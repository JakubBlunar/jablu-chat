import { useEffect, useState } from "react";

type DeviceInfo = {
  deviceId: string;
  label: string;
};

const CAMERA_QUALITY_KEY = "chat:voice:camera-quality";
const SCREEN_QUALITY_KEY = "chat:voice:screen-quality";

export type CameraQuality = "360p" | "480p" | "720p" | "1080p";
export type ScreenQuality = "static" | "balanced" | "motion";

export function getCameraQuality(): CameraQuality {
  return (localStorage.getItem(CAMERA_QUALITY_KEY) as CameraQuality) || "720p";
}

export function getScreenQuality(): ScreenQuality {
  return (localStorage.getItem(SCREEN_QUALITY_KEY) as ScreenQuality) || "balanced";
}

export const CAMERA_PRESETS: Record<
  CameraQuality,
  { width: number; height: number; fps: number }
> = {
  "360p": { width: 640, height: 360, fps: 15 },
  "480p": { width: 854, height: 480, fps: 30 },
  "720p": { width: 1280, height: 720, fps: 30 },
  "1080p": { width: 1920, height: 1080, fps: 30 },
};

export const SCREEN_PRESETS: Record<
  ScreenQuality,
  { width: number; height: number; fps: number; bitrate: number }
> = {
  static: { width: 1920, height: 1080, fps: 5, bitrate: 1_500_000 },
  balanced: { width: 1920, height: 1080, fps: 15, bitrate: 2_500_000 },
  motion: { width: 1280, height: 720, fps: 30, bitrate: 3_000_000 },
};

export function VoiceSettings() {
  const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([]);

  const [selectedInput, setSelectedInput] = useState("");
  const [selectedOutput, setSelectedOutput] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");
  const [cameraQuality, setCameraQuality] = useState<CameraQuality>(getCameraQuality);
  const [screenQuality, setScreenQuality] = useState<ScreenQuality>(getScreenQuality);

  useEffect(() => {
    async function enumerate() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // Permission denied
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(
        devices
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 6)}` })),
      );
      setAudioOutputs(
        devices
          .filter((d) => d.kind === "audiooutput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 6)}` })),
      );
      setVideoInputs(
        devices
          .filter((d) => d.kind === "videoinput")
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 6)}` })),
      );
    }
    void enumerate();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("chat:voice:input");
    if (saved) setSelectedInput(saved);
    const savedOut = localStorage.getItem("chat:voice:output");
    if (savedOut) setSelectedOutput(savedOut);
    const savedCam = localStorage.getItem("chat:voice:camera");
    if (savedCam) setSelectedCamera(savedCam);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400">
          Audio Input
        </h3>
        <select
          value={selectedInput}
          onChange={(e) => {
            setSelectedInput(e.target.value);
            localStorage.setItem("chat:voice:input", e.target.value);
          }}
          className="w-full rounded-md bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10"
        >
          <option value="">Default</option>
          {audioInputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400">
          Audio Output
        </h3>
        <select
          value={selectedOutput}
          onChange={(e) => {
            setSelectedOutput(e.target.value);
            localStorage.setItem("chat:voice:output", e.target.value);
          }}
          className="w-full rounded-md bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10"
        >
          <option value="">Default</option>
          {audioOutputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400">
          Camera
        </h3>
        <select
          value={selectedCamera}
          onChange={(e) => {
            setSelectedCamera(e.target.value);
            localStorage.setItem("chat:voice:camera", e.target.value);
          }}
          className="w-full rounded-md bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10"
        >
          <option value="">Default</option>
          {videoInputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400">
          Camera Quality
        </h3>
        <div className="flex gap-2">
          {(Object.keys(CAMERA_PRESETS) as CameraQuality[]).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setCameraQuality(q);
                localStorage.setItem(CAMERA_QUALITY_KEY, q);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                cameraQuality === q
                  ? "bg-[#5865f2] text-white"
                  : "bg-[#1e1f22] text-gray-300 hover:bg-white/10"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400">
          Screen Share Quality
        </h3>
        <div className="flex gap-2">
          {(Object.keys(SCREEN_PRESETS) as ScreenQuality[]).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setScreenQuality(q);
                localStorage.setItem(SCREEN_QUALITY_KEY, q);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                screenQuality === q
                  ? "bg-[#5865f2] text-white"
                  : "bg-[#1e1f22] text-gray-300 hover:bg-white/10"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Static: 1080p/5fps &middot; Balanced: 1080p/15fps &middot; Motion: 720p/30fps
        </p>
      </div>
    </div>
  );
}
