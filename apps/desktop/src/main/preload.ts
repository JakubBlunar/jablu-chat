import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  getSources: () => ipcRenderer.invoke("get-sources") as Promise<
    Array<{
      id: string;
      name: string;
      thumbnail: string;
      appIcon: string | null;
    }>
  >,

  platform: process.platform,
  appVersion: "1.0.0",
});
