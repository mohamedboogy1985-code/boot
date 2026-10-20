import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Briefcase, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Receipt, 
  FileCheck, 
  AlertTriangle, 
  Bot, 
  Mic, 
  Play, 
  Sparkles, 
  ArrowUpRight, 
  Search, 
  Filter,
  CheckCircle2,
  Clock,
  Volume2,
  PiggyBank,
  BellRing,
  FileDown,
  Coins
} from 'lucide-react';
import { 
  ChatterBot, 
  UserProfile, 
  AccountingInvoice, 
  SoundAlertSettings,
  ConversationSession,
  TranscriptFinancialAnalysis,
  CurrencyCode
} from '../types';
import { LiveVoiceChat } from './LiveVoiceChat';
import { FinancialTranscriptAnalyzer } from './FinancialTranscriptAnalyzer';
import { FinancialDistributionCharts } from './FinancialDistributionCharts';
import { LocalDB } from '../services/localDb';
import { CURRENCIES, formatMoney, loadStoredCurrency, storeCurrency } from '../services/currency';
import { NotificationService, playBudgetAlertSound } from '../services/notificationService';
import {
  exportAnalysisToXlsx,
  exportAnalysisToDocx,
  exportAnalysisToCsv,
  exportAnalysisToPdfViaPrint,
} from '../services/fileExportService';

interface AccountingSuiteViewProps {
  activeBot: ChatterBot;
  userProfile: UserProfile;
  soundSettings: SoundAlertSettings;
  onOpenSoundSettings: () => void;
  onOpenStudio: () => void;
  onSessionSaved: () => void;
  onOpenLocalDb: () => void;
}

const SAMPLE_INVOICES: AccountingInvoice[] = [
  {
    id: 'inv-1',
    invoiceNumber: 'INV-2026-104',
    client: 'شركة الأفق للتجارة والخدمات',
    amount: 34500,
    date: '2026-10-10',
    dueDate: '2026-10-25',
    status: 'pending',
    vatAmount: 4830,
    category: 'مبيعات خدمات رقمية',
  },
  {
    id: 'inv-2',
    invoiceNumber: 'INV-2026-103',
    client: 'مجموعة الرياض للتوريدات',
    amount: 18200,
    date: '2026-10-08',
    dueDate: '2026-10-15',
    status: 'paid',
    vatAmount: 2548,
    category: 'استشارات محاسبية وإدارية',
  },
  {
    id: 'inv-3',
    invoiceNumber: 'INV-2026-102',
    client: 'مؤسسة البناء الحديث للمقاولات',
    amount: 58000,
    date: '2026-09-28',
    dueDate: '2026-10-05',
    status: 'overdue',
    vatAmount: 8120,
    category: 'عقود صيانة سنوية',
  },
  {
    id: 'inv-4',
    invoiceNumber: 'INV-2026-101',
    client: 'سلسلة مقاهي إكسبريسو',
    amount: 9400,
    date: '2026-10-01',
    dueDate: '2026-10-20',
    status: 'paid',
    vatAmount: 1316,
    category: 'تراخيص برمجيات الحسابات',
  },
  {
    id: 'inv-5',
    invoiceNumber: 'INV-2026-100',
    client: 'مختبرات التقنية السحابية',
    amount: 22600,
    date: '2026-09-22',
    dueDate: '2026-10-12',
    status: 'pending',
    vatAmount: 3164,
    category: 'تطوير حلول الفوترة',
  },
];

export const AccountingSuiteView: React.FC<AccountingSuiteViewProps> = ({
  activeBot,
  userProfile,
  soundSettings,
  onOpenSoundSettings,
  onOpenStudio,
  onSessionSaved,
  onOpenLocalDb,
}) => {
  const [selectedInvoice, setSelectedInvoice] = useState<AccountingInvoice | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Sessions and financial analysis state
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');

  // Multi-currency state (EGP default — Egyptian accounting profile)
  const [currency, setCurrency] = useState<CurrencyCode>(() => loadStoredCurrency());
  const symbol = CURRENCIES[currency].symbol;
  const vatRate = CURRENCIES[currency].vatRate;
  const handleCurrencyChange = (code: CurrencyCode) => {
    setCurrency(code);
    storeCurrency(code);
  };

  // Budget Threshold state (user-defined monthly expense limit, persisted)
  const [budgetLimit, setBudgetLimit] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('chatterbots_monthly_budget_limit')) || 50000;
    } catch {
      return 50000;
    }
  });
  const [pdfExportError, setPdfExportError] = useState<string | null>(null);
  const budgetAlertKeyRef = useRef<string>('');

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const selectedAnalysis = selectedSession?.financialAnalysis;

  // Cumulative expenses of the CURRENT month across all analyzed sessions.
  const currentMonthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  const currentMonthExpenses = useMemo(() => {
    let sum = 0;
    for (const s of sessions) {
      const fa = s.financialAnalysis;
      if (!fa) continue;
      const datedExpenses = (fa.transactions || []).filter(
        (t) => t.type === 'expense' && t.date?.startsWith(currentMonthKey),
      );
      if (datedExpenses.length > 0) {
        sum += datedExpenses.reduce((acc, t) => acc + Number(t.amount || 0), 0);
      } else if (new Date(fa.analyzedAt).toISOString().slice(0, 7) === currentMonthKey) {
        sum += Number(fa.totalExpenses || 0);
      }
    }
    return sum;
  }, [sessions, currentMonthKey]);

  const isOverBudget = budgetLimit > 0 && currentMonthExpenses >= budgetLimit;
  const budgetPercent = budgetLimit > 0 ? Math.min(100, Math.round((currentMonthExpenses / budgetLimit) * 100)) : 0;

  // Fire sound + browser notification ONCE per (month, limit) when crossing the threshold.
  useEffect(() => {
    const key = `${currentMonthKey}-${budgetLimit}`;
    if (!isOverBudget) {
      if (budgetAlertKeyRef.current && !budgetAlertKeyRef.current.startsWith(currentMonthKey)) {
        budgetAlertKeyRef.current = '';
      }
      return;
    }
    if (budgetAlertKeyRef.current === key) return;
    budgetAlertKeyRef.current = key;
    playBudgetAlertSound();
    NotificationService.notifyBudgetExceeded(
      formatMoney(currentMonthExpenses, currency),
      formatMoney(budgetLimit, currency),
    );
  }, [isOverBudget, currentMonthExpenses, budgetLimit, currentMonthKey, currency]);

  const handleBudgetLimitChange = (value: number) => {
    const safe = isNaN(value) || value < 0 ? 0 : value;
    setBudgetLimit(safe);
    budgetAlertKeyRef.current = '';
    try {
      localStorage.setItem('chatterbots_monthly_budget_limit', String(safe));
    } catch {
      /* storage unavailable */
    }
  };

  const loadSessions = async () => {
    try {
      const records = await LocalDB.getAllSessions();
      setSessions(records);
      if (records.length > 0 && !selectedSessionId) {
        setSelectedSessionId(records[0].id);
      }
    } catch (e) {
      console.warn('Failed to load sessions in AccountingSuiteView:', e);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleSessionSaved = () => {
    loadSessions();
    onSessionSaved();
  };

  const handleAnalysisComplete = (sessionId: string, result: TranscriptFinancialAnalysis) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, financialAnalysis: result } : s))
    );
  };

  const filteredInvoices = SAMPLE_INVOICES.filter((inv) => {
    const matchesFilter = filterStatus === 'all' || inv.status === filterStatus;
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.client.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Banner: Accounting ERP Integration context */}
      <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-indigo-950/60 border border-emerald-500/30 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5" />
              <span>إدماج برنامج الحسابات (ERP Integrated Mode)</span>
            </span>
            <span className="text-xs text-slate-400">
              السنة المالية 2026 • الربع الرابع
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-white">
            {userProfile.company || 'نظام الحسابات المتكامل'}
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            مرحباً يا <strong className="text-emerald-400">{userProfile.name}</strong>. وكيل ChatterBots الذكي <strong className="text-indigo-300">({activeBot.name})</strong> متصل ومتاح صوتياً في الجانب الأيسر لتقديم التحليلات المالية الفورية.
          </p>
        </div>

        <div className="flex flex-col gap-2 self-start md:self-auto md:items-end">
          {/* Multi-currency selector: Egyptian Pound (default), USD, SAR */}
          <label className="flex items-center gap-2 bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 shadow">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-slate-300">عملة العرض والتحليل:</span>
            <select
              value={currency}
              onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
              className="bg-transparent font-bold text-white focus:outline-none cursor-pointer"
              aria-label="اختيار عملة البرنامج"
            >
              <option value="EGP" className="bg-slate-900">الجنيه المصري (EGP)</option>
              <option value="USD" className="bg-slate-900">الدولار الأمريكي (USD)</option>
              <option value="SAR" className="bg-slate-900">الريال السعودي (SAR)</option>
            </select>
          </label>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            🇪🇬 معايير المحاسبة المصرية • {CURRENCIES[currency].vatLabel} • {CURRENCIES[currency].authorityAr}
          </span>
        </div>

        <button
          onClick={onOpenStudio}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-2 self-start md:self-auto shadow-md"
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>تغيير الوكيل في استوديو ChatterBots</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>إجمالي الإيرادات (Q4)</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-extrabold text-white font-mono">
            428,500 <span className="text-xs text-slate-400 font-normal">{symbol}</span>
          </div>
          <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-semibold">
            <span>+14.2%</span>
            <span className="text-slate-500 font-normal">مقارنة بالربع الماضي</span>
          </p>
        </div>

        {/* Expenses */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>إجمالي المصروفات</span>
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-extrabold text-white font-mono">
            182,100 <span className="text-xs text-slate-400 font-normal">{symbol}</span>
          </div>
          <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1 font-semibold">
            <span>-4.8%</span>
            <span className="text-slate-500 font-normal">وفر في التكاليف التشغيلية</span>
          </p>
        </div>

        {/* Net Profit */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>صافي الربح التقديري</span>
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-extrabold text-white font-mono">
            246,400 <span className="text-xs text-slate-400 font-normal">{symbol}</span>
          </div>
          <p className="text-[11px] text-indigo-400 mt-1 flex items-center gap-1 font-semibold">
            <span>هامش الربح: 57.5%</span>
          </p>
        </div>

        {/* Pending & VAT */}
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>الفواتير قيد التحصيل</span>
            <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
              <Receipt className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-extrabold text-white font-mono">
            54,200 <span className="text-xs text-slate-400 font-normal">{symbol}</span>
          </div>
          <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1 font-semibold">
            <span>2 فواتير متأخرة</span>
            <span className="text-slate-500 font-normal">• تحتاج متابعة</span>
          </p>
        </div>
      </div>

      {/* Main Grid: Left is Invoices, Right is Live ChatterBot Agent */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left: Invoices Ledger Table (7 columns) */}
        <div className="lg:col-span-6 xl:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <span>سجل الفواتير والمطالبات (Invoices Ledger)</span>
              </h3>
              <p className="text-xs text-slate-400">
                انقر على أي فاتورة لاستشارة الوكيل الذكي {activeBot.name} صوتياً حولها
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  filterStatus === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setFilterStatus('pending')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  filterStatus === 'pending' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                معلقة
              </button>
              <button
                onClick={() => setFilterStatus('overdue')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  filterStatus === 'overdue' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                متأخرة
              </button>
              <button
                onClick={() => setFilterStatus('paid')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  filterStatus === 'paid' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                مدفوعة
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم الفاتورة أو اسم العميل..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Invoices List */}
          <div className="space-y-2.5 overflow-x-auto">
            {filteredInvoices.map((inv) => {
              const isSelected = selectedInvoice?.id === inv.id;
              return (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInvoice(inv)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-950/40 border-indigo-500 shadow-md ring-1 ring-indigo-500/60'
                      : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-indigo-400">
                        {inv.invoiceNumber}
                      </span>
                      <span className="text-xs font-semibold text-white">
                        {inv.client}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-white">
                        {formatMoney(inv.amount, currency)}
                      </span>
                      {inv.status === 'paid' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>مدفوعة</span>
                        </span>
                      )}
                      {inv.status === 'pending' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>قيد الانتظار</span>
                        </span>
                      )}
                      {inv.status === 'overdue' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>متأخرة</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
                    <span>
                      التصنيف: {inv.category} • ضريبة (15%): {inv.vatAmount.toLocaleString('ar-SA')} ر.س
                    </span>
                    <span className="text-indigo-400 font-semibold hover:underline flex items-center gap-1">
                      <span>استشر {activeBot.name}</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Invoice Quick Summary Card */}
          {selectedInvoice && (
            <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/40 text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-indigo-300">
                  تفاصيل الفاتورة المحددة: {selectedInvoice.invoiceNumber}
                </span>
                <span className="text-slate-400">تاريخ الاستحقاق: {selectedInvoice.dueDate}</span>
              </div>
              <p className="text-slate-300 mb-2">
                العميل: <strong>{selectedInvoice.client}</strong> بمبلغ إجمالي <strong>{formatMoney(selectedInvoice.amount, currency)}</strong> شامل ضريبة القيمة المضافة وفق المعايير المصرية (14%)، ويُصدَر عبر منظومة الفاتورة الإلكترونية (ETA).
              </p>
              <div className="text-[11px] text-slate-400">
                💡 اسأل الوكيل الصوتي في اليسار: "ما الإجراء المناسب لهذه الفاتورة؟" أو "اقترح رسالة تذكير مهذبة للعميل".
              </div>
            </div>
          )}
        </div>

        {/* Right: Embedded ChatterBots Voice Agent (5 columns) */}
        <div className="lg:col-span-6 xl:col-span-5">
          <div className="sticky top-20">
            <LiveVoiceChat
              bot={activeBot}
              userProfile={userProfile}
              soundSettings={soundSettings}
              onOpenSoundSettings={onOpenSoundSettings}
              onSessionSaved={handleSessionSaved}
              onOpenLocalDb={onOpenLocalDb}
            />
          </div>
        </div>

      </div>
      
      {/* Recharts Financial Distribution & Analytics Interactive Card */}
      <FinancialDistributionCharts
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSessionId={setSelectedSessionId}
        userProfile={userProfile}
        activeBot={activeBot}
      />

      {/* Gemini analysis export (PDF / CSV / Excel / Word) + Budget Threshold */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FileDown className="w-4 h-4 text-emerald-400" />
            <span>تصدير بيانات تحليل Gemini للجلسة المحددة</span>
          </h3>
          <p className="text-[11px] leading-5 text-slate-400">
            ملفات حقيقية قابلة للتنزيل: Excel متعدد الأوراق، مستند Word، تقرير PDF (حفظ كـ PDF من الطباعة)، وCSV لبرامج المحاسبة — بعملة {CURRENCIES[currency].labelAr}.
            {selectedAnalysis?.isSimulated && ' ملحوظة: تحليل هذه الجلسة صادر عن محاكاة محلية وسيُوسم بوضوح داخل الملفات.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!selectedAnalysis}
              onClick={() => selectedAnalysis && exportAnalysisToCsv(selectedAnalysis, selectedSession?.title || 'تقرير التحليل المالي', symbol)}
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold"
            >
              تنزيل CSV
            </button>
            <button
              type="button"
              disabled={!selectedAnalysis}
              onClick={() => {
                if (!selectedAnalysis) return;
                const ok = exportAnalysisToPdfViaPrint(selectedAnalysis, selectedSession?.title || 'تقرير التحليل المالي', symbol);
                setPdfExportError(ok ? null : 'حظر المتصفح نافذة الطباعة — اسمح بالنوافذ المنبثقة ثم أعد محاولة تصدير PDF.');
              }}
              className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white text-xs font-bold"
            >
              تنزيل PDF
            </button>
            <button
              type="button"
              disabled={!selectedAnalysis}
              onClick={() => selectedAnalysis && exportAnalysisToXlsx(selectedAnalysis, selectedSession?.title || 'تقرير التحليل المالي')}
              className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white text-xs font-bold"
            >
              Excel XLSX
            </button>
            <button
              type="button"
              disabled={!selectedAnalysis}
              onClick={() => void (selectedAnalysis && exportAnalysisToDocx(selectedAnalysis, selectedSession?.title || 'تقرير التحليل المالي'))}
              className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-bold"
            >
              Word DOCX
            </button>
          </div>
          {!selectedAnalysis && (
            <p className="text-[11px] text-amber-300">لا يوجد تحليل محفوظ للجلسة المحددة بعد — شغّل التحليل من بطاقة «تحليل نصوص المحادثات» أسفله أولًا، ثم صدّر من هنا.</p>
          )}
          {pdfExportError && <p className="text-[11px] text-rose-300">{pdfExportError}</p>}
        </div>

        {/* Budget Threshold card */}
        <div className={`bg-slate-900/90 border rounded-3xl p-5 shadow-xl space-y-3 ${isOverBudget ? 'border-rose-500/60' : 'border-slate-800'}`}>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <PiggyBank className="w-4 h-4 text-amber-400" />
            <span>حدّ الميزانية الشهري (Budget Threshold)</span>
          </h3>
          <div className="flex flex-wrap items-end gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-400 block">الحد الشهري للمصروفات ({symbol})</span>
              <input
                type="number"
                min={0}
                step={500}
                value={budgetLimit}
                onChange={(e) => handleBudgetLimitChange(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white w-44 focus:outline-none focus:border-amber-500"
                aria-label="حد الميزانية الشهري"
              />
            </label>
            <button
              type="button"
              onClick={async () => {
                await NotificationService.requestPermission(true);
                playBudgetAlertSound();
                await NotificationService.notify('اختبار تنبيه الميزانية 🔔', {
                  body: 'إشعارات المتصفح والصوت تعملان — ستصلك مثلها تلقائيًا عند تجاوز حد الميزانية.',
                  kind: 'budget',
                  tag: 'budget-test',
                });
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <BellRing className="w-3.5 h-3.5" /> تفعيل الإشعارات + اختبار التنبيه
            </button>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                مصروفات الشهر الحالي ({currentMonthKey}): <b className="text-white">{formatMoney(currentMonthExpenses, currency)}</b>
              </span>
              <span>
                الحد: <b className="text-white">{formatMoney(budgetLimit, currency)}</b> • {budgetPercent}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-800 overflow-hidden mt-1.5">
              <div
                className={`h-full transition-all ${isOverBudget ? 'bg-gradient-to-r from-rose-600 to-red-500' : budgetPercent >= 80 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
          </div>
          {isOverBudget ? (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-[11px] font-bold flex items-center gap-2">
              <BellRing className="w-4 h-4 shrink-0" />
              <span>تم تجاوز حد الميزانية الشهري! أُرسل تنبيه صوتي وإشعار متصفح الآن. راجِع مخططات توزيع المصاريف أعلاه لخفض أكبر البنود.</span>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">
              يُحتسب الإجمالي من المصروفات المستخرجة بتقنية التحليل من جلساتك لهذا الشهر. عند التجاوز يصلك تنبيه صوتي وإشعار مرئي حتى لو كان التبويب في الخلفية.
            </p>
          )}
        </div>
      </div>

      {/* Financial Transcript Insights & AI Tax Deductions Analyzer */}
      <FinancialTranscriptAnalyzer 
        userProfile={userProfile} 
        activeBot={activeBot}
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSessionId={setSelectedSessionId}
        onAnalysisComplete={handleAnalysisComplete}
        currency={currency}
      />

    </div>
  );
};
