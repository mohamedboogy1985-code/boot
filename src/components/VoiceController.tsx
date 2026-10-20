import React, { useRef, useState } from 'react';
import { Mic, MicOff, SendHorizonal, Square, Keyboard, Loader2 } from 'lucide-react';

interface VoiceControllerProps {
  /** Called with the final command text (typed or dictated) when the user submits. */
  onExecuteGoal: (text: string) => Promise<void> | void;
  isBusy?: boolean;
  placeholder?: string;
  title?: string;
  hint?: string;
  buttonLabel?: string;
}

/**
 * Voice + Text command controller.
 *
 * The user may TYPE a multi-agent goal in the text box (the requested
 * alternative to voice input) OR dictate it with the microphone
 * (Web Speech API, ar-EG). Dictation only fills the editable text box —
 * nothing runs until the user presses the execute button, which forwards
 * the text to the parent handler (`handleExecuteMultiAgentGoal`).
 */
export const VoiceController: React.FC<VoiceControllerProps> = ({
  onExecuteGoal,
  isBusy = false,
  placeholder = 'اكتب هدفك هنا… مثال: راجع فواتير هذا الشهر وحلّل الضرائب وجهّز سكربت إكسل',
  title = 'وحدة التحكم في الأوامر (صوت + نص)',
  hint = 'اكتب الأمر واضغط تنفيذ، أو انقر الميكروفون وتحدث — النص المُملَى يظهر في الصندوق لمراجعته قبل التنفيذ، ولا يُنفَّذ أي إجراء على الجهاز دون موافقتك.',
  buttonLabel = 'تنفيذ الهدف عبر الوكلاء',
}) => {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    setVoiceError(null);
    if (isListening) {
      stopListening();
      return;
    }
    if (!speechSupported) {
      setVoiceError('متصفحك لا يدعم التعرف على الكلام. استخدم صندوق النص — يعمل بالكامل كبديل.');
      return;
    }
    try {
      const RecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new RecognitionClass();
      recognition.lang = 'ar-EG';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setText(transcript);
      };
      recognition.onerror = (event: any) => {
        setVoiceError(
          event?.error === 'not-allowed'
            ? 'تم رفض إذن الميكروفون من المتصفح. فعّل الإذن أو اكتب الأمر في الصندوق.'
            : 'تعذر التعرف على الكلام الآن — يمكنك الكتابة في الصندوق مباشرة.',
        );
        setIsListening(false);
      };
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (e) {
      console.warn('Speech recognition start failed:', e);
      setVoiceError('تعذر تشغيل الميكروفون — صندوق النص جاهز كبديل كامل.');
      setIsListening(false);
    }
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    stopListening();
    await onExecuteGoal(trimmed);
  };

  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-cyan-400" />
          <span>{title}</span>
        </h4>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
            speechSupported
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          }`}
        >
          {speechSupported ? 'الإدخال الصوتي متاح' : 'النص فقط على هذا المتصفح'}
        </span>
      </div>

      <p className="text-[11px] leading-5 text-slate-400">{hint}</p>

      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={toggleListening}
          disabled={isBusy}
          title={isListening ? 'إيقاف الإملاء الصوتي' : 'بدء الإملاء الصوتي (عربية مصرية ar-EG)'}
          className={`px-3 rounded-xl border flex items-center justify-center transition-all disabled:opacity-50 ${
            isListening
              ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
              : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
          }`}
        >
          {isListening ? <Square className="w-4 h-4" /> : speechSupported ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit();
          }}
          placeholder={placeholder}
          disabled={isBusy}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-60"
          aria-label="صندوق إدخال أمر نصي للوكلاء"
        />

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isBusy || !text.trim()}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2 shadow"
        >
          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
          <span>{buttonLabel}</span>
        </button>
      </div>

      {isListening && (
        <p className="text-[11px] text-rose-300 font-semibold">🎙️ أستمع الآن… تحدّث، وسيظهر كلامك في الصندوق للمراجعة قبل التنفيذ.</p>
      )}
      {voiceError && <p className="text-[11px] text-amber-300">{voiceError}</p>}
    </div>
  );
};
