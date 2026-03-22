import { create } from "zustand";
import { Track, type Room } from "livekit-client";
import { getSocket } from "@/lib/socket";
import { type MicMode, getMicMode, startMicMode, stopMicMode, setRoomGetter } from "@/lib/micMode";
import { type CameraQuality, CAMERA_PRESETS, getSavedCamera } from "@/lib/deviceSettings";
import type { BlurHandle } from "@/lib/backgroundBlur";

function emitVoiceState(state: {
  muted?: boolean;
  deafened?: boolean;
  camera?: boolean;
  screenShare?: boolean;
}) {
  getSocket()?.emit("voice:state", state);
}

export type VoiceConnectionState = {
  currentChannelId: string | null;
  currentChannelName: string | null;
  room: Room | null;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isConnecting: boolean;
  connectedAt: number | null;
  viewingVoiceRoom: boolean;
  micMode: MicMode;
  isBlurEnabled: boolean;
  _blurHandle: BlurHandle | null;
  _originalCameraTrack: MediaStreamTrack | null;

  setConnecting: (channelId: string, channelName: string) => void;
  setConnected: (room: Room) => void;
  disconnect: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  startCamera: (quality: CameraQuality, blur: boolean) => void;
  stopCamera: () => void;
  applyCameraSettings: (quality: CameraQuality, blur: boolean) => void;
  setScreenSharing: (v: boolean) => void;
  setViewingVoiceRoom: (v: boolean) => void;
  setMicMode: (mode: MicMode) => void;
};

type StoreGet = () => VoiceConnectionState;
type StoreSet = (
  partial:
    | Partial<VoiceConnectionState>
    | ((s: VoiceConnectionState) => Partial<VoiceConnectionState>),
) => void;

function showVoiceError(message: string) {
  window.dispatchEvent(
    new CustomEvent("voice:error", { detail: { message } }),
  );
}

async function captureCamera(preset: {
  width: number;
  height: number;
  fps: number;
}): Promise<MediaStreamTrack> {
  const savedDevice = getSavedCamera();
  const constraints: MediaTrackConstraints = {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.fps },
  };
  if (savedDevice) {
    constraints.deviceId = { exact: savedDevice };
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: constraints,
  });
  return stream.getVideoTracks()[0];
}

async function applyBlur(get: StoreGet, set: StoreSet) {
  const { room } = get();
  if (!room) return;

  const camPub = room.localParticipant.getTrackPublication(
    Track.Source.Camera,
  );
  const mediaTrack = camPub?.track?.mediaStreamTrack;
  if (!mediaTrack) return;

  try {
    const { createBlurredStream } = await import("@/lib/backgroundBlur");
    const handle = await createBlurredStream(mediaTrack);
    const blurredTrack = handle.stream.getVideoTracks()[0];
    if (blurredTrack && camPub.track) {
      await camPub.track.replaceTrack(blurredTrack);
    }
    set({ _blurHandle: handle, _originalCameraTrack: mediaTrack });
  } catch (err) {
    console.warn("Background blur unavailable:", err);
    set({ isBlurEnabled: false });
    showVoiceError(
      "Background blur is unavailable. Camera started without blur.",
    );
  }
}

export const useVoiceConnectionStore = create<VoiceConnectionState>(
  (set, get) => ({
    currentChannelId: null,
    currentChannelName: null,
    room: null,
    isMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    isConnecting: false,
    connectedAt: null,
    viewingVoiceRoom: false,
    micMode: getMicMode(),
    isBlurEnabled: false,
    _blurHandle: null,
    _originalCameraTrack: null,

    setConnecting: (channelId, channelName) =>
      set({ currentChannelId: channelId, currentChannelName: channelName, isConnecting: true, viewingVoiceRoom: true }),

    setConnected: (room) => {
      set({ room, isConnecting: false, connectedAt: Date.now() });
      const mode = get().micMode;
      if (mode !== "always") {
        setTimeout(() => startMicMode(mode), 500);
      }
    },

    disconnect: () => {
      const { room, _blurHandle, _originalCameraTrack } = get();
      stopMicMode();
      _blurHandle?.stop();
      _originalCameraTrack?.stop();
      if (room) {
        room.localParticipant.getTrackPublications().forEach((pub) => {
          pub.track?.mediaStreamTrack?.stop();
        });
        room.disconnect().catch(() => {});
      }
      set({
        currentChannelId: null,
        currentChannelName: null,
        room: null,
        isMuted: false,
        isDeafened: false,
        isCameraOn: false,
        isScreenSharing: false,
        isConnecting: false,
        connectedAt: null,
        viewingVoiceRoom: false,
        isBlurEnabled: false,
        _blurHandle: null,
        _originalCameraTrack: null,
      });
    },

    toggleMute: () => {
      const { room, isMuted, micMode } = get();
      const next = !isMuted;
      if (room) {
        room.localParticipant
          .setMicrophoneEnabled(!next)
          .catch(() => {});
      }
      if (next) {
        stopMicMode();
      } else if (micMode !== "always") {
        setTimeout(() => startMicMode(micMode), 300);
      }
      set({ isMuted: next });
      emitVoiceState({ muted: next });
    },

    toggleDeafen: () => {
      const { isDeafened } = get();
      const next = !isDeafened;
      set({ isDeafened: next });
      emitVoiceState({ deafened: next });
    },

    startCamera: async (quality: CameraQuality, blur: boolean) => {
      const { room } = get();
      if (!room) return;

      const preset = CAMERA_PRESETS[quality];
      room.options.videoCaptureDefaults = {
        ...room.options.videoCaptureDefaults,
        resolution: {
          width: preset.width,
          height: preset.height,
          frameRate: preset.fps,
        },
      };

      if (blur) {
        try {
          const rawTrack = await captureCamera(preset);
          const { createBlurredStream } = await import("@/lib/backgroundBlur");
          const handle = await createBlurredStream(rawTrack);
          const blurredTrack = handle.stream.getVideoTracks()[0];
          if (blurredTrack) {
            await room.localParticipant.publishTrack(blurredTrack, {
              source: Track.Source.Camera,
              name: "camera",
            });
          }
          set({
            isCameraOn: true,
            isBlurEnabled: true,
            _blurHandle: handle,
            _originalCameraTrack: rawTrack,
          });
          emitVoiceState({ camera: true });
        } catch {
          await room.localParticipant.setCameraEnabled(true).catch(() => {});
          set({ isCameraOn: true, isBlurEnabled: false });
          emitVoiceState({ camera: true });
          showVoiceError(
            "Background blur is unavailable. Camera started without blur.",
          );
        }
      } else {
        await room.localParticipant.setCameraEnabled(true).catch(() => {});
        set({ isCameraOn: true, isBlurEnabled: false });
        emitVoiceState({ camera: true });
      }
    },

    stopCamera: async () => {
      const { room, _blurHandle, _originalCameraTrack } = get();
      _blurHandle?.stop();
      _originalCameraTrack?.stop();
      if (room) {
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track) {
          camPub.track.mediaStreamTrack?.stop();
          await room.localParticipant.unpublishTrack(camPub.track).catch(() => {});
        }
      }
      set({
        isCameraOn: false,
        isBlurEnabled: false,
        _blurHandle: null,
        _originalCameraTrack: null,
      });
      emitVoiceState({ camera: false });
    },

    applyCameraSettings: async (quality: CameraQuality, blur: boolean) => {
      const { room, isCameraOn, isBlurEnabled, _blurHandle } = get();
      if (!room || !isCameraOn) return;

      const qualityChanged =
        (() => {
          const preset = CAMERA_PRESETS[quality];
          const cur = room.options.videoCaptureDefaults?.resolution;
          return (
            !cur ||
            cur.width !== preset.width ||
            cur.height !== preset.height
          );
        })();

      if (qualityChanged) {
        _blurHandle?.stop();
        const { _originalCameraTrack: oldRaw } = get();
        oldRaw?.stop();
        set({ _blurHandle: null, _originalCameraTrack: null });

        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track) {
          camPub.track.mediaStreamTrack?.stop();
          await room.localParticipant.unpublishTrack(camPub.track).catch(() => {});
        }

        const preset = CAMERA_PRESETS[quality];
        room.options.videoCaptureDefaults = {
          ...room.options.videoCaptureDefaults,
          resolution: {
            width: preset.width,
            height: preset.height,
            frameRate: preset.fps,
          },
        };

        if (blur) {
          try {
            const rawTrack = await captureCamera(preset);
            const { createBlurredStream } = await import("@/lib/backgroundBlur");
            const handle = await createBlurredStream(rawTrack);
            const blurredTrack = handle.stream.getVideoTracks()[0];
            if (blurredTrack) {
              await room.localParticipant.publishTrack(blurredTrack, {
                source: Track.Source.Camera,
                name: "camera",
              });
            }
            set({
              isBlurEnabled: true,
              _blurHandle: handle,
              _originalCameraTrack: rawTrack,
            });
          } catch {
            await room.localParticipant.setCameraEnabled(true).catch(() => {});
            set({ isBlurEnabled: false });
            showVoiceError("Background blur is unavailable. Camera restarted without blur.");
          }
        } else {
          await room.localParticipant.setCameraEnabled(true).catch(() => {});
          set({ isBlurEnabled: false });
        }
      } else if (blur !== isBlurEnabled) {
        if (blur) {
          set({ isBlurEnabled: true });
          await applyBlur(get, set);
        } else {
          _blurHandle?.stop();
          const { _originalCameraTrack } = get();
          if (_originalCameraTrack) {
            const camPub = room.localParticipant.getTrackPublication(
              Track.Source.Camera,
            );
            if (camPub?.track) {
              await camPub.track.replaceTrack(_originalCameraTrack);
            }
          }
          set({
            isBlurEnabled: false,
            _blurHandle: null,
            _originalCameraTrack: null,
          });
        }
      }
    },

    setScreenSharing: (v) => {
      set({ isScreenSharing: v });
      emitVoiceState({ screenShare: v });
    },

    setViewingVoiceRoom: (v) => set({ viewingVoiceRoom: v }),

    setMicMode: (mode) => {
      const { isMuted } = get();
      set({ micMode: mode });
      stopMicMode();
      if (!isMuted && mode !== "always") {
        startMicMode(mode);
      }
    },
  }),
);

setRoomGetter(() => useVoiceConnectionStore.getState().room);
