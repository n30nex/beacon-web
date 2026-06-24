import { useCallback, useEffect, useRef, useState } from "react";
import { hashSeed, hexBytes, type LivePacketEvent } from "./live-model";

const AUDIO_MIN_INTERVAL_MS = 85;
const AUDIO_SCALE = [220, 247, 277, 330, 370, 415, 494, 554, 659, 740, 831, 988];

function storedNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = Number.parseFloat(localStorage.getItem(key) ?? "");
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function packetFrequency(byte: number, payloadType: number, hopCount: number): number {
  const octave = byte > 205 ? 2 : byte > 122 ? 1 : 0;
  const scaleIndex = (byte + payloadType + hopCount) % AUDIO_SCALE.length;
  return AUDIO_SCALE[scaleIndex]! * 2 ** octave;
}

export function useLiveAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioEnabledRef = useRef(false);
  const audioVolumeRef = useRef(0.22);
  const audioBpmRef = useRef(132);
  const lastAudioAtRef = useRef(0);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioVolume, setAudioVolume] = useState(() => storedNumber("live-audio-volume", 0.22, 0, 1));
  const [audioBpm, setAudioBpm] = useState(() => Math.round(storedNumber("live-audio-bpm", 132, 60, 240)));

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") return null;
    let context = audioContextRef.current;
    if (context?.state === "closed") {
      audioContextRef.current = null;
      audioGainRef.current = null;
      context = null;
    }
    if (!context) {
      const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      context = new AudioCtor();
      const gain = context.createGain();
      gain.gain.value = audioVolumeRef.current;
      gain.connect(context.destination);
      audioContextRef.current = context;
      audioGainRef.current = gain;
    }
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    return context.state === "closed" ? null : context;
  }, []);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
    localStorage.setItem("live-audio-enabled", String(audioEnabled));
    if (audioEnabled) void ensureAudioContext();
  }, [audioEnabled, ensureAudioContext]);

  useEffect(() => {
    const safeVolume = Math.max(0, Math.min(1, audioVolume));
    audioVolumeRef.current = safeVolume;
    localStorage.setItem("live-audio-volume", String(safeVolume));
    const gain = audioGainRef.current;
    const context = audioContextRef.current;
    if (gain && context && context.state !== "closed") {
      gain.gain.setTargetAtTime(safeVolume, context.currentTime, 0.025);
    }
  }, [audioVolume]);

  useEffect(() => {
    const safeBpm = Math.max(60, Math.min(240, Math.round(audioBpm)));
    audioBpmRef.current = safeBpm;
    localStorage.setItem("live-audio-bpm", String(safeBpm));
  }, [audioBpm]);

  useEffect(() => {
    return () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      audioGainRef.current = null;
      if (context && context.state !== "closed") void context.close();
    };
  }, []);

  const playPacketAudio = useCallback(
    (event: LivePacketEvent) => {
      if (!audioEnabledRef.current) return;
      const performanceNow = performance.now();
      if (performanceNow - lastAudioAtRef.current < AUDIO_MIN_INTERVAL_MS) return;
      lastAudioAtRef.current = performanceNow;

      void ensureAudioContext().then((context) => {
        const masterGain = audioGainRef.current;
        if (!context || !masterGain || context.state !== "running") return;

        const bytes = hexBytes(event.rawHex || event.packetHash, 8).map((byte) => Number.parseInt(byte, 16));
        if (bytes.length === 0) return;

        const hopCount = Math.max(1, event.hopCount ?? 1);
        const observationEnergy = Math.min(3, Math.max(1, event.observationCount));
        const stepSeconds = Math.max(0.045, Math.min(0.15, 60 / audioBpmRef.current / 3));
        const start = context.currentTime + 0.018;
        const packetGain = context.createGain();
        const filter = context.createBiquadFilter();
        const pan = context.createStereoPanner();
        const seed = hashSeed(event.packetHash);

        packetGain.gain.setValueAtTime(0.0001, start);
        packetGain.gain.exponentialRampToValueAtTime(Math.max(0.015, 0.045 * observationEnergy), start + 0.012);
        packetGain.gain.exponentialRampToValueAtTime(0.0001, start + bytes.length * stepSeconds + 0.18);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(Math.max(640, 6_400 - hopCount * 560), start);
        filter.Q.value = 0.85;
        pan.pan.setValueAtTime(((seed % 200) - 100) / 120, start);
        filter.connect(pan);
        pan.connect(packetGain);
        packetGain.connect(masterGain);

        bytes.slice(0, 5).forEach((byte, index) => {
          const oscillator = context.createOscillator();
          const noteGain = context.createGain();
          const noteStart = start + index * stepSeconds;
          const noteEnd = noteStart + stepSeconds * 1.65;
          oscillator.type = event.payloadTypeName.includes("TXT") || event.payloadTypeName.includes("GRP") ? "triangle" : "sine";
          oscillator.frequency.setValueAtTime(packetFrequency(byte, event.payloadType, hopCount), noteStart);
          oscillator.frequency.exponentialRampToValueAtTime(packetFrequency((byte + seed) % 256, event.payloadType, hopCount), noteEnd);
          noteGain.gain.setValueAtTime(0.0001, noteStart);
          noteGain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.01);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
          oscillator.connect(noteGain);
          noteGain.connect(filter);
          oscillator.start(noteStart);
          oscillator.stop(noteEnd + 0.02);
        });

        const cleanupMs = Math.max(250, (bytes.length * stepSeconds + 0.5) * 1000);
        window.setTimeout(() => {
          filter.disconnect();
          pan.disconnect();
          packetGain.disconnect();
        }, cleanupMs);
      });
    },
    [ensureAudioContext],
  );

  return {
    audioBpm,
    audioEnabled,
    audioVolume,
    playPacketAudio,
    setAudioBpm,
    setAudioEnabled,
    setAudioVolume,
  };
}
