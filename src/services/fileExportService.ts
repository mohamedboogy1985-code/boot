/**
 * Real Office file export (XLSX / DOCX) — merged from Bogy-Agants (NexusAI).
 *
 * Generates genuine Office Open XML binaries in the browser using `xlsx`
 * (SheetJS) and `docx`, replacing the previous CSV/JSON-only export path
 * for the financial transcript analysis.
 */
// Heavy Office libraries are intentionally loaded only when an export is
// requested, keeping them out of the initial application bundle.
type XlsxModule = typeof import('xlsx');
type DocxModule = typeof import('docx');
import type {
  TranscriptFinancialAnalysis,
  FinancialItem,
  ConversationSession,
} from '../types';

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFileBase(name: string): string {
  const cleaned = (name || 'financial-report')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.slice(0, 60) || 'financial-report';
}

function sheetFromItems(XLSX: XlsxModule, items: FinancialItem[], fallbackLabel: string) {
  const rows =
    items.length > 0
      ? items.map((i) => ({
          الوصف: i.description,
          النوع: i.type === 'expense' ? 'مصروف' : 'إيراد',
          المبلغ: i.amount,
          العملة: i.currency,
          الفئة: i.category,
          'الطرف المقابل': i.counterparty ?? '',
          التاريخ: i.date ?? '',
          'قابل للخصم ضريبيًا': i.isTaxDeductible ? 'نعم' : 'لا',
          'سبب الخصم': i.deductionReason ?? '',
        }))
      : [{ الوصف: fallbackLabel }];
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 42 },
    { wch: 10 },
    { wch: 14 },
    { wch: 9 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 16 },
    { wch: 36 },
  ];
  return ws;
}

/**
 * Export a financial transcript analysis as a real multi-sheet .xlsx workbook:
 * summary / expenses / revenues / tax deductions / all transactions.
 */
export async function exportAnalysisToXlsx(
  analysis: TranscriptFinancialAnalysis,
  title = 'تقرير التحليل المالي',
): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    { البند: 'عنوان التقرير', القيمة: title },
    { البند: 'معرّف الجلسة', القيمة: analysis.sessionId },
    {
      البند: 'تاريخ التحليل',
      القيمة: new Date(analysis.analyzedAt).toLocaleString('ar-EG'),
    },
    { البند: 'ملخص تنفيذي', القيمة: analysis.summary },
    { البند: 'إجمالي المصروفات', القيمة: analysis.totalExpenses },
    { البند: 'إجمالي الإيرادات', القيمة: analysis.totalRevenue },
    { البند: 'صافي التأثير', القيمة: analysis.netImpact },
    {
      البند: 'إجمالي التوفير الضريبي المحتمل',
      القيمة: analysis.totalPotentialTaxSavings,
    },
    {
      البند: 'مصدر البيانات',
      القيمة: analysis.isSimulated
        ? 'محاكاة محلية (خوارزمية استدلالية — بيانات تجريبية، ليست تحليل Gemini حي)'
        : 'تحليل Gemini حي',
    },
    ...(analysis.recommendations ?? []).map((r, idx) => ({
      البند: `توصية ${idx + 1}`,
      القيمة: r,
    })),
  ];
  const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
  summaryWs['!cols'] = [{ wch: 34 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'ملخص تنفيذي');

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromItems(XLSX, analysis.expenses, 'لا توجد مصروفات مرصودة'),
    'المصروفات',
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromItems(XLSX, analysis.revenues, 'لا توجد إيرادات مرصودة'),
    'الإيرادات',
  );

  const taxRows =
    analysis.taxDeductions.length > 0
      ? analysis.taxDeductions.map((t) => ({
          العنوان: t.title,
          'التوفير المحتمل': t.potentialSavings,
          الفئة: t.category,
          التحليل: t.reasoning,
          'ملاحظة الامتثال': t.complianceNote,
        }))
      : [{ العنوان: 'لا توجد رؤى خصم ضريبي' }];
  const taxWs = XLSX.utils.json_to_sheet(taxRows);
  taxWs['!cols'] = [{ wch: 36 }, { wch: 16 }, { wch: 18 }, { wch: 60 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, taxWs, 'الخصومات الضريبية');

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromItems(XLSX, analysis.transactions, 'لا توجد معاملات مرصودة'),
    'كل المعاملات',
  );

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  triggerDownload(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${sanitizeFileBase(title)}.xlsx`,
  );
}

function itemsTable(docx: DocxModule, items: FinancialItem[]) {
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = docx;
  const header = new TableRow({
    children: ['الوصف', 'النوع', 'المبلغ', 'العملة', 'الفئة', 'التاريخ'].map(
      (h) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true })],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
    ),
  });
  const body = items.map(
    (i) =>
      new TableRow({
        children: [
          i.description,
          i.type === 'expense' ? 'مصروف' : 'إيراد',
          String(i.amount),
          i.currency,
          i.category,
          i.date ?? '',
        ].map(
          (c) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun(c)] })],
            }),
        ),
      }),
  );
  return new Table({ rows: [header, ...body], width: { size: 100, type: WidthType.PERCENTAGE } });
}

/**
 * Export a financial transcript analysis as a real .docx report.
 */
export async function exportAnalysisToDocx(
  analysis: TranscriptFinancialAnalysis,
  title = 'تقرير التحليل المالي',
): Promise<void> {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
  const children: Array<InstanceType<DocxModule['Paragraph']> | InstanceType<DocxModule['Table']>> = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: `تاريخ التحليل: ${new Date(analysis.analyzedAt).toLocaleString('ar-EG')} — معرّف الجلسة: ${analysis.sessionId}`,
          italics: true,
        }),
      ],
    }),
  ];

  if (analysis.isSimulated) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'تنبيه: هذا التقرير صادر عن محرك محاكاة استدلالي محلي (بدون تحليل Gemini حي) — البيانات تجريبية ولا تُستخدم كسجلات محاسبية رسمية.',
            bold: true,
          }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({ text: 'الملخص التنفيذي', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun(analysis.summary)] }),
    new Paragraph({
      children: [
        new TextRun(
          `إجمالي المصروفات: ${analysis.totalExpenses} | إجمالي الإيرادات: ${analysis.totalRevenue} | صافي التأثير: ${analysis.netImpact} | التوفير الضريبي المحتمل: ${analysis.totalPotentialTaxSavings}`,
        ),
      ],
    }),
    new Paragraph({ text: 'المصروفات', heading: HeadingLevel.HEADING_1 }),
  );
  if (analysis.expenses.length > 0) children.push(itemsTable(docx, analysis.expenses));
  else children.push(new Paragraph({ children: [new TextRun('لا توجد مصروفات مرصودة.')] }));

  children.push(new Paragraph({ text: 'الإيرادات', heading: HeadingLevel.HEADING_1 }));
  if (analysis.revenues.length > 0) children.push(itemsTable(docx, analysis.revenues));
  else children.push(new Paragraph({ children: [new TextRun('لا توجد إيرادات مرصودة.')] }));

  children.push(new Paragraph({ text: 'رؤى الخصومات الضريبية', heading: HeadingLevel.HEADING_1 }));
  if (analysis.taxDeductions.length > 0) {
    for (const t of analysis.taxDeductions) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${t.title} (توفير محتمل: ${t.potentialSavings})`, bold: true }),
          ],
        }),
        new Paragraph({ children: [new TextRun(t.reasoning)] }),
        new Paragraph({
          children: [new TextRun({ text: `ملاحظة امتثال: ${t.complianceNote}`, italics: true })],
        }),
      );
    }
  } else {
    children.push(new Paragraph({ children: [new TextRun('لا توجد رؤى خصم ضريبي.')] }));
  }

  if (analysis.recommendations && analysis.recommendations.length > 0) {
    children.push(new Paragraph({ text: 'التوصيات', heading: HeadingLevel.HEADING_1 }));
    for (const r of analysis.recommendations) {
      children.push(new Paragraph({ children: [new TextRun(r)], bullet: { level: 0 } }));
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${sanitizeFileBase(title)}.docx`);
}

/**
 * Export a plain conversation session transcript as .docx (useful for records).
 */
export async function exportSessionTranscriptToDocx(
  session: ConversationSession,
): Promise<void> {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
  const children: Array<InstanceType<DocxModule['Paragraph']>> = [
    new Paragraph({ text: session.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${session.botName} — ${new Date(session.createdAt).toLocaleString('ar-EG')}`,
          italics: true,
        }),
      ],
    }),
  ];
  for (const m of session.messages) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${m.sender === 'user' ? session.userName || 'المستخدم' : session.botName}: `,
            bold: true,
          }),
          new TextRun(m.text),
        ],
      }),
    );
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${sanitizeFileBase(session.title)}-transcript.docx`);
}

/* ===== CSV export (Excel-friendly, UTF-8 BOM, Egypt ETA wording) ===== */

function csvCell(value: unknown): string {
  const s = String(value ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

export function exportAnalysisToCsv(
  analysis: TranscriptFinancialAnalysis,
  title = 'تقرير التحليل المالي',
  currencySymbol?: string,
): void {
  const cur =
    currencySymbol ||
    analysis.transactions?.[0]?.currency ||
    analysis.expenses?.[0]?.currency ||
    'ج.م';
  const rows: string[] = [];
  rows.push(csvCell(`تقرير التحليل المالي — ${title}`));
  rows.push(csvCell(`تاريخ التحليل: ${new Date(analysis.analyzedAt).toLocaleString('ar-EG')}`));
  rows.push(
    csvCell(
      `مصدر البيانات: ${analysis.isSimulated ? 'محاكاة استدلالية محلية (تجريبي — ليس سجلًا رسميًا)' : 'تحليل Gemini حي'}`,
    ),
  );
  rows.push('');
  rows.push(['المؤشر', 'القيمة'].map(csvCell).join(','));
  rows.push(['إجمالي المصروفات', `${analysis.totalExpenses} ${cur}`].map(csvCell).join(','));
  rows.push(['إجمالي الإيرادات', `${analysis.totalRevenue} ${cur}`].map(csvCell).join(','));
  rows.push(['صافي التأثير', `${analysis.netImpact} ${cur}`].map(csvCell).join(','));
  rows.push(['التوفير الضريبي المحتمل', `${analysis.totalPotentialTaxSavings} ${cur}`].map(csvCell).join(','));
  rows.push('');
  rows.push(csvCell('كل المعاملات المستخرجة'));
  rows.push(['النوع', 'الوصف', `المبلغ (${cur})`, 'الفئة', 'الطرف المقابل', 'التاريخ', 'قابل للخصم ضريبيًا', 'سبب الخصم'].map(csvCell).join(','));
  for (const t of analysis.transactions || []) {
    rows.push(
      [
        t.type === 'expense' ? 'مصروف' : 'إيراد',
        t.description,
        t.amount,
        t.category,
        t.counterparty || '',
        t.date || '',
        t.isTaxDeductible ? 'نعم' : 'لا',
        t.deductionReason || '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  rows.push('');
  rows.push(csvCell('رؤى الخصومات الضريبية — مصلحة الضرائب المصرية (ETA) / VAT'));
  rows.push(['العنوان', 'التوفير المحتمل', 'الفئة', 'التحليل', 'ملاحظة الامتثال'].map(csvCell).join(','));
  for (const d of analysis.taxDeductions || []) {
    rows.push([d.title, d.potentialSavings, d.category, d.reasoning, d.complianceNote].map(csvCell).join(','));
  }
  rows.push('');
  rows.push(csvCell('الملخص التنفيذي'));
  rows.push(csvCell(analysis.summary));

  const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${sanitizeFileBase(title)}.csv`);
}

/* ===== PDF export (print-ready RTL document -> Save as PDF) ===== */

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Opens a clean, print-optimized RTL report window and triggers the browser
 * print dialog ("Save as PDF"). This rasterizes Arabic correctly (unlike raw
 * jsPDF text without embedded fonts) and produces a downloadable PDF file.
 * Returns false when the popup was blocked.
 */
export function exportAnalysisToPdfViaPrint(
  analysis: TranscriptFinancialAnalysis,
  title = 'تقرير التحليل المالي',
  currencySymbol?: string,
): boolean {
  const cur =
    currencySymbol ||
    analysis.transactions?.[0]?.currency ||
    analysis.expenses?.[0]?.currency ||
    'ج.م';
  const fmt = (n: number) => `${Number(n || 0).toLocaleString('ar-EG')} ${cur}`;
  const itemsRows = (items: typeof analysis.transactions) =>
    items.length
      ? items
          .map(
            (i) =>
              `<tr><td>${escapeHtml(i.description)}</td><td>${i.type === 'expense' ? 'مصروف' : 'إيراد'}</td><td>${fmt(i.amount)}</td><td>${escapeHtml(i.category)}</td><td>${escapeHtml(i.counterparty || '')}</td><td>${escapeHtml(i.date || '')}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="6">لا توجد بنود مرصودة</td></tr>';
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; margin: 32px; color: #0f172a; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 26px 0 8px; border-bottom: 2px solid #0ea5e9; padding-bottom: 4px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 14px; }
  .warn { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px 12px; border-radius: 8px; font-size: 12px; }
  .kpis { display: flex; gap: 10px; flex-wrap: wrap; margin: 14px 0; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; min-width: 150px; }
  .kpi b { display: block; font-size: 16px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; }
  th { background: #e0f2fe; }
  .foot { margin-top: 28px; font-size: 11px; color: #94a3b8; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">منصة ChatterBots Remix — جناح المحاسبة (معايير المحاسبة المصرية) • ${new Date(analysis.analyzedAt).toLocaleString('ar-EG')} • جلسة: ${escapeHtml(analysis.sessionId)}</div>
  ${analysis.isSimulated ? '<div class="warn">تنبيه: هذا التقرير من محرك محاكاة استدلالي محلي — البيانات تجريبية ولا تُستخدم كسجلات محاسبية أو إقرارات رسمية.</div>' : ''}
  <div class="kpis">
    <div class="kpi">إجمالي المصروفات<b>${fmt(analysis.totalExpenses)}</b></div>
    <div class="kpi">إجمالي الإيرادات<b>${fmt(analysis.totalRevenue)}</b></div>
    <div class="kpi">صافي التأثير<b>${fmt(analysis.netImpact)}</b></div>
    <div class="kpi">توفير ضريبي محتمل<b>${fmt(analysis.totalPotentialTaxSavings)}</b></div>
  </div>
  <h2>الملخص التنفيذي</h2>
  <p>${escapeHtml(analysis.summary)}</p>
  <h2>المعاملات المستخرجة</h2>
  <table><thead><tr><th>الوصف</th><th>النوع</th><th>المبلغ</th><th>الفئة</th><th>الطرف المقابل</th><th>التاريخ</th></tr></thead>
  <tbody>${itemsRows(analysis.transactions || [])}</tbody></table>
  <h2>رؤى الخصومات الضريبية</h2>
  ${
    analysis.taxDeductions.length
      ? analysis.taxDeductions
          .map(
            (d) =>
              `<p><b>${escapeHtml(d.title)}</b> — توفير محتمل: ${fmt(d.potentialSavings)}<br/>${escapeHtml(d.reasoning)}<br/><i>امتثال: ${escapeHtml(d.complianceNote)}</i></p>`,
          )
          .join('')
      : '<p>لا توجد رؤى خصم ضريبي.</p>'
  }
  <h2>التوصيات</h2>
  <ul>${(analysis.recommendations || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('') || '<li>—</li>'}</ul>
  <div class="foot">أُنشئ تلقائيًا من تحليل جلسة محادثة صوتية. راجِع الأرقام ومستنداتها قبل أي إقرار ضريبي لدى مصلحة الضرائب المصرية (ETA).</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body>
</html>`;
  const win = window.open('', '_blank', 'noopener,width=900,height=1100');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
