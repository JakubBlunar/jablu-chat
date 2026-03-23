import { useEffect, useState } from "react";
import { isElectron } from "@/lib/electron";
import { usePwaInstall, isDismissed, dismissBanner } from "@/hooks/usePwaInstall";

export function PwaInstallBanner() {
  const { canPrompt, showInstallUi, triggerInstall } = usePwaInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!showInstallUi || isDismissed()) return;
    const id = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(id);
  }, [showInstallUi]);

  if (isElectron || !showInstallUi || !visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    dismissBanner();
  };

  const handleInstall = async () => {
    const accepted = await triggerInstall();
    if (accepted) setVisible(false);
  };

  const openGuide = () => {
    handleDismiss();
    window.dispatchEvent(new CustomEvent("open-settings", { detail: "install" }));
  };

  return (
    <div className="flex items-center gap-3 bg-primary/90 px-4 py-2 text-sm text-white">
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      <span className="min-w-0 flex-1">
        Install Jablu for a faster, app-like experience
      </span>
      {canPrompt ? (
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="shrink-0 rounded-md bg-white/20 px-3 py-1 text-xs font-medium transition hover:bg-white/30"
        >
          Install
        </button>
      ) : (
        <button
          type="button"
          onClick={openGuide}
          className="shrink-0 rounded-md bg-white/20 px-3 py-1 text-xs font-medium transition hover:bg-white/30"
        >
          Learn How
        </button>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 text-white/70 transition hover:text-white"
        title="Dismiss"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
        </svg>
      </button>
    </div>
  );
}
