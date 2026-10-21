import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  FileDown,
  Landmark,
  PiggyBank,
  ReceiptText,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  AccountingInvoice,
  ConversationSession,
  CurrencyCode,
  FinancialItem,
  TranscriptFinancialAnalysis,
} from '../types';
import { CURRENCIES, formatMoney } from '../services/currency';
import {
  exportAnalysisToCsv,
  exportAnalysisToDocx,
  exportAnalysisToPdfViaPrint,
  exportAnalysisToXlsx,
} from '../services/fileExportService';

interface MonthlyTaxReportCardProps {
  sessions: ConversationSession[];
  currency: CurrencyCode;
  invoices?: AccountingInvoice[];
}

interface CategoryTotal {
  category: string;
  amount: number;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);
const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

function addMonths(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, (m || 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function categoryTotals(items: FinancialItem[]): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.category?.trim() || 'غير مصنّف';
    map.set(key, (map.get(key) || 0) + (Number(item.amount) || 0));
  }
  return Array.from(map.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);
}

export const MonthlyTaxReportCard: React.FC<MonthlyTaxReportCardProps> = ({
  sessions,
  currency,
  invoices = [],
}) => {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [exportError, setExportError] = useState<string | null>(null);
  const info = CURRENCIES[currency];
  const vatRate = info.vatRate;

  const report = useMemo(() => {
    const analysisExpenses: FinancialItem[] = [];
    const analysisRevenues: FinancialItem[] = [];
    const seenItemIds = new Set<string>();
    let includedAnalyses = 0;
    let analysesSimulated = false;
    let sourcePotentialSavings = 0;

    const pushItems = (items: FinancialItem[]) => {
      for (const item of items) {
        const uniqueKey = item.id || `${item.type}-${item.date || ''}-${item.amount}-${item.description}`;
        if (seenItemIds.has(uniqueKey)) continue;
        seenItemIds.add(uniqueKey);
        const normalized = {
          ...item,
          amount: Number(item.amount) || 0,
          currency: item.currency || info.symbol,
          category: item.category || 'غير مصنّف',
          date: item.date || `${selectedMonth}-01`,
        };
        if (normalized.type === 'expense') analysisExpenses.push(normalized);
        else analysisRevenues.push(normalized);
      }
    };

    for (const session of sessions) {
      const analysis = session.financialAnalysis;
      if (!analysis) continue;

      const allTransactions = Array.isArray(analysis.transactions) ? analysis.transactions : [];
      const dated = allTransactions.filter(
        (item) => typeof item.date === 'string' && item.date.startsWith(selectedMonth),
      );

      if (dated.length) {
        includedAnalyses++;
        analysesSimulated = analysesSimulated || Boolean(analysis.isSimulated);
        sourcePotentialSavings += Number(analysis.totalPotentialTaxSavings) || 0;
        pushItems(dated);
        continue;
      }

      const analyzedMonth = new Date(analysis.analyzedAt).toISOString().slice(0, 7);
      if (analyzedMonth !== selectedMonth) continue;

      const undatedItems = [...(analysis.expenses || []), ...(analysis.revenues || [])];
      includedAnalyses++;
      analysesSimulated = analysesSimulated || Boolean(analysis.isSimulated);
      sourcePotentialSavings += Number(analysis.totalPotentialTaxSavings) || 0;

      if (undatedItems.length) {
        pushItems(undatedItems);
      } else {
        const fallbackItems: FinancialItem[] = [];
        if ((analysis.totalExpenses || 0) > 0) {
          fallbackItems.push({
            id: `monthly-expense-${session.id}`,
            type: 'expense',
            description: `إجمالي مصروفات تحليل جلسة: ${session.title || 'بدون عنوان'}`,
            amount: Number(analysis.totalExpenses) || 0,
            currency: info.symbol,
            category: 'جلسات بلا تواريخ بندية',
            counterparty: session.botName,
            date: `${selectedMonth}-01`,
            isTaxDeductible: true,
          });
        }
        if ((analysis.totalRevenue || 0) > 0) {
          fallbackItems.push({
            id: `monthly-revenue-${session.id}`,
            type: 'revenue',
            description: `إجمالي إيرادات تحليل جلسة: ${session.title || 'بدون عنوان'}`,
            amount: Number(analysis.totalRevenue) || 0,
            currency: info.symbol,
            category: 'جلسات بلا تواريخ بندية',
            counterparty: session.botName,
            date: `${selectedMonth}-01`,
            isTaxDeductible: false,
          });
        }
        pushItems(fallbackItems);
      }
    }

    const reliableInvoices = invoices.filter(
      (invoice) =>
        invoice.date?.startsWith(selectedMonth) &&
        invoice.source !== 'sample' &&
        !invoice.simulated,
    );
    const invoiceItems: FinancialItem[] = reliableInvoices.map((invoice) => ({
      id: `invoice-monthly-${invoice.id}`,
      type: 'revenue',
      description: `فاتورة مبيعات ${invoice.invoiceNumber} — ${invoice.client}`,
      amount: Number(invoice.amount) || 0,
      currency: info.symbol,
      category: invoice.category || 'مبيعات/خدمات',
      counterparty: invoice.client,
      date: invoice.date,
      isTaxDeductible: false,
      deductionReason: `ضريبة الفاتورة المحفوظة: ${roundMoney(Number(invoice.vatAmount) || 0)} ${info.symbol}`,
    }));

    // Prevent the same sale from being counted twice when it was both imported
    // as an invoice and mentioned as a dated revenue item in a transcript.
    const isDuplicateOfInvoice = (item: FinancialItem) =>
      reliableInvoices.some((invoice) => {
        const sameAmount = Math.abs((Number(item.amount) || 0) - (Number(invoice.amount) || 0)) < 0.01;
        const sameDate = item.date === invoice.date;
        const mentionsInvoice =
          item.description?.includes(invoice.invoiceNumber) ||
          item.counterparty?.includes(invoice.client) ||
          item.description?.includes(invoice.client);
        return sameAmount && (sameDate || Boolean(mentionsInvoice));
      });
    const dedupedAnalysisRevenues = analysisRevenues.filter((item) => !isDuplicateOfInvoice(item));

    const expenses = analysisExpenses.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const revenues = [...invoiceItems, ...dedupedAnalysisRevenues].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    const transactions = [...expenses, ...revenues].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );

    const totalExpenses = roundMoney(expenses.reduce((sum, i) => sum + i.amount, 0));
    const totalRevenue = roundMoney(revenues.reduce((sum, i) => sum + i.amount, 0));
    const deductibleExpenses = expenses.filter((item) => item.isTaxDeductible !== false);
    const deductibleBase = roundMoney(deductibleExpenses.reduce((sum, i) => sum + i.amount, 0));
    const invoiceOutputVat = roundMoney(
      reliableInvoices.reduce((sum, invoice) => sum + (Number(invoice.vatAmount) || 0), 0),
    );
    const analysisOutputVat = roundMoney(
      dedupedAnalysisRevenues.reduce((sum, i) => sum + i.amount * vatRate, 0),
    );
    const outputVat = roundMoney(invoiceOutputVat + analysisOutputVat);
    const inputVat = roundMoney(deductibleBase * vatRate);
    const netVat = roundMoney(outputVat - inputVat);
    const netImpact = roundMoney(totalRevenue - totalExpenses);
    const anySimulated = analysesSimulated || reliableInvoices.some((invoice) => invoice.simulated);

    const exportAnalysis: TranscriptFinancialAnalysis = {
      sessionId: `monthly-tax-${selectedMonth}`,
      analyzedAt: Date.now(),
      summary:
        `مسودة تقرير ضريبي لشهر ${selectedMonth} بملف ${info.labelAr}: إيرادات خاضعة قبل الضريبة ` +
        `${totalRevenue}، مصروفات ${totalExpenses}، مخرجات ضريبية ${outputVat} (فواتير ${invoiceOutputVat} + تحليلات ${analysisOutputVat})، ` +
        `مدخلات تقديرية قابلة للخصم ${inputVat}، وصافي ${netVat >= 0 ? 'مستحق للسداد' : 'رصيد دائن مرحّل'} ${Math.abs(netVat)}. ` +
        'هذه مسودة داخلية للمراجعة ولا تُغني عن مراجعة محاسب قانوني أو التقديم عبر المنظومة الضريبية الرسمية.',
      totalExpenses,
      totalRevenue,
      netImpact,
      totalPotentialTaxSavings: inputVat,
      expenses,
      revenues,
      taxDeductions: [
        {
          title: netVat >= 0 ? 'صافي ضريبة القيمة المضافة المستحق للفترة' : 'رصيد ضريبة دائن مرحّل للفترة التالية',
          potentialSavings: inputVat,
          category: currency === 'SAR' ? 'إقرار ZATCA الشهري/الربعي' : 'إقرار قيمة مضافة — نموذج 10',
          reasoning: `مخرجات الضريبة ${outputVat} ناقص مدخلات قابلة للخصم ${inputVat} يساوي ${netVat}.`,
          complianceNote: `تحقق من الفواتير الإلكترونية والمستندات المؤيدة ثم قدّم الإقرار عبر ${info.authorityAr}.`,
        },
      ],
      transactions,
      recommendations: [
        'طابق فواتير المبيعات والمشتريات مع دفاتر الفترة ومنظومة الفاتورة الإلكترونية قبل إغلاق الشهر.',
        'احتفظ بمستندات إثبات لضريبة المدخلات؛ لا تُخصم ضريبة مصروفات غير موثقة أو لا تتعلق بنشاط خاضع للضريبة.',
        currency === 'SAR'
          ? 'راجع موعد تقديم إقرار ZATCA وفق دورة التقديم المسجلة للمنشأة وسدد صافي الضريبة في الميعاد.'
          : 'راجع إقرار نموذج 10 ونموذج 41 (الخصم والتحصيل عند انطباقه) قبل التقديم الشهري/ربع السنوي.',
        `وفورات/استردادات محتملة وردت في التحليلات المصدرية: ${formatMoney(sourcePotentialSavings, currency)} — راجع كل بند منفردًا قبل الاعتماد.`,
      ],
      isSimulated: anySimulated,
    };

    return {
      expenses,
      revenues,
      transactions,
      reliableInvoices,
      includedAnalyses,
      totalExpenses,
      totalRevenue,
      netImpact,
      deductibleBase,
      invoiceOutputVat,
      analysisOutputVat,
      outputVat,
      inputVat,
      netVat,
      sourcePotentialSavings: roundMoney(sourcePotentialSavings),
      anySimulated,
      exportAnalysis,
      expenseCategories: categoryTotals(expenses),
      revenueCategories: categoryTotals(revenues),
    };
  }, [sessions, invoices, selectedMonth, currency, info.symbol, vatRate]);

  const title = `التقرير الضريبي الشهري — ${selectedMonth}`;
  const hasData = report.transactions.length > 0;
  const maxCategoryAmount = Math.max(
    1,
    ...report.expenseCategories.map((c) => c.amount),
    ...report.revenueCategories.map((c) => c.amount),
  );

  const handlePdf = () => {
    const ok = exportAnalysisToPdfViaPrint(report.exportAnalysis, title, info.symbol);
    setExportError(ok ? null : 'حظر المتصفح نافذة الطباعة — اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.');
  };

  const statCard = (
    label: string,
    value: number,
    icon: React.ReactNode,
    tone: string,
    hint: string,
  ) => (
    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5">
      <div className={`flex items-center gap-1.5 text-[11px] font-bold ${tone}`}>
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-lg font-black text-white mt-1.5">{formatMoney(value, currency)}</p>
      <p className="text-[10px] text-slate-500 mt-1">{hint}</p>
    </div>
  );

  const categoryList = (titleText: string, rows: CategoryTotal[], color: string) => (
    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5">
      <h4 className="text-xs font-bold text-white mb-2.5">{titleText}</h4>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.category} className="text-[11px]">
              <div className="flex items-center justify-between gap-2 text-slate-300">
                <span className="truncate">{row.category}</span>
                <b className="text-slate-100 shrink-0">{formatMoney(row.amount, currency)}</b>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 mt-1 overflow-hidden">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: `${Math.max(3, (row.amount / maxCategoryAmount) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500">لا توجد بنود هذا الشهر.</p>
      )}
    </div>
  );

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-cyan-400" />
            <span>التقرير الضريبي الشهري — ضريبة القيمة المضافة</span>
          </h3>
          <p className="text-[11px] leading-5 text-slate-400 mt-1 max-w-3xl">
            يجمع فواتير المبيعات المحفوظة وغير التجريبية مع البنود المؤرخة من تحليلات الجلسات
            (أو تحليل أنشئ في نفس الشهر عند غياب تواريخ البنود)، ثم يحسب مدخلات ومخرجات
            الضريبة وصافي المستحق أو الرصيد الدائن.
          </p>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
          {info.vatLabel}
        </span>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <label className="space-y-1 text-xs">
          <span className="text-slate-400 flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> شهر التقرير</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value || currentMonth())}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
          />
        </label>
        <button
          type="button"
          onClick={() => setSelectedMonth(addMonths(selectedMonth, -1))}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold"
        >
          الشهر السابق
        </button>
        <button
          type="button"
          onClick={() => setSelectedMonth(currentMonth())}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold"
        >
          الشهر الحالي
        </button>
        <span className="text-[11px] text-slate-400 me-auto">
          المصادر: {report.reliableInvoices.length} فاتورة سجل • {report.includedAnalyses} تحليل جلسة • {report.transactions.length} بند
        </span>
      </div>

      {report.anySimulated && (
        <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-[11px] font-bold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>بعض مصادر هذا الشهر صادرة عن محاكاة محلية. هذا التقرير مسودة مراجعة فقط ولا يصلح للتقديم الرسمي قبل التحقق من المستندات الأصلية.</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {statCard('إيرادات قبل الضريبة', report.totalRevenue, <TrendingUp className="w-4 h-4" />, 'text-emerald-300', 'أساس ضريبة المخرجات')}
        {statCard('مخرجات الضريبة', report.outputVat, <ReceiptText className="w-4 h-4" />, 'text-indigo-300', `فواتير ${formatMoney(report.invoiceOutputVat, currency)}`)}
        {statCard('مصروفات الفترة', report.totalExpenses, <TrendingDown className="w-4 h-4" />, 'text-rose-300', 'كل المصروفات المشمولة')}
        {statCard('مدخلات قابلة للخصم', report.inputVat, <PiggyBank className="w-4 h-4" />, 'text-amber-300', `على أساس ${formatMoney(report.deductibleBase, currency)}`)}
        {statCard(
          report.netVat >= 0 ? 'صافي مستحق للسداد' : 'رصيد دائن مرحّل',
          Math.abs(report.netVat),
          <Scale className="w-4 h-4" />,
          report.netVat >= 0 ? 'text-cyan-300' : 'text-teal-300',
          'المخرجات − المدخلات',
        )}
        {statCard('صافي أثر الإيرادات/المصروفات', Math.max(report.netImpact, 0), <Landmark className="w-4 h-4" />, 'text-slate-300', `الأثر الفعلي: ${formatMoney(report.netImpact, currency)}`)}
      </div>

      {hasData ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {categoryList('أهم فئات الإيرادات', report.revenueCategories, 'bg-emerald-500')}
          {categoryList('أهم فئات المصروفات', report.expenseCategories, 'bg-rose-500')}
        </div>
      ) : (
        <div className="p-5 rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 text-center">
          <ReceiptText className="w-8 h-8 mx-auto text-slate-500" />
          <p className="text-sm font-bold text-slate-200 mt-2">لا توجد بيانات ضريبية لهذا الشهر بعد</p>
          <p className="text-[11px] text-slate-400 mt-1">
            أضف فواتير من بطاقة الاستيراد أعلاه أو شغّل تحليلًا ماليًا لجلسة تتضمن بنودًا بتاريخ يقع في {selectedMonth}.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!hasData}
            onClick={() => exportAnalysisToCsv(report.exportAnalysis, title, info.symbol)}
            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            type="button"
            disabled={!hasData}
            onClick={handlePdf}
            className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" /> PDF
          </button>
          <button
            type="button"
            disabled={!hasData}
            onClick={() => void exportAnalysisToXlsx(report.exportAnalysis, title)}
            className="px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" /> Excel
          </button>
          <button
            type="button"
            disabled={!hasData}
            onClick={() => void exportAnalysisToDocx(report.exportAnalysis, title)}
            className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" /> Word
          </button>
        </div>
        <p className="text-[10px] text-slate-500 max-w-xl leading-4">
          الافتراضات: مبالغ البنود قبل الضريبة؛ ضريبة فواتير السجل تؤخذ من حقل الضريبة المحفوظ؛
          مدخلات الضريبة تقديرية على المصروفات غير المستبعدة من الخصم. الملفات المصدرة مسودات داخلية وليست إقرارًا ضريبيًا رسميًا.
        </p>
      </div>
      {exportError && <p className="text-[11px] text-rose-300">{exportError}</p>}
    </section>
  );
};
