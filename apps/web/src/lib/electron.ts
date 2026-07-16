// Backwards-compatibility shim. The desktop app is now built with Tauri; this
// module re-exports the Tauri-backed bridge under the historical
// `electronAPI` / `isElectron` names so existing call sites keep working.
import { desktopAPI, isDesktop, type DesktopAPI } from './desktop'

export type ElectronAPI = DesktopAPI

export const electronAPI: ElectronAPI | undefined = desktopAPI

export const isElectron = isDesktop
