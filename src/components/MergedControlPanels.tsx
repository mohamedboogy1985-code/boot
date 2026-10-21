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
  Copy,
  MemoryStick,
  Monitor,
  MousePointer2,
  Play,
  Terminal,
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
  AdapterActionProposal,
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
  const [copiedCommand, setCopiedCommand] = useState('');
  const [wizardBusy, setWizardBusy] = useState<'mouse' | 'keyboard' | null>(null);
  const [wizardMessage, setWizardMessage] = useState<string | null>(null);
  const [realConfirmations, setRealConfirmations] = useState<Record<string, boolean>>({});
  const [keyboardTestValue, setKeyboardTestValue] = useState('');
  const keyboardTestRef = useRef<HTMLInputElement | null>(null);

  const pageIsLocal =
    typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const desktopAdapterMode = state?.adapters.find((a) => a.id === 'mouse')?.mode;
  const realDesktopReady = Boolean(
    state?.desktopAdaptersEnabled &&
      state?.nutJsInstalled &&
      state?.requestIsLoopback &&
      pageIsLocal &&
      desktopAdapterMode === 'enabled',
  );
  const needsRealConfirmation = (action: AdapterActionProposal) =>
    (action.adapter === 'mouse' || action.adapter === 'keyboard') &&
    state?.adapters.find((a) => a.id === action.adapter)?.mode === 'enabled';

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
      setRealConfirmations({});
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
    const isRealDesktopAction = needsRealConfirmation(original);
    const ok = window.confirm(
      `${isRealDesktopAction ? '⚠️ تنفيذ حقيقي على جهازك (ليس معاينة). راجع النافذة المركّزة والمعاملات قبل التأكيد.\n' : ''}موافقة نهائية؟\nسيتم تنفيذ ${ADAPTER_LABELS[original.adapter]}.${original.action} بالمعاملات:\n${JSON.stringify(params)}\n\nلن يتم تنفيذ أي إجراء آخر تلقائيًا.`,
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

  const copyCommand = async (key: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(key);
      window.setTimeout(() => {
        setCopiedCommand((current) => (current === key ? '' : current));
      }, 2000);
    } catch {
      setWizardMessage('تعذر النسخ التلقائي في هذا المتصفح — حدّد نص الأمر يدويًا ثم انسخه.');
    }
  };

  const runWizardTest = async (kind: 'mouse' | 'keyboard') => {
    const testAction: AdapterActionProposal =
      kind === 'mouse'
        ? {
            id: `wizard-mouse-${Date.now()}`,
            adapter: 'mouse',
            action: 'move',
            params: { x: 300, y: 300 },
            rationale: 'اختبار إعداد آمن: تحريك المؤشر فقط دون أي نقر.',
            riskLevel: 'low',
            status: 'awaiting-approval',
          }
        : {
            id: `wizard-keyboard-${Date.now()}`,
            adapter: 'keyboard',
            action: 'type',
            params: { text: 'ChatterBots desktop test ✓' },
            rationale: 'اختبار إعداد آمن: كتابة نص ثابت داخل حقل الاختبار في هذه الصفحة.',
            riskLevel: 'low',
            status: 'awaiting-approval',
          };

    const modeWarning = realDesktopReady
      ? '⚠️ التنفيذ الحقيقي مفعّل: سيصل هذا الإجراء فعليًا إلى جهازك.'
      : 'سيعمل هذا الاختبار الآن في وضع المعاينة الآمن Dry-Run لأن شروط التنفيذ الحقيقي غير مكتملة.';
    const detail =
      kind === 'mouse'
        ? 'سيتحرك المؤشر إلى (300, 300) دون نقر أو فتح أي شيء.'
        : 'ستتم كتابة نص الاختبار الثابت داخل الحقل الآمن أدناه. بعد الموافقة لا تغيّر تركيز النافذة حتى ينتهي الاختبار.';
    if (!window.confirm(`${modeWarning}\n\n${detail}\n\nهل توافق على هذا الإجراء الواحد فقط؟`)) return;

    setWizardBusy(kind);
    setWizardMessage(null);
    setError(null);
    try {
      if (kind === 'keyboard') {
        setKeyboardTestValue('');
        keyboardTestRef.current?.focus();
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
      const result = await ApiService.executeAdapterAction(testAction, true);
      setResults((prev) => [{ id: testAction.id, result }, ...prev]);
      setWizardMessage(
        result.summary +
          (kind === 'keyboard' && result.executed ? ' تحقق من ظهور النص داخل حقل الاختبار.' : ''),
      );
      void loadState();
    } catch (e: any) {
      setWizardMessage(e?.message || 'تعذر تشغيل اختبار إعداد سطح المكتب.');
    } finally {
      setWizardBusy(null);
    }
  };

  const setupSteps = [
    {
      done: pageIsLocal,
      title: 'افتح التطبيق من نفس جهاز ويندوز',
      detail: pageIsLocal
        ? 'تم: هذه الصفحة مفتوحة محليًا.'
        : 'هذه الصفحة ليست localhost. النشر السحابي لا يمكنه تحريك فأرة جهازك؛ شغّل المشروع محليًا وافتح http://localhost:3000.',
    },
    {
      done: Boolean(state?.requestIsLoopback),
      title: 'الخادم يرى الطلب كطلب Loopback',
      detail: state
        ? state.requestIsLoopback
          ? 'تم: الطلب قادم من نفس الجهاز الذي يعمل عليه الخادم.'
          : 'الطلب الحالي لا يبدو قادمًا من نفس الجهاز، وسيظل التنفيذ الحقيقي محظورًا أمنيًا.'
        : 'جارٍ قراءة حالة الخادم…',
    },
    {
      done: Boolean(state?.nutJsInstalled),
      title: 'تثبيت محرك الإدخال الاختياري',
      detail: state?.nutJsInstalled
        ? 'تم: ‎@nut-tree/nut-js‎ مثبت على الخادم المحلي.'
        : 'ثبّت ‎@nut-tree/nut-js‎ مرة واحدة داخل مجلد المشروع على جهازك.',
    },
    {
      done: Boolean(state?.desktopAdaptersEnabled),
      title: 'السماح الصريح من مشغّل الجهاز',
      detail: state?.desktopAdaptersEnabled
        ? 'تم: ‎ENABLE_DESKTOP_ADAPTERS=true‎.'
        : 'عيّن ‎ENABLE_DESKTOP_ADAPTERS=true‎ ثم أعد تشغيل الخادم. لا تستخدم هذا الوضع على خادم عام أو شبكة مشتركة.',
    },
    {
      done: realDesktopReady,
      title: 'جاهزية التنفيذ الحقيقي المشروط بموافقتك',
      detail:
        'حتى عند اكتمال كل الشروط، كل إجراء يحتاج إقرارًا منفصلًا وتأكيدًا نهائيًا. تنفيذ أوامر النظاميبقى معطّلًا كليًا by design.',
    },
  ];

  const setupCommands = [
    {
      id: 'clone',
      label: '1) الحصول على المشروع وتثبيت تبعياته',
      command: 'git clone https://github.com/mohamedboogy1985-code/boot.git\ncd boot\nnpm install',
    },
    {
      id: 'nut',
      label: '2) تثبيت محرك الفأرة/لوحة المفاتيح الاختياري',
      command: 'npm i @nut-tree/nut-js',
    },
    {
      id: 'env',
      label: '3) أضف هذا السطر إلى ملف .env',
      command: 'ENABLE_DESKTOP_ADAPTERS=true',
    },
    {
      id: 'run',
      label: '4) أو بدّل المتغير لجلسة PowerShell واحدة ثم شغّل',
      command: '$env:ENABLE_DESKTOP_ADAPTERS="true"\nnpm run dev',
    },
    {
      id: 'open',
      label: '5) افتح التطبيق من نفس الجهاز فقط',
      command: 'http://localhost:3000',
    },
  ];

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

      {/* Local desktop-control setup wizard */}
      {state && (
        <section className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Monitor className="w-4 h-4 text-cyan-400" />
              <span>معالج تفعيل التحكم بسطح المكتب على جهازك</span>
            </h4>
            <button
              type="button"
              onClick={() => void loadState()}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-[11px] font-bold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> إعادة فحص الجاهزية
            </button>
          </div>

          <div
            className={`p-3 rounded-xl border text-[11px] leading-6 font-bold ${
              realDesktopReady
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            }`}
          >
            {realDesktopReady ? (
              <span className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-1 shrink-0" />
                التنفيذ الحقيقي جاهز على هذا الجهاز — لكنه ما يزال محصورًا بإقرار وموافقة منفصلين لكل إجراء، ولا يشمل أي تنفيذ أوامر نظام.
              </span>
            ) : (
              <span className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 mt-1 shrink-0" />
                أنت الآن في وضع المعاينة الآمن Dry-Run. أكمل الخطوات الناقصة أدناه على جهاز ويندوز الذي يعمل عليه الخادم، ثم أعد الفحص.
              </span>
            )}
          </div>

          <p className="text-[11px] leading-5 text-slate-400">
            منصة الخادم: <b className="text-slate-200">{state.serverPlatform}</b> • الصفحة محلية:{' '}
            <b className="text-slate-200">{pageIsLocal ? 'نعم' : 'لا'}</b> • الطلب Loopback:{' '}
            <b className="text-slate-200">{state.requestIsLoopback ? 'نعم' : 'لا'}</b> • ‎nut.js‎:{' '}
            <b className="text-slate-200">{state.nutJsInstalled ? 'مثبت' : 'غير مثبت'}</b> • إذن التشغيل:{' '}
            <b className="text-slate-200">{state.desktopAdaptersEnabled ? 'true' : 'false'}</b>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2.5">
            {setupSteps.map((step, index) => (
              <div key={step.title} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-white">
                  {step.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Clock3 className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span>{index + 1}. {step.title}</span>
                </div>
                <p className="text-[10px] leading-5 text-slate-400 mt-1.5">{step.detail}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" /> أوامر الإعداد على ويندوز (راجعها ثم انسخها)
            </h5>
            {setupCommands.map((item) => (
              <div key={item.id} className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800">
                  <span className="text-[11px] font-bold text-slate-200">{item.label}</span>
                  <button
                    type="button"
                    onClick={() => void copyCommand(item.id, item.command)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> {copiedCommand === item.id ? 'تم النسخ' : 'نسخ'}
                  </button>
                </div>
                <pre dir="ltr" className="text-left whitespace-pre-wrap break-all px-3 py-2 text-[11px] leading-5 font-mono text-cyan-200">{item.command}</pre>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <MousePointer2 className="w-4 h-4 text-cyan-400" /> اختبار فأرة آمن — تحريك فقط
              </h5>
              <p className="text-[11px] leading-5 text-slate-400">
                الاختبار المعتمد يحرك المؤشر إلى (300, 300) ولا ينقر ولا يفتح أي عنصر. في الوضع الحالي سيظهر في النتائج ما إذا كان تنفيذًا فعليًا أم معاينة.
              </p>
              <button
                type="button"
                disabled={wizardBusy !== null}
                onClick={() => void runWizardTest('mouse')}
                className="px-3.5 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1.5"
              >
                {wizardBusy === 'mouse' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {realDesktopReady ? 'الموافقة على تحريك حقيقي للتجربة' : 'تشغيل اختبار المعاينة'}
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Keyboard className="w-4 h-4 text-cyan-400" /> اختبار لوحة مفاتيح آمن — حقل مخصص
              </h5>
              <input
                ref={keyboardTestRef}
                type="text"
                value={keyboardTestValue}
                onChange={(e) => setKeyboardTestValue(e.target.value)}
                placeholder="حقل اختبار آمن — سيُركّز تلقائيًا قبل الكتابة"
                className="w-full bg-slate-950 border border-cyan-500/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
              <p className="text-[11px] leading-5 text-slate-400">
                سيُكتب نص ثابت واحد فقط. لا تغيّر النافذة أو التركيز أثناء الاختبار؛ وفي وضع المعاينة لن يُكتب أي حرف فعليًا.
              </p>
              <button
                type="button"
                disabled={wizardBusy !== null}
                onClick={() => void runWizardTest('keyboard')}
                className="px-3.5 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1.5"
              >
                {wizardBusy === 'keyboard' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {realDesktopReady ? 'الموافقة على كتابة حقيقية للتجربة' : 'تشغيل اختبار المعاينة'}
              </button>
            </div>
          </div>

          {wizardMessage && (
            <p className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 text-[11px] leading-5 font-bold">
              {wizardMessage}
            </p>
          )}
          <p className="text-[10px] leading-5 text-slate-500">
            حدود لا تتغير: لا تنفيذ Shell أو PowerShell من الخادم، لا كتابة/حذف ملفات نظام، لا إجراءات متسلسلة تلقائيًا، ولا تنفيذ من جهاز آخر. أوقف الوضع الحقيقي في أي وقت بحذف المتغير أو ضبطه على false وإعادة تشغيل الخادم.
          </p>
        </section>
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
                {needsRealConfirmation(action) && (
                  <label className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-[11px] leading-5 text-rose-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(realConfirmations[action.id])}
                      onChange={(e) =>
                        setRealConfirmations((prev) => ({ ...prev, [action.id]: e.target.checked }))
                      }
                      className="mt-1 w-4 h-4 accent-rose-500 shrink-0"
                    />
                    <span>
                      <b>إقرار تنفيذ حقيقي:</b> أفهم أن هذا الإجراء سيحرّك الفأرة أو يكتب فعليًا في النافذة المركّزة على جهازي، وقد راجعت المعاملات أعلاه. هذا الإقرار يخص هذا الإجراء فقط ولا يمنح أي صلاحية دائمة.
                    </span>
                  </label>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      executingId === action.id ||
                      rejected[action.id] ||
                      (needsRealConfirmation(action) && !realConfirmations[action.id])
                    }
                    onClick={() => void handleApproveExecute(action.id)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1.5"
                  >
                    {executingId === action.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {needsRealConfirmation(action) ? 'أوافق — نفّذ فعليًا هذا الإجراء فقط' : 'أوافق — نفّذ هذا الإجراء فقط'}
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
