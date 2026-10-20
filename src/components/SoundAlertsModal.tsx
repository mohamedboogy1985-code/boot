import React, { useState } from 'react';
import { 
  X, 
  Bell, 
  Volume2, 
  Play, 
  Square, 
  Check, 
  VolumeX, 
  Sparkles,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { SoundAlertSettings, ChimeToneId } from '../types';
import { PRESET_CHIMES, soundEffectsManager } from '../services/soundEffects';

interface SoundAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SoundAlertSettings;
  onSaveSettings: (settings: SoundAlertSettings) => void;
}

export const SoundAlertsModal: React.FC<SoundAlertsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [currentSettings, setCurrentSettings] = useState<SoundAlertSettings>(settings);
  const [lastTestedTone, setLastTestedTone] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectTone = (toneId: ChimeToneId) => {
    const updated = { ...currentSettings, toneId };
    setCurrentSettings(updated);
    onSaveSettings(updated);
    // Play preview automatically upon selection
    soundEffectsManager.playStartAlert(toneId, updated.volume);
    setLastTestedTone(`${toneId}-start`);
  };

  const handlePreviewStart = (toneId: ChimeToneId, e: React.MouseEvent) => {
    e.stopPropagation();
    soundEffectsManager.playStartAlert(toneId, currentSettings.volume);
    setLastTestedTone(`${toneId}-start`);
  };

  const handlePreviewEnd = (toneId: ChimeToneId, e: React.MouseEvent) => {
    e.stopPropagation();
    soundEffectsManager.playEndAlert(toneId, currentSettings.volume);
    setLastTestedTone(`${toneId}-end`);
  };

  const handleVolumeChange = (vol: number) => {
    const updated = { ...currentSettings, volume: vol };
    setCurrentSettings(updated);
    onSaveSettings(updated);
  };

  const handleToggleStart = () => {
    const updated = { ...currentSettings, enableStartAlert: !currentSettings.enableStartAlert };
    setCurrentSettings(updated);
    onSaveSettings(updated);
  };

  const handleToggleEnd = () => {
    const updated = { ...currentSettings, enableEndAlert: !currentSettings.enableEndAlert };
    setCurrentSettings(updated);
    onSaveSettings(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-md">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                إعدادات التنبيهات الصوتية للجلسات
              </h2>
              <p className="text-xs text-slate-400">
                اختر نغمة التنبيه التي تدق عند بدء أو إنهاء جلسة المحادثة الصوتية
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Toggles: Enable Start & End alerts */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>خيارات التفعيل ومستوى الصوت</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Start Alert Checkbox */}
              <label className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={currentSettings.enableStartAlert}
                  onChange={handleToggleStart}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-800 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-200">
                  تنبيه صوتي عند بدء الجلسة
                </span>
              </label>

              {/* End Alert Checkbox */}
              <label className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={currentSettings.enableEndAlert}
                  onChange={handleToggleEnd}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-800 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-200">
                  تنبيه صوتي عند إنهاء الجلسة
                </span>
              </label>
            </div>

            {/* Volume Slider */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>شدة صوت التنبيه:</span>
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {Math.round(currentSettings.volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={currentSettings.volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Preset Chime List */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>قائمة النغمات الصوتية المسبقة (Preset Tones)</span>
              </h3>
              <span className="text-xs text-slate-500">
                انقر على النغمة لاختيارها وسماعها
              </span>
            </div>

            <div className="space-y-2.5">
              {PRESET_CHIMES.map((chime) => {
                const isSelected = currentSettings.toneId === chime.id;

                return (
                  <div
                    key={chime.id}
                    onClick={() => handleSelectTone(chime.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-indigo-950/60 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:bg-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{chime.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-white">
                            {chime.arabicName}
                          </h4>
                          <span className="text-xs text-slate-500">
                            ({chime.name})
                          </span>
                          {isSelected && (
                            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.2 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>مفعلة</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                          {chime.description}
                        </p>
                      </div>
                    </div>

                    {/* Preview Buttons */}
                    {chime.id !== 'none' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handlePreviewStart(chime.id, e)}
                          className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-all shadow-sm"
                          title="استمع لنغمة البدء"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span className="hidden sm:inline">البدء</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handlePreviewEnd(chime.id, e)}
                          className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-all shadow-sm"
                          title="استمع لنغمة الإنهاء"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span className="hidden sm:inline">الإنهاء</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            النغمة المختارة حالياً: <strong className="text-indigo-300">{PRESET_CHIMES.find(c => c.id === currentSettings.toneId)?.arabicName}</strong>
          </span>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>حفظ وإغلاق</span>
          </button>
        </div>

      </div>
    </div>
  );
};
