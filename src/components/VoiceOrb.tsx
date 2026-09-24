import React, { useMemo } from 'react';
import { Mic, MicOff, VolumeX, Sparkles, Radio, Loader2 } from 'lucide-react';
import { VoiceState } from '../services/voiceEngine';

interface VoiceOrbProps {
  voiceState: VoiceState;
  frequencies: Uint8Array;
  onToggleMic: () => void;
  onInterrupt: () => void;
  language: string;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  voiceState,
  frequencies,
  onToggleMic,
  onInterrupt,
  language,
}) => {
  // Compute normalized heights for frequency visualizer
  const bars = useMemo(() => {
    if (!frequencies || frequencies.length === 0) {
      return Array(16).fill(6);
    }
    const step = Math.floor(frequencies.length / 16) || 1;
    const result: number[] = [];
    for (let i = 0; i < 16; i++) {
      const val = frequencies[i * step] || 10;
      // map 0-255 to 4-48px height
      result.push(Math.max(4, Math.min(48, Math.round((val / 255) * 44) + 4)));
    }
    return result;
  }, [frequencies]);

  const stateConfig = useMemo(() => {
    switch (voiceState) {
      case 'listening':
        return {
          title: 'Kofi is Listening...',
          sub: 'Speak naturally in English or Twi (e.g. "I need 50 crates of Techiman tomatoes")',
          glow: 'from-emerald-500/40 via-green-500/30 to-amber-500/30',
          border: 'border-emerald-400 shadow-emerald-500/50',
          iconColor: 'text-emerald-300',
        };
      case 'processing':
        return {
          title: 'GhanaNLP Reasoning & Normalization...',
          sub: 'Processing speech phonetics & querying GHarvest supply chain',
          glow: 'from-amber-500/40 via-yellow-500/30 to-emerald-500/30',
          border: 'border-amber-400 shadow-amber-500/50',
          iconColor: 'text-amber-300',
        };
      case 'speaking':
        return {
          title: 'Kofi is Speaking',
          sub: 'Tap the orb or speak to interrupt (Jarvis Barge-in enabled)',
          glow: 'from-emerald-600/50 via-teal-500/40 to-green-600/50',
          border: 'border-teal-400 shadow-teal-500/60',
          iconColor: 'text-white',
        };
      case 'interrupted':
        return {
          title: 'Speech Interrupted',
          sub: 'Listening for your new instruction...',
          glow: 'from-red-500/40 via-amber-500/30 to-red-500/20',
          border: 'border-red-400 shadow-red-500/40',
          iconColor: 'text-red-300',
        };
      default:
        return {
          title: 'Tap to Speak with Kofi',
          sub: `Voice-first commerce in ${language === 'ak-GH' ? 'Asante Twi' : language === 'pcm-GH' ? 'Ghanaian Pidgin' : 'Ghanaian English'}`,
          glow: 'from-emerald-950/40 via-green-950/30 to-black',
          border: 'border-emerald-800/80 shadow-emerald-950/50',
          iconColor: 'text-emerald-400',
        };
    }
  }, [voiceState, language]);

  return (
    <div className="flex flex-col items-center justify-center py-6 px-4 select-none">
      {/* Outer ambient glow ring */}
      <div className="relative flex items-center justify-center">
        {voiceState === 'listening' && (
          <div className="absolute w-52 h-52 rounded-full bg-emerald-500/20 blur-2xl animate-pulse-ring pointer-events-none" />
        )}
        {voiceState === 'speaking' && (
          <div className="absolute w-56 h-56 rounded-full bg-teal-500/20 blur-2xl animate-pulse pointer-events-none" />
        )}

        {/* Central Clickable Orb */}
        <button
          onClick={voiceState === 'speaking' ? onInterrupt : onToggleMic}
          className={`relative z-10 w-36 h-36 rounded-full bg-gradient-to-b from-[#162f22] via-[#0d1d14] to-[#07110c] p-1 flex flex-col items-center justify-center shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 border-2 ${stateConfig.border}`}
          title={voiceState === 'speaking' ? 'Click to interrupt' : 'Click to toggle microphone'}
        >
          {/* Inner ring */}
          <div className={`w-full h-full rounded-full flex flex-col items-center justify-center bg-radial ${stateConfig.glow}`}>
            {voiceState === 'processing' ? (
              <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
            ) : voiceState === 'speaking' ? (
              <div className="flex flex-col items-center">
                <VolumeX className="w-10 h-10 text-emerald-300 mb-1" />
                <span className="text-[10px] text-emerald-200 font-semibold uppercase tracking-wider">
                  Interrupt
                </span>
              </div>
            ) : voiceState === 'listening' ? (
              <div className="flex flex-col items-center">
                <Mic className="w-11 h-11 text-emerald-300 animate-bounce" />
                <span className="text-[9px] text-emerald-200 font-bold tracking-wider uppercase mt-1">
                  Listening
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Mic className="w-11 h-11 text-emerald-400 group-hover:text-white transition" />
                <span className="text-[10px] text-emerald-300/80 font-medium tracking-wide mt-1">
                  Start Voice
                </span>
              </div>
            )}
          </div>
        </button>
      </div>

      {/* Dynamic Sound Wave Bars */}
      <div className="h-12 flex items-center justify-center gap-1.5 mt-5 px-4 py-1 bg-[#102016]/80 rounded-full border border-emerald-900/50 shadow-inner">
        {bars.map((height, i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-75 ${
              voiceState === 'listening'
                ? 'bg-gradient-to-t from-emerald-500 to-amber-300'
                : voiceState === 'speaking'
                ? 'bg-gradient-to-t from-teal-400 to-emerald-300'
                : 'bg-emerald-950/60'
            }`}
            style={{ height: `${height}px` }}
          />
        ))}
      </div>

      {/* Voice Status & Subtext */}
      <div className="text-center mt-3 max-w-md">
        <h3 className="font-display font-semibold text-lg text-white flex items-center justify-center gap-2">
          {voiceState === 'listening' && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />}
          {stateConfig.title}
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">{stateConfig.sub}</p>
      </div>
    </div>
  );
};
