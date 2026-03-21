import type { Attachment } from "@chat/shared";
import { useState } from "react";

interface AttachmentPreviewProps {
  attachment: Attachment;
}

export function AttachmentPreview({ attachment }: AttachmentPreviewProps) {
  const [lightbox, setLightbox] = useState(false);

  if (attachment.type === "image" || attachment.type === "gif") {
    return (
      <>
        <button
          type="button"
          className="mt-1 block max-w-md overflow-hidden rounded-lg"
          onClick={() => setLightbox(true)}
        >
          <img
            src={attachment.url}
            alt={attachment.filename}
            className="max-h-[300px] rounded-lg object-contain"
            loading="lazy"
          />
        </button>
        {lightbox && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setLightbox(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Escape" && setLightbox(false)}
          >
            <img
              src={attachment.url}
              alt={attachment.filename}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />
          </div>
        )}
      </>
    );
  }

  if (attachment.type === "video") {
    return (
      <div className="mt-1 max-w-md">
        <video
          src={attachment.url}
          controls
          className="max-h-[300px] rounded-lg"
          preload="metadata"
        >
          <track kind="captions" />
        </video>
      </div>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 flex items-center gap-3 rounded-lg bg-[#2b2d31] px-3 py-2 ring-1 ring-white/10 transition hover:bg-[#35373c]"
    >
      <FileIcon />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-blue-400 hover:underline">
          {attachment.filename}
        </p>
        <p className="text-xs text-gray-500">
          {formatBytes(attachment.sizeBytes)}
        </p>
      </div>
      <DownloadIcon />
    </a>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon() {
  return (
    <svg className="h-8 w-8 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
