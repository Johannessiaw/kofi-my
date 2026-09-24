import { prepareGhanaianSpeechText } from './ghanaNlp';

export type VoiceState = 'idle' | 'standby' | 'listening' | 'processing' | 'speaking' | 'interrupted';

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
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private animFrameId: number | null = null;
  private bargeInAnimFrameId: number | null = null;
  private isContinuousMode: boolean = false;
  private restartTimeout: any = null;
  private isDestroyed: boolean = false;
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
      // Enable continuous listening so the engine stays in standby
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-GH'; // Ghanaian English priority
      this.recognition.maxAlternatives = 3;

      this.recognition.onstart = () => {
        if (this.state !== 'speaking' && this.state !== 'processing') {
          this.setState('standby');
          this.startAudioVisualizer();
        }
      };

      this.recognition.onspeechstart = () => {
        // If user speaks while Kofi is speaking -> instant barge-in!
        if (this.state === 'speaking') {
          this.stopSpeaking();
        }
        if (this.state !== 'processing') {
          this.setState('listening');
        }
      };

      this.recognition.onresult = (event: any) => {
        // User speech detected - if Kofi was speaking, interrupt immediately
        if (this.state === 'speaking') {
          this.stopSpeaking();
        }

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

        if (finalText && finalText.trim()) {
          this.callbacks.onSpeechRecognized(finalText.trim(), true);
          this.setState('processing');
        } else if (interimText && interimText.trim()) {
          if (this.state !== 'processing' && this.state !== 'speaking') {
            this.setState('listening');
          }
          this.callbacks.onSpeechRecognized(interimText.trim(), false);
        }
      };

      this.recognition.onerror = (event: any) => {
        // When silence occurs (no-speech), DO NOT turn off!
        // Standby mode is designed precisely so the user can pause without stress.
        if (event.error === 'no-speech') {
          if (this.isContinuousMode && this.state !== 'speaking' && this.state !== 'processing') {
            this.setState('standby');
          }
          return;
        }

        if (event.error === 'aborted') {
          // Aborted during barge-in or clean restart
          return;
        }

        console.warn('Speech recognition notice:', event.error);
        if (!this.isContinuousMode) {
          this.stopAudioVisualizer();
          if (this.state === 'listening' || this.state === 'standby') {
            this.setState('idle');
          }
        }
      };

      this.recognition.onend = () => {
        // In continuous mode, automatic standby restart if session timed out or paused
        if (this.isContinuousMode && !this.isDestroyed && this.state !== 'speaking' && this.state !== 'processing') {
          this.setState('standby');
          this.scheduleRecognitionRestart(150);
        } else if (!this.isContinuousMode) {
          this.stopAudioVisualizer();
          if (this.state === 'listening' || this.state === 'standby') {
            this.setState('idle');
          }
        }
      };
    } catch (e) {
      console.error('Failed to initialize speech recognition', e);
    }
  }

  private scheduleRecognitionRestart(delayMs = 150) {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }
    this.restartTimeout = setTimeout(() => {
      if (this.isContinuousMode && !this.isDestroyed && this.state !== 'speaking' && this.state !== 'processing') {
        try {
          this.recognition?.start();
        } catch (e: any) {
          // Ignore if already active
          if (e.name !== 'InvalidStateError') {
            this.startMediaRecorderRecording();
          }
        }
      }
    }, delayMs);
  }

  public setState(newState: VoiceState) {
    if (this.state === newState) return;
    this.state = newState;
    this.callbacks.onStateChange(newState);
  }

  public getState(): VoiceState {
    return this.state;
  }

  public isVoiceActive(): boolean {
    return this.isContinuousMode;
  }

  /**
   * Start hands-free voice mode with continuous standby
   */
  public async startListening() {
    this.isContinuousMode = true;
    // If currently speaking, stop immediately (Barge-in / Interruption)
    this.stopSpeaking();

    this.playChime(440, 0.08); // Ready chime

    if (this.recognition) {
      try {
        this.setState('standby');
        this.startAudioVisualizer();
        this.recognition.start();
        return;
      } catch (e: any) {
        if (e.name === 'InvalidStateError') {
          // Already running
          this.setState('standby');
          return;
        }
        // Fallback to MediaRecorder
        this.startMediaRecorderRecording();
        return;
      }
    }

    // Fallback: MediaRecorder audio capture for browsers without SpeechRecognition
    this.startMediaRecorderRecording();
  }

  /**
   * Start recording with MediaRecorder and visualizer
   */
  private async startMediaRecorderRecording() {
    try {
      this.recordedChunks = [];
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      this.setState('standby');
      this.startAudioVisualizer();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.recordedChunks.length === 0) {
          if (this.isContinuousMode) {
            this.setState('standby');
          } else {
            this.setState('idle');
          }
          return;
        }

        this.setState('processing');
        const audioBlob = new Blob(this.recordedChunks, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          try {
            const base64Audio = (reader.result as string).split(',')[1];
            const response = await fetch('/api/gemini/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64Audio, mimeType }),
            });
            const data = await response.json();
            if (data.transcript && data.transcript.trim()) {
              this.callbacks.onSpeechRecognized(data.transcript, true);
            } else {
              if (this.isContinuousMode) {
                this.setState('standby');
                this.startMediaRecorderRecording();
              } else {
                this.setState('idle');
              }
            }
          } catch {
            if (this.isContinuousMode) {
              this.setState('standby');
            } else {
              this.setState('idle');
            }
          }
        };
      };

      this.mediaRecorder.start();
    } catch (err: any) {
      this.callbacks.onError('Microphone access denied or unavailable. Please use text input.');
      this.setState('idle');
    }
  }

  /**
   * Stop voice mode completely (user clicked off)
   */
  public stopListening() {
    this.isContinuousMode = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignore
      }
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        // Ignore
      }
    }

    this.stopBargeInDetector();
    this.stopAudioVisualizer();
    this.setState('idle');
  }

  /**
   * Toggle voice mode on/off
   */
  public toggleVoiceMode() {
    if (this.isContinuousMode) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  /**
   * Speak response naturally with Ghanaian phonetic preparation
   */
  public speak(rawText: string, onEnd?: () => void) {
    if (!this.synth) {
      onEnd?.();
      if (this.isContinuousMode) {
        this.setState('standby');
        this.scheduleRecognitionRestart(200);
      }
      return;
    }

    // Cancel any previous speech (Barge-in)
    this.stopSpeaking();

    // Temporarily pause recognition to prevent echo cancellation loops
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }

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
      this.startBargeInDetector();
    };

    const finishSpeech = () => {
      this.currentUtterance = null;
      this.stopBargeInDetector();
      this.stopAudioVisualizer();
      onEnd?.();

      if (this.isContinuousMode) {
        // Automatically return to standby listening after speaking!
        // No stress on the user - mic remains ready!
        this.setState('standby');
        this.scheduleRecognitionRestart(200);
        this.startAudioVisualizer();
      } else {
        this.setState('idle');
      }
    };

    utterance.onend = finishSpeech;
    utterance.onerror = finishSpeech;

    this.synth.speak(utterance);
  }

  /**
   * Instant interruption / Barge-in: cut off Kofi immediately when user clicks or speaks
   */
  public stopSpeaking() {
    this.stopBargeInDetector();
    if (this.synth) {
      this.synth.cancel();
    }
    this.currentUtterance = null;
    this.stopAudioVisualizer();

    if (this.state === 'speaking' || this.state === 'processing') {
      this.setState('interrupted');
      setTimeout(() => {
        if (this.isContinuousMode) {
          this.setState('standby');
          this.scheduleRecognitionRestart(150);
          this.startAudioVisualizer();
        } else {
          this.setState('idle');
        }
      }, 200);
    }
  }

  /**
   * Voice Activity Detection (VAD) for instant barge-in during speech
   * If the user speaks into the microphone while Kofi is talking, speech stops immediately.
   */
  private startBargeInDetector() {
    this.stopBargeInDetector();
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    let consecutiveVoiceFrames = 0;

    const checkVolume = () => {
      if (this.state !== 'speaking' || !this.analyser) return;

      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Threshold for human speech detected in mic during playback
      if (average > 38) {
        consecutiveVoiceFrames++;
        if (consecutiveVoiceFrames >= 3) {
          // Detected user speech - barge in and stop Kofi!
          this.stopSpeaking();
          return;
        }
      } else {
        consecutiveVoiceFrames = Math.max(0, consecutiveVoiceFrames - 1);
      }

      this.bargeInAnimFrameId = requestAnimationFrame(checkVolume);
    };

    this.bargeInAnimFrameId = requestAnimationFrame(checkVolume);
  }

  private stopBargeInDetector() {
    if (this.bargeInAnimFrameId) {
      cancelAnimationFrame(this.bargeInAnimFrameId);
      this.bargeInAnimFrameId = null;
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

      if (!this.analyser) {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        source.connect(this.analyser);
      }

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLoop = () => {
        if (!this.analyser || (this.state !== 'listening' && this.state !== 'standby')) return;
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
      if (this.state !== 'speaking' && this.state !== 'listening' && this.state !== 'standby') return;
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

  public destroy() {
    this.isDestroyed = true;
    this.stopListening();
    this.stopSpeaking();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }
}
