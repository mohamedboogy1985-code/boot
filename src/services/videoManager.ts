/**
 * Video Stream and Camera Capture Manager for ChatterBots Remix
 *
 * Includes precise camera-failure diagnostics so the UI can show the user
 * the REAL reason access failed (denied vs no device vs busy vs insecure
 * context vs blocked by an embedding iframe's Permissions-Policy) instead
 * of a generic "Permission denied" for everything.
 */

export type CameraErrorKind =
  | 'denied'
  | 'notfound'
  | 'inuse'
  | 'insecure'
  | 'policy-blocked'
  | 'constraints'
  | 'unsupported'
  | 'interrupted'
  | 'unknown';

export interface CameraIssue {
  kind: CameraErrorKind;
  title: string;
  message: string;
  steps: string[];
  canRetry: boolean;
}

export interface CameraSupportInfo {
  secureContext: boolean;
  hasGetUserMedia: boolean;
  /** From the Permissions API when available. */
  permissionState: 'granted' | 'denied' | 'prompt' | null;
  /** false when a parent iframe's Permissions-Policy blocks the camera. */
  policyAllows: boolean | null;
  /** true when the app is rendered inside an iframe (e.g. a live preview). */
  embedded: boolean;
}

const BROWSER_PERMISSION_STEPS = [
  'اضغط أيقونة القفل/الضبط بجوار شريط عنوان المتصفح.',
  'افتح «إعدادات الموقع» ثم اجعل «الكاميرا» على «سماح (Allow)».',
  'أعد تحميل الصفحة ثم اضغط «إعادة طلب الإذن».',
];

/** Map a getUserMedia error to an actionable Arabic diagnosis. */
export function classifyCameraError(err: any): CameraIssue {
  const name = String(err?.name || '');
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return {
        kind: 'denied',
        title: 'تم رفض إذن الكاميرا من المتصفح',
        message:
          'المتصفح يمنع هذا الموقع من استخدام الكاميرا حاليًا (رفضت الإذن سابقًا أو حُظر من الإعدادات). لن يظهر طلب إذن جديد حتى تعدّل إعدادات الموقع يدويًا.',
        steps: BROWSER_PERMISSION_STEPS,
        canRetry: true,
      };
    case 'PermissionsPolicyBlockedError':
      return {
        kind: 'policy-blocked',
        title: 'الكاميرا محظورة داخل إطار المعاينة المضمّن',
        message:
          'التطبيق يعمل الآن داخل إطار (iframe) لم يفوّض صلاحية الكاميرا، لذا لا يمكن تشغيلها هنا مهما كانت إعدادات متصفحك. الحل الفوري: افتح التطبيق في نافذة/تبويب مستقل بنفس الرابط، أو ارفع صورة الفاتورة مباشرة.',
        steps: [
          'اضغط زر «فتح التطبيق في نافذة مستقلة» أسفله (أو انسخ الرابط وافتحه في تبويب جديد).',
          'في النافذة المستقلة اضغط «تشغيل الكاميرا» واختر «سماح» عند ظهور الطلب.',
          'أو على جهازك: شغّل المشروع محليًا وافتح http://localhost:3000 — يعمل مباشرة.',
        ],
        canRetry: false,
      };
    case 'InsecureContextError':
    case 'SecurityError':
      return {
        kind: 'insecure',
        title: 'الصفحة ليست في سياق آمن (HTTPS)',
        message:
          'المتصفحات لا تسمح بالكاميرا إلا عبر HTTPS أو localhost. الرابط الحالي غير آمن، لذلك رُفض الوصول تلقائيًا.',
        steps: [
          'افتح التطبيق عبر رابط يبدأ بـ https:// أو عبر http://localhost على جهازك.',
          'أو ارفع صورة/PDF الفاتورة مباشرة — يعمل التحليل الصوتي بنفس الطريقة.',
        ],
        canRetry: false,
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        kind: 'notfound',
        title: 'لم يتم العثور على كاميرا في هذا الجهاز',
        message: 'لا توجد كاميرا متصلة/متاحة للنظام حاليًا. يمكنك رفع صورة أو ملف PDF للفاتورة وسيحلّله الوكيل صوتيًا.',
        steps: ['وصّل كاميرا ويب ثم أعد المحاولة، أو ارفع ملف الفاتورة من الأسفل.'],
        canRetry: true,
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        kind: 'inuse',
        title: 'الكاميرا مشغولة بتطبيق آخر',
        message: 'كاميرتك مستخدمة حاليًا في برنامج/تبويب آخر (اجتماع، تسجيل...). أغلقه ثم أعد المحاولة.',
        steps: ['أغلق أي اجتماع/تطبيق يستخدم الكاميرا (Zoom/Teams/تبويب آخر).', 'اضغط «إعادة طلب الإذن».'],
        canRetry: true,
      };
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return {
        kind: 'constraints',
        title: 'إعدادات الكاميرا المطلوبة غير متوفرة',
        message: 'كاميرتك لا تدعم الإعدادات المطلوبة (الاتجاه/الدقة). سنحاول تلقائيًا بأبسط إعداد عند إعادة المحاولة.',
        steps: ['اضغط «إعادة طلب الإذن» للتجربة بإعدادات مبسّطة.'],
        canRetry: true,
      };
    case 'AbortError':
      return {
        kind: 'interrupted',
        title: 'تمت مقاطعة تشغيل الكاميرا',
        message: 'توقف تشغيل الكاميرا قبل اكتماله. أعد المحاولة مرة أخرى.',
        steps: ['اضغط «إعادة طلب الإذن».'],
        canRetry: true,
      };
    case 'NotSupportedError':
    case 'TypeError':
      return {
        kind: 'unsupported',
        title: 'المتصفح/البيئة لا يدعم الكاميرا المباشرة',
        message:
          'واجهة الكاميرا (getUserMedia) غير متاحة في هذا المتصفح أو هذه البيئة. جرّب Chrome/Edge حديثًا، أو ارفع ملف الفاتورة مباشرة.',
        steps: BROWSER_PERMISSION_STEPS,
        canRetry: false,
      };
    default:
      return {
        kind: 'unknown',
        title: 'تعذر تشغيل الكاميرا',
        message: `حدث خطأ غير متوقع أثناء تشغيل الكاميرا${err?.message ? `: ${String(err.message).slice(0, 120)}` : ''}. يمكنك إعادة المحاولة أو رفع ملف الفاتورة مباشرة.`,
        steps: BROWSER_PERMISSION_STEPS,
        canRetry: true,
      };
  }
}

/** Snapshot of everything that could block camera access in this context. */
export async function getCameraSupportInfo(): Promise<CameraSupportInfo> {
  const info: CameraSupportInfo = {
    secureContext: typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false,
    hasGetUserMedia: Boolean(
      typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia,
    ),
    permissionState: null,
    policyAllows: null,
    embedded: typeof window !== 'undefined' ? window.self !== window.top : false,
  };

  try {
    const policy: any =
      (document as any).permissionsPolicy ?? (document as any).featurePolicy;
    if (policy?.allowsFeature) {
      info.policyAllows = Boolean(policy.allowsFeature('camera'));
    }
  } catch {
    /* Permissions-Policy API unavailable — leave null */
  }

  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      info.permissionState = status.state;
    }
  } catch {
    /* Permissions API doesn't know 'camera' in some browsers */
  }

  return info;
}

function namedError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

export class VideoManager {
  private currentStream: MediaStream | null = null;
  private facingMode: 'user' | 'environment' = 'user';

  // Start webcam video stream (with precise preflight diagnostics)
  async startCamera(
    videoElement?: HTMLVideoElement | null,
    facing: 'user' | 'environment' = 'user',
  ): Promise<MediaStream> {
    this.stopCamera();
    this.facingMode = facing;

    // --- Preflight: fail fast with a classifiable reason ---
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      throw namedError(
        'InsecureContextError',
        'الكاميرا تتطلب سياقًا آمنًا (HTTPS أو localhost).',
      );
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw namedError(
        'NotSupportedError',
        'متصفحك أو بيئة العرض لا تدعم الكاميرا مباشرة.',
      );
    }
    try {
      const policy: any =
        (document as any).permissionsPolicy ?? (document as any).featurePolicy;
      if (policy?.allowsFeature && policy.allowsFeature('camera') === false) {
        throw namedError(
          'PermissionsPolicyBlockedError',
          'الكاميرا محظورة بسياسة أذونات الإطار المضمّن.',
        );
      }
    } catch (e: any) {
      if (e?.name === 'PermissionsPolicyBlockedError') throw e;
      /* policy probe failed — proceed and let getUserMedia decide */
    }

    const preferred: MediaStreamConstraints = {
      video: {
        facingMode: this.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false, // audio handled via audioManager
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(preferred);
    } catch (err: any) {
      // One graceful retry with the most permissive constraints.
      if (err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError') {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } else {
        console.warn('Camera permission or device notice:', err?.name || err?.message || 'Access denied');
        throw err;
      }
    }

    this.currentStream = stream;
    if (videoElement) {
      videoElement.srcObject = stream;
      videoElement.play().catch((err) => console.warn('Video play notice:', err));
    }
    return stream;
  }

  // Stop camera stream
  stopCamera(videoElement?: HTMLVideoElement | null) {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => track.stop());
      this.currentStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  // Switch between front and back camera
  async flipCamera(videoElement?: HTMLVideoElement | null): Promise<MediaStream> {
    const nextMode = this.facingMode === 'user' ? 'environment' : 'user';
    return this.startCamera(videoElement, nextMode);
  }

  // Capture current video frame as base64 JPEG
  captureFrame(videoElement: HTMLVideoElement | null): string | null {
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return null;
    }

    const canvas = document.createElement('canvas');
    const maxDim = 1024;
    let width = videoElement.videoWidth;
    let height = videoElement.videoHeight;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(videoElement, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  // Check if camera is currently running
  isCameraActive(): boolean {
    return Boolean(this.currentStream && this.currentStream.active);
  }
}

export const videoManager = new VideoManager();

/** Read any file as a data URL (used for PDF invoices). */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale a (potentially huge) phone photo to a vision-friendly JPEG data
 * URL (max 1600px) so uploads stay fast and under server/payload limits.
 * Falls back to the raw data URL when decoding fails.
 */
export async function prepareImageForUpload(
  file: File,
  maxDim = 1600,
  quality = 0.85,
): Promise<{ dataUrl: string; mimeType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#ffffff'; // invoices read best on white
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return { dataUrl: canvas.toDataURL('image/jpeg', quality), mimeType: 'image/jpeg' };
  } catch {
    const raw = await readFileAsDataUrl(file);
    return { dataUrl: raw, mimeType: file.type || 'image/jpeg' };
  }
}
