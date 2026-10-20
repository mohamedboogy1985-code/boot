import React from 'react';
import { 
  Bot, 
  Settings, 
  Database, 
  PlusCircle, 
  Briefcase, 
  Radio, 
  Sparkles,
  Volume2,
  Bell,
  Zap
} from 'lucide-react';
import { UserProfile } from '../types';

interface NavbarProps {
  currentView: 'studio' | 'accounting' | 'control';
  onViewChange: (view: 'studio' | 'accounting' | 'control') => void;
  userProfile: UserProfile;
  onOpenProfile: () => void;
  onOpenNewBot: () => void;
  onOpenLocalDb: () => void;
  onOpenSoundSettings: () => void;
  savedSessionsCount: number;
  hasGeminiKey: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onViewChange,
  userProfile,
  onOpenProfile,
  onOpenNewBot,
  onOpenLocalDb,
  onOpenSoundSettings,
  savedSessionsCount,
  hasGeminiKey,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
        
        {/* Brand & Logo */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-2 ring-indigo-400/30">
            <Radio className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-white via-indigo-100 to-purple-200 bg-clip-text text-transparent">
                ChatterBots Remix
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Live AI
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              وكيل الذكاء الاصطناعي الصوتي المتكامل مع برنامج الحسابات والتحكم العميق
            </p>
          </div>
        </div>

        {/* View Switcher: Studio Hub vs Accounting Suite vs Deep Control */}
        <div className="hidden lg:flex items-center bg-slate-950/70 p-1.5 rounded-xl border border-slate-800/80 shadow-inner">
          <button
            onClick={() => onViewChange('studio')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              currentView === 'studio'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>استوديو ChatterBots</span>
          </button>
          <button
            onClick={() => onViewChange('accounting')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              currentView === 'accounting'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>نظام الحسابات والتدقيق</span>
          </button>
          <button
            onClick={() => onViewChange('control')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              currentView === 'control'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Zap className="w-4 h-4 text-cyan-400" />
            <span>التحكم العميق بالويندوز والويب</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Add custom bot button */}
          <button
            onClick={onOpenNewBot}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-200 text-xs sm:text-sm font-medium border border-slate-700/60 transition-all shadow-sm hover:shadow"
            title="إنشاء شخصية ChatterBot مخصصة جديدة"
          >
            <PlusCircle className="w-4 h-4 text-purple-400" />
            <span className="hidden sm:inline">شخصية جديدة</span>
          </button>

          {/* Local DB recorded sessions */}
          <button
            onClick={onOpenLocalDb}
            className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-200 text-xs sm:text-sm font-medium border border-indigo-700/50 transition-all shadow-sm"
            title="المحادثات المسجلة في قاعدة البيانات المحلية (IndexedDB)"
          >
            <Database className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">المحادثات المسجلة</span>
            {savedSessionsCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold bg-indigo-500 text-white shadow">
                {savedSessionsCount}
              </span>
            )}
          </button>

          {/* Sound Alerts Settings */}
          <button
            onClick={onOpenSoundSettings}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 text-xs sm:text-sm font-medium border border-amber-600/40 transition-all shadow-sm"
            title="إعدادات نغمات وتنبيهات بدء وانتهاء الجلسة الصوتية"
          >
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">نغمات التنبيه</span>
          </button>

          {/* User profile (Mohamed) */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium border border-slate-700/70 transition-all group"
            title="الإعداد الشخصي وتخصيص تجربة الذكاء الاصطناعي"
          >
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-xs font-bold text-white shadow-sm">
              {userProfile.name.charAt(0)}
            </div>
            <span className="hidden sm:inline max-w-[100px] truncate text-slate-200 group-hover:text-white font-semibold">
              {userProfile.name}
            </span>
            <Settings className="w-3.5 h-3.5 text-slate-400 group-hover:rotate-45 transition-transform" />
          </button>
        </div>

      </div>

      {/* Mobile view switcher */}
      <div className="lg:hidden flex border-t border-slate-800 bg-slate-950/90 px-3 py-1.5 gap-2 justify-center overflow-x-auto">
        <button
          onClick={() => onViewChange('studio')}
          className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shrink-0 ${
            currentView === 'studio'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>استوديو الصوت</span>
        </button>
        <button
          onClick={() => onViewChange('accounting')}
          className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shrink-0 ${
            currentView === 'accounting'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>الحسابات</span>
        </button>
        <button
          onClick={() => onViewChange('control')}
          className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shrink-0 ${
            currentView === 'control'
              ? 'bg-cyan-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>التحكم العميق</span>
        </button>
      </div>
    </header>
  );
};
