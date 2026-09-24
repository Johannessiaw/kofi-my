import { prepareGhanaianSpeechText } from './ghanaNlp';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'interrupted';

interface VoiceEngineCallbacks {
  onStateChange: (state: VoiceState) => void;
  onSpeechRecognized: (text: string, isFinal: boolean) => void;
  onError: (err: string) => void;
  onAudioFrequencies?: (frequencies: Uint8Array) => void;
}

export class JarvisVoiceEngine {
  private state: VoiceState = 'idle';
  private callbacks: VoiceEngineCallbacks;
  private recognition: any = null;
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private isListeningContinuous: boolean = false;
  private selectedVoice: SpeechSynthesisVoice | null = null;

  constructor(callbacks: VoiceEngineCallbacks) {
    this.callbacks = callbacks;
    if (typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        this.synth = window.speechSynthesis;
        this.initVoices();
      }
      this.initRecognition();
    }
  }

  private initVoices() {
    if (!this.synth) return;
    const updateVoices = () => {
      const voices = this.synth?.getVoices() || [];
      // Look for British or South African or English voices with natural tone
      const preferred = voices.find(v => v.lang === 'en-GH' || v.lang === 'en-ZA' || v.lang === 'en-GB' || v.name.includes('Natural') || v.name.includes('Guy') || v.name.includes('George'));
      this.selectedVoice = preferred || voices.find(v => v.lang.startsWith('en')) || null;
    };
    updateVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = updateVoices;
    }
  }

  private initRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available in this browser. Fallback typing supported.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-GH'; // Ghanaian English priority
      this.recognition.maxAlternatives = 3;

      this.recognition.onstart = () => {
        this.setState('listening');
        this.startAudioVisualizer();
        this.playChime(440, 0.08); // Listening start chime
      };

      this.recognition.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        if (finalText) {
          this.callbacks.onSpeechRecognized(finalText, true);
          this.setState('processing');
        } else if (interimText) {
          this.callbacks.onSpeechRecognized(interimText, false);
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('Speech recognition error:', event.error);
        }
        this.stopAudioVisualizer();
        if (this.state === 'listening') {
          this.setState('idle');
        }
      };

      this.recognition.onend = () => {
        this.stopAudioVisualizer();
        if (this.state === 'listening') {
          this.setState('idle');
        }
      };
    } catch (e) {
      console.error('Failed to initialize speech recognition', e);
    }
  }

  public setState(newState: VoiceState) {
    this.state = newState;
    this.callbacks.onStateChange(newState);
  }

  public getState(): VoiceState {
    return this.state;
  }

  /**
   * Start listening for voice input
   */
  public async startListening() {
    // If currently speaking, stop immediately (Barge-in / Interruption)
    this.stopSpeaking();

    if (!this.recognition) {
      this.callbacks.onError('Microphone speech recognition is not supported in this browser. Please use the text input.');
      return;
    }

    try {
      this.recognition.start();
    } catch (e: any) {
      // If already started, ignore or restart
      if (e.name !== 'InvalidStateError') {
        this.callbacks.onError(`Speech error: ${e.message}`);
      }
    }
  }

  /**
   * Stop listening
   */
  public stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore
      }
    }
    this.stopAudioVisualizer();
    if (this.state === 'listening') {
      this.setState('idle');
    }
  }

  /**
   * Speak response naturally with Ghanaian phonetic preparation
   */
  public speak(rawText: string, onEnd?: () => void) {
    if (!this.synth) {
      onEnd?.();
      return;
    }

    // Cancel any previous speech (Barge-in)
    this.stopSpeaking();

    const speechText = prepareGhanaianSpeechText(rawText);
    const utterance = new SpeechSynthesisUtterance(speechText);
    this.currentUtterance = utterance;

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    // Ghanaian English cadence tuning: measured pace and warm tone
    utterance.rate = 0.94;
    utterance.pitch = 0.98;

    utterance.onstart = () => {
      this.setState('speaking');
      this.startSimulatedAudioVisualizer();
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      this.stopAudioVisualizer();
      this.setState('idle');
      onEnd?.();
    };

    utterance.onerror = () => {
      this.currentUtterance = null;
      this.stopAudioVisualizer();
      this.setState('idle');
      onEnd?.();
    };

    this.synth.speak(utterance);
  }

  /**
   * Instant interruption / Barge-in: cut off Kofi immediately when user clicks or speaks
   */
  public stopSpeaking() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.currentUtterance = null;
    this.stopAudioVisualizer();
    if (this.state === 'speaking') {
      this.setState('interrupted');
      setTimeout(() => {
        if (this.state === 'interrupted') this.setState('idle');
      }, 150);
    }
  }

  /**
   * Web Audio API visualizer using microphone stream
   */
  private async startAudioVisualizer() {
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLoop = () => {
        if (!this.analyser || this.state !== 'listening') return;
        this.analyser.getByteFrequencyData(dataArray);
        this.callbacks.onAudioFrequencies?.(dataArray);
        this.animFrameId = requestAnimationFrame(updateLoop);
      };
      updateLoop();
    } catch (e) {
      // Microphones might be blocked; fallback to simulated visualizer
      this.startSimulatedAudioVisualizer();
    }
  }

  /**
   * Simulated frequency wave when playing TTS or when mic permissions are restricted
   */
  private startSimulatedAudioVisualizer() {
    const dummyFreqs = new Uint8Array(32);
    let phase = 0;

    const simLoop = () => {
      if (this.state !== 'speaking' && this.state !== 'listening') return;
      phase += 0.15;
      for (let i = 0; i < dummyFreqs.length; i++) {
        const val = Math.sin(phase + i * 0.4) * 80 + 100 + Math.random() * 40;
        dummyFreqs[i] = Math.max(20, Math.min(255, Math.floor(val)));
      }
      this.callbacks.onAudioFrequencies?.(dummyFreqs);
      this.animFrameId = requestAnimationFrame(simLoop);
    };
    simLoop();
  }

  private stopAudioVisualizer() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Subtle pleasant Web Audio chime
   */
  public playChime(freq = 520, duration = 0.12) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + duration);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // AudioContext might require user interaction first
    }
  }
}
