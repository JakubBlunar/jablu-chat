import type { LinkPreview } from "@chat/shared";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
];

function extractYouTubeId(url: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const m = url.match(pattern);
    if (m?.[1]) return m[1];
  }
  return null;
}

function isGifUrl(lp: LinkPreview): boolean {
  if (lp.siteName === "GIF") return true;
  try {
    const u = new URL(lp.url);
    const path = u.pathname.toLowerCase();
    if (path.endsWith(".gif")) return true;
    if (u.hostname === "media.tenor.com") return true;
    if (/^media\d*\.giphy\.com$/i.test(u.hostname)) return true;
    if (u.hostname === "i.giphy.com") return true;
  } catch {}
  return false;
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".svg"]);

function isImageUrl(lp: LinkPreview): boolean {
  if (lp.siteName === "Image") return true;
  try {
    const path = new URL(lp.url).pathname.toLowerCase();
    const ext = path.slice(path.lastIndexOf("."));
    return IMAGE_EXTS.has(ext);
  } catch {}
  return false;
}

function LightboxOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
  );
}

function MediaEmbed({ lp, label }: { lp: LinkPreview; label: string }) {
  const [lightbox, setLightbox] = useState(false);
  const imgUrl = lp.imageUrl ?? lp.url;

  return (
    <>
      <button
        type="button"
        className="mt-1 block min-h-[120px] max-w-md overflow-hidden rounded-lg"
        onClick={() => setLightbox(true)}
      >
        <img
          src={imgUrl}
          alt={lp.title ?? label}
          className="h-auto max-h-[300px] w-auto max-w-full rounded-lg object-contain"
          loading="lazy"
        />
      </button>
      {lightbox && (
        <LightboxOverlay onClose={() => setLightbox(false)}>
          <img
            src={imgUrl}
            alt={lp.title ?? label}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        </LightboxOverlay>
      )}
    </>
  );
}

function YouTubeEmbed({ lp, videoId }: { lp: LinkPreview; videoId: string }) {
  const [loaded, setLoaded] = useState(false);

  if (!loaded) {
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    return (
      <div className="mt-1 max-w-lg overflow-hidden rounded-lg border-l-4 border-red-500 bg-surface-dark">
        <button
          type="button"
          className="group relative block w-full"
          onClick={() => setLoaded(true)}
        >
          <img
            src={thumbUrl}
            alt={lp.title ?? "YouTube video"}
            className="aspect-video w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/40">
            <svg className="h-16 w-16 text-red-500 drop-shadow-lg" viewBox="0 0 68 48" fill="currentColor">
              <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" />
              <path d="M45 24 27 14v20z" fill="#fff" />
            </svg>
          </div>
        </button>
        <div className="p-3">
          {lp.siteName && (
            <p className="text-xs font-medium text-red-400">YouTube</p>
          )}
          {lp.title && (
            <a
              href={lp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 block text-sm font-semibold text-blue-400 line-clamp-2 hover:underline"
            >
              {lp.title}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 max-w-lg overflow-hidden rounded-lg border-l-4 border-red-500 bg-surface-dark">
      <div className="aspect-video w-full">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          title={lp.title ?? "YouTube video"}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {lp.title && (
        <div className="p-3">
          <p className="text-xs font-medium text-red-400">YouTube</p>
          <a
            href={lp.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block text-sm font-semibold text-blue-400 line-clamp-2 hover:underline"
          >
            {lp.title}
          </a>
        </div>
      )}
    </div>
  );
}

function DefaultPreview({ lp }: { lp: LinkPreview }) {
  return (
    <a
      href={lp.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex max-w-md overflow-hidden rounded-lg border-l-4 border-primary bg-surface-dark transition hover:bg-surface-hover"
    >
      {lp.imageUrl && (
        <img
          src={lp.imageUrl}
          alt=""
          className="hidden h-24 w-24 shrink-0 object-cover sm:block"
          loading="lazy"
        />
      )}
      <div className="min-w-0 p-3">
        {lp.siteName && (
          <p className="text-xs font-medium text-gray-400">{lp.siteName}</p>
        )}
        {lp.title && (
          <p className="mt-0.5 text-sm font-semibold text-blue-400 line-clamp-1">
            {lp.title}
          </p>
        )}
        {lp.description && (
          <p className="mt-0.5 text-xs text-gray-400 line-clamp-2">
            {lp.description}
          </p>
        )}
      </div>
    </a>
  );
}

export function LinkPreviewCard({ lp }: { lp: LinkPreview }) {
  const youtubeId = extractYouTubeId(lp.url);
  if (youtubeId) return <YouTubeEmbed lp={lp} videoId={youtubeId} />;
  if (isGifUrl(lp)) return <MediaEmbed lp={lp} label="GIF" />;
  if (isImageUrl(lp)) return <MediaEmbed lp={lp} label="Image" />;
  return <DefaultPreview lp={lp} />;
}
