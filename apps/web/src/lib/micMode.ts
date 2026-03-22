export type MicMode = "always" | "activity" | "push-to-talk";

import { Track } from "livekit-client";

type RoomGetter = () => import("livekit-client").Room | null;
let _getRoom: RoomGetter = () => null;

export function setRoomGetter(fn: RoomGetter) {
  _getRoom = fn;
}

export type PttBinding = { type: "key"; key: string } | { type: "mouse"; button: number };

const MIC_MODE_KEY = "chat:voice:mic-mode";
const PTT_KEY_KEY = "chat:voice:ptt-key";
const VAD_THRESHOLD_KEY = "chat:voice:vad-threshold";

export function getMicMode(): MicMode {
  return (localStorage.getItem(MIC_MODE_KEY) as MicMode) || "always";
}

export function setMicMode(mode: MicMode) {
  localStorage.setItem(MIC_MODE_KEY, mode);
}

export function getPttBinding(): PttBinding {
  const raw = localStorage.getItem(PTT_KEY_KEY);
  if (!raw) return { type: "key", key: " " };
  try {
    return JSON.parse(raw) as PttBinding;
  } catch {
    return { type: "key", key: raw };
  }
}

export function setPttBinding(binding: PttBinding) {
  localStorage.setItem(PTT_KEY_KEY, JSON.stringify(binding));
}

export function pttBindingLabel(binding: PttBinding): string {
  if (binding.type === "mouse") {
    const names: Record<number, string> = {
      0: "Left Click",
      1: "Middle Click",
      2: "Right Click",
      3: "Mouse 4",
      4: "Mouse 5",
    };
    return names[binding.button] ?? `Mouse ${binding.button + 1}`;
  }
  if (binding.key === " ") return "Space";
  if (binding.key.length === 1) return binding.key.toUpperCase();
  return binding.key;
}

export function getVadThreshold(): number {
  const v = localStorage.getItem(VAD_THRESHOLD_KEY);
  return v ? Number(v) : 15;
}

export function setVadThreshold(threshold: number) {
  localStorage.setItem(VAD_THRESHOLD_KEY, String(threshold));
}

let vadCleanup: (() => void) | null = null;
let pttCleanup: (() => void) | null = null;

export function startMicMode(mode: MicMode) {
  stopMicMode();

  if (mode === "activity") {
    vadCleanup = startVAD();
  } else if (mode === "push-to-talk") {
    pttCleanup = startPTT();
  }
}

export function stopMicMode() {
  vadCleanup?.();
  vadCleanup = null;
  pttCleanup?.();
  pttCleanup = null;
}

function startVAD(): () => void {
  const room = _getRoom();
  if (!room) return () => {};

  const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  const mediaTrack = micPub?.track?.mediaStreamTrack;
  if (!mediaTrack) return () => {};

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(new MediaStream([mediaTrack]));
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.4;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;
  let silenceFrames = 0;
  const SILENCE_DELAY = 15;

  let running = true;
  let calibrated = false;
  let autoThreshold = getVadThreshold();
  const calibrationSamples: number[] = [];
  const calibrationStart = performance.now();
  const CALIBRATION_MS = 1500;

  function getAvg(): number {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / dataArray.length;
  }

  function tick() {
    if (!running) return;

    const avg = getAvg();

    if (!calibrated) {
      calibrationSamples.push(avg);
      if (performance.now() - calibrationStart >= CALIBRATION_MS) {
        const ambient =
          calibrationSamples.reduce((a, b) => a + b, 0) /
          calibrationSamples.length;
        autoThreshold = Math.max(Math.round(ambient * 1.5 + 5), 8);
        setVadThreshold(autoThreshold);
        calibrated = true;
      }
      requestAnimationFrame(tick);
      return;
    }

    const threshold = getVadThreshold();

    if (avg > threshold) {
      silenceFrames = 0;
      if (!speaking) {
        speaking = true;
        setTrackMuted(false);
      }
    } else {
      silenceFrames++;
      if (speaking && silenceFrames > SILENCE_DELAY) {
        speaking = false;
        setTrackMuted(true);
      }
    }

    requestAnimationFrame(tick);
  }

  setTrackMuted(true);
  requestAnimationFrame(tick);

  return () => {
    running = false;
    source.disconnect();
    audioCtx.close().catch(() => {});
    setTrackMuted(false);
  };
}

function startPTT(): () => void {
  const binding = getPttBinding();

  setTrackMuted(true);

  if (binding.type === "mouse") {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === binding.button) {
        e.preventDefault();
        setTrackMuted(false);
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === binding.button) {
        e.preventDefault();
        setTrackMuted(true);
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    // Prevent context menu for right-click PTT
    const onContext = (e: Event) => {
      if (binding.button === 2) e.preventDefault();
    };
    window.addEventListener("contextmenu", onContext);

    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("contextmenu", onContext);
      setTrackMuted(false);
    };
  }

  // Keyboard binding
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (isInputFocused()) return;
    if (e.key === binding.key) {
      e.preventDefault();
      setTrackMuted(false);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (isInputFocused()) return;
    if (e.key === binding.key) {
      e.preventDefault();
      setTrackMuted(true);
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    setTrackMuted(false);
  };
}

function setTrackMuted(muted: boolean) {
  const room = _getRoom();
  if (!room) return;

  const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  if (micPub?.track) {
    if (muted) {
      micPub.track.mute();
    } else {
      micPub.track.unmute();
    }
  }
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable;
}
