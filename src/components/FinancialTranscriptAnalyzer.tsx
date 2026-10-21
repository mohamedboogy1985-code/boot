import React, { useState, useEffect } from 'react';
import { 
  FileSearch, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShieldCheck, 
  Download, 
  FileSpreadsheet, 
  FileCode, 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  HelpCircle,
  ArrowRight,
  PieChart as PieChartIcon,
  BarChart3
} from 'lucide-react';
import { 
  ConversationSession, 
  UserProfile, 
  ChatterBot, 
  TranscriptFinancialAnalysis,
  FinancialItem,
  TaxDeductionInsight
} from '../types';
import { ApiService } from '../services/api';
import { LocalDB } from '../services/localDb';
import { FinancialDistributionCharts } from './FinancialDistributionCharts';
import {
  exportAnalysisToXlsx,
  exportAnalysisToDocx,
  exportAnalysisToCsv,
  exportAnalysisToPdfViaPrint,
} from '../services/fileExportService';
import { CURRENCIES } from '../services/currency';
import { NotificationService } from '../services/notificationService';
import type { CurrencyCode } from '../types';

interface FinancialTranscriptAnalyzerProps {
  userProfile: UserProfile;
  activeBot: ChatterBot;
  onConsultAgent?: (text: string) => void;
  sessions?: ConversationSession[];
  selectedSessionId?: string;
  onSelectSessionId?: (id: string) => void;
  onAnalysisComplete?: (sessionId: string, result: TranscriptFinancialAnalysis) => void;
  currency?: CurrencyCode;
}

export const FinancialTranscriptAnalyzer: React.FC<FinancialTranscriptAnalyzerProps> = ({
  userProfile,
  activeBot,
  onConsultAgent,
  sessions: propSessions,
  selectedSessionId: propSelectedSessionId,
  onSelectSessionId: propOnSelectSessionId,
  onAnalysisComplete,
  currency = 'EGP',
}) => {
  const [internalSessions, setInternalSessions] = useState<ConversationSession[]>([]);
  const sessions = propSessions || internalSessions;

  const [internalSelectedSessionId, setInternalSelectedSessionId] = useState<string>('');
  const selectedSessionId = propSelectedSessionId !== undefined ? propSelectedSessionId : internalSelectedSessionId;
  const setSelectedSessionId = propOnSelectSessionId || setInternalSelectedSessionId;

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TranscriptFinancialAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'expenses' | 'revenues' | 'tax' | 'transactions' | 'charts'>('expenses');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load available sessions from LocalDB if not provided via props
  const refreshSessions = async () => {
    try {
      const records = await LocalDB.getAllSessions();
      setInternalSessions(records);
      if (records.length > 0 && !selectedSessionId) {
        setSelectedSessionId(records[0].id);
        if (records[0].financialAnalysis) {
          setAnalysis(records[0].financialAnalysis);
        }
      }
    } catch (e) {
      console.warn('Failed to load sessions in FinancialTranscriptAnalyzer:', e);
    }
  };

  useEffect(() => {
    if (!propSessions) {
      refreshSessions();
    }
  }, [propSessions]);

  // Sync analysis when selectedSessionId or sessions change
  useEffect(() => {
    if (selectedSessionId) {
      const target = sessions.find((s) => s.id === selectedSessionId);
      if (target?.financialAnalysis) {
        setAnalysis(target.financialAnalysis);
      } else {
        setAnalysis(null);
      }
    }
  }, [selectedSessionId, sessions]);

  // When selected session changes, load cached analysis if available
  const handleSessionChange = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    const target = sessions.find((s) => s.id === sessionId);
    if (target?.financialAnalysis) {
      setAnalysis(target.financialAnalysis);
    } else {
      setAnalysis(null);
    }
  };

  // Trigger on-demand analysis via Gemini API
  const handleRunAnalysis = async () => {
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (!session) {
      setErrorMessage('يرجى اختيار جلسة محادثة أولاً لتحليلها');
      return;
    }

    if (!session.messages || session.messages.length === 0) {
      setErrorMessage('هذه الجلسة لا تحتوي على رسائل كافية للتحليل');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      void NotificationService.requestPermission();
      const result = await ApiService.analyzeTranscript(session, userProfile, currency);
      NotificationService.notifyAnalysisComplete(session.title, Boolean(result.isSimulated));
      setAnalysis(result);
      // Persist analysis into the session
      await LocalDB.saveFinancialAnalysis(session.id, result);
      // Update local state if internal
      setInternalSessions((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, financialAnalysis: result } : s))
      );
      // Notify parent callback
      onAnalysisComplete?.(session.id, result);
    } catch (err: any) {
      console.error('Error running financial analysis:', err);
      setErrorMessage(err?.message || 'حدث خطأ أثناء إجراء التدقيق المالي للمحادثة.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
      
      {/* Header and Title */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
              <FileSearch className="w-3.5 h-3.5" />
              <span>وحدة التدقيق المالي التوليدي (Gemini Financial Intelligence)</span>
            </span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-400">تحليل المصروفات والإيرادات والاستقطاعات الضريبية</span>
          </div>
          <h3 className="text-lg font-extrabold text-white">
            تحليل نصوص المحادثات والاستشارات المالية
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            يقوم نموذج الذكاء الاصطناعي بفحص نص محادثات الوكلاء تلقائياً، واستخراج قيود المصروفات، وتوثيق سجل الإيرادات، وتحديد فرص استرداد ضريبة القيمة المضافة ZATCA.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Session Picker */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200">
            <span className="text-slate-400 shrink-0 font-medium">الجلسة:</span>
            {sessions.length > 0 ? (
              <select
                value={selectedSessionId}
                onChange={(e) => handleSessionChange(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer max-w-[200px] truncate"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                    {s.title} ({s.messages?.length || 0} رسالة)
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-slate-400 italic">لا توجد جلسات محفوظة حالياً</span>
            )}
          </div>

          {/* Trigger Button */}
          <button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing || sessions.length === 0}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md ${
              isAnalyzing || sessions.length === 0
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white border border-indigo-400/30'
            }`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-300" />
                <span>جاري التدقيق بواسطة Gemini...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>بدء التحليل المالي للمحادثة</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error message banner */}
      {errorMessage && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Analysis Output Section */}
      {isAnalyzing ? (
        /* Loading Skeleton */
        <div className="space-y-4 py-8 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-slate-800/60 rounded-2xl"></div>
            ))}
          </div>
          <div className="h-10 bg-slate-800/40 rounded-xl"></div>
          <div className="h-48 bg-slate-800/30 rounded-2xl"></div>
        </div>
      ) : analysis ? (
        <div className="space-y-6">
          
          {/* Executive Summary Kicker */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs text-slate-300 flex items-start gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">الخلاصة التنفيذية للتدقيق</span>
                <span className="text-slate-500">·</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {new Date(analysis.analyzedAt).toLocaleDateString('ar-SA')}
                </span>
              </div>
              {analysis.isSimulated ? (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-300 text-[11px] font-bold leading-5">
                  ⚠️ بيانات محاكاة تجريبية من محرك استدلالي محلي (بدون تحليل Gemini حي) — الأرقام التالية للعرض والتعلم فقط ولا تُستخدم كسجلات محاسبية أو إقرارات ضريبية رسمية. فعّل GEMINI_API_KEY للتحليل الحي.
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                  ✅ تحليل Gemini حي — وفق معايير المحاسبة المصرية (ق.م 14% • مصلحة الضرائب ETA).
                </div>
              )}
              <p className="leading-relaxed text-slate-300">{analysis.summary}</p>
            </div>
          </div>

          {/* 4 Financial KPI Tiles (Tabular Figures) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Expenses */}
            <div className="bg-slate-950/80 border border-slate-800/90 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>المصروفات المرصودة</span>
                <span className="p-1 rounded-md bg-amber-500/15 text-amber-400">
                  <TrendingDown className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-xl font-extrabold text-white font-mono tabular-nums">
                {analysis.totalExpenses.toLocaleString('ar-SA')}{' '}
                <span className="text-xs text-slate-400 font-normal">ر.س</span>
              </div>
              <p className="text-[11px] text-amber-400 mt-1">
                {analysis.expenses?.length || 0} بنود مصروفات مكتشفة
              </p>
            </div>

            {/* Revenue */}
            <div className="bg-slate-950/80 border border-slate-800/90 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>الإيرادات المسجلة</span>
                <span className="p-1 rounded-md bg-emerald-500/15 text-emerald-400">
                  <TrendingUp className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-xl font-extrabold text-white font-mono tabular-nums">
                {analysis.totalRevenue.toLocaleString('ar-SA')}{' '}
                <span className="text-xs text-slate-400 font-normal">ر.س</span>
              </div>
              <p className="text-[11px] text-emerald-400 mt-1">
                {analysis.revenues?.length || 0} عمليات إيراد وتدفق نقدي
              </p>
            </div>

            {/* Net Impact */}
            <div className="bg-slate-950/80 border border-slate-800/90 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>صافي الأثر المالي</span>
                <span className="p-1 rounded-md bg-indigo-500/15 text-indigo-400">
                  <DollarSign className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-xl font-extrabold text-white font-mono tabular-nums">
                {analysis.netImpact.toLocaleString('ar-SA')}{' '}
                <span className="text-xs text-slate-400 font-normal">ر.س</span>
              </div>
              <p className={`text-[11px] mt-1 font-semibold ${analysis.netImpact >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {analysis.netImpact >= 0 ? 'فائض نقدي إيجابي' : 'عجز يحتاج تغطية'}
              </p>
            </div>

            {/* Potential Tax Deductions */}
            <div className="bg-slate-950/80 border border-slate-800/90 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>وفر ضريبي محتمل (ZATCA)</span>
                <span className="p-1 rounded-md bg-purple-500/15 text-purple-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-xl font-extrabold text-purple-300 font-mono tabular-nums">
                {analysis.totalPotentialTaxSavings.toLocaleString('ar-SA')}{' '}
                <span className="text-xs text-slate-400 font-normal">ر.س</span>
              </div>
              <p className="text-[11px] text-purple-400 mt-1">
                استرداد مدخلات ضريبة القيمة المضافة
              </p>
            </div>

          </div>

          {/* Categorized Tabs & Export Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            
            {/* Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('expenses')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  activeTab === 'expenses'
                    ? 'bg-amber-600/90 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                تتبع المصروفات ({analysis.expenses?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('revenues')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  activeTab === 'revenues'
                    ? 'bg-emerald-600/90 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                سجل الإيرادات ({analysis.revenues?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tax')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  activeTab === 'tax'
                    ? 'bg-purple-600/90 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                الاستقطاعات الضريبية ({analysis.taxDeductions?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('transactions')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  activeTab === 'transactions'
                    ? 'bg-indigo-600/90 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                كشف الحركات ({analysis.transactions?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('charts')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === 'charts'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5 text-purple-300" />
                <span>مخططات Recharts البيانية</span>
              </button>
            </div>

            {/* Export Buttons — real Office files + PDF/CSV */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void exportAnalysisToXlsx(analysis, selectedSession?.title || 'تقرير التحليل المالي')}
                className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold border border-emerald-600 flex items-center gap-1.5 transition-all"
                title="تصدير ملف Excel حقيقي متعدد الأوراق (.xlsx)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel XLSX</span>
              </button>
              <button
                type="button"
                onClick={() => void exportAnalysisToDocx(analysis, selectedSession?.title || 'تقرير التحليل المالي')}
                className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold border border-blue-600 flex items-center gap-1.5 transition-all"
                title="تصدير مستند Word حقيقي (.docx)"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Word DOCX</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const ok = exportAnalysisToPdfViaPrint(analysis, selectedSession?.title || 'تقرير التحليل المالي', CURRENCIES[currency].symbol);
                  if (!ok) setErrorMessage('حظر المتصفح نافذة الطباعة. اسمح بالنوافذ المنبثقة لحفظ ملف PDF.');
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold border border-rose-600 flex items-center gap-1.5 transition-all"
                title="تصدير PDF قابل للتنزيل (حفظ كـ PDF من نافذة الطباعة)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={() => exportAnalysisToCsv(analysis, selectedSession?.title || 'تقرير التحليل المالي', CURRENCIES[currency].symbol)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-all"
                title="تصدير CSV متوافق مع إكسل وبرامج المحاسبة"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  LocalDB.downloadFinancialAnalysisAsJson(
                    analysis,
                    selectedSession?.title || 'تقرير التحليل المالي'
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-all"
                title="تصدير كملف JSON لبرامج المحاسبة"
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                <span>تصدير JSON</span>
              </button>
            </div>
          </div>

          {/* Tab Content Display */}
          <div className="overflow-x-auto">
            
            {/* Tab 1: Expenses */}
            {activeTab === 'expenses' && (
              <div className="space-y-2.5">
                {(!analysis.expenses || analysis.expenses.length === 0) ? (
                  <p className="text-xs text-slate-400 p-4 text-center">لم يتم رصد مصروفات صريحة في نص هذه المحادثة.</p>
                ) : (
                  analysis.expenses.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-white">{item.description}</span>
                          <span className="text-xs text-slate-500">·</span>
                          <span className="text-xs text-amber-400/90">{item.category}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>الجهة: {item.counterparty || 'غير محدد'}</span>
                          {item.date && (
                            <>
                              <span>·</span>
                              <span>التاريخ: {item.date}</span>
                            </>
                          )}
                          {item.isTaxDeductible && (
                            <>
                              <span>·</span>
                              <span className="text-emerald-400 font-medium">مؤهل للخصم الضريبي</span>
                            </>
                          )}
                        </div>
                        {item.deductionReason && (
                          <p className="text-[11px] text-slate-400 mt-1 italic">
                            💡 {item.deductionReason}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-sm text-amber-400 tabular-nums">
                          -{item.amount.toLocaleString('ar-SA')} ر.س
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 2: Revenues */}
            {activeTab === 'revenues' && (
              <div className="space-y-2.5">
                {(!analysis.revenues || analysis.revenues.length === 0) ? (
                  <p className="text-xs text-slate-400 p-4 text-center">لم يتم رصد إيرادات صريحة في نص هذه المحادثة.</p>
                ) : (
                  analysis.revenues.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-white">{item.description}</span>
                          <span className="text-xs text-slate-500">·</span>
                          <span className="text-xs text-emerald-400/90">{item.category}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span>العميل: {item.counterparty || 'غير محدد'}</span>
                          {item.date && (
                            <>
                              <span>·</span>
                              <span>التاريخ: {item.date}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-sm text-emerald-400 tabular-nums">
                          +{item.amount.toLocaleString('ar-SA')} ر.س
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 3: Tax Deductions */}
            {activeTab === 'tax' && (
              <div className="space-y-3">
                {(!analysis.taxDeductions || analysis.taxDeductions.length === 0) ? (
                  <p className="text-xs text-slate-400 p-4 text-center">لا توجد ملاحظات استقطاع ضريبي خاصة لهذه الجلسة.</p>
                ) : (
                  analysis.taxDeductions.map((tax, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                          <h4 className="text-xs font-bold text-purple-200">{tax.title}</h4>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{tax.reasoning}</p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
                          <span className="text-purple-400 font-semibold">{tax.category}</span>
                          {tax.complianceNote && (
                            <>
                              <span>·</span>
                              <span>{tax.complianceNote}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[11px] text-slate-400 block">وفر تقديري:</span>
                        <span className="font-mono font-bold text-base text-purple-300 tabular-nums">
                          +{tax.potentialSavings.toLocaleString('ar-SA')} ر.س
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 4: Transactions History */}
            {activeTab === 'transactions' && (
              <div className="space-y-2">
                {(!analysis.transactions || analysis.transactions.length === 0) ? (
                  <p className="text-xs text-slate-400 p-4 text-center">لا توجد حركات مسجلة.</p>
                ) : (
                  analysis.transactions.map((tx, idx) => (
                    <div
                      key={tx.id || idx}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            tx.type === 'revenue' ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                        />
                        <div>
                          <span className="font-bold text-white">{tx.description}</span>
                          <span className="text-slate-400 text-[11px] mr-2">
                            ({tx.category} {tx.counterparty ? `· ${tx.counterparty}` : ''})
                          </span>
                        </div>
                      </div>

                      <span
                        className={`font-mono font-bold tabular-nums ${
                          tx.type === 'revenue' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {tx.type === 'revenue' ? '+' : '-'}
                        {tx.amount.toLocaleString('ar-SA')} ر.س
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 5: Recharts Financial Distribution Charts */}
            {activeTab === 'charts' && (
              <div className="pt-1">
                <FinancialDistributionCharts
                  sessions={sessions}
                  selectedSessionId={selectedSessionId}
                  onSelectSessionId={setSelectedSessionId}
                  userProfile={userProfile}
                  activeBot={activeBot}
                />
              </div>
            )}

          </div>

          {/* Recommendations Banner */}
          {analysis.recommendations && analysis.recommendations.length > 0 && (
            <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-slate-300 space-y-2">
              <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>توصيات المحاسب الذكي {activeBot.name}:</span>
              </span>
              <ul className="space-y-1 list-disc list-inside text-slate-300 text-xs">
                {analysis.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

        </div>
      ) : (
        /* Empty / Ready State */
        <div className="py-10 text-center space-y-3 bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl">
          <FileSearch className="w-8 h-8 text-indigo-400 mx-auto" />
          <h4 className="text-sm font-bold text-white">
            جاهز لتحليل جلسة المحادثة واستخراج الأرقام المالية
          </h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            اختر أي جلسة محادثة مسجلة من القائمة أعلاه واضغط على <strong>"بدء التحليل المالي للمحادثة"</strong> ليقوم نموذج Gemini بتدقيق المصروفات والإيرادات والاستقطاعات الضريبية فورياً.
          </p>
        </div>
      )}

    </div>
  );
};
