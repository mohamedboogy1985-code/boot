import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Clock3,
  Cpu,
  Globe,
  HardDrive,
  Keyboard,
  Loader2,
  MemoryStick,
  MousePointer2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type {
  ChatterBot,
  UserProfile,
  OrchestrationResult,
  OrchestratorTask,
  RealDiagnostics,
  OllamaStatus,
  OllamaToolResult,
  AuditLogItem,
  AdaptersStateResponse,
  AdapterProposalResponse,
  AdapterExecuteResult,
} from '../types';
import { ApiService } from '../services/api';
import { NotificationService } from '../services/notificationService';
import { VoiceController } from './VoiceController';

/* ============================================================
 * Orchestrator panel — text/voice goal -> handleExecuteMultiAgentGoal
 * ============================================================ */

export const OrchestratorPanel: React.FC<{ activeBot: ChatterBot; userProfile: UserProfile }> = ({
  activeBot,
  userProfile,
}) => {
  const [plan, setPlan] = useState<OrchestrationResult | null>(null);
  const [tasks, setTasks] = useState<OrchestratorTask[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notifiedDoneForRef = useRef<number>(0);

  /** Processes BOTH typed and dictated goals coming from VoiceController. */
  const handleExecuteMultiAgentGoal = async (rawText: string) => {
    const goal = rawText.trim();
    if (!goal) return;
    setIsBusy(true);
    setError(null);
    try {
      void NotificationService.requestPermission();
      const result = await ApiService.orchestrateTask(goal, activeBot, userProfile);
      setPlan(result);
      setTasks(result.delegatedTasks);
      NotificationService.notifyTaskPlanReady(result.delegatedTasks.length, Boolean(result.simulated));
    } catch (e: any) {
      setError(e?.message || 'تعذر إنشاء خطة التفويض. تحقق من تشغيل الخادم.');
    } finally {
      setIsBusy(false);
    }
  };

  const toggleTask = (index: number) => {
    setTasks((prev) => {
      const next = prev.map((t, i) =>
        i === index ? { ...t, status: t.status === 'completed' ? ('pending' as const) : ('completed' as const) } : t,
      );
      if (
        plan &&
        next.length > 0 &&
        next.every((t) => t.status === 'completed') &&
        notifiedDoneForRef.current !== plan.createdAt
      ) {
        notifiedDoneForRef.current = plan.createdAt;
        NotificationService.notifyAllTasksCompleted();
      }
      return next;
    });
  };

  const doneCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="space-y-4">
      <VoiceController onExecuteGoal={handleExecuteMultiAgentGoal} isBusy={isBusy} />

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs">{error}</div>
      )}

      {plan && (
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>خطة التفويض متعدد الوكلاء</span>
            </h4>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                plan.simulated
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {plan.simulated ? 'تخطيط استدلالي محلي (محاكاة)' : 'تخطيط Gemini حي'}
            </span>
          </div>
          <p className="text-xs leading-6 text-slate-300">{plan.planSummary}</p>
          <p className="text-[11px] text-cyan-300">🗣️ {plan.speechResponse}</p>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
              style={{ width: tasks.length ? `${(doneCount / tasks.length) * 100}%` : '0%' }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            اكتمل {doneCount} من {tasks.length} — نفّذ كل مهمة من تبويبها المختص ثم ضع علامة الاكتمال هنا. ستصلك إشعارات متصفح عند اكتمال الخطة.
          </p>
          <div className="space-y-2">
            {tasks.map((task, idx) => (
              <label
                key={idx}
                className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800 cursor-pointer hover:border-slate-700"
              >
                <input
                  type="checkbox"
                  checked={task.status === 'completed'}
                  onChange={() => toggleTask(idx)}
                  className="mt-1 w-4 h-4 accent-emerald-500"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <b className="text-xs text-white">{task.taskTitle}</b>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                      {task.agentId}
                    </span>
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Clock3 className="w-3.5 h-3.5 text-amber-400" />
                    )}
                  </span>
                  <span className="block text-[11px] text-slate-400 leading-5 mt-1">{task.instruction}</span>
                  <span className="block text-[11px] text-slate-500 mt-1">المخرج المتوقع: {task.expectedArtifact}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
 * Adapters panel — LLM proposes, USER approves each action
 * ============================================================ */

const ADAPTER_LABELS: Record<string, string> = {
  mouse: 'الفأرة',
  keyboard: 'لوحة المفاتيح',
  browser: 'المتصفح',
  filesystem: 'الملفات',
  windows: 'ويندوز',
  system: 'النظام',
};

export const AdaptersPanel: React.FC = () => {
  const [state, setState] = useState<AdaptersStateResponse | null>(null);
  const [proposal, setProposal] = useState<AdapterProposalResponse | null>(null);
  const [source, setSource] = useState<'user' | 'ollama'>('ollama');
  const [editedParams, setEditedParams] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Array<{ id: string; result: AdapterExecuteResult }>>([]);
  const [rejected, setRejected] = useState<Record<string, boolean>>({});
  const [isProposing, setIsProposing] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState('chrome');
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  const loadState = async () => {
    try {
      const s = await ApiService.getAdaptersState();
      setState(s);
      setPreset(s.browserConfig.userAgentPreset);
      setTimeoutMs(s.browserConfig.timeoutMs);
    } catch {
      setError('تعذر تحميل حالة المحوّلات من الخادم.');
    }
  };

  useEffect(() => {
    void loadState();
  }, []);

  const handleProposeGoal = async (text: string) => {
    setIsProposing(true);
    setError(null);
    try {
      const p = await ApiService.proposeAdapterActions(text, source);
      setProposal(p);
      setResults([]);
      setRejected({});
      setEditedParams(
        Object.fromEntries(p.actions.map((a) => [a.id, JSON.stringify(a.params, null, 0)])),
      );
    } catch (e: any) {
      setError(e?.message || 'تعذر إنشاء مقترحات إجراءات.');
    } finally {
      setIsProposing(false);
    }
  };

  const handleApproveExecute = async (actionId: string) => {
    if (!proposal) return;
    const original = proposal.actions.find((a) => a.id === actionId);
    if (!original) return;
    let params: Record<string, any> = original.params;
    try {
      params = JSON.parse(editedParams[actionId] || '{}');
    } catch {
      setError('صيغة JSON للمعاملات غير صالحة — صحّحها قبل التنفيذ.');
      return;
    }
    const ok = window.confirm(
      `موافقة نهائية؟\nسيتم تنفيذ ${ADAPTER_LABELS[original.adapter]}.${original.action} بالمعاملات:\n${JSON.stringify(params)}\n\nلن يتم تنفيذ أي إجراء آخر تلقائيًا.`,
    );
    if (!ok) return;
    setExecutingId(actionId);
    setError(null);
    try {
      void NotificationService.requestPermission();
      const result = await ApiService.executeAdapterAction({ ...original, params }, true);
      setResults((prev) => [{ id: actionId, result }, ...prev]);
      NotificationService.notifyAdapterResult(
        `${ADAPTER_LABELS[original.adapter]}.${original.action}`,
        result.summary,
      );
      void loadState();
    } catch (e: any) {
      setError(e?.message || 'فشل تنفيذ الإجراء المعتمد.');
    } finally {
      setExecutingId(null);
    }
  };

  const applyBrowserConfig = async () => {
    try {
      const resp = await ApiService.configureBrowserAdapter(preset, timeoutMs);
      setConfigMsg(resp.note || 'تمت تهيئة المتصفح.');
      void loadState();
    } catch {
      setConfigMsg('تعذر حفظ تهيئة المتصفح.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-[11px] leading-6 text-amber-200">
        <b className="flex items-center gap-1.5 text-amber-300">
          <ShieldAlert className="w-4 h-4" /> نموذج الأمان (حماية النظام أولًا)
        </b>
        الـ LLM (Gemini/Ollama) <b>يقترح فقط</b> إجراءات من قائمة بيضاء، ولا يستطيع التنفيذ. كل إجراء يحتاج نقرة «موافقة وتنفيذ» منك
        وتأكيدًا منفصلًا. تحريك الفأرة/الكتابة الفعلي معطّل افتراضيًا (وضع المعاينة) ولا يعمل إلا على جهازك المحلي بعد تفعيل صريح
        (‎ENABLE_DESKTOP_ADAPTERS=true‎ + تثبيت ‎@nut-tree/nut-js‎) ولطلبات نفس الجهاز فقط. لا توجد أي نقطة تنفيذ أوامر نظام في الخادم.
      </div>

      {state && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {state.adapters.map((a) => (
            <div key={a.id} className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <b className="text-xs text-white flex items-center gap-1.5">
                  {a.id === 'mouse' && <MousePointer2 className="w-4 h-4 text-cyan-400" />}
                  {a.id === 'keyboard' && <Keyboard className="w-4 h-4 text-cyan-400" />}
                  {a.id === 'browser' && <Globe className="w-4 h-4 text-cyan-400" />}
                  {a.id === 'filesystem' && <HardDrive className="w-4 h-4 text-cyan-400" />}
                  {a.id === 'windows' && <Bot className="w-4 h-4 text-cyan-400" />}
                  {a.id === 'system' && <Cpu className="w-4 h-4 text-cyan-400" />}
                  {a.nameAr}
                </b>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    a.mode === 'enabled'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {a.mode === 'enabled' ? 'مفعّل (بموافقتك)' : 'معاينة آمنة Dry-Run'}
                </span>
              </div>
              <ul className="text-[11px] text-slate-400 list-disc list-inside">
                {a.capabilities.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="text-[11px] leading-5 text-slate-500">{a.notes}</p>
            </div>
          ))}
        </div>
      )}

      {/* Browser setup */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h4 className="text-sm font-bold text-white">تهيئة محوّل المتصفح</h4>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-slate-400 block">هوية المتصفح (User-Agent)</span>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
            >
              <option value="chrome">Chrome (ويندوز)</option>
              <option value="firefox">Firefox (ويندوز)</option>
              <option value="bot">ChatterBots Bot (شفاف)</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-slate-400 block">مهلة الجلب (مللي ثانية)</span>
            <input
              type="number"
              min={1000}
              max={30000}
              step={500}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white w-32"
            />
          </label>
          <button
            type="button"
            onClick={() => void applyBrowserConfig()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold"
          >
            تطبيق التهيئة
          </button>
        </div>
        {state && <p className="text-[11px] text-slate-500 break-all">UA الحالي: {state.browserConfig.userAgent}</p>}
        {configMsg && <p className="text-[11px] text-emerald-300">{configMsg}</p>}
      </div>

      {/* Propose actions from a goal (typed or dictated) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-bold">مصدر الاقتراح:</span>
          <button
            type="button"
            onClick={() => setSource('ollama')}
            className={`px-3 py-1.5 rounded-lg font-bold border ${source === 'ollama' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 text-slate-300 border-slate-700'}`}
          >
            Ollama محلي (يقترح فقط)
          </button>
          <button
            type="button"
            onClick={() => setSource('user')}
            className={`px-3 py-1.5 rounded-lg font-bold border ${source === 'user' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 text-slate-300 border-slate-700'}`}
          >
            قواعد محلية سريعة
          </button>
        </div>
        <VoiceController
          onExecuteGoal={handleProposeGoal}
          isBusy={isProposing}
          title="هدف للمحوّلات (اكتب أو تحدّث)"
          placeholder="مثال: افتح https://zatca.gov.sa واستخرج الروابط، واعرض ملفات مساحة العمل"
          hint="سيحوّل الهدف إلى إجراءات محددة من القائمة البيضاء لمراجعتها. الاقتراح لا ينفّذ شيئًا — أنت من يوافق على كل إجراء على حدة."
          buttonLabel="اقترح إجراءات آمنة"
        />
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs">{error}</div>}

      {proposal && (
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-bold text-white">إجراءات مقترحة بانتظار موافقتك ({proposal.actions.length})</h4>
            <span className="text-[11px] text-slate-400">
              المحرك: {proposal.engine} {proposal.simulated && '• اقتراح محاكاة/استدلالي'}
            </span>
          </div>
          <p className="text-[11px] leading-5 text-slate-400">{proposal.note}</p>
          <div className="space-y-2.5">
            {proposal.actions.map((action) => (
              <div key={action.id} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <b className="text-xs text-white font-mono">
                    {ADAPTER_LABELS[action.adapter]} . {action.action}
                  </b>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      action.riskLevel === 'medium'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    خطورة {action.riskLevel === 'medium' ? 'متوسطة' : 'منخفضة'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-5">{action.rationale}</p>
                <input
                  type="text"
                  value={editedParams[action.id] ?? ''}
                  onChange={(e) => setEditedParams((prev) => ({ ...prev, [action.id]: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-[11px] font-mono text-cyan-200 focus:outline-none focus:border-cyan-500"
                  aria-label="معاملات الإجراء (JSON قابل للتحرير)"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={executingId === action.id || rejected[action.id]}
                    onClick={() => void handleApproveExecute(action.id)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1.5"
                  >
                    {executingId === action.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    أوافق — نفّذ هذا الإجراء فقط
                  </button>
                  <button
                    type="button"
                    disabled={rejected[action.id]}
                    onClick={() => setRejected((prev) => ({ ...prev, [action.id]: true }))}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-[11px] font-bold flex items-center gap-1.5 border border-slate-700"
                  >
                    <XCircle className="w-3.5 h-3.5" /> رفض
                  </button>
                  {rejected[action.id] && <span className="text-[11px] text-rose-300">تم الرفض — لن يُنفَّذ.</span>}
                </div>
              </div>
            ))}
          </div>

          {results.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <h5 className="text-xs font-bold text-white">نتائج التنفيذ المعتمد</h5>
              {results.map(({ id, result }) => (
                <div key={id + result.summary} className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <p className="text-[11px] font-bold text-slate-200">
                    {result.executed ? '✅ نُفِّذ فعليًا' : result.simulated ? '🧪 معاينة (لم يُنفَّذ على الجهاز)' : '⛔ لم يُنفَّذ'} — {result.summary}
                  </p>
                  {result.detail && (
                    <pre className="text-[11px] text-slate-400 whitespace-pre-wrap mt-2 max-h-48 overflow-auto">{result.detail}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ============================================================
 * Ollama panel
 * ============================================================ */

export const OllamaPanel: React.FC = () => {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [tool, setTool] = useState('accounting');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('كيف أخصم ضريبة المدخلات 14% على ترخيص برنامج محاسبة في إقرار القيمة المضافة بمصر؟');
  const [result, setResult] = useState<OllamaToolResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const load = async () => setStatus(await ApiService.getOllamaStatus());
  useEffect(() => {
    void load();
  }, []);

  const run = async () => {
    setIsBusy(true);
    try {
      setResult(await ApiService.runOllamaTool(tool, prompt, model || undefined));
    } catch (e: any) {
      setResult({ tool, executed: false, summary: e?.message || 'فشل الاتصال', explanation: 'تحقق من الخادم وحالة Ollama.' });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-sm font-bold text-white">جسر الذكاء المحلي Ollama</h4>
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-[11px] font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> تحديث الحالة
          </button>
        </div>
        {status ? (
          <>
            <p className={`text-xs font-bold ${status.isConnected ? 'text-emerald-300' : 'text-amber-300'}`}>
              {status.isConnected ? '🟢 متصل محليًا' : '🟡 غير متصل (يعمل بوضع التفسير فقط — بلا ردود مزيفة)'} — {status.host}
            </p>
            <p className="text-[11px] leading-5 text-slate-400">{status.message}</p>
            <div className="flex flex-wrap gap-2">
              {status.models.map((m) => (
                <span key={m.name} className="text-[11px] px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200">
                  {m.displayName} <span className="text-slate-500">({m.size})</span>
                  {m.recommended && <span className="text-emerald-400 font-bold"> ★</span>}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> جارٍ فحص حالة Ollama…
          </p>
        )}
      </div>

      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-slate-400 block">الأداة</span>
            <select value={tool} onChange={(e) => setTool(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white">
              <option value="accounting">محاسبة مصرية (ETA/14%)</option>
              <option value="generate">توليد عام</option>
              <option value="summarize">تلخيص</option>
              <option value="translate">ترجمة</option>
            </select>
          </label>
          {status?.isConnected && status.models.length > 0 && (
            <label className="space-y-1">
              <span className="text-slate-400 block">النموذج</span>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white">
                <option value="">تلقائي (الأول المتاح)</option>
                {status.models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          aria-label="نص مهمة Ollama"
        />
        <button
          type="button"
          disabled={isBusy || !prompt.trim()}
          onClick={() => void run()}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"
        >
          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          تشغيل محليًا عبر Ollama
        </button>
        <p className="text-[11px] text-slate-500">
          لاستخدام Ollama مع أدوات التحكم: انتقل لتبويب «المحوّلات الآمنة»، اختر مصدر الاقتراح «Ollama»، واكتب هدفك — سيقترح النموذج إجراءات، وتوافق أنت على كل إجراء قبل أي تنفيذ.
        </p>
        {result && (
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <p className={`text-xs font-bold ${result.executed ? 'text-emerald-300' : 'text-amber-300'}`}>{result.summary}</p>
            {result.detail && <pre className="text-xs text-slate-200 whitespace-pre-wrap max-h-80 overflow-auto">{result.detail}</pre>}
            <p className="text-[11px] text-slate-400 leading-5">{result.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================
 * Real diagnostics panel
 * ============================================================ */

export const RealDiagnosticsPanel: React.FC = () => {
  const [data, setData] = useState<RealDiagnostics | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsBusy(true);
    setError(null);
    try {
      setData(await ApiService.getRealDiagnostics());
    } catch {
      setError('تعذر جلب التشخيص الحقيقي من الخادم.');
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const meter = (label: string, pct: number, color: string) => (
    <div>
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="font-mono font-bold text-white">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden mt-1">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );

  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <MemoryStick className="w-4 h-4 text-cyan-400" /> تشخيص النظام الحقيقي (systeminformation)
        </h4>
        <div className="flex items-center gap-2">
          {data && (
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${data.simulated ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>
              {data.simulated ? 'بديل os الأساسي' : 'بيانات عتاد حقيقية'}
            </span>
          )}
          <button type="button" onClick={() => void load()} disabled={isBusy} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50">
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} تحديث
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <p className="font-bold text-white">{data.cpu.brand}</p>
              <p className="text-slate-400">{data.cpu.manufacturer} • {data.cpu.cores} أنوية • {data.cpu.speed}GHz</p>
              {meter('حمل CPU', data.cpu.loadPercent, 'bg-cyan-500')}
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <p className="font-bold text-white">الذاكرة</p>
              <p className="text-slate-400">المستخدم {data.memory.usedMb}MB من {data.memory.totalMb}MB (حر {data.memory.freeMb}MB)</p>
              {meter('استخدام RAM', data.memory.usedPercent, 'bg-indigo-500')}
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <p className="font-bold text-white">{data.os.distro} {data.os.release}</p>
              <p className="text-slate-400 mt-1">{data.os.platform}/{data.os.arch} • {data.os.hostname}</p>
              <p className="text-slate-400">مدة التشغيل: {data.os.uptimeHours} ساعة</p>
              <p className="text-slate-500 text-[11px] mt-1">{new Date(data.timestamp).toLocaleString('ar-EG')}</p>
            </div>
          </div>
          {data.storage.length > 0 && (
            <div>
              <h5 className="text-xs font-bold text-white mb-2">أقراص التخزين</h5>
              <div className="space-y-2">
                {data.storage.map((s) => (
                  <div key={s.fs + s.mount} className="flex items-center gap-3 text-[11px]">
                    <span className="text-slate-300 font-mono w-40 truncate">{s.mount} ({s.usedGb}/{s.sizeGb}GB)</span>
                    <span className="flex-1">{meter('', s.usePercent, 'bg-amber-500')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.processes.length > 0 && (
            <div>
              <h5 className="text-xs font-bold text-white mb-2">أعلى العمليات استهلاكًا للمعالج</h5>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-slate-300">
                  <thead>
                    <tr className="text-slate-500 text-right">
                      <th className="py-1">PID</th><th>العملية</th><th>CPU %</th><th>RAM MB</th><th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.processes.map((p) => (
                      <tr key={p.pid} className="border-t border-slate-800">
                        <td className="py-1 font-mono">{p.pid}</td><td>{p.name}</td><td className="font-mono">{p.cpu}</td><td className="font-mono">{p.ramMb}</td><td>{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ============================================================
 * Security audit panel
 * ============================================================ */

export const SecurityAuditPanel: React.FC = () => {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const load = async () => {
    setIsBusy(true);
    try {
      setItems(await ApiService.getAuditLog());
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> الحارس الأمني وسجل التدقيق
        </h4>
        <button type="button" onClick={() => void load()} disabled={isBusy} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-50">
          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} تحديث
        </button>
      </div>
      <p className="text-[11px] leading-5 text-slate-400">
        كل إجراءات التحكم (تصفح، سكربتات، وكلاء، Ollama، محوّلات) تُصنَّف وتُسجَّل هنا. تنفيذ أوامر النظام معطّل نهائيًا — لا توجد نقطة نهاية تنفيذ Shell في هذا الخادم.
      </p>
      <div className="space-y-1.5 max-h-[480px] overflow-auto">
        {items.length === 0 && <p className="text-xs text-slate-500">لا سجلات بعد.</p>}
        {items.map((item) => (
          <div key={item.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-3">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                item.status === 'blocked'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : item.riskLevel === 'medium'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {item.status === 'blocked' ? 'محظور' : item.riskLevel === 'medium' ? 'مسموح/متوسط' : 'مسموح'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-200 font-mono truncate">
                {item.category} • {item.action} • {item.target}
              </p>
              <p className="text-[11px] text-slate-400 leading-5">{item.reason}</p>
              <p className="text-[10px] text-slate-600">{new Date(item.timestamp).toLocaleString('ar-EG')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
