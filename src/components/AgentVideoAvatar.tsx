import React, { useEffect, useState } from 'react';
import { ChatterBot } from '../types';
import { Volume2, Sparkles, Radio, ShieldCheck, Video, Mic } from 'lucide-react';

interface AgentVideoAvatarProps {
  bot: ChatterBot;
  voiceState: 'idle' | 'listening' | 'thinking' | 'speaking';
  isBotMuted: boolean;
}

const BOT_ENVIRONMENTS: Record<string, {
  bgGradient: string;
  badge: string;
  roomName: string;
  accentColor: string;
  avatarRing: string;
}> = {
  'proper-paul': {
    bgGradient: 'from-emerald-950/90 via-slate-900 to-slate-950',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    roomName: 'مكتب المراسم والبروتوكول المالي',
    accentColor: '#10b981',
    avatarRing: 'ring-emerald-400 border-emerald-500',
  },
  'accountant-adam': {
    bgGradient: 'from-indigo-950/90 via-slate-900 to-slate-950',
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    roomName: 'صالة العمليات والقيود المحاسبية',
    accentColor: '#6366f1',
    avatarRing: 'ring-indigo-400 border-indigo-500',
  },
  'auditor-amira': {
    bgGradient: 'from-purple-950/90 via-slate-900 to-slate-950',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    roomName: 'مكتب الرقابة والتدقيق الداخلي',
    accentColor: '#a855f7',
    avatarRing: 'ring-purple-400 border-purple-500',
  },
  'chic-charlotte': {
    bgGradient: 'from-pink-950/90 via-slate-900 to-slate-950',
    badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    roomName: 'استوديو التصميم والميزانيات الذكية',
    accentColor: '#ec4899',
    avatarRing: 'ring-pink-400 border-pink-500',
  },
  'chef-shane': {
    bgGradient: 'from-amber-950/90 via-slate-900 to-slate-950',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    roomName: 'مطبخ الاستراتيجيات والوصفات الربحية',
    accentColor: '#f59e0b',
    avatarRing: 'ring-amber-400 border-amber-500',
  },
  'passport-penny': {
    bgGradient: 'from-cyan-950/90 via-slate-900 to-slate-950',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    roomName: 'صالة العملات الأجنبية والتوسع الدولي',
    accentColor: '#06b6d4',
    avatarRing: 'ring-cyan-400 border-cyan-500',
  },
};

export const AgentVideoAvatar: React.FC<AgentVideoAvatarProps> = ({
  bot,
  voiceState,
  isBotMuted,
}) => {
  const env = BOT_ENVIRONMENTS[bot.id] || {
    bgGradient: 'from-indigo-950/90 via-slate-900 to-slate-950',
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    roomName: 'استوديو الذكاء الاصطناعي',
    accentColor: '#818cf8',
    avatarRing: 'ring-indigo-400 border-indigo-500',
  };

  const [speechPulse, setSpeechPulse] = useState(0);

  // Animate mouth/expression pulse while speaking
  useEffect(() => {
    let interval: any = null;
    if (voiceState === 'speaking') {
      interval = setInterval(() => {
        setSpeechPulse((prev) => (prev + 1) % 4);
      }, 160);
    } else {
      setSpeechPulse(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [voiceState]);

  return (
    <div className={`relative w-full h-full min-h-[320px] sm:min-h-[380px] rounded-3xl overflow-hidden bg-gradient-to-b ${env.bgGradient} border border-slate-700/80 shadow-2xl flex flex-col justify-between p-4 sm:p-5 select-none`}>
      
      {/* Top HUD: Live Video Badges */}
      <div className="flex items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-2">
          {/* Live Badge */}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-700/80 text-[11px] font-bold text-slate-200 shadow-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-emerald-400">مباشر HD</span>
          </span>

          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${env.badge}`}>
            {env.roomName}
          </span>
        </div>

        {/* Voice Engine Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/70 border border-slate-800 text-xs font-mono text-slate-300">
          <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>صوت {bot.voice}</span>
        </div>
      </div>

      {/* Center: Animated Virtual Persona Presence */}
      <div className="relative flex flex-col items-center justify-center my-auto py-4 z-10">
        
        {/* Animated Radiant Rings when bot is speaking */}
        {voiceState === 'speaking' && (
          <>
            <div className="absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-indigo-500/15 animate-ping pointer-events-none" />
            <div className="absolute w-52 h-52 sm:w-64 sm:h-64 rounded-full bg-purple-500/10 animate-pulse pointer-events-none" />
          </>
        )}

        {/* Persona Portrait Frame */}
        <div className="relative group">
          <div
            className={`w-28 h-28 sm:w-36 sm:h-36 rounded-3xl bg-slate-800/90 border-2 flex items-center justify-center text-6xl sm:text-7xl shadow-2xl transition-all duration-300 transform ${
              voiceState === 'speaking'
                ? `scale-105 ring-4 ${env.avatarRing} shadow-indigo-500/40`
                : voiceState === 'listening'
                ? 'ring-2 ring-slate-500 border-slate-600'
                : 'border-slate-700/80 shadow-black/50'
            }`}
          >
            {/* Dynamic visual representation */}
            <span className={`transition-transform duration-150 ${
              voiceState === 'speaking' ? 'scale-110' : 'scale-100'
            }`}>
              {bot.avatar}
            </span>

            {/* Speaking reactive soundwave overlay */}
            {voiceState === 'speaking' && (
              <div className="absolute -bottom-2 px-3 py-1 rounded-full bg-indigo-600 border border-indigo-400 text-white text-[10px] font-bold flex items-center gap-1 shadow-lg animate-bounce">
                <Volume2 className="w-3 h-3 animate-pulse" />
                <span>يتحدث الآن...</span>
              </div>
            )}
          </div>
        </div>

        {/* Name & Catchphrase */}
        <div className="text-center mt-4">
          <div className="flex items-center justify-center gap-2">
            <h3 className="font-extrabold text-lg sm:text-xl text-white tracking-tight">
              {bot.name}
            </h3>
            <span className="text-xs text-slate-400 font-semibold">
              ({bot.arabicName})
            </span>
          </div>

          <p className="text-xs text-slate-300 font-medium mt-0.5 max-w-sm mx-auto line-clamp-1">
            {bot.title}
          </p>

          <p className="text-[11px] text-slate-400 italic mt-1 max-w-xs mx-auto line-clamp-1 opacity-80">
            "{bot.catchphrase}"
          </p>
        </div>

      </div>

      {/* Bottom HUD: Live Status Banner & Audio Wave Indicator */}
      <div className="flex items-center justify-between gap-3 bg-slate-950/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 z-10">
        <div className="flex items-center gap-2">
          {voiceState === 'speaking' && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-300 font-bold">
              {/* Equalizer animation */}
              <div className="flex items-end gap-0.5 h-4 w-5">
                <span className="w-1 bg-indigo-400 rounded-full animate-[pulse_0.4s_infinite]" style={{ height: speechPulse === 1 ? '100%' : '40%' }} />
                <span className="w-1 bg-indigo-400 rounded-full animate-[pulse_0.5s_infinite]" style={{ height: speechPulse === 2 ? '100%' : '60%' }} />
                <span className="w-1 bg-indigo-400 rounded-full animate-[pulse_0.3s_infinite]" style={{ height: speechPulse === 3 ? '100%' : '30%' }} />
              </div>
              <span>الوكيل يرد عليك بالصوت الآن</span>
            </div>
          )}

          {voiceState === 'listening' && (
            <div className="flex items-center gap-1.5 text-xs text-red-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span>الوكيل يشاهدك ويستمع لصوتك...</span>
            </div>
          )}

          {voiceState === 'thinking' && (
            <div className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
              <Sparkles className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>جاري تحليل الفيديو والبيانات المحاسبية...</span>
            </div>
          )}

          {voiceState === 'idle' && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Video className="w-3.5 h-3.5 text-slate-400" />
              <span>مكالمة الفيديو والصوت جاهزة • ابدأ التحدث</span>
            </div>
          )}
        </div>

        {/* Audio Status */}
        <span className="text-[11px] font-mono text-slate-400">
          {isBotMuted ? '🔇 الصوت مكتوم' : '🔊 الصوت مفعل'}
        </span>
      </div>

    </div>
  );
};
