type ElectronAPI = {
  isElectron: true;
  platform: string;
  appVersion: string;
  getSources: () => Promise<
    Array<{
      id: string;
      name: string;
      thumbnail: string;
      appIcon: string | null;
    }>
  >;
  setServerUrl: (url: string) => Promise<void>;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (cb: (info: { version: string }) => void) => () => void;
  onUpdateNotAvailable: (cb: () => void) => () => void;
  onUpdateDownloadProgress: (cb: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void;
  onUpdateError: (cb: (err: { message: string }) => void) => () => void;
};

export const electronAPI: ElectronAPI | undefined = (
  window as unknown as { electronAPI?: ElectronAPI }
).electronAPI;

export const isElectron = !!electronAPI;
