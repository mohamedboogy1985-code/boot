import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AccountingInvoice, CurrencyCode } from '../types';
import { ApiService } from '../services/api';
import { CURRENCIES, formatMoney } from '../services/currency';
import { prepareImageForUpload, readFileAsDataUrl } from '../services/videoManager';

interface InvoiceImportCardProps {
  currency: CurrencyCode;
  onAddInvoices: (invoices: AccountingInvoice[]) => number;
}

interface ImportFileState {
  id: string;
  name: string;
  kind: 'spreadsheet' | 'document';
  status: 'processing' | 'done' | 'error';
  detail: string;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TODAY = () => new Date().toISOString().slice(0, 10);
const IN_14_DAYS = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== 'string') return 0;
  const normalized = normalizeDigits(value)
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function parseDateValue(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))
      .toISOString()
      .slice(0, 10);
  }
  if (typeof value === 'number' && value > 20000 && value < 100000) {
    // Excel serial date (days since 1899-12-30)
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  if (typeof value !== 'string') return '';
  const raw = normalizeDigits(value).trim().replace(/\//g, '-');
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) {
    const [y, m, d] = raw.slice(0, 10).split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[\s_-]+/g, ' ');
}

function findHeader(headers: string[], aliases: string[]): string | undefined {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.find((header) => {
    const normalized = normalizeHeader(header);
    return normalizedAliases.some((alias) => normalized === alias || normalized.includes(alias));
  });
}

function normalizeCurrency(value: unknown, fallback: CurrencyCode): CurrencyCode {
  const raw = String(value || '');
  if (/USD|\$|دولار/i.test(raw)) return 'USD';
  if (/SAR|ر\.س|ريال/i.test(raw)) return 'SAR';
  if (/EGP|ج\.م|جنيه/i.test(raw)) return 'EGP';
  return fallback;
}

function normalizeStatus(value: unknown, dueDate: string): AccountingInvoice['status'] {
  const raw = String(value || '').toLowerCase();
  if (/paid|settled|مدفوع|مسدد|خالص/.test(raw)) return 'paid';
  if (/overdue|late|متأخر/.test(raw)) return 'overdue';
  return dueDate && dueDate < TODAY() ? 'overdue' : 'pending';
}

const FIELD_ALIASES: Record<string, string[]> = {
  invoiceNumber: ['invoice number', 'invoice no', 'invoice', 'number', 'no', 'رقم الفاتورة', 'رقم فاتورة', 'الفاتورة', 'رقم'],
  client: ['client', 'customer', 'customer name', 'name', 'العميل', 'اسم العميل', 'الزبون', 'المورد', 'الجهة'],
  amount: ['amount', 'total', 'grand total', 'value', 'net amount', 'المبلغ', 'الإجمالي', 'اجمالي', 'القيمة', 'قيمة الفاتورة', 'المبلغ الإجمالي', 'صافي'],
  vatAmount: ['vat amount', 'vat', 'tax amount', 'tax', 'الضريبة', 'ضريبة القيمة المضافة', 'قيمة الضريبة', 'مبلغ الضريبة', 'ق م'],
  date: ['invoice date', 'issue date', 'date', 'تاريخ الفاتورة', 'تاريخ الإصدار', 'التاريخ'],
  dueDate: ['due date', 'payment due', 'due', 'تاريخ الاستحقاق', 'الاستحقاق', 'تاريخ السداد'],
  category: ['category', 'type', 'الفئة', 'التصنيف', 'البند', 'نوع الخدمة', 'الوصف'],
  status: ['status', 'state', 'الحالة', 'حالة السداد'],
  currency: ['currency', 'العملة'],
};

export const InvoiceImportCard: React.FC<InvoiceImportCardProps> = ({ currency, onAddInvoices }) => {
  const [drafts, setDrafts] = useState<AccountingInvoice[]>([]);
  const [filesState, setFilesState] = useState<ImportFileState[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const vatRate = CURRENCIES[currency].vatRate;

  const invalidCount = useMemo(
    () =>
      drafts.filter(
        (inv) =>
          !inv.invoiceNumber.trim() ||
          !inv.client.trim() ||
          !inv.date ||
          !inv.dueDate ||
          !(Number(inv.amount) > 0),
      ).length,
    [drafts],
  );
  const draftTotal = useMemo(() => drafts.reduce((s, i) => s + (Number(i.amount) || 0), 0), [drafts]);
  const draftVat = useMemo(() => drafts.reduce((s, i) => s + (Number(i.vatAmount) || 0), 0), [drafts]);
  const simulatedCount = drafts.filter((i) => i.simulated).length;

  const updateFileState = (id: string, patch: Partial<ImportFileState>) => {
    setFilesState((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const parseSpreadsheet = async (file: File): Promise<{ invoices: AccountingInvoice[]; skipped: number }> => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('الملف لا يحتوي على أي ورقة بيانات.');

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: '',
      raw: true,
    });
    if (!rows.length) throw new Error('لم يتم العثور على صفوف بيانات في الملف.');

    const headers = Object.keys(rows[0]);
    const columns: Record<string, string | undefined> = {};
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      columns[field] = findHeader(headers, aliases);
    }
    if (!columns.amount) {
      throw new Error('لم يتم التعرف على عمود المبلغ. أعد تسميته إلى «المبلغ» أو Amount ثم حاول مجددًا.');
    }
    const get = (row: Record<string, unknown>, field: string) =>
      columns[field] ? row[columns[field] as string] : '';

    let skipped = 0;
    const invoices: AccountingInvoice[] = [];
    rows.forEach((row, index) => {
      const amount = parseAmount(get(row, 'amount'));
      const invoiceNumber = String(get(row, 'invoiceNumber') || '').trim();
      const client = String(get(row, 'client') || '').trim();
      if (amount <= 0 || (!invoiceNumber && !client)) {
        skipped++;
        return;
      }
      const date = parseDateValue(get(row, 'date')) || TODAY();
      const dueDate = parseDateValue(get(row, 'dueDate')) || IN_14_DAYS();
      const explicitVat = columns.vatAmount ? parseAmount(get(row, 'vatAmount')) : 0;
      invoices.push({
        id: `sheet-${Date.now()}-${index}`,
        invoiceNumber: invoiceNumber || `IMP-${index + 1}`,
        client: client || 'عميل يحتاج مراجعة',
        amount,
        date,
        dueDate,
        status: normalizeStatus(get(row, 'status'), dueDate),
        vatAmount: explicitVat > 0 ? explicitVat : Math.round(amount * vatRate * 100) / 100,
        category: String(get(row, 'category') || '').trim() || 'مبيعات/خدمات',
        currency: normalizeCurrency(get(row, 'currency'), currency),
        source: 'spreadsheet',
        simulated: false,
        notes: explicitVat > 0 ? undefined : 'حُسبت الضريبة تلقائيًا من مبلغ الفاتورة — راجعها مقابل الأصل.',
        sourceFileName: file.name,
      });
    });
    return { invoices, skipped };
  };

  const extractDocument = async (file: File): Promise<AccountingInvoice> => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const prepared = isPdf
      ? { dataUrl: await readFileAsDataUrl(file), mimeType: 'application/pdf' }
      : await prepareImageForUpload(file);
    const result = await ApiService.extractInvoice(prepared.dataUrl, prepared.mimeType, file.name, currency);
    return {
      ...result.invoice,
      currency: normalizeCurrency(result.invoice.currency, currency),
      source: 'extracted',
      sourceFileName: file.name,
    };
  };

  const processFiles = async (incoming: File[]) => {
    if (!incoming.length || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    setNotice(null);

    for (const file of incoming) {
      const lower = file.name.toLowerCase();
      const isSpreadsheet = /\.(csv|xls|xlsx)$/.test(lower) || /spreadsheet|csv/.test(file.type);
      const stateId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setFilesState((prev) => [
        {
          id: stateId,
          name: file.name,
          kind: isSpreadsheet ? 'spreadsheet' : 'document',
          status: 'processing',
          detail: isSpreadsheet ? 'جارٍ قراءة الجدول...' : 'جارٍ استخراج الفاتورة...',
        },
        ...prev,
      ]);

      try {
        if (file.size > MAX_FILE_BYTES) throw new Error('الملف أكبر من 10MB.');
        if (isSpreadsheet) {
          const { invoices, skipped } = await parseSpreadsheet(file);
          if (!invoices.length) throw new Error('لا توجد صفوف فواتير صالحة في هذا الملف.');
          setDrafts((prev) => [...invoices, ...prev]);
          updateFileState(stateId, {
            status: 'done',
            detail: `${invoices.length} فاتورة جاهزة للمراجعة${skipped ? ` — تم تخطي ${skipped} صفًا غير صالح` : ''}`,
          });
        } else if (file.type.startsWith('image/') || lower.endsWith('.pdf') || file.type === 'application/pdf') {
          const invoice = await extractDocument(file);
          setDrafts((prev) => [invoice, ...prev]);
          updateFileState(stateId, {
            status: 'done',
            detail: invoice.simulated
              ? 'أُنشئت مسودة محاكاة — عدّل الحقول مقابل الأصل قبل الإضافة'
              : `تم الاستخراج بثقة ${Math.round((invoice.confidence ?? 0) * 100)}%`,
          });
        } else {
          throw new Error('نوع ملف غير مدعوم. استخدم CSV/Excel أو صورة أو PDF.');
        }
      } catch (e: any) {
        updateFileState(stateId, { status: 'error', detail: e?.message || 'تعذرت معالجة الملف.' });
      }
    }
    setIsProcessing(false);
  };

  const updateDraft = (id: string, patch: Partial<AccountingInvoice>) => {
    setDrafts((prev) => prev.map((inv) => (inv.id === id ? { ...inv, ...patch } : inv)));
  };

  const handleAddAll = () => {
    if (!drafts.length || invalidCount) return;
    const added = onAddInvoices(
      drafts.map((inv) => ({
        ...inv,
        invoiceNumber: inv.invoiceNumber.trim(),
        client: inv.client.trim(),
        category: inv.category.trim() || 'مبيعات/خدمات',
        amount: Number(inv.amount) || 0,
        vatAmount: Number(inv.vatAmount) || 0,
        currency: normalizeCurrency(inv.currency, currency),
      })),
    );
    setDrafts([]);
    setNotice(
      added === drafts.length
        ? `تمت إضافة ${added} فاتورة إلى السجل وحفظها محليًا على هذا الجهاز.`
        : `تمت إضافة ${added} من ${drafts.length} فاتورة — تخطّى النظام الصفوف المكررة (نفس الرقم/العميل/المبلغ/التاريخ).`,
    );
  };

  const inputCls =
    'w-full min-w-[104px] bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-indigo-500';

  return (
    <section className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FileUp className="w-5 h-5 text-indigo-400" />
            <span>استيراد واستخراج الفواتير جماعيًا</span>
          </h3>
          <p className="text-[11px] leading-5 text-slate-400 mt-1 max-w-3xl">
            ارفع ملفات Excel/CSV لاستيراد فواتير حقيقية مباشرة، أو صور/PDF فواتير ليستخرجها Gemini (أو مسودة محاكاة
            موسومة بوضوح عند غياب المفتاح). لن يُحفظ أي شيء في السجل حتى تراجع الجدول وتضغط «إضافة».
          </p>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          CSV • Excel • PDF • صور
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.xls,.xlsx,image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          void processFiles(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          void processFiles(Array.from(e.dataTransfer.files || []));
        }}
        className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-colors ${
          isDragOver ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700 bg-slate-950/60 hover:border-indigo-500/60'
        }`}
      >
        {isProcessing ? (
          <Loader2 className="w-8 h-8 mx-auto text-indigo-400 animate-spin" />
        ) : (
          <Upload className="w-8 h-8 mx-auto text-indigo-400" />
        )}
        <p className="text-sm font-bold text-white mt-2">اسحب ملفات الفواتير هنا أو انقر للاختيار</p>
        <p className="text-[11px] text-slate-400 mt-1">
          حتى 10MB لكل ملف. لجداول البيانات يُفضّل وجود أعمدة: رقم الفاتورة، العميل، المبلغ، الضريبة، التاريخ، الاستحقاق، الحالة.
        </p>
      </div>

      {filesState.length > 0 && (
        <div className="space-y-1.5 max-h-32 overflow-auto">
          {filesState.slice(0, 8).map((file) => (
            <div key={file.id} className="flex items-center gap-2 text-[11px] bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2">
              {file.kind === 'spreadsheet' ? (
                <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="font-bold text-slate-200 truncate max-w-[220px]">{file.name}</span>
              <span className="text-slate-400 flex-1">{file.detail}</span>
              {file.status === 'processing' && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-300" />}
              {file.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              {file.status === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-[11px] text-rose-300">{error}</p>}
      {notice && (
        <p className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold">
          {notice}
        </p>
      )}

      {drafts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-slate-300">
              <b className="text-white">{drafts.length}</b> مسودة بانتظار المراجعة • الإجمالي{' '}
              <b className="text-white">{formatMoney(draftTotal, currency)}</b> • الضريبة{' '}
              <b className="text-white">{formatMoney(draftVat, currency)}</b>
              {simulatedCount > 0 && (
                <span className="text-amber-300"> • {simulatedCount} مسودة محاكاة تحتاج تحققًا كاملًا</span>
              )}
              {invalidCount > 0 && (
                <span className="text-rose-300"> • {invalidCount} صف ناقص البيانات</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDrafts([])}
                className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold"
              >
                مسح المسودات
              </button>
              <button
                type="button"
                onClick={handleAddAll}
                disabled={isProcessing || invalidCount > 0}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> إضافة {drafts.length} إلى سجل الفواتير
              </button>
            </div>
          </div>

          <div className="overflow-auto max-h-96 border border-slate-800 rounded-2xl">
            <table className="w-full min-w-[1080px] text-[11px] text-slate-300">
              <thead className="bg-slate-950 sticky top-0 z-10">
                <tr className="text-right text-slate-400">
                  <th className="p-2">المصدر</th>
                  <th className="p-2">رقم الفاتورة *</th>
                  <th className="p-2">العميل *</th>
                  <th className="p-2">التاريخ *</th>
                  <th className="p-2">الاستحقاق *</th>
                  <th className="p-2">المبلغ قبل الضريبة *</th>
                  <th className="p-2">الضريبة</th>
                  <th className="p-2">الفئة</th>
                  <th className="p-2">الحالة</th>
                  <th className="p-2">حذف</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((inv) => {
                  const invalid = !inv.invoiceNumber.trim() || !inv.client.trim() || !inv.date || !inv.dueDate || !(inv.amount > 0);
                  return (
                    <tr key={inv.id} className={`border-t border-slate-800 ${invalid ? 'bg-rose-950/20' : ''}`}>
                      <td className="p-2 align-top">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800 border border-slate-700 font-bold whitespace-nowrap">
                          {inv.source === 'spreadsheet' ? <FileSpreadsheet className="w-3 h-3 text-emerald-400" /> : <Sparkles className="w-3 h-3 text-indigo-400" />}
                          {inv.source === 'spreadsheet' ? 'جدول' : 'استخراج'}
                        </span>
                        {inv.simulated && (
                          <span className="block mt-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold whitespace-nowrap">
                            محاكاة
                          </span>
                        )}
                        {typeof inv.confidence === 'number' && inv.source !== 'spreadsheet' && (
                          <span className="block mt-1 text-slate-500">ثقة {Math.round(inv.confidence * 100)}%</span>
                        )}
                      </td>
                      <td className="p-2"><input className={inputCls} value={inv.invoiceNumber} onChange={(e) => updateDraft(inv.id, { invoiceNumber: e.target.value })} /></td>
                      <td className="p-2"><input className={`${inputCls} min-w-[160px]`} value={inv.client} onChange={(e) => updateDraft(inv.id, { client: e.target.value })} /></td>
                      <td className="p-2"><input type="date" className={inputCls} value={inv.date} onChange={(e) => updateDraft(inv.id, { date: e.target.value })} /></td>
                      <td className="p-2"><input type="date" className={inputCls} value={inv.dueDate} onChange={(e) => updateDraft(inv.id, { dueDate: e.target.value })} /></td>
                      <td className="p-2"><input type="number" min={0} step="0.01" className={inputCls} value={inv.amount} onChange={(e) => updateDraft(inv.id, { amount: Number(e.target.value) })} /></td>
                      <td className="p-2"><input type="number" min={0} step="0.01" className={inputCls} value={inv.vatAmount} onChange={(e) => updateDraft(inv.id, { vatAmount: Number(e.target.value) })} /></td>
                      <td className="p-2"><input className={inputCls} value={inv.category} onChange={(e) => updateDraft(inv.id, { category: e.target.value })} /></td>
                      <td className="p-2">
                        <select className={inputCls} value={inv.status} onChange={(e) => updateDraft(inv.id, { status: e.target.value as AccountingInvoice['status'] })}>
                          <option value="pending">قيد الانتظار</option>
                          <option value="paid">مدفوعة</option>
                          <option value="overdue">متأخرة</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== inv.id))}
                          className="p-2 rounded-lg bg-rose-950/60 border border-rose-600/40 text-rose-300"
                          title="حذف المسودة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] leading-5 text-slate-500 flex items-start gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              «المبلغ قبل الضريبة» هو الأساس المستخدم في هذا التطبيق لحساب مخرجات ضريبة القيمة المضافة. عند استخراج صورة/PDF
              بإجمالي شامل الضريبة يحوّله الخادم إلى صافي + ضريبة. راجع المبالغ والتواريخ مقابل أصل كل مستند قبل الإضافة.
              <X className="hidden" />
            </span>
          </p>
        </div>
      )}
    </section>
  );
};
