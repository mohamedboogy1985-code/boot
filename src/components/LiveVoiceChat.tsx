import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Play, 
  Square, 
  RotateCcw, 
  Save, 
  Send, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  MessageSquare, 
  Clock, 
  Check, 
  AlertCircle,
  Radio,
  FileSpreadsheet,
  Download,
  FileCode,
  Bell,
  Video,
  VideoOff,
  Camera,
  Scan,
  RefreshCw,
  Eye,
  Sliders,
  Upload,
  FileUp,
  Image as ImageIcon
} from 'lucide-react';
import { ChatterBot, UserProfile, ChatMessage, ConversationSession, SoundAlertSettings } from '../types';
import { audioManager } from '../services/audio';
import { videoManager } from '../services/videoManager';
import { ApiService } from '../services/api';
import { LocalDB } from '../services/localDb';
import { soundEffectsManager, PRESET_CHIMES } from '../services/soundEffects';
import { AgentVideoAvatar } from './AgentVideoAvatar';

interface LiveVoiceChatProps {
  bot: ChatterBot;
  userProfile: UserProfile;
  soundSettings: SoundAlertSettings;
  onOpenSoundSettings: () => void;
  onSessionSaved: () => void;
  onOpenLocalDb: () => void;
}

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export const LiveVoiceChat: React.FC<LiveVoiceChatProps> = ({
  bot,
  userProfile,
  soundSettings,
  onOpenSoundSettings,
  onSessionSaved,
  onOpenLocalDb,
}) => {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [lastBotAudio, setLastBotAudio] = useState<string | null>(null);
  const [isBotMuted, setIsBotMuted] = useState(false);
  const [accountingTag, setAccountingTag] = useState('مراجعة حسابات عامة');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isContinuousMode, setIsContinuousMode] = useState(true);

  // Video call & Camera states
  const [isCallMode, setIsCallMode] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      videoManager.stopCamera(videoRef.current);
    };
  }, []);

  const [chatLang, setChatLang] = useState<'ar' | 'en'>(userProfile.language === 'en' ? 'en' : 'ar');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechRecognizerRef = useRef<{ start: () => void; stop: () => void; pause: () => void; resume: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recordedSessionBlobRef = useRef<Blob | null>(null);

  // Timer for session duration
  useEffect(() => {
    let timer: any = null;
    if (isStreaming) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isStreaming]);

  // Scroll to bottom of message list
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscript]);

  // Initial welcome message from the active bot
  useEffect(() => {
    setMessages([
      {
        id: 'welcome-' + Date.now(),
        sender: 'bot',
        text: `أهلاً بك يا ${userProfile.name}! أنا ${bot.name} (${bot.arabicName})، ${bot.title}. "${bot.catchphrase}" كيف يمكنني مساعدتك اليوم في الحسابات أو استفساراتك المالية؟`,
        timestamp: Date.now(),
      },
    ]);
    setSessionStartTime(Date.now());
    setElapsedSeconds(0);
    setLastBotAudio(null);
  }, [bot.id, userProfile.name]);

  // Waveform canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isActive = true;

    const render = () => {
      if (!isActive) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const freqData = audioManager.getFrequencyData();
      const numBars = 36;
      const barWidth = (width / numBars) * 0.7;
      const gap = (width / numBars) * 0.3;

      for (let i = 0; i < numBars; i++) {
        const rawVal = freqData[i % freqData.length] || 0;
        let scale = rawVal / 255;

        // Visual simulation if idle or speaking
        if (voiceState === 'speaking') {
          scale = Math.max(scale, 0.25 + 0.65 * Math.sin(Date.now() / 150 + i));
        } else if (voiceState === 'listening') {
          scale = Math.max(scale * 1.5, 0.15 + 0.3 * Math.sin(Date.now() / 200 + i * 0.5));
        } else if (voiceState === 'thinking') {
          scale = 0.2 + 0.25 * Math.sin(Date.now() / 100 + i * 0.8);
        } else {
          scale = 0.05 + 0.05 * Math.sin(Date.now() / 400 + i);
        }

        const barHeight = Math.max(4, scale * (height - 10));
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        // Dynamic gradient based on bot color and state
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (voiceState === 'listening') {
          gradient.addColorStop(0, '#ef4444');
          gradient.addColorStop(1, '#f97316');
        } else if (voiceState === 'speaking') {
          gradient.addColorStop(0, '#818cf8');
          gradient.addColorStop(1, '#c084fc');
        } else if (voiceState === 'thinking') {
          gradient.addColorStop(0, '#38bdf8');
          gradient.addColorStop(1, '#818cf8');
        } else {
          gradient.addColorStop(0, '#475569');
          gradient.addColorStop(1, '#334155');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [3]);
        ctx.fill();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isActive = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [voiceState]);

  // Camera toggle handler
  // Camera toggle handler
  const handleToggleCamera = async () => {
    if (isCameraActive) {
      videoManager.stopCamera(videoRef.current);
      setIsCameraActive(false);
      setCameraError(null);
    } else {
      setIsCameraLoading(true);
      setCameraError(null);
      try {
        await videoManager.startCamera(videoRef.current);
        setIsCameraActive(true);
        setCameraError(null);
        showToast('تم تشغيل الكاميرا بنجاح! يمكنك الآن التحدث وعرض المستندات مباشرة.', 'success');
      } catch (err: any) {
        console.warn('Camera access denied or unavailable:', err?.name || err?.message);
        const errMsg = 'تم حظر أو رفض إذن الكاميرا من المتصفح أو إعدادات الإطار. يمكنك السماح بالإذن أو رفع صورة الفاتورة/المستند مباشرة كبديل فوري.';
        setCameraError(errMsg);
        setIsCameraActive(false);
        showToast(errMsg, 'error');
      } finally {
        setIsCameraLoading(false);
      }
    }
  };

  // Flip front/back camera
  const handleFlipCamera = async () => {
    if (!isCameraActive) return;
    try {
      await videoManager.flipCamera(videoRef.current);
      showToast('تم تبديل اتجاه الكاميرا.', 'info');
    } catch (err) {
      console.warn('Flip camera notice:', err);
    }
  };

  // Handle uploaded file image
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setUploadedImagePreview(base64);
      showToast('تم تحميل صورة المستند بنجاح! جاري تحليله صوتياً مع الوكيل...', 'success');
      handleUserSpeechFinal(
        'لقد قمت برفع هذه الصورة للمستند/الفاتورة. يرجى فحصها وتدقيق بنودها وأرقامها محاسبياً والرد علي صوتياً.',
        base64
      );
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Handle sample invoice testing when no camera is present
  const handleSampleInvoiceTest = (title: string, sampleDataUrl: string) => {
    setUploadedImagePreview(sampleDataUrl);
    showToast(`تم تحميل عينة "${title}" بنجاح! جاري التحليل الصوتي...`, 'success');
    handleUserSpeechFinal(
      `أعرض لك عينة "${title}"، تفضل بمراجعتها وتدقيق أرقامها وضريبتها والرد علي صوتياً.`,
      sampleDataUrl
    );
  };

  // Snap frame and immediately analyze with Agent using Voice
  const handleCaptureAndAnalyze = async () => {
    // If user has an uploaded image preview, analyze that
    if (uploadedImagePreview) {
      setIsScanning(true);
      await handleUserSpeechFinal(
        'يرجى إعادة تدقيق المستند المرفوع وتحليل أرقامه محاسبياً صوتياً.',
        uploadedImagePreview
      );
      setIsScanning(false);
      return;
    }

    let frame: string | null = null;
    if (!isCameraActive || !videoRef.current) {
      await handleToggleCamera();
      await new Promise((r) => setTimeout(r, 600));
    }
    frame = videoManager.captureFrame(videoRef.current);
    if (!frame) {
      showToast('يرجى تشغيل الكاميرا أو رفع صورة مستند لعرضها على الوكيل الذكي.', 'info');
      return;
    }
    setIsScanning(true);
    await handleUserSpeechFinal(
      'لقد قمت بمسح المستند المعروض أمام الكاميرا. تفضل بتدقيقه وتحليله محاسبياً وأخبرني بالنتائج صوتياً.',
      frame
    );
    setIsScanning(false);
  };

  // Handle user speech submission (with optional camera frame for vision)
  const handleUserSpeechFinal = async (text: string, overrideImage?: string) => {
    if (!text.trim()) return;

    // Grab current camera frame if camera is running and no override
    let imageFrame = overrideImage;
    if (!imageFrame && isCameraActive && videoRef.current) {
      const captured = videoManager.captureFrame(videoRef.current);
      if (captured) {
        imageFrame = captured;
      }
    }

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: text.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLiveTranscript('');
    setVoiceState('thinking');

    try {
      // 1. Get AI conversational response with vision frame if available
      const reply = await ApiService.sendChatMessage(
        bot,
        userProfile,
        messages,
        userMsg.text,
        imageFrame || undefined
      );

      const botMsg: ChatMessage = {
        id: 'bot-' + Date.now(),
        sender: 'bot',
        text: reply,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, botMsg]);

      // 2. Play voice audio if bot not muted
      if (!isBotMuted) {
        // Pause microphone listening so bot voice is not transcribed
        speechRecognizerRef.current?.pause();
        setVoiceState('speaking');

        const onFinishedSpeaking = () => {
          speechRecognizerRef.current?.resume();
          setVoiceState(isStreaming && isContinuousMode ? 'listening' : 'idle');
        };

        const ttsRes = await ApiService.getTTSAudio(
          reply,
          bot.voice,
          bot.speakingStyle
        );

        if (ttsRes.audioData) {
          setLastBotAudio(ttsRes.audioData);
          await audioManager.playBase64Audio(ttsRes.audioData, onFinishedSpeaking);
        } else {
          // Web speech fallback with language detection
          const isEnglish = /[a-zA-Z]{3,}/.test(reply);
          audioManager.speakWebSpeech(
            reply,
            isEnglish ? 'en-US' : 'ar-SA',
            onFinishedSpeaking
          );
        }
      } else {
        setVoiceState(isStreaming && isContinuousMode ? 'listening' : 'idle');
      }
    } catch (err) {
      console.error('Conversation error:', err);
      setVoiceState(isStreaming && isContinuousMode ? 'listening' : 'idle');
    }
  };

  // Toggle Live Streaming Microphone
  const toggleStreaming = async () => {
    if (isStreaming) {
      // Stop stream
      audioManager.stopSpeaking();
      const sessionBlob = audioManager.stopMicrophone();
      if (sessionBlob) {
        recordedSessionBlobRef.current = sessionBlob;
      }
      if (speechRecognizerRef.current) {
        speechRecognizerRef.current.stop();
      }

      // Play End Session Alert Chime
      if (soundSettings.enableEndAlert) {
        soundEffectsManager.playEndAlert(soundSettings.toneId, soundSettings.volume);
      }

      setIsStreaming(false);
      setVoiceState('idle');
      setLiveTranscript('');
    } else {
      // Start stream
      try {
        // Play Start Session Alert Chime
        if (soundSettings.enableStartAlert) {
          soundEffectsManager.playStartAlert(soundSettings.toneId, soundSettings.volume);
        }

        setVoiceState('listening');
        setIsStreaming(true);

        // Start microphone and recorder
        await audioManager.startMicrophone();

        // Initialize Speech Recognition
        const lang = chatLang === 'en' ? 'en-US' : 'ar-SA';
        const recognizer = audioManager.createSpeechRecognition(
          lang,
          (transcript, isFinal) => {
            setLiveTranscript(transcript);
            if (isFinal && transcript.trim().length > 2) {
              handleUserSpeechFinal(transcript);
            }
          },
          (err) => {
            console.warn('Recognition notice:', err);
          }
        );

        if (recognizer) {
          speechRecognizerRef.current = recognizer;
          recognizer.start();
        }
      } catch (err) {
        console.warn('Failed to start microphone stream:', err);
        showToast('تعذر الوصول إلى الميكروفون. يرجى التأكد من منح الإذن للمتصفح.', 'error');
        setIsStreaming(false);
        setVoiceState('idle');
      }
    }
  };

  // Replay last bot speech audio
  const handleReplayVoice = () => {
    if (lastBotAudio) {
      setVoiceState('speaking');
      audioManager.playBase64Audio(lastBotAudio, () => {
        setVoiceState(isStreaming ? 'listening' : 'idle');
      });
    } else {
      const lastBotMsg = [...messages].reverse().find((m) => m.sender === 'bot');
      if (lastBotMsg) {
        setVoiceState('speaking');
        audioManager.speakWebSpeech(
          lastBotMsg.text,
          userProfile.language === 'en' ? 'en-US' : 'ar-SA',
          () => {
            setVoiceState(isStreaming ? 'listening' : 'idle');
          }
        );
      }
    }
  };

  // Interrupt / Stop bot speaking
  const handleStopSpeaking = () => {
    audioManager.stopSpeaking();
    setVoiceState(isStreaming ? 'listening' : 'idle');
  };

  // Save current conversation session to IndexedDB
  const handleSaveToLocalDb = async () => {
    if (messages.length === 0) return;

    try {
      const sessionId = 'session-' + Date.now();
      const sessionData: ConversationSession = {
        id: sessionId,
        title: `محادثة مع ${bot.name} - ${new Date().toLocaleDateString('ar-SA')}`,
        botId: bot.id,
        botName: bot.name,
        botAvatar: bot.avatar,
        userName: userProfile.name,
        createdAt: sessionStartTime,
        updatedAt: Date.now(),
        durationSeconds: elapsedSeconds || 1,
        messages: messages,
        accountingTag: accountingTag,
        notes: `محادثة مسجلة مع الوكيل الذكي ${bot.name} حول ${accountingTag}.`,
        summary: messages.length > 2 ? messages[messages.length - 1].text.slice(0, 150) + '...' : undefined,
      };

      await LocalDB.saveSession(sessionData, recordedSessionBlobRef.current || undefined);
      setSaveSuccess(true);
      onSessionSaved();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.warn('Failed to save to Local DB:', err);
      showToast('حدث خطأ أثناء حفظ المحادثة في قاعدة البيانات المحلية.', 'error');
    }
  };

  // Export current session directly to CSV
  const handleExportCurrentCsv = () => {
    if (messages.length === 0) return;
    const sessionData: ConversationSession = {
      id: 'session-' + Date.now(),
      title: `محادثة مع ${bot.name} - ${new Date().toLocaleDateString('ar-SA')}`,
      botId: bot.id,
      botName: bot.name,
      botAvatar: bot.avatar,
      userName: userProfile.name,
      createdAt: sessionStartTime,
      updatedAt: Date.now(),
      durationSeconds: elapsedSeconds || 1,
      messages: messages,
      accountingTag: accountingTag,
      notes: `تصدير مباشر للمحادثة الصوتية مع ${bot.name}.`,
    };
    LocalDB.downloadSessionAsCsv(sessionData);
  };

  // Export current session directly to JSON
  const handleExportCurrentJson = () => {
    if (messages.length === 0) return;
    const sessionData: ConversationSession = {
      id: 'session-' + Date.now(),
      title: `محادثة مع ${bot.name} - ${new Date().toLocaleDateString('ar-SA')}`,
      botId: bot.id,
      botName: bot.name,
      botAvatar: bot.avatar,
      userName: userProfile.name,
      createdAt: sessionStartTime,
      updatedAt: Date.now(),
      durationSeconds: elapsedSeconds || 1,
      messages: messages,
      accountingTag: accountingTag,
      notes: `تصدير مباشر للمحادثة الصوتية مع ${bot.name}.`,
    };
    LocalDB.downloadSessionAsJson(sessionData);
  };

  // Submit typed message
  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    handleUserSpeechFinal(text);
  };

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[780px] lg:h-[880px] relative">
      
      {/* Top Header */}
      <div className="px-5 py-4 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-3">
        {/* Active Bot Info */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-600/80 flex items-center justify-center text-3xl shadow-inner">
              {bot.avatar}
            </div>
            {/* Live pulsating dot */}
            <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-950 flex items-center justify-center ${
              voiceState === 'listening' ? 'bg-red-500 animate-ping' :
              voiceState === 'speaking' ? 'bg-indigo-500 animate-pulse' :
              voiceState === 'thinking' ? 'bg-amber-500 animate-bounce' : 'bg-emerald-500'
            }`} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-white tracking-tight">
                {bot.name}
              </h2>
              <span className="text-xs font-semibold text-slate-400">
                ({bot.arabicName})
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                صوت {bot.voice}
              </span>
            </div>
            <p className="text-xs text-slate-400 line-clamp-1">
              {bot.title} • "{bot.catchphrase}"
            </p>
          </div>
        </div>

        {/* Top Actions: Accounting Tag & Save to Local DB */}
        <div className="flex items-center gap-2">
          {/* Accounting Tag Selector */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/60 text-xs text-slate-300">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={accountingTag}
              onChange={(e) => setAccountingTag(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-200 outline-none cursor-pointer"
            >
              <option value="مراجعة حسابات عامة" className="bg-slate-900">مراجعة حسابات عامة</option>
              <option value="فواتير المبيعات والمشتريات" className="bg-slate-900">فواتير ومبيعات</option>
              <option value="ضريبة القيمة المضافة" className="bg-slate-900">إقرار ضريبي (VAT)</option>
              <option value="التدفقات النقدية والميزانية" className="bg-slate-900">تدفقات نقدية وميزانية</option>
              <option value="تدقيق داخلي ومكافحة هدر" className="bg-slate-900">تدقيق ومكافحة هدر</option>
            </select>
          </div>

          {/* Direct CSV / JSON Download buttons */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={handleExportCurrentCsv}
              disabled={messages.length === 0}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-950/60 text-slate-300 hover:text-emerald-400 border border-slate-700/60 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-40 shadow-sm"
              title="تحميل المحادثة الحالية كملف CSV لجداول الإكسل"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV</span>
            </button>
            <button
              onClick={handleExportCurrentJson}
              disabled={messages.length === 0}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-400 border border-slate-700/60 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-40 shadow-sm"
              title="تحميل المحادثة الحالية كملف JSON"
            >
              <FileCode className="w-3.5 h-3.5 text-indigo-400" />
              <span>JSON</span>
            </button>
          </div>

          {/* Video Call Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsCallMode(!isCallMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-sm ${
              isCallMode
                ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 shadow-rose-600/30 ring-2 ring-rose-500/20'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700/60'
            }`}
            title="التبديل بين وضع التحدث بالصوت والصورة المباشرة والاستوديو الصوتي"
          >
            <Video className="w-3.5 h-3.5 text-rose-300" />
            <span className="hidden sm:inline">{isCallMode ? 'مكالمة صوت وصورة' : 'استوديو صوتي'}</span>
          </button>

          {/* Voice Language Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-xl p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setChatLang('ar')}
              className={`px-2 py-1 rounded-lg transition-all ${
                chatLang === 'ar' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="التحدث بالعربية"
            >
              عربي
            </button>
            <button
              type="button"
              onClick={() => setChatLang('en')}
              className={`px-2 py-1 rounded-lg transition-all ${
                chatLang === 'en' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
              title="Talk in English"
            >
              EN
            </button>
          </div>

          {/* Sound Alert Chime Selector Button */}
          <button
            onClick={onOpenSoundSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold transition-all shadow-sm"
            title="تغيير نغمة التنبيه الصوتي لبدء وانتهاء الجلسة"
          >
            <Bell className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">
              {PRESET_CHIMES.find((c) => c.id === soundSettings.toneId)?.name || 'نغمة التنبيه'}
            </span>
          </button>

          {/* Save to Local DB button */}
          <button
            onClick={handleSaveToLocalDb}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
              saveSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600/90 hover:bg-indigo-500 text-white'
            }`}
            title="حفظ هذه المحادثة بالكامل في قاعدة البيانات المحلية (IndexedDB)"
          >
            {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'تم الحفظ محلياً!' : 'حفظ المحادثة'}</span>
          </button>
        </div>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className={`px-4 py-2.5 flex items-center justify-between gap-3 text-xs font-semibold border-b animate-fade-in z-30 transition-all ${
          toastMessage.type === 'error'
            ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
            : toastMessage.type === 'success'
            ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
            : 'bg-indigo-950/90 text-indigo-200 border-indigo-500/40'
        }`}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white px-2 py-0.5 rounded text-xs bg-slate-800/60"
          >
            إغلاق ✕
          </button>
        </div>
      )}

      {/* Main Interactive Stage: Video Call Mode OR Audio Studio Mode */}
      {isCallMode ? (
        <div className="relative p-4 sm:p-5 bg-gradient-to-b from-slate-950 via-slate-900/80 to-slate-950 border-b border-slate-800/80 flex flex-col gap-4 shrink-0">
          
          {/* Top Status Bar: Live State Badge & Call Duration */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/60 border border-rose-500/40 text-xs font-bold text-rose-300 shadow-md">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span>مكالمة تفاعلية مباشرة بالصوت والصورة</span>
              </span>

              {/* State pill */}
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/80 text-xs font-semibold text-slate-200">
                {voiceState === 'listening' && (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span className="text-red-400 font-bold">الوكيل يستمع لصوتك ويشاهدك...</span>
                  </>
                )}
                {voiceState === 'speaking' && (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                    <span className="text-indigo-300 font-bold">{bot.name} يرد عليك بالصوت الآن...</span>
                  </>
                )}
                {voiceState === 'thinking' && (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    <span className="text-amber-300 font-bold">جاري تحليل الفيديو والبيانات المحاسبية...</span>
                  </>
                )}
                {voiceState === 'idle' && (
                  <>
                    <Radio className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-400">جاهز • اضغط على زر التحدث الصوتي بالأسفل</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs font-mono text-slate-400 px-3 py-1 rounded-full bg-slate-800/70 border border-slate-700/60">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>مدة الجلسة: {formatTime(elapsedSeconds)}</span>
            </div>
          </div>

          {/* Dual Video Screens: Agent Video Avatar (HD) & User Webcam Feed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 1. Agent Video Screen */}
            <div className="w-full h-72 sm:h-80">
              <AgentVideoAvatar
                bot={bot}
                voiceState={voiceState}
                isBotMuted={isBotMuted}
              />
            </div>

            {/* 2. User Live Camera Screen */}
            <div className="relative w-full h-72 sm:h-80 rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex flex-col justify-between p-4">
              
              {/* Camera Video Stream */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-300 ${
                  isCameraActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              />

              {/* Scanning Laser Animation during document vision capture */}
              {isScanning && (
                <div className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between overflow-hidden">
                  <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-[bounce_1.5s_infinite]" />
                  <div className="absolute inset-0 bg-cyan-500/10 backdrop-blur-[1px]" />
                </div>
              )}

              {/* Top Camera Controls Overlay */}
              <div className="flex items-center justify-between gap-2 z-10">
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md ${
                    isCameraActive
                      ? 'bg-slate-950/80 border border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-950/80 border border-slate-700 text-slate-400'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                    <span>{isCameraActive ? 'كاميرتك المباشرة' : 'الكاميرا متوقفة'}</span>
                  </span>

                  {isCameraActive && (
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-950/70 border border-slate-700/60 text-slate-300">
                      مستشعر الرؤية الذكي
                    </span>
                  )}
                </div>

                {isCameraActive && (
                  <div className="flex items-center gap-1.5">
                    {/* Flip camera */}
                    <button
                      onClick={handleFlipCamera}
                      className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition-all shadow-md"
                      title="تبديل الكاميرا الأمامية/الخلفية"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    {/* Turn off camera */}
                    <button
                      onClick={handleToggleCamera}
                      className="p-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-600/50 transition-all shadow-md"
                      title="إيقاف الكاميرا"
                    >
                      <VideoOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Hidden file input for uploading invoice images */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />

              {/* Uploaded Document Preview Mode */}
              {uploadedImagePreview && !isCameraActive && (
                <div className="relative w-full h-full my-auto flex flex-col items-center justify-between p-3 z-10 bg-slate-900/90 rounded-2xl border border-indigo-500/40">
                  <div className="flex items-center justify-between w-full">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>مستند/فاتورة جاهزة للفحص</span>
                    </span>
                    <button
                      onClick={() => setUploadedImagePreview(null)}
                      className="text-xs text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded-lg bg-rose-950/60 border border-rose-600/40"
                    >
                      إلغاء المستند
                    </button>
                  </div>

                  <div className="my-auto max-h-36 max-w-full overflow-hidden rounded-xl border border-slate-700 bg-black/60 p-1 flex items-center justify-center">
                    <img
                      src={uploadedImagePreview}
                      alt="Uploaded Document"
                      className="max-h-32 object-contain rounded"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full">
                    <button
                      onClick={handleCaptureAndAnalyze}
                      disabled={isScanning}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
                    >
                      <Scan className="w-4 h-4 text-cyan-200" />
                      <span>{isScanning ? 'جاري التدقيق...' : 'تدقيق المستند صوتياً مع الوكيل'}</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700"
                      title="استبدال المستند"
                    >
                      <FileUp className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Placeholder when Camera is Off and no uploaded preview */}
              {!isCameraActive && !uploadedImagePreview && (
                <div className="my-auto flex flex-col items-center justify-center text-center p-3 z-10">
                  {cameraError ? (
                    /* Graceful Permission Denied / Unavailable fallback */
                    <div className="w-full flex flex-col items-center">
                      <div className="w-12 h-12 rounded-2xl bg-amber-950/60 border border-amber-600/40 flex items-center justify-center text-amber-400 mb-2 shadow-inner">
                        <AlertCircle className="w-6 h-6 animate-pulse" />
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-amber-300 mb-1">
                        إذن الكاميرا غير مفعل في المتصفح
                      </h4>
                      <p className="text-[11px] text-slate-300 max-w-xs mb-3 leading-relaxed">
                        لم نتمكن من الوصول للكاميرا (Permission denied). يمكنك السماح بالإذن من إعدادات المتصفح، أو رفع ملف الفاتورة مباشرة للمعاينة والتحليل الصوتي:
                      </p>

                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                          onClick={handleToggleCamera}
                          disabled={isCameraLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>إعادة طلب الإذن</span>
                        </button>

                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md active:scale-95"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>رفع صورة مستند</span>
                        </button>

                        <button
                          onClick={() => handleSampleInvoiceTest(
                            'فاتورة مبيعات معتمدة INV-2026',
                            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360"><rect width="600" height="360" fill="%231e293b" rx="16"/><text x="40" y="50" fill="%23f8fafc" font-size="20" font-family="sans-serif" font-weight="bold">فاتورة مبيعات معتمدة INV-2026-99</text><text x="40" y="85" fill="%2394a3b8" font-size="14" font-family="sans-serif">العميل: مؤسسة الريادة الرقمية</text><line x1="40" y1="105" x2="560" y2="105" stroke="%23334155" stroke-width="2"/><text x="40" y="145" fill="%23e2e8f0" font-size="14" font-family="sans-serif">1. خدمات تطوير برمجيات: 20,000 ريال</text><text x="40" y="185" fill="%23e2e8f0" font-size="14" font-family="sans-serif">2. ضريبة القيمة المضافة 15%: 3,000 ريال</text><line x1="40" y1="225" x2="560" y2="225" stroke="%23334155" stroke-width="2"/><text x="40" y="265" fill="%2338bdf8" font-size="18" font-family="sans-serif" font-weight="bold">المجموع: 23,000 ريال سعودي</text><text x="40" y="310" fill="%2310b981" font-size="14" font-family="sans-serif">معتمدة ومطابقة للشروط الضريبية</text></svg>'
                          )}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 text-xs font-semibold border border-cyan-500/40 transition-all active:scale-95"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
                          <span>عينة فاتورة للتجربة</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Default Camera Off State */
                    <>
                      <div className="w-14 h-14 rounded-2xl bg-indigo-950/50 border border-indigo-700/40 flex items-center justify-center text-indigo-400 mb-2.5 shadow-inner">
                        <Camera className="w-7 h-7 animate-pulse" />
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-white mb-1">
                        كاميرا الفيديو غير مشغلة
                      </h4>
                      <p className="text-xs text-slate-400 max-w-xs mb-3">
                        قم بتشغيل الكاميرا للتحدث وجهاً لوجه مع الوكيل وعرض الفواتير ليراها ويحللها صوتياً.
                      </p>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                          onClick={handleToggleCamera}
                          disabled={isCameraLoading}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 active:scale-95 disabled:opacity-50"
                        >
                          <Video className="w-4 h-4" />
                          <span>{isCameraLoading ? 'جاري فتح الكاميرا...' : 'تشغيل الكاميرا الآن'}</span>
                        </button>

                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all active:scale-95"
                          title="رفع صورة مستند أو فاتورة من جهازك"
                        >
                          <Upload className="w-3.5 h-3.5 text-indigo-400" />
                          <span>رفع صورة فاتورة</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Bottom Camera Action Bar when Active */}
              {isCameraActive && (
                <div className="flex items-center justify-between gap-2 bg-slate-950/85 backdrop-blur-md p-2 rounded-2xl border border-slate-800 z-10">
                  <button
                    onClick={handleCaptureAndAnalyze}
                    disabled={isScanning}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
                    title="التقاط لقطة للمستند أو الفاتورة أمام الكاميرا وتدقيقها فورياً مع الوكيل"
                  >
                    <Scan className="w-4 h-4 text-cyan-200" />
                    <span>{isScanning ? 'جاري المسح الضوئي...' : 'فحص وتدقيق ما في الكاميرا'}</span>
                  </button>
                </div>
              )}

            </div>

          </div>

          {/* Interactive Voice Controls in Call Mode */}
          <div className="flex items-center justify-between gap-3 bg-slate-950/80 p-3 rounded-2xl border border-slate-800 flex-wrap">
            
            {/* Live Subtitle Bubble */}
            <div className="flex-1 min-w-[240px]">
              {liveTranscript ? (
                <div className="px-3 py-1.5 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs font-medium animate-fade-in">
                  <span className="opacity-75">أنت تقول: </span>"{liveTranscript}"
                </div>
              ) : voiceState === 'speaking' ? (
                <div className="px-3 py-1.5 rounded-xl bg-indigo-950/50 border border-indigo-500/40 text-indigo-200 text-xs font-medium animate-pulse">
                  <span>{bot.name} يتحدث بالصوت • يمكنك الاستماع أو مقاطعته بالسؤال</span>
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  اضغط على زر التحدث الصوتي لبدء الحديث مع الوكيل مباشرة
                </div>
              )}
            </div>

            {/* Controls buttons */}
            <div className="flex items-center gap-3">
              {/* Mute bot toggle */}
              <button
                onClick={() => setIsBotMuted(!isBotMuted)}
                className={`p-2.5 rounded-full border transition-all ${
                  isBotMuted
                    ? 'bg-red-950/60 border-red-500 text-red-400'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
                title={isBotMuted ? 'إلغاء كتم صوت الوكيل' : 'كتم صوت الوكيل'}
              >
                {isBotMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* MAIN VOICE TALK BUTTON */}
              <button
                onClick={toggleStreaming}
                className={`group flex items-center gap-2 px-5 py-2.5 rounded-full shadow-2xl transition-all duration-300 transform active:scale-95 ${
                  isStreaming
                    ? 'bg-gradient-to-tr from-red-600 to-rose-500 text-white ring-4 ring-red-500/30 shadow-red-500/50 font-bold'
                    : 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 text-white ring-4 ring-indigo-500/30 shadow-indigo-500/50 font-bold'
                }`}
                title={isStreaming ? 'إيقاف التحدث الصوتي' : 'بدء التحدث الصوتي المباشر'}
              >
                {isStreaming ? (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span className="text-xs">إيقاف التحدث</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 text-white" />
                    <span className="text-xs">تحدث بالصوت الآن</span>
                  </>
                )}
              </button>

              {/* Replay last bot speech */}
              {voiceState === 'speaking' ? (
                <button
                  onClick={handleStopSpeaking}
                  className="p-2.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
                  title="إيقاف صوت الوكيل الحالي"
                >
                  <Square className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleReplayVoice}
                  disabled={!lastBotAudio && !messages.some((m) => m.sender === 'bot')}
                  className="p-2.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-all disabled:opacity-40"
                  title="إعادة الاستماع لآخر رد صوتي"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

          </div>

        </div>
      ) : (
        /* Classic Waveform Studio Mode */
        <div className="relative px-6 py-4 bg-gradient-to-b from-slate-950 via-slate-900/60 to-slate-950 border-b border-slate-800/80 flex flex-col items-center justify-center shrink-0">
          
          {/* State Badge & Session Timer */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/80 text-xs font-semibold text-slate-200 shadow-sm">
              {voiceState === 'listening' && (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                  <span className="text-red-400 font-bold">جاري الاستماع لصوتك المباشر...</span>
                </>
              )}
              {voiceState === 'speaking' && (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                  <span className="text-indigo-300 font-bold">{bot.name} يتحدث بالصوت الآن...</span>
                </>
              )}
              {voiceState === 'thinking' && (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span className="text-amber-300 font-bold">جاري تحليل الأرقام والبيانات...</span>
                </>
              )}
              {voiceState === 'idle' && (
                <>
                  <Radio className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400">مستعد للبدء • اضغط على زر البث</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 text-xs font-mono text-slate-400 px-2.5 py-1 rounded-full bg-slate-800/60 border border-slate-700/50">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{formatTime(elapsedSeconds)}</span>
            </div>
          </div>

          {/* Central Audio Visualizer Canvas */}
          <div className="w-full max-w-lg h-20 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={480}
              height={70}
              className="w-full h-full"
            />
          </div>

          {/* Live spoken subtitle bubble */}
          {liveTranscript && (
            <div className="mt-1 px-4 py-1.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs font-medium max-w-md text-center animate-fade-in shadow-inner">
              <span className="opacity-75">أنت تقول: </span>"{liveTranscript}"
            </div>
          )}

          {/* Primary Voice Controls */}
          <div className="mt-3 flex items-center gap-4">
            {/* Mute bot toggle */}
            <button
              onClick={() => setIsBotMuted(!isBotMuted)}
              className={`p-2.5 rounded-full border transition-all ${
                isBotMuted
                  ? 'bg-red-950/60 border-red-500 text-red-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title={isBotMuted ? 'إلغاء كتم صوت الوكيل' : 'كتم صوت الوكيل'}
            >
              {isBotMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* MAIN STREAM BUTTON (play_arrow / mic) */}
            <button
              onClick={toggleStreaming}
              className={`group relative flex items-center justify-center w-16 h-16 rounded-full shadow-2xl transition-all duration-300 transform active:scale-95 ${
                isStreaming
                  ? 'bg-gradient-to-tr from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white ring-4 ring-red-500/30 shadow-red-500/50'
                  : 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white ring-4 ring-indigo-500/30 shadow-indigo-500/50'
              }`}
              title={isStreaming ? 'إيقاف البث الصوتي' : 'بدء البث الصوتي التفاعلي المباشر (Start Voice Stream)'}
            >
              {isStreaming ? (
                <Square className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-8 h-8 fill-current ml-1" />
              )}
            </button>

            {/* Stop / Replay voice controls */}
            {voiceState === 'speaking' ? (
              <button
                onClick={handleStopSpeaking}
                className="p-2.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
                title="إيقاف صوت الوكيل الحالي"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleReplayVoice}
                disabled={!lastBotAudio && !messages.some((m) => m.sender === 'bot')}
                className="p-2.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-all disabled:opacity-40"
                title="إعادة الاستماع لآخر رد صوتي"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

        </div>
      )}

      {/* Quick Prompts Chips */}
      <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[11px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>مقترحات سريعة:</span>
        </span>
        
        {/* Direct Vision Scan Button */}
        <button
          onClick={handleCaptureAndAnalyze}
          className="text-xs shrink-0 px-3 py-1 rounded-full bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 transition-all font-bold flex items-center gap-1 shadow-sm"
          title="فحص وتحليل المستند المعروض أمام الكاميرا صوتياً"
        >
          <Scan className="w-3.5 h-3.5 text-cyan-400" />
          <span>📸 فحص ما في الكاميرا صوتياً</span>
        </button>

        {/* Voice Intro Button */}
        <button
          onClick={() => handleUserSpeechFinal('تحدث معي بالصوت مباشرة وعرفني بنفسك ومجال خبرتك المحاسبية.')}
          className="text-xs shrink-0 px-3 py-1 rounded-full bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/40 transition-all font-semibold flex items-center gap-1 shadow-sm"
        >
          <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>🎙️ تحدث معي وعرفني بنفسك</span>
        </button>

        {/* Windows Automation Chip */}
        <button
          onClick={() => handleUserSpeechFinal('قم بتوليد سكريبت PowerShell لأتمتة قيود الحسابات في إكسل والتحكم ببرامج ويندوز.')}
          className="text-xs shrink-0 px-3 py-1 rounded-full bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 transition-all font-semibold flex items-center gap-1 shadow-sm"
        >
          <span>⚡ أتمتة ويندوز وإكسل</span>
        </button>

        {/* Web Search / Scraping Chip */}
        <button
          onClick={() => handleUserSpeechFinal('افحص لي موقع هيئة الزكاة والضريبة والجمارك ZATCA وأحدث لوائح الفوترة الإلكترونية.')}
          className="text-xs shrink-0 px-3 py-1 rounded-full bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-500/40 transition-all font-semibold flex items-center gap-1 shadow-sm"
        >
          <span>🌐 فحص الويب المباشر</span>
        </button>

        {bot.samplePrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleUserSpeechFinal(prompt)}
            className="text-xs shrink-0 px-3 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-all font-medium"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages Transcript Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg shadow-md border ${
                  isUser
                    ? 'bg-gradient-to-tr from-amber-500 to-orange-600 border-amber-400 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                {isUser ? userProfile.name.charAt(0) : bot.avatar}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-md ${
                  isUser
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-tr-none'
                    : 'bg-slate-800/90 border border-slate-700/80 text-slate-100 rounded-tl-none'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] font-bold opacity-80">
                    {isUser ? userProfile.name : bot.name}
                  </span>
                  <span className="text-[10px] opacity-60 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString('ar-SA', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.text}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Text Input Bar */}
      <div className="p-3 bg-slate-950/90 border-t border-slate-800">
        <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`تحدث صوتياً أو اكتب استفسارك المحاسبي لـ ${bot.name}...`}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />

          {/* Quick Voice Talk Mic Button */}
          <button
            type="button"
            onClick={toggleStreaming}
            className={`p-2.5 rounded-xl border transition-all flex items-center justify-center ${
              isStreaming
                ? 'bg-red-600 border-red-500 text-white animate-pulse shadow-md shadow-red-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
            title={isStreaming ? 'إيقاف الاستماع الصوتي' : 'تحدث صوتياً الآن مع الوكيل (Speak with Agent)'}
          >
            {isStreaming ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-rose-400" />}
          </button>

          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all shadow-md"
            title="إرسال"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

    </div>
  );
};
