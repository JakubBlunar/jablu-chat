const NOTIF_SETTINGS_KEY = "jablu-notif-settings";

type NotifSettings = {
  enabled: boolean;
  soundEnabled: boolean;
};

const defaults: NotifSettings = { enabled: true, soundEnabled: true };

export function getNotifSettings(): NotifSettings {
  try {
    const raw = localStorage.getItem(NOTIF_SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveNotifSettings(s: Partial<NotifSettings>) {
  const current = getNotifSettings();
  localStorage.setItem(
    NOTIF_SETTINGS_KEY,
    JSON.stringify({ ...current, ...s }),
  );
}

export async function requestPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showNotification(
  title: string,
  body: string,
  onClick?: () => void,
) {
  if (document.hasFocus()) return;

  const settings = getNotifSettings();
  if (!settings.enabled) return;

  const { electronAPI } = window as unknown as {
    electronAPI?: { showNotification: (t: string, b: string) => void };
  };
  if (electronAPI?.showNotification) {
    electronAPI.showNotification(title, body);
    if (settings.soundEnabled) playSound();
    return;
  }

  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const n = new Notification(title, {
    body,
    icon: "/favicon-32x32.png",
    silent: !settings.soundEnabled,
  });

  if (onClick) {
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  }

  if (settings.soundEnabled) {
    playSound();
  }
}

let audioEl: HTMLAudioElement | null = null;

export function playSound() {
  const settings = getNotifSettings();
  if (!settings.soundEnabled) return;

  if (!audioEl) {
    audioEl = new Audio("/sounds/notification.mp3");
    audioEl.volume = 0.5;
  }
  audioEl.currentTime = 0;
  audioEl.play().catch(() => {});
}
