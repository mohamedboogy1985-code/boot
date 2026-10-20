import React from 'react';
import { ChatterBot } from '../types';
import { 
  Sparkles, 
  Volume2, 
  CheckCircle2, 
  Trash2, 
  Plus,
  Play,
  Cpu
} from 'lucide-react';

interface BotSelectorProps {
  presetBots: ChatterBot[];
  customBots: ChatterBot[];
  selectedBot: ChatterBot;
  onSelectBot: (bot: ChatterBot) => void;
  onDeleteCustomBot: (botId: string) => void;
  onOpenNewBotModal: () => void;
}

const COLOR_MAP: Record<string, {
  border: string;
  selectedRing: string;
  badge: string;
  bgGrad: string;
  glow: string;
}> = {
  emerald: {
    border: 'border-emerald-500/30 hover:border-emerald-400',
    selectedRing: 'ring-2 ring-emerald-400 border-emerald-500 bg-emerald-950/20',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    bgGrad: 'from-emerald-500/10 via-transparent to-transparent',
    glow: 'shadow-emerald-500/20',
  },
  pink: {
    border: 'border-pink-500/30 hover:border-pink-400',
    selectedRing: 'ring-2 ring-pink-400 border-pink-500 bg-pink-950/20',
    badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    bgGrad: 'from-pink-500/10 via-transparent to-transparent',
    glow: 'shadow-pink-500/20',
  },
  amber: {
    border: 'border-amber-500/30 hover:border-amber-400',
    selectedRing: 'ring-2 ring-amber-400 border-amber-500 bg-amber-950/20',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    bgGrad: 'from-amber-500/10 via-transparent to-transparent',
    glow: 'shadow-amber-500/20',
  },
  cyan: {
    border: 'border-cyan-500/30 hover:border-cyan-400',
    selectedRing: 'ring-2 ring-cyan-400 border-cyan-500 bg-cyan-950/20',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    bgGrad: 'from-cyan-500/10 via-transparent to-transparent',
    glow: 'shadow-cyan-500/20',
  },
  indigo: {
    border: 'border-indigo-500/30 hover:border-indigo-400',
    selectedRing: 'ring-2 ring-indigo-400 border-indigo-500 bg-indigo-950/20',
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    bgGrad: 'from-indigo-500/10 via-transparent to-transparent',
    glow: 'shadow-indigo-500/20',
  },
  purple: {
    border: 'border-purple-500/30 hover:border-purple-400',
    selectedRing: 'ring-2 ring-purple-400 border-purple-500 bg-purple-950/20',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    bgGrad: 'from-purple-500/10 via-transparent to-transparent',
    glow: 'shadow-purple-500/20',
  },
};

export const BotSelector: React.FC<BotSelectorProps> = ({
  presetBots,
  customBots,
  selectedBot,
  onSelectBot,
  onDeleteCustomBot,
  onOpenNewBotModal,
}) => {
  const renderBotCard = (bot: ChatterBot, isCustom = false) => {
    const isSelected = selectedBot.id === bot.id;
    const colors = COLOR_MAP[bot.color] || COLOR_MAP.indigo;

    return (
      <div
        key={bot.id}
        onClick={() => onSelectBot(bot)}
        className={`group relative flex flex-col p-4 rounded-2xl cursor-pointer transition-all duration-200 border bg-slate-900/80 backdrop-blur-sm shadow-md hover:shadow-xl ${
          isSelected
            ? `${colors.selectedRing} ${colors.glow}`
            : `border-slate-800 ${colors.border} hover:-translate-y-1`
        }`}
      >
        {/* Top Header: Avatar & Badges */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform">
              {bot.avatar}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base tracking-tight">
                  {bot.name}
                </h3>
                {isSelected && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>نشط</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {bot.arabicName}
              </p>
            </div>
          </div>

          {/* Voice model pill */}
          <div className="flex items-center gap-1">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${colors.badge}`}
              title={`صوت الذكاء الاصطناعي: ${bot.voice}`}
            >
              <Volume2 className="w-3 h-3" />
              {bot.voice}
            </span>

            {isCustom && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`هل أنت متأكد من حذف الشخصية "${bot.name}"؟`)) {
                    onDeleteCustomBot(bot.id);
                  }
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                title="حذف هذه الشخصية"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Role & Catchphrase */}
        <div className="flex-1 mb-3">
          <span className="inline-block text-xs font-semibold text-slate-300 mb-1.5 px-2 py-0.5 rounded bg-slate-800/80">
            {bot.title}
          </span>
          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
            "{bot.catchphrase}"
          </p>
        </div>

        {/* Bottom Bar: Action */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500 truncate max-w-[170px]">
            {bot.speakingStyle}
          </span>
          <span className={`font-semibold flex items-center gap-1 transition-colors ${
            isSelected ? 'text-indigo-400' : 'text-slate-400 group-hover:text-indigo-300'
          }`}>
            <Play className="w-3 h-3 fill-current" />
            <span>{isSelected ? 'تحدث الآن' : 'اختر وتحدث'}</span>
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Preset ChatterBots Section */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              الشخصيات الجاهزة (Presets)
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            {presetBots.length} شخصيات متخصصة
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {presetBots.map((bot) => renderBotCard(bot, false))}
        </div>
      </div>

      {/* Your Custom ChatterBots Section */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              شخصياتك المخصصة (Your ChatterBots)
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            {customBots.length} شخصيات تم إنشاؤها
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* Custom Bots list */}
          {customBots.map((bot) => renderBotCard(bot, true))}

          {/* New ChatterBot Card */}
          <button
            onClick={onOpenNewBotModal}
            className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-700 hover:border-purple-500/80 bg-slate-900/40 hover:bg-slate-900/70 text-slate-400 hover:text-purple-300 transition-all duration-200 group min-h-[170px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 group-hover:bg-purple-500/20 transition-all mb-2.5">
              <Plus className="w-6 h-6" />
            </div>
            <span className="font-bold text-sm text-slate-200 group-hover:text-white">
              إنشاء ChatterBot مخصص (New ChatterBot)
            </span>
            <span className="text-xs text-slate-500 text-center mt-1">
              حدد الاسم، نبرة الصوت، والأسلوب المحاسبي الفريد
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
