import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { BotSelector } from './components/BotSelector';
import { LiveVoiceChat } from './components/LiveVoiceChat';
import { UserProfileModal } from './components/UserProfileModal';
import { NewBotModal } from './components/NewBotModal';
import { RecordedSessionsModal } from './components/RecordedSessionsModal';
import { SoundAlertsModal } from './components/SoundAlertsModal';
import { AccountingSuiteView } from './components/AccountingSuiteView';
import { DeepControlHub } from './components/DeepControlHub';
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
          /* Accounting Suite ERP Integrated View */
          <AccountingSuiteView
            activeBot={selectedBot}
            userProfile={userProfile}
            soundSettings={soundSettings}
            onOpenSoundSettings={() => setIsSoundModalOpen(true)}
            onOpenStudio={() => setCurrentView('studio')}
            onSessionSaved={refreshSessionsCount}
            onOpenLocalDb={() => setIsLocalDbOpen(true)}
          />
        ) : (
          /* Deep Control & Real Agent Automation Hub */
          <DeepControlHub
            activeBot={selectedBot}
            allBots={[...presetBots, ...customBots]}
            userProfile={userProfile}
          />
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

      <RecordedSessionsModal
        isOpen={isLocalDbOpen}
        onClose={() => setIsLocalDbOpen(false)}
        onSessionDeleted={refreshSessionsCount}
      />

      <SoundAlertsModal
        isOpen={isSoundModalOpen}
        onClose={() => setIsSoundModalOpen(false)}
        settings={soundSettings}
        onSaveSettings={handleUpdateSoundSettings}
      />

    </div>
  );
}
