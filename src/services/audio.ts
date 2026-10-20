/**
 * Audio service for ChatterBots Remix:
 * - Real-time frequency analysis for visualizer waves
 * - MediaRecorder for recording audio sessions and storing them in IndexedDB
 * - Gemini TTS playback with AudioContext / HTMLAudioElement
 * - SpeechRecognition for live speech-to-text transcription (Arabic & English)
 * - Fallback speech synthesis
 */

export class AudioManager {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private currentAudioElement: HTMLAudioElement | null = null;
  private recognition: any = null;

  // Initialize or get AudioContext
  getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // Start microphone stream and analyzer
  async startMicrophone(onAudioChunk?: (blob: Blob) => void): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.micStream = stream;

    const ctx = this.getAudioContext();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.8;

    this.micSource = ctx.createMediaStreamSource(stream);
    this.micSource.connect(this.analyser);

    // Setup MediaRecorder for local DB archiving
    this.recordedChunks = [];
    try {
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      }
      this.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
          if (onAudioChunk) onAudioChunk(event.data);
        }
      };
      this.mediaRecorder.start(1000); // chunk every 1 second
    } catch (e) {
      console.warn('MediaRecorder error:', e);
    }

    return stream;
  }

  // Stop microphone stream and finish recording
  stopMicrophone(): Blob | null {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.warn('Error stopping MediaRecorder:', e);
      }
    }

    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch (e) {
        // ignore
      }
      this.micSource = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    if (this.recordedChunks.length > 0) {
      const mime = this.recordedChunks[0]?.type || 'audio/webm';
      const fullBlob = new Blob(this.recordedChunks, { type: mime });
      this.recordedChunks = [];
      return fullBlob;
    }
    return null;
  }

  // Get live frequency data for waveform canvas
  getFrequencyData(): Uint8Array {
    if (!this.analyser) {
      return new Uint8Array(32);
    }
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  // Play base64 WAV audio from Gemini TTS
  async playBase64Audio(base64Wav: string, onEnded?: () => void): Promise<void> {
    this.stopSpeaking();
    return new Promise((resolve, reject) => {
      try {
        const audio = new Audio(`data:audio/wav;base64,${base64Wav}`);
        this.currentAudioElement = audio;

        // Optionally connect audio element to analyzer for bot wave animation
        try {
          const ctx = this.getAudioContext();
          const source = ctx.createMediaElementSource(audio);
          if (!this.analyser) {
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 128;
          }
          source.connect(this.analyser);
          this.analyser.connect(ctx.destination);
        } catch (e) {
          // If already connected or cross-origin restriction, normal playback still works
        }

        audio.onended = () => {
          this.currentAudioElement = null;
          if (onEnded) onEnded();
          resolve();
        };

        audio.onerror = (e) => {
          this.currentAudioElement = null;
          console.warn('Audio playback error:', e);
          if (onEnded) onEnded();
          resolve();
        };

        audio.play().catch((err) => {
          console.warn('Playback blocked or failed:', err);
          if (onEnded) onEnded();
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Fallback to browser Web Speech API synthesis
  speakWebSpeech(text: string, lang = 'ar-SA', onEnded?: () => void): void {
    this.stopSpeaking();
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onEnded) onEnded();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick suitable voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find((v) => v.lang.startsWith(lang.split('-')[0]));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => {
      if (onEnded) onEnded();
    };
    utterance.onerror = () => {
      if (onEnded) onEnded();
    };

    window.speechSynthesis.speak(utterance);
  }

  // Stop any active audio or speech
  stopSpeaking(): void {
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
      } catch (e) {
        // ignore
      }
      this.currentAudioElement = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  // Setup SpeechRecognition for live microphone transcription with auto-loop
  createSpeechRecognition(
    lang: string,
    onResult: (transcript: string, isFinal: boolean) => void,
    onError?: (error: any) => void
  ): { start: () => void; stop: () => void; pause: () => void; resume: () => void } | null {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      return null;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang || 'ar-SA';

      let isDesired = false;
      let isPaused = false;

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          onResult(finalTranscript, true);
        } else if (interimTranscript) {
          onResult(interimTranscript, false);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          // Normal timeout between sentences, do not treat as error
          return;
        }
        console.warn('SpeechRecognition error:', event.error);
        if (onError) onError(event.error);
      };

      recognition.onend = () => {
        // Auto restart if continuous listening is desired and not manually paused
        if (isDesired && !isPaused) {
          setTimeout(() => {
            if (isDesired && !isPaused) {
              try {
                recognition.start();
              } catch (e) {
                // Already started or busy
              }
            }
          }, 200);
        }
      };

      this.recognition = recognition;

      return {
        start: () => {
          isDesired = true;
          isPaused = false;
          try {
            recognition.start();
          } catch (e) {
            // Already started or busy
          }
        },
        stop: () => {
          isDesired = false;
          isPaused = false;
          try {
            recognition.stop();
          } catch (e) {
            // ignore
          }
        },
        pause: () => {
          isPaused = true;
          try {
            recognition.stop();
          } catch (e) {
            // ignore
          }
        },
        resume: () => {
          isPaused = false;
          if (isDesired) {
            try {
              recognition.start();
            } catch (e) {
              // ignore
            }
          }
        },
      };
    } catch (e) {
      console.warn('Could not initialize SpeechRecognition:', e);
      return null;
    }
  }
}

export const audioManager = new AudioManager();
