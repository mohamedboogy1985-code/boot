/**
 * Browser Notification API service.
 *
 * Sends visual OS-level notifications when agent tasks complete, a financial
 * analysis finishes, an approved adapter action succeeds, or the monthly
 * budget threshold is exceeded — even when the app tab is in the background.
 *
 * Falls back to an in-app `app-notification` CustomEvent when the Notification
 * API is unsupported or permission was not granted, so callers never crash.
 */

export interface AppNotificationDetail {
  title: string;
  body?: string;
  tag?: string;
  kind: 'task' | 'analysis' | 'budget' | 'adapter' | 'info';
  at: number;
}

const PERMISSION_ASKED_KEY = 'chatterbots_notifications_permission_asked';

export const NotificationService = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  permission(): NotificationPermission | 'unsupported' {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },

  /** Ask the user once for permission (call from a user gesture where possible). */
  async requestPermission(force = false): Promise<NotificationPermission | 'unsupported'> {
    if (!this.isSupported()) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    if (!force && localStorage.getItem(PERMISSION_ASKED_KEY) === '1') {
      return Notification.permission;
    }
    try {
      const result = await Notification.requestPermission();
      localStorage.setItem(PERMISSION_ASKED_KEY, '1');
      return result;
    } catch {
      return Notification.permission;
    }
  },

  /**
   * Fire a notification. Uses the Service Worker registration when available
   * (best for background tabs), then the Notification constructor, then an
   * in-app event fallback. Always also emits the in-app event for toasts/logs.
   * Returns true when an OS notification was actually shown.
   */
  async notify(
    title: string,
    options: { body?: string; tag?: string; kind?: AppNotificationDetail['kind']; icon?: string } = {},
  ): Promise<boolean> {
    const detail: AppNotificationDetail = {
      title,
      body: options.body,
      tag: options.tag,
      kind: options.kind || 'info',
      at: Date.now(),
    };
    try {
      window.dispatchEvent(new CustomEvent<AppNotificationDetail>('app-notification', { detail }));
    } catch {
      /* non-browser context */
    }

    if (!this.isSupported()) return false;
    if (Notification.permission === 'default') {
      const p = await this.requestPermission();
      if (p !== 'granted') return false;
    }
    if (Notification.permission !== 'granted') return false;

    const payload: NotificationOptions = {
      body: options.body,
      tag: options.tag,
      icon: options.icon,
      dir: 'rtl',
      lang: 'ar',
    };
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.showNotification(title, payload);
          return true;
        }
      }
      new Notification(title, payload);
      return true;
    } catch (e) {
      console.warn('Notification display failed:', e);
      return false;
    }
  },

  notifyTaskPlanReady(taskCount: number, simulated: boolean): void {
    void this.notify('اكتمل تخطيط الوكلاء ✅', {
      body: `تم إنشاء خطة تفويض من ${taskCount} مهام${simulated ? ' (وضع التخطيط المحلي)' : ''}. المهام بانتظار تنفيذها/اعتمادها من التبويبات المختصة.`,
      tag: 'orchestrator-plan',
      kind: 'task',
    });
  },

  notifyAllTasksCompleted(): void {
    void this.notify('اكتملت جميع مهام الوكلاء 🎉', {
      body: 'أنجزت/اعتمدت كل المهام المفوّضة في خطة الوكلاء الحالية.',
      tag: 'orchestrator-done',
      kind: 'task',
    });
  },

  notifyAnalysisComplete(sessionTitle: string, simulated: boolean): void {
    void this.notify('اكتمل التحليل المالي للجلسة 📊', {
      body: `«${sessionTitle}» — ${simulated ? 'نتائج محاكاة استدلالية (فعّل GEMINI_API_KEY للتحليل الحي).' : 'نتائج تحليل Gemini الحي جاهزة للتصدير Excel/Word/PDF/CSV.'}`,
      tag: 'analysis-complete',
      kind: 'analysis',
    });
  },

  notifyAdapterResult(adapterLabel: string, summary: string): void {
    void this.notify(`نتيجة إجراء المحوّل: ${adapterLabel}`, {
      body: summary.slice(0, 180),
      tag: 'adapter-result',
      kind: 'adapter',
    });
  },

  notifyBudgetExceeded(current: string, limit: string): void {
    void this.notify('⚠️ تجاوز حد الميزانية الشهري', {
      body: `بلغت مصروفات هذا الشهر ${current} وتجاوزت الحد الذي حددته (${limit}). راجِع بطاقة حد الميزانية في جناح المحاسبة.`,
      tag: 'budget-exceeded',
      kind: 'budget',
    });
  },
};

/**
 * Short double-beep budget alert sound via Web Audio.
 * Independent from the persona chime system; best-effort (browsers may
 * require a prior user gesture — failures are swallowed silently).
 */
export function playBudgetAlertSound(): void {
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = (freq: number, start: number, dur = 0.18) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    };
    const now = ctx.currentTime;
    beep(880, now);
    beep(660, now + 0.22);
    beep(880, now + 0.44);
    window.setTimeout(() => void ctx.close().catch(() => undefined), 1200);
  } catch (e) {
    console.warn('Budget alert sound unavailable:', e);
  }
}
