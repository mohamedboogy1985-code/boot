import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import {
  PieChart as PieIcon,
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShieldCheck,
  Filter,
  Layers,
  Sparkles,
  Maximize2,
  Minimize2,
  Percent,
  CheckCircle2
} from 'lucide-react';
import {
  ConversationSession,
  TranscriptFinancialAnalysis,
  FinancialItem,
  UserProfile,
  ChatterBot
} from '../types';

interface FinancialDistributionChartsProps {
  sessions: ConversationSession[];
  selectedSessionId?: string;
  onSelectSessionId?: (id: string) => void;
  userProfile?: UserProfile;
  activeBot?: ChatterBot;
}

// Visual Palette constants
const EXPENSE_COLORS = ['#F59E0B', '#F43F5E', '#FB923C', '#E11D48', '#D97706', '#F87171', '#EF4444'];
const REVENUE_COLORS = ['#10B981', '#059669', '#34D399', '#047857', '#6EE7B7', '#059669', '#14B8A6'];
const NET_COLORS = ['#6366F1', '#8B5CF6', '#3B82F6', '#06B6D4'];

interface CategoryDataPoint {
  category: string;
  amount: number;
  percentage?: number;
  count: number;
  items: string[];
}

interface ComparisonDataPoint {
  category: string;
  revenue: number;
  expense: number;
  net: number;
}

export const FinancialDistributionCharts: React.FC<FinancialDistributionChartsProps> = ({
  sessions,
  selectedSessionId,
  onSelectSessionId,
  userProfile,
  activeBot
}) => {
  // View states
  const [scope, setScope] = useState<'selected' | 'aggregate'>('selected');
  const [chartType, setChartType] = useState<'donut' | 'bar' | 'stream' | 'tax'>('donut');
  const [donutCategory, setDonutCategory] = useState<'expenses' | 'revenues' | 'both'>('both');
  const [activeExpenseIndex, setActiveExpenseIndex] = useState<number | null>(null);
  const [activeRevenueIndex, setActiveRevenueIndex] = useState<number | null>(null);

  // Identify sessions with financial analysis
  const analyzedSessions = useMemo(() => {
    return sessions.filter((s) => Boolean(s.financialAnalysis));
  }, [sessions]);

  // Current active session
  const currentSession = useMemo(() => {
    if (selectedSessionId) {
      return sessions.find((s) => s.id === selectedSessionId) || sessions[0] || null;
    }
    return sessions[0] || null;
  }, [sessions, selectedSessionId]);

  // Extract financial dataset based on scope (single session vs aggregate)
  const financialData = useMemo(() => {
    if (scope === 'selected' && currentSession?.financialAnalysis) {
      const fa = currentSession.financialAnalysis;
      return {
        expenses: fa.expenses || [],
        revenues: fa.revenues || [],
        taxDeductions: fa.taxDeductions || [],
        totalExpenses: fa.totalExpenses || 0,
        totalRevenue: fa.totalRevenue || 0,
        netImpact: fa.netImpact || 0,
        taxSavings: fa.totalPotentialTaxSavings || 0,
        summary: fa.summary || '',
        sessionCount: 1,
      };
    }

    // Aggregate mode across all analyzed sessions
    let allExpenses: FinancialItem[] = [];
    let allRevenues: FinancialItem[] = [];
    let allTax = 0;
    let totalExp = 0;
    let totalRev = 0;

    analyzedSessions.forEach((s) => {
      const fa = s.financialAnalysis;
      if (fa) {
        if (fa.expenses) allExpenses.push(...fa.expenses);
        if (fa.revenues) allRevenues.push(...fa.revenues);
        totalExp += fa.totalExpenses || 0;
        totalRev += fa.totalRevenue || 0;
        allTax += fa.totalPotentialTaxSavings || 0;
      }
    });

    return {
      expenses: allExpenses,
      revenues: allRevenues,
      taxDeductions: [],
      totalExpenses: totalExp,
      totalRevenue: totalRev,
      netImpact: totalRev - totalExp,
      taxSavings: allTax,
      summary: `تجميع شامل لنتائج التدقيق المالي عبر ${analyzedSessions.length} جلسة محادثة مسجلة.`,
      sessionCount: analyzedSessions.length,
    };
  }, [scope, currentSession, analyzedSessions]);

  // Group Expenses by Category
  const expenseCategories = useMemo<CategoryDataPoint[]>(() => {
    const map = new Map<string, { amount: number; count: number; items: string[] }>();
    financialData.expenses.forEach((item) => {
      const cat = item.category || 'مصروفات عامة';
      const current = map.get(cat) || { amount: 0, count: 0, items: [] };
      current.amount += item.amount;
      current.count += 1;
      if (item.description && !current.items.includes(item.description)) {
        current.items.push(item.description);
      }
      map.set(cat, current);
    });

    const total = financialData.totalExpenses || 1;
    const list: CategoryDataPoint[] = [];
    map.forEach((val, cat) => {
      list.push({
        category: cat,
        amount: val.amount,
        count: val.count,
        percentage: Math.round((val.amount / total) * 100),
        items: val.items,
      });
    });

    // Sort descending by amount
    list.sort((a, b) => b.amount - a.amount);
    return list;
  }, [financialData.expenses, financialData.totalExpenses]);

  // Group Revenues by Category
  const revenueCategories = useMemo<CategoryDataPoint[]>(() => {
    const map = new Map<string, { amount: number; count: number; items: string[] }>();
    financialData.revenues.forEach((item) => {
      const cat = item.category || 'إيرادات عامة';
      const current = map.get(cat) || { amount: 0, count: 0, items: [] };
      current.amount += item.amount;
      current.count += 1;
      if (item.description && !current.items.includes(item.description)) {
        current.items.push(item.description);
      }
      map.set(cat, current);
    });

    const total = financialData.totalRevenue || 1;
    const list: CategoryDataPoint[] = [];
    map.forEach((val, cat) => {
      list.push({
        category: cat,
        amount: val.amount,
        count: val.count,
        percentage: Math.round((val.amount / total) * 100),
        items: val.items,
      });
    });

    list.sort((a, b) => b.amount - a.amount);
    return list;
  }, [financialData.revenues, financialData.totalRevenue]);

  // Comparison dataset: combined categories with revenues vs expenses
  const comparisonData = useMemo<ComparisonDataPoint[]>(() => {
    const categoriesSet = new Set<string>();
    expenseCategories.forEach((e) => categoriesSet.add(e.category));
    revenueCategories.forEach((r) => categoriesSet.add(r.category));

    // If categories don't overlap much, also compare sessions or top categories
    const result: ComparisonDataPoint[] = [];
    categoriesSet.forEach((cat) => {
      const exp = expenseCategories.find((e) => e.category === cat)?.amount || 0;
      const rev = revenueCategories.find((r) => r.category === cat)?.amount || 0;
      result.push({
        category: cat,
        revenue: rev,
        expense: exp,
        net: rev - exp,
      });
    });

    // If there are many categories, sort by total volume
    result.sort((a, b) => (b.revenue + b.expense) - (a.revenue + a.expense));
    return result.slice(0, 8); // Top 8 for clean layout
  }, [expenseCategories, revenueCategories]);

  // Stream data across analyzed sessions
  const streamData = useMemo(() => {
    return analyzedSessions.map((s, idx) => {
      const fa = s.financialAnalysis!;
      const label = s.title.length > 20 ? s.title.slice(0, 18) + '...' : s.title;
      return {
        sessionName: label || `جلسة ${idx + 1}`,
        revenue: fa.totalRevenue || 0,
        expense: fa.totalExpenses || 0,
        net: fa.netImpact || 0,
        taxShield: fa.totalPotentialTaxSavings || 0,
      };
    });
  }, [analyzedSessions]);

  // Top metrics
  const topExpenseCat = expenseCategories[0];
  const topRevenueCat = revenueCategories[0];
  const operatingMargin = financialData.totalRevenue > 0
    ? Math.round((financialData.netImpact / financialData.totalRevenue) * 100)
    : 0;

  // Custom Tooltip Formatter
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-950/95 border border-slate-700/80 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs space-y-1.5 z-50">
          <p className="font-bold text-white border-b border-slate-800 pb-1">
            {label || payload[0]?.name || payload[0]?.payload?.category || payload[0]?.payload?.sessionName}
          </p>
          {payload.map((entry: any, index: number) => {
            const val = entry.value;
            const name = entry.name;
            const color = entry.color || entry.fill;
            return (
              <div key={`item-${index}`} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5" style={{ color }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span>{name}:</span>
                </span>
                <span className="font-mono font-bold text-white tabular-nums">
                  {typeof val === 'number' ? `${val.toLocaleString('ar-SA')} ر.س` : val}
                </span>
              </div>
            );
          })}
          {payload[0]?.payload?.percentage !== undefined && (
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
              النسبة المئوية: <strong className="text-indigo-300 font-mono">{payload[0].payload.percentage}%</strong>
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const hasData = financialData.totalExpenses > 0 || financialData.totalRevenue > 0;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
      
      {/* Header with Title and Control Toggles */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1">
              <PieIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>مخططات Recharts البيانية التفاعلية</span>
            </span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-400">
              تحليل توزيع التدفقات المالية المستخرجة من الجلسات
            </span>
          </div>
          <h3 className="text-lg font-extrabold text-white">
            توزيع المصاريف والإيرادات المستخرجة (Financial Analytics)
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            عرض بصري شامل يوضح نسب استهلاك الميزانية، وتوزيع مصادر الدخل، ومقارنة الأثر الصافي والوفر الضريبي المسترد بنقرة زر.
          </p>
        </div>

        {/* Scope and Session Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scope Toggle: Selected vs Aggregate */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setScope('selected')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                scope === 'selected'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>الجلسة المحددة</span>
            </button>
            <button
              onClick={() => setScope('aggregate')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                scope === 'aggregate'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>تجميع الكل ({analyzedSessions.length})</span>
            </button>
          </div>

          {/* Session Selector (active when in single session mode) */}
          {scope === 'selected' && sessions.length > 0 && onSelectSessionId && (
            <select
              value={selectedSessionId || sessions[0]?.id}
              onChange={(e) => onSelectSessionId(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-white text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[190px] truncate"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.title} {s.financialAnalysis ? '✓' : ''}
                </option>
              ))}
            </select>
          )}

          {/* Chart View Modes */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setChartType('donut')}
              className={`p-1.5 rounded-lg transition-all ${
                chartType === 'donut' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="توزيع الفئات الدائري (Donut Charts)"
            >
              <PieIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartType('bar')}
              className={`p-1.5 rounded-lg transition-all ${
                chartType === 'bar' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="مقارنة الأعمدة (Bar Chart)"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartType('stream')}
              className={`p-1.5 rounded-lg transition-all ${
                chartType === 'stream' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="مسار التدفقات والأثر الصافي (Area Stream)"
            >
              <TrendingUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Scorecard Badges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* Total Extracted Expenses */}
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>إجمالي المصروفات</span>
            <span className="p-1 rounded-md bg-amber-500/15 text-amber-400">
              <TrendingDown className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-lg font-black text-white font-mono tabular-nums">
            {financialData.totalExpenses.toLocaleString('ar-SA')}{' '}
            <span className="text-xs text-slate-400 font-normal">ر.س</span>
          </div>
          <p className="text-[11px] text-amber-400/90 mt-1 truncate">
            {topExpenseCat ? `أعلى إنفاق: ${topExpenseCat.category} (${topExpenseCat.percentage}%)` : `${expenseCategories.length} فئات`}
          </p>
        </div>

        {/* Total Extracted Revenues */}
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>إجمالي الإيرادات</span>
            <span className="p-1 rounded-md bg-emerald-500/15 text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-lg font-black text-white font-mono tabular-nums">
            {financialData.totalRevenue.toLocaleString('ar-SA')}{' '}
            <span className="text-xs text-slate-400 font-normal">ر.س</span>
          </div>
          <p className="text-[11px] text-emerald-400/90 mt-1 truncate">
            {topRevenueCat ? `أعلى دخل: ${topRevenueCat.category} (${topRevenueCat.percentage}%)` : `${revenueCategories.length} مصادر`}
          </p>
        </div>

        {/* Net Profit & Margin */}
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>صافي الأثر المالي</span>
            <span className="p-1 rounded-md bg-indigo-500/15 text-indigo-400">
              <DollarSign className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className={`text-lg font-black font-mono tabular-nums ${
            financialData.netImpact >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {financialData.netImpact > 0 ? '+' : ''}
            {financialData.netImpact.toLocaleString('ar-SA')}{' '}
            <span className="text-xs text-slate-400 font-normal">ر.س</span>
          </div>
          <p className="text-[11px] text-indigo-300 mt-1">
            هامش التدفق: <strong className="font-mono">{operatingMargin}%</strong>
          </p>
        </div>

        {/* Potential Tax Savings */}
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>وفر ضريبي مؤهل ZATCA</span>
            <span className="p-1 rounded-md bg-purple-500/15 text-purple-400">
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-lg font-black text-purple-300 font-mono tabular-nums">
            +{financialData.taxSavings.toLocaleString('ar-SA')}{' '}
            <span className="text-xs text-slate-400 font-normal">ر.س</span>
          </div>
          <p className="text-[11px] text-purple-400 mt-1">
            استرداد مدخلات ضريبة القيمة المضافة 15%
          </p>
        </div>

      </div>

      {/* Main Charts Area */}
      {!hasData ? (
        <div className="py-12 text-center bg-slate-950/40 rounded-2xl border border-dashed border-slate-800 p-6 space-y-2">
          <PieIcon className="w-8 h-8 text-indigo-400 mx-auto" />
          <h4 className="text-sm font-bold text-white">لا توجد بيانات مالية مستخرجة للعرض بعد</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            قم باختيار جلسة محادثة واضغط على <strong>"بدء التحليل المالي للمحادثة"</strong> أدناه ليتم استخراج بنود المصروفات والإيرادات ورسم المخططات البيانية تلقائياً.
          </p>
        </div>
      ) : chartType === 'donut' ? (
        /* ================= MODE 1: DONUT PIE CHARTS ================= */
        <div className="space-y-4">
          
          {/* Sub-selector for Donut Focus */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span>توزيع البنود المالية حسب التصنيف</span>
              <span className="text-slate-500">·</span>
              <span className="text-xs text-slate-400 font-normal">
                {donutCategory === 'both' ? 'عرض المصروفات والإيرادات معاً' : donutCategory === 'expenses' ? 'المصروفات فقط' : 'الإيرادات فقط'}
              </span>
            </span>

            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setDonutCategory('both')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  donutCategory === 'both' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل جنباً لجنب
              </button>
              <button
                onClick={() => setDonutCategory('expenses')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  donutCategory === 'expenses' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                المصروفات ({expenseCategories.length})
              </button>
              <button
                onClick={() => setDonutCategory('revenues')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  donutCategory === 'revenues' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                الإيرادات ({revenueCategories.length})
              </button>
            </div>
          </div>

          <div className={`grid gap-6 ${donutCategory === 'both' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
            
            {/* Donut Chart: Expenses Breakdown */}
            {(donutCategory === 'both' || donutCategory === 'expenses') && (
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>توزيع المصروفات حسب التصنيف (Expenses Breakdown)</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-white tabular-nums">
                    {financialData.totalExpenses.toLocaleString('ar-SA')} ر.س
                  </span>
                </div>

                {expenseCategories.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">لا توجد بنود مصروفات مرصودة.</p>
                ) : (
                  <>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={expenseCategories}
                            dataKey="amount"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={3}
                            onMouseEnter={(_, index) => setActiveExpenseIndex(index)}
                          >
                            {expenseCategories.map((_, index) => (
                              <Cell
                                key={`cell-exp-${index}`}
                                fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]}
                                stroke="#0f172a"
                                strokeWidth={2}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Category List & Percentages */}
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {expenseCategories.map((cat, idx) => (
                        <div
                          key={cat.category}
                          className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-900/80 transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: EXPENSE_COLORS[idx % EXPENSE_COLORS.length] }}
                            />
                            <span className="text-white truncate font-medium">{cat.category}</span>
                            <span className="text-[11px] text-slate-500">({cat.count} بنود)</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-amber-300 font-bold tabular-nums">
                              {cat.amount.toLocaleString('ar-SA')} ر.س
                            </span>
                            <span className="font-mono text-[11px] text-slate-400 w-8 text-left">
                              {cat.percentage}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Donut Chart: Revenue Breakdown */}
            {(donutCategory === 'both' || donutCategory === 'revenues') && (
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>توزيع الإيرادات ومصادر الدخل (Revenue Streams)</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-white tabular-nums">
                    {financialData.totalRevenue.toLocaleString('ar-SA')} ر.س
                  </span>
                </div>

                {revenueCategories.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">لا توجد بنود إيرادات مرصودة.</p>
                ) : (
                  <>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={revenueCategories}
                            dataKey="amount"
                            nameKey="category"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={3}
                            onMouseEnter={(_, index) => setActiveRevenueIndex(index)}
                          >
                            {revenueCategories.map((_, index) => (
                              <Cell
                                key={`cell-rev-${index}`}
                                fill={REVENUE_COLORS[index % REVENUE_COLORS.length]}
                                stroke="#0f172a"
                                strokeWidth={2}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Revenue Category List & Percentages */}
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {revenueCategories.map((cat, idx) => (
                        <div
                          key={cat.category}
                          className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-900/80 transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: REVENUE_COLORS[idx % REVENUE_COLORS.length] }}
                            />
                            <span className="text-white truncate font-medium">{cat.category}</span>
                            <span className="text-[11px] text-slate-500">({cat.count} عمليات)</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-emerald-300 font-bold tabular-nums">
                              {cat.amount.toLocaleString('ar-SA')} ر.س
                            </span>
                            <span className="font-mono text-[11px] text-slate-400 w-8 text-left">
                              {cat.percentage}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

          </div>

        </div>
      ) : chartType === 'bar' ? (
        /* ================= MODE 2: GROUPED BAR CHART ================= */
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                <span>مقارنة الإيرادات مقابل المصروفات حسب التصنيف</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                أعمدة توضيحية تقارن حجم الدخل الوارد مقابل العبء المالي في كل قطاع تشغيلي.
              </p>
            </div>
            
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-3 h-3 rounded bg-emerald-500" />
                <span>الإيرادات</span>
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-3 h-3 rounded bg-amber-500" />
                <span>المصروفات</span>
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={comparisonData}
                margin={{ top: 20, right: 20, left: 20, bottom: 35 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="category"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="revenue"
                  name="الإيرادات"
                  fill="#10B981"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={45}
                />
                <Bar
                  dataKey="expense"
                  name="المصروفات"
                  fill="#F59E0B"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={45}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        /* ================= MODE 3: AREA / STREAM TRAJECTORY ================= */
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                <span>مسار الأثر المالي والوفر الضريبي عبر الجلسات</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                تتبع انسيابي لحركة التدفقات الإجمالية وتطور الفائض النقدي في جلسات الاستشارات.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>الإيرادات</span>
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>المصروفات</span>
              </span>
              <span className="flex items-center gap-1.5 text-indigo-400">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>صافي الأثر</span>
              </span>
              <span className="flex items-center gap-1.5 text-purple-400">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span>وفر ضريبي</span>
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={streamData}
                margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
              >
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="sessionName" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="الإيرادات"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRev)"
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  name="المصروفات"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorExp)"
                />
                <Area
                  type="monotone"
                  dataKey="net"
                  name="صافي الأثر"
                  stroke="#6366F1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorNet)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Footer Info & Insights banner */}
      <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
          <span>
            {financialData.summary || 'تم استخراج كافة البيانات وتصنيفها آلياً عبر نماذج الاستدلال المالي.'}
          </span>
        </div>
        <div className="text-[11px] text-slate-400 font-mono shrink-0">
          تحديث ديناميكي • Recharts v3
        </div>
      </div>

    </div>
  );
};
