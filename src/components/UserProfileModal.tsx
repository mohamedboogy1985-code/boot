import React, { useState } from 'react';
import { X, User, Briefcase, Heart, Building2, Check, RotateCcw, Globe } from 'lucide-react';
import { UserProfile } from '../types';
import { INITIAL_USER_PROFILE } from '../data/presetBots';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onSaveProfile: (profile: UserProfile) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onSaveProfile,
}) => {
  const [profile, setProfile] = useState<UserProfile>(userProfile);
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile(profile);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 700);
  };

  const handleResetToDefault = () => {
    setProfile(INITIAL_USER_PROFILE);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                شاشة الإعداد والتخصيص الشخصي
              </h2>
              <p className="text-xs text-slate-400">
                تخصيص هوية المستخدم واهتماماته لتتفاعل شخصيات ChatterBots بذكاء معك
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
          {/* User Name */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-400" />
              <span>الاسم (Name):</span>
            </label>
            <input
              type="text"
              required
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              placeholder="مثال: Mohamed أو محمد"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              ستناديك الشخصيات بهذا الاسم دائماً في المحادثات الصوتية.
            </p>
          </div>

          {/* Job Role / Title */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
              <span>المسمى المهني والدور (Professional Role):</span>
            </label>
            <input
              type="text"
              value={profile.role}
              onChange={(e) => setProfile({ ...profile, role: e.target.value })}
              placeholder="مثال: مدير مالي ومحاسب قانوني، أو صاحب متجر"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Company / Business Name */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span>اسم الشركة أو النشاط التجاري (Company):</span>
            </label>
            <input
              type="text"
              value={profile.company}
              onChange={(e) => setProfile({ ...profile, company: e.target.value })}
              placeholder="مثال: مؤسسة النور لحلول المحاسبة والأعمال"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Hobbies & Personal Interests */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-pink-400" />
              <span>الاهتمامات والهوايات (Interests & Hobbies):</span>
            </label>
            <textarea
              rows={2}
              value={profile.interests}
              onChange={(e) => setProfile({ ...profile, interests: e.target.value })}
              placeholder="مثال: التكنولوجيا، كرة القدم، القهوة المختصة، السفر، الاستثمار العقاري"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              تستخدمها الشخصيات لطرح أمثلة مخصصة ودعابات ذكية تناسب شخصيتك!
            </p>
          </div>

          {/* Accounting & Business Context */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-amber-400" />
              <span>سياق الحسابات والأولويات المالية (Accounting Focus):</span>
            </label>
            <textarea
              rows={2}
              value={profile.context}
              onChange={(e) => setProfile({ ...profile, context: e.target.value })}
              placeholder="مثال: الفواتير الإلكترونية، ضريبة القيمة المضافة، مطابقة كشوفات البنك، التدفقات النقدية"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Language Preference */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>اللغة المفضلة في المحادثات:</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setProfile({ ...profile, language: 'ar' })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  profile.language === 'ar'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                العربية (Arabic)
              </button>
              <button
                type="button"
                onClick={() => setProfile({ ...profile, language: 'en' })}
                className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                  profile.language === 'en'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                الإنجليزية (English)
              </button>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة ملف Mohamed الافتراضي</span>
            </button>

            <button
              type="submit"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all ${
                isSaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {isSaved ? <Check className="w-4 h-4" /> : null}
              <span>{isSaved ? 'تم حفظ التعديلات!' : 'حفظ الملف الشخصي'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
