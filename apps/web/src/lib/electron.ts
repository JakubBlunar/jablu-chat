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
};

export const electronAPI: ElectronAPI | undefined = (
  window as unknown as { electronAPI?: ElectronAPI }
).electronAPI;

export const isElectron = !!electronAPI;
