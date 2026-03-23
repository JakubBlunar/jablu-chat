import type { UserStatus } from "@chat/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserAvatar } from "@/components/UserAvatar";
import { useAppNavigate } from "@/hooks/useAppNavigate";
import { useIsMobile } from "@/hooks/useMobile";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth.store";
import { useDmStore } from "@/stores/dm.store";

export type ProfileCardUser = {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  status: UserStatus;
  joinedAt?: string;
  role?: string;
};

const statusLabel: Record<UserStatus, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

function roleLabel(role?: string): string | null {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return null;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProfileCard({
  user,
  onClose,
  anchorRect,
}: {
  user: ProfileCardUser;
  onClose: () => void;
  anchorRect: DOMRect | null;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const badge = roleLabel(user.role);

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60" onClick={onClose}>
        <div
          ref={cardRef}
          className="w-[90vw] max-w-[320px] overflow-hidden rounded-lg bg-surface-overlay shadow-2xl ring-1 ring-black/30"
          onClick={(e) => e.stopPropagation()}
        >
          <ProfileCardContent user={user} badge={badge} onClose={onClose} />
        </div>
      </div>,
      document.body,
    );
  }

  const style: React.CSSProperties = {};
  if (anchorRect) {
    style.position = "fixed";
    const cardWidth = 320;
    const rightSpace = window.innerWidth - anchorRect.right - 8;
    const leftSpace = anchorRect.left - 8;

    if (rightSpace >= cardWidth) {
      style.left = anchorRect.right + 8;
    } else if (leftSpace >= cardWidth) {
      style.left = anchorRect.left - cardWidth - 8;
    } else {
      style.left = Math.max(8, (window.innerWidth - cardWidth) / 2);
    }

    const cardHeight = 320;
    if (anchorRect.top + cardHeight > window.innerHeight) {
      style.bottom = Math.max(8, window.innerHeight - anchorRect.bottom);
    } else {
      style.top = anchorRect.top;
    }
  }

  return (
    <div
      ref={cardRef}
      style={style}
      className="z-[90] w-[300px] overflow-hidden rounded-lg bg-surface-overlay shadow-2xl ring-1 ring-black/30"
    >
      <ProfileCardContent user={user} badge={badge} onClose={onClose} />
    </div>
  );
}

type MutualServer = {
  id: string;
  name: string;
  iconUrl: string | null;
};

function ProfileCardContent({
  user,
  badge,
  onClose,
}: {
  user: ProfileCardUser;
  badge: string | null;
  onClose: () => void;
}) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [mutualServers, setMutualServers] = useState<MutualServer[]>([]);
  const { goToServer } = useAppNavigate();

  useEffect(() => {
    if (!user.id || user.id === currentUserId) return;
    let cancelled = false;
    api.getMutualServers(user.id).then((res) => {
      if (!cancelled) setMutualServers(res.servers);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user.id, currentUserId]);

  return (
    <>
      <div className="h-16 bg-primary" />

      <div className="px-4 pb-3">
        <div className="-mt-8">
          <div className="inline-block rounded-full border-[5px] border-surface-overlay">
            <UserAvatar
              username={user.username}
              avatarUrl={user.avatarUrl}
              size="lg"
              showStatus
              status={user.status}
            />
          </div>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">{user.displayName ?? user.username}</h3>
          {badge && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/40">
              {badge}
            </span>
          )}
        </div>

        {user.displayName && user.displayName !== user.username && (
          <p className="text-xs text-gray-400">@{user.username}</p>
        )}
        <p className="text-xs text-gray-400">{statusLabel[user.status]}</p>

        <div className="my-3 border-t border-white/10" />

        {user.bio && (
          <div className="mb-3">
            <p className="mb-0.5 text-[11px] font-semibold tracking-wide text-gray-400">
              ABOUT ME
            </p>
            <p className="whitespace-pre-wrap text-sm text-gray-200">
              {user.bio}
            </p>
          </div>
        )}

        {user.joinedAt && (
          <div className="mb-3">
            <p className="mb-0.5 text-[11px] font-semibold tracking-wide text-gray-400">
              MEMBER SINCE
            </p>
            <p className="text-sm text-gray-200">{formatDate(user.joinedAt)}</p>
          </div>
        )}

        {mutualServers.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-gray-400">
              MUTUAL SERVERS — {mutualServers.length}
            </p>
            <div className="space-y-0.5">
              {mutualServers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { goToServer(s.id); onClose(); }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left transition hover:bg-white/5"
                >
                  <ServerIcon name={s.name} iconUrl={s.iconUrl} />
                  <span className="min-w-0 truncate text-sm text-gray-200">
                    {s.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <SendDmButton userId={user.id} onClose={onClose} />
      </div>
    </>
  );
}

function ServerIcon({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  if (iconUrl) {
    return (
      <img src={iconUrl} alt={name} className="h-5 w-5 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/30 text-[10px] font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function SendDmButton({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { goToDm } = useAppNavigate();
  const addOrUpdateConv = useDmStore((s) => s.addOrUpdateConversation);
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (!userId || userId === currentUserId) return;
    setLoading(true);
    try {
      const conv = await api.createDm(userId);
      addOrUpdateConv(conv);
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit("dm:join", { conversationId: conv.id });
      }
      goToDm(conv.id);
      onClose();
    } finally {
      setLoading(false);
    }
  }, [userId, currentUserId, addOrUpdateConv, goToDm, onClose]);

  if (userId === currentUserId) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={loading}
        onClick={handleClick}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {loading ? "Opening…" : "Message"}
      </button>
    </div>
  );
}
