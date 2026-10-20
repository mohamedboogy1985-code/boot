import React, { useState } from 'react';
import { X, Sparkles, Volume2, Bot, Palette, MessageSquare } from 'lucide-react';
import { ChatterBot, VoiceId } from '../types';

interface NewBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBot: (bot: ChatterBot) => void;
}

const AVATAR_OPTIONS = ['🤖', '💼', '📊', '🔍', '⚖️', '💡', '💰', '👑', '🧙‍♂️', '🚀', '🧠', '☕'];

const VOICE_OPTIONS: Array<{ id: VoiceId; name: string; desc: string }> = [
  { id: 'Puck', name: 'Puck', desc: 'صوت ذكوري وقور، فصيح، واثق ومثالي للبروتوكول' },
  { id: 'Charon', name: 'Charon', desc: 'صوت ذكوري عميق، رسمي ورزين، ممتاز للمحاسبة والضرائب' },
  { id: 'Kore', name: 'Kore', desc: 'صوت نسائي ناعم، ملهم وذكي، مثالي للتسويق والتدقيق' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'صوت دافئ، قوي وحماسي، رائع للطهو والاستراتيجيات' },
  { id: 'Zephyr', name: 'Zephyr', desc: 'صوت ديناميكي سريع ومتعدد النغمات، ممتاز للرحلات والعملات' },
];

const COLOR_OPTIONS: Array<{ id: ChatterBot['color']; label: string; bg: string }> = [
  { id: 'indigo', label: 'نيلي', bg: 'bg-indigo-600' },
  { id: 'emerald', label: 'زمردي', bg: 'bg-emerald-600' },
  { id: 'pink', label: 'وردي', bg: 'bg-pink-600' },
  { id: 'amber', label: 'كهرماني', bg: 'bg-amber-600' },
  { id: 'cyan', label: 'سماوي', bg: 'bg-cyan-600' },
  { id: 'purple', label: 'بنفسجي', bg: 'bg-purple-600' },
];

export const NewBotModal: React.FC<NewBotModalProps> = ({
  isOpen,
  onClose,
  onAddBot,
}) => {
  const [name, setName] = useState('');
  const [arabicName, setArabicName] = useState('');
  const [title, setTitle] = useState('');
  const [avatar, setAvatar] = useState('🤖');
  const [color, setColor] = useState<ChatterBot['color']>('indigo');
  const [voice, setVoice] = useState<VoiceId>('Charon');
  const [personality, setPersonality] = useState('');
  const [speakingStyle, setSpeakingStyle] = useState('عملي، ناصح، مباشر');
  const [catchphrase, setCatchphrase] = useState('');
  const [samplePrompt1, setSamplePrompt1] = useState('');
  const [samplePrompt2, setSamplePrompt2] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newBot: ChatterBot = {
      id: 'custom-' + Date.now(),
      name: name.trim(),
      arabicName: arabicName.trim() || name.trim(),
      title: title.trim() || 'مستشار ذكي مخصص',
      avatar: avatar,
      color: color,
      voice: voice,
      personality: personality.trim() || 'ذكي ومتعاون، متخصص في مساعدة رواد الأعمال في الحسابات.',
      speakingStyle: speakingStyle.trim() || 'واضح وودود وموجز',
      catchphrase: catchphrase.trim() || 'دعنا نجعل أرقامك تتحدث بالنجاح!',
      samplePrompts: [
        samplePrompt1.trim() || 'كيف نطور الأداء المالي لمشروعنا؟',
        samplePrompt2.trim() || 'أعطني نصيحة سريعة لإدارة النقدية.',
      ],
      isCustom: true,
    };

    onAddBot(newBot);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                تصميم شخصية ChatterBot جديدة (New ChatterBot)
              </h2>
              <p className="text-xs text-slate-400">
                حدد ملامح الوكيل الذكي، نبرة الصوت، وسلوكه المحاسبي
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Bot Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                اسم الشخصية بالإنجليزية:
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: Ledger Liam أو Smart Sami"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                اسم الشخصية بالعربية:
              </label>
              <input
                type="text"
                value={arabicName}
                onChange={(e) => setArabicName(e.target.value)}
                placeholder="مثال: سامي الحكيم"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Title / Role */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              الدور والمسمى الوظيفي:
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: مستشار دراسات الجدوى وتسعير الخدمات"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Avatar Icon Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              <span>الأيقونة والرمز التعبيري (Avatar):</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_OPTIONS.map((icon) => (
                <button
                  type="button"
                  key={icon}
                  onClick={() => setAvatar(icon)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${
                    avatar === icon
                      ? 'bg-purple-600 text-white ring-2 ring-purple-400 scale-110 shadow'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Voice Model Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>نبرة الصوت (Gemini 3.8 Voice Engine):</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {VOICE_OPTIONS.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className={`p-2.5 rounded-xl border text-right transition-all ${
                    voice === v.id
                      ? 'bg-indigo-950/80 border-indigo-500 text-white shadow ring-1 ring-indigo-500'
                      : 'bg-slate-800/80 border-slate-700/80 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-indigo-300">{v.name}</span>
                    {voice === v.id && (
                      <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.2 rounded font-bold">
                        مختار
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{v.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Theme Color */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-pink-400" />
              <span>اللون التمييزي:</span>
            </label>
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setColor(c.id)}
                  className={`w-7 h-7 rounded-full ${c.bg} transition-all ${
                    color === c.id ? 'ring-3 ring-white scale-110 shadow-lg' : 'opacity-60 hover:opacity-100'
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Personality & Prompt Instructions */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              الشخصية والسلوك (Personality Prompt):
            </label>
            <textarea
              rows={2}
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="مثال: يركز على خفض التكاليف، يحب التفاؤل، يستشهد بأرقام واضحة، ويقدم حلولاً مبتكرة."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Catchphrase */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              العبارة المميزة (Catchphrase):
            </label>
            <input
              type="text"
              value={catchphrase}
              onChange={(e) => setCatchphrase(e.target.value)}
              placeholder="مثال: كل رقم يحكي قصة ربح قادمة!"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Sample Prompts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                سؤال تجريبي 1:
              </label>
              <input
                type="text"
                value={samplePrompt1}
                onChange={(e) => setSamplePrompt1(e.target.value)}
                placeholder="كيف نحسن هامش الربح؟"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                سؤال تجريبي 2:
              </label>
              <input
                type="text"
                value={samplePrompt2}
                onChange={(e) => setSamplePrompt2(e.target.value)}
                placeholder="ما أهمية المراجعة الأسبوعية؟"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all"
            >
              حفظ وبدء التحدث مع الشخصية
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
