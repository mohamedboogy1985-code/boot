import { ChimeToneId, SoundAlertSettings } from '../types';

export const SOUND_SETTINGS_STORAGE_KEY = 'chatterbots_sound_alert_settings';

export const DEFAULT_SOUND_SETTINGS: SoundAlertSettings = {
  toneId: 'studio',
  enableStartAlert: true,
  enableEndAlert: true,
  volume: 0.7,
};

export interface PresetChimeInfo {
  id: ChimeToneId;
  name: string;
  arabicName: string;
  description: string;
  icon: string;
}

export const PRESET_CHIMES: PresetChimeInfo[] = [
  {
    id: 'studio',
    name: 'Studio Chime',
    arabicName: 'رنين الاستوديو الأنيق',
    description: 'نغمات هارمونية نقية ومتدرجة تمنح شعوراً بالحضور والاحترافية.',
    icon: '✨',
  },
  {
    id: 'accounting',
    name: 'Ledger Cashier',
    arabicName: 'رنين الكاشير وسجل الحسابات',
    description: 'رنين معدني دافئ كصوت رنين القيود والفواتير الناجحة ومكافأة الأرقام.',
    icon: '💰',
  },
  {
    id: 'modern',
    name: 'Modern Tech',
    arabicName: 'تقني عصري متطور',
    description: 'تدرج موجي ذكي وناعم ملائم لأنظمة الذكاء الاصطناعي الحديثة.',
    icon: '⚡',
  },
  {
    id: 'gentle',
    name: 'Gentle Pulse',
    arabicName: 'نبض هادئ ودافئ',
    description: 'نغمات خشبية ناعمة شبيهة بالماريمبا مريحة للأذن ولا تقاطع التركيز.',
    icon: '🌿',
  },
  {
    id: 'retro',
    name: '8-Bit Arcade',
    arabicName: 'ريترو كلاسيكي (8-Bit)',
    description: 'نغمة كلاسيكية مرحة ومميزة لبدء وإنهاء الجلسات.',
    icon: '🎮',
  },
  {
    id: 'none',
    name: 'Muted',
    arabicName: 'كتم التنبيهات (صامت)',
    description: 'تعطيل كافة التنبيهات الصوتية لبدء وانتهاء المحادثة.',
    icon: '🔕',
  },
];

class SoundEffectsManager {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // Play a single note helper with exponential gain envelope
  private playNote(
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.5
  ) {
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    } catch (e) {
      console.warn('Audio tone error:', e);
    }
  }

  // Play frequency sweep helper
  private playSweep(
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.5
  ) {
    try {
      const ctx = this.getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(startFreq, startTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    } catch (e) {
      console.warn('Audio sweep error:', e);
    }
  }

  // Play Start Session Alert
  playStartAlert(toneId: ChimeToneId, volume = 0.7) {
    if (toneId === 'none') return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1, volume * 0.45));

    switch (toneId) {
      case 'studio':
        // Ascending harmonic triad E5 -> G#5 -> B5
        this.playNote(659.25, now, 0.25, 'sine', vol * 0.9);
        this.playNote(830.61, now + 0.08, 0.28, 'sine', vol);
        this.playNote(987.77, now + 0.16, 0.45, 'sine', vol * 1.1);
        break;

      case 'accounting':
        // Crisp dual metallic cash register / coin ding
        this.playNote(1975.5, now, 0.35, 'triangle', vol * 1.2);
        this.playNote(2637.0, now + 0.04, 0.4, 'sine', vol * 0.9);
        break;

      case 'modern':
        // Modern upward frequency sweep
        this.playSweep(480, 960, now, 0.22, 'triangle', vol * 0.85);
        this.playNote(960, now + 0.18, 0.25, 'sine', vol);
        break;

      case 'gentle':
        // Warm marimba pulse C5 -> E5 -> G5
        this.playNote(523.25, now, 0.2, 'sine', vol * 0.8);
        this.playNote(659.25, now + 0.1, 0.22, 'sine', vol * 0.9);
        this.playNote(783.99, now + 0.2, 0.35, 'sine', vol);
        break;

      case 'retro':
        // 8-bit jump sound C5 -> G5
        this.playNote(523.25, now, 0.08, 'square', vol * 0.35);
        this.playNote(783.99, now + 0.08, 0.18, 'square', vol * 0.4);
        break;
    }
  }

  // Play End Session Alert
  playEndAlert(toneId: ChimeToneId, volume = 0.7) {
    if (toneId === 'none') return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1, volume * 0.45));

    switch (toneId) {
      case 'studio':
        // Descending harmonic resolution B5 -> G#5 -> E5
        this.playNote(987.77, now, 0.2, 'sine', vol);
        this.playNote(830.61, now + 0.08, 0.22, 'sine', vol * 0.9);
        this.playNote(659.25, now + 0.16, 0.45, 'sine', vol * 0.85);
        break;

      case 'accounting':
        // Cash drawer closing resolution tap (two low-warm thuds)
        this.playNote(587.33, now, 0.15, 'triangle', vol * 0.9);
        this.playNote(293.66, now + 0.1, 0.3, 'sine', vol * 1.1);
        break;

      case 'modern':
        // Downward smooth sweep
        this.playSweep(960, 440, now, 0.25, 'triangle', vol * 0.85);
        break;

      case 'gentle':
        // Warm downward cadence G5 -> E5 -> C5
        this.playNote(783.99, now, 0.18, 'sine', vol);
        this.playNote(659.25, now + 0.09, 0.2, 'sine', vol * 0.85);
        this.playNote(523.25, now + 0.18, 0.38, 'sine', vol * 0.75);
        break;

      case 'retro':
        // 8-bit downward resolution
        this.playNote(783.99, now, 0.08, 'square', vol * 0.4);
        this.playNote(523.25, now + 0.08, 0.18, 'square', vol * 0.35);
        break;
    }
  }

  // Load saved settings or defaults
  loadSettings(): SoundAlertSettings {
    try {
      const data = localStorage.getItem(SOUND_SETTINGS_STORAGE_KEY);
      if (data) {
        return { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(data) };
      }
    } catch (e) {
      console.warn('Error reading sound alert settings:', e);
    }
    return DEFAULT_SOUND_SETTINGS;
  }

  // Save settings
  saveSettings(settings: SoundAlertSettings) {
    try {
      localStorage.setItem(SOUND_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Error saving sound alert settings:', e);
    }
  }
}

export const soundEffectsManager = new SoundEffectsManager();
