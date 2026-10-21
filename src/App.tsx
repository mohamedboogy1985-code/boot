import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { BotSelector } from './components/BotSelector';
import { LiveVoiceChat } from './components/LiveVoiceChat';
import { UserProfileModal } from './components/UserProfileModal';
import { NewBotModal } from './components/NewBotModal';
import { SoundAlertsModal } from './components/SoundAlertsModal';

// Route-level code splitting: the accounting ERP, deep-control hub, and
// recorded-sessions modal are downloaded only when the user opens them.
const AccountingSuiteView = lazy(() =>
  import('./components/AccountingSuiteView').then((m) => ({ default: m.AccountingSuiteView })),
);
const DeepControlHub = lazy(() =>
  import('./components/DeepControlHub').then((m) => ({ default: m.DeepControlHub })),
);
const RecordedSessionsModal = lazy(() =>
  import('./components/RecordedSessionsModal').then((m) => ({ default: m.RecordedSessionsModal })),
);

const LazyViewFallback: React.FC = () => (
  <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/70 p-8">
    <div className="text-center">
      <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
      <p className="text-sm font-bold text-slate-300">جارٍ تحميل الوحدة عند الطلب…</p>
    </div>
  </div>
);
import { PRESET_BOTS, INITIAL_USER_PROFILE } from './data/presetBots';
import { ChatterBot, UserProfile, SoundAlertSettings } from './types';
import { LocalDB } from './services/localDb';
import { ApiService } from './services/api';
import { soundEffectsManager } from './services/soundEffects';

const CUSTOM_BOTS_STORAGE_KEY = 'chatterbots_custom_personas';
const USER_PROFILE_STORAGE_KEY = 'chatterbots_user_profile';

export default function App() {
  const [presetBots] = useState<ChatterBot[]>(PRESET_BOTS);
  const [customBots, setCustomBots] = useState<ChatterBot[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_BOTS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedBot, setSelectedBot] = useState<ChatterBot>(PRESET_BOTS[0]);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
      return saved ? JSON.parse(saved) : INITIAL_USER_PROFILE;
    } catch {
      return INITIAL_USER_PROFILE;
    }
  });

  const [currentView, setCurrentView] = useState<'studio' | 'accounting' | 'control'>('studio');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNewBotOpen, setIsNewBotOpen] = useState(false);
  const [isLocalDbOpen, setIsLocalDbOpen] = useState(false);
  const [isSoundModalOpen, setIsSoundModalOpen] = useState(false);
  const [soundSettings, setSoundSettings] = useState<SoundAlertSettings>(() => {
    return soundEffectsManager.loadSettings();
  });
  const [savedSessionsCount, setSavedSessionsCount] = useState(0);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  // Update and persist sound settings
  const handleUpdateSoundSettings = (newSettings: SoundAlertSettings) => {
    setSoundSettings(newSettings);
    soundEffectsManager.saveSettings(newSettings);
  };

  // Sync custom bots to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_BOTS_STORAGE_KEY, JSON.stringify(customBots));
    } catch (e) {
      console.warn('Failed to save custom bots:', e);
    }
  }, [customBots]);

  // Sync user profile to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(userProfile));
    } catch (e) {
      console.warn('Failed to save user profile:', e);
    }
  }, [userProfile]);

  // Load saved sessions count and backend status
  const refreshSessionsCount = async () => {
    try {
      const sessions = await LocalDB.getAllSessions();
      setSavedSessionsCount(sessions.length);
    } catch (e) {
      console.warn('Error reading LocalDB sessions count:', e);
    }
  };

  useEffect(() => {
    refreshSessionsCount();
    ApiService.getStatus().then((res) => {
      setHasGeminiKey(res.hasGeminiKey);
    });
  }, []);

  const handleAddBot = (newBot: ChatterBot) => {
    setCustomBots((prev) => [newBot, ...prev]);
    setSelectedBot(newBot);
  };

  const handleDeleteCustomBot = (botId: string) => {
    setCustomBots((prev) => prev.filter((b) => b.id !== botId));
    if (selectedBot.id === botId) {
      setSelectedBot(PRESET_BOTS[0]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white" dir="rtl">
      
      {/* Navigation Header */}
      <Navbar
        currentView={currentView}
        onViewChange={setCurrentView}
        userProfile={userProfile}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenNewBot={() => setIsNewBotOpen(true)}
        onOpenLocalDb={() => setIsLocalDbOpen(true)}
        onOpenSoundSettings={() => setIsSoundModalOpen(true)}
        savedSessionsCount={savedSessionsCount}
        hasGeminiKey={hasGeminiKey}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {currentView === 'studio' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column (Voice Chat Window on large screens, 7 cols) */}
            <div className="lg:col-span-7 xl:col-span-7 order-1 lg:order-1">
              <LiveVoiceChat
                bot={selectedBot}
                userProfile={userProfile}
                soundSettings={soundSettings}
                onOpenSoundSettings={() => setIsSoundModalOpen(true)}
                onSessionSaved={refreshSessionsCount}
                onOpenLocalDb={() => setIsLocalDbOpen(true)}
              />
            </div>

            {/* Right Column (Bot Presets & Custom Bot List, 5 cols) */}
            <div className="lg:col-span-5 xl:col-span-5 order-2 lg:order-2 space-y-6">
              {/* Profile summary card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center font-bold text-white shadow">
                    {userProfile.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">{userProfile.name}</h4>
                    <p className="text-xs text-slate-400 line-clamp-1">{userProfile.role}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline"
                >
                  تعديل التخصيص
                </button>
              </div>

              {/* Bot Selector Component */}
              <BotSelector
                presetBots={presetBots}
                customBots={customBots}
                selectedBot={selectedBot}
                onSelectBot={setSelectedBot}
                onDeleteCustomBot={handleDeleteCustomBot}
                onOpenNewBotModal={() => setIsNewBotOpen(true)}
              />
            </div>

          </div>
        ) : currentView === 'accounting' ? (
          /* Accounting Suite ERP Integrated View (lazy chunk) */
          <Suspense fallback={<LazyViewFallback />}>
            <AccountingSuiteView
            activeBot={selectedBot}
            userProfile={userProfile}
            soundSettings={soundSettings}
            onOpenSoundSettings={() => setIsSoundModalOpen(true)}
            onOpenStudio={() => setCurrentView('studio')}
            onSessionSaved={refreshSessionsCount}
              onOpenLocalDb={() => setIsLocalDbOpen(true)}
            />
          </Suspense>
        ) : (
          /* Deep Control & Real Agent Automation Hub (lazy chunk) */
          <Suspense fallback={<LazyViewFallback />}>
            <DeepControlHub
            activeBot={selectedBot}
            allBots={[...presetBots, ...customBots]}
              userProfile={userProfile}
            />
          </Suspense>
        )}
      </main>

      {/* Modals */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        userProfile={userProfile}
        onSaveProfile={setUserProfile}
      />

      <NewBotModal
        isOpen={isNewBotOpen}
        onClose={() => setIsNewBotOpen(false)}
        onAddBot={handleAddBot}
      />

      {isLocalDbOpen && (
        <Suspense fallback={null}>
          <RecordedSessionsModal
            isOpen={isLocalDbOpen}
            onClose={() => setIsLocalDbOpen(false)}
            onSessionDeleted={refreshSessionsCount}
          />
        </Suspense>
      )}

      <SoundAlertsModal
        isOpen={isSoundModalOpen}
        onClose={() => setIsSoundModalOpen(false)}
        settings={soundSettings}
        onSaveSettings={handleUpdateSoundSettings}
      />

    </div>
  );
}
