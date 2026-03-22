import type { LinkPreview } from "@chat/shared";
import { useState } from "react";

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

  if (youtubeId) {
    return <YouTubeEmbed lp={lp} videoId={youtubeId} />;
  }

  return <DefaultPreview lp={lp} />;
}
