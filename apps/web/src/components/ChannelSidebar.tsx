import { useMemo, useState } from "react";
import { CreateChannelModal } from "@/components/CreateChannelModal";
import { InviteModal } from "@/components/InviteModal";
import { ServerSettingsModal } from "@/components/ServerSettingsModal";
import { SettingsModal } from "@/components/SettingsModal";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuthStore } from "@/stores/auth.store";
import { useChannelStore } from "@/stores/channel.store";
import { useMemberStore } from "@/stores/member.store";
import { useServerStore } from "@/stores/server.store";

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 10l5 5 5-5H7z" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-gray-400"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M11 4h2l1 4h4v2h-3.382l.894 4H19v2h-3.618l1 4h-2.054l-1-4H9.382l-1 4H6.328l1-4H4v-2h3.618L6.724 10H3V8h3.382L5.5 4h2.054l1 4h5.946l-1-4zM10.618 10l.894 4h5.946l-.894-4h-5.946z" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-gray-400"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function PlusSmallIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2z" />
    </svg>
  );
}

function InviteIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  );
}

export function ChannelSidebar() {
  const user = useAuthStore((s) => s.user);

  const currentServer = useServerStore((s) => {
    const id = s.currentServerId;
    if (!id) return null;
    return s.servers.find((x) => x.id === id) ?? null;
  });
  const channelsLoading = useChannelStore((s) => s.isLoading);
  const channels = useChannelStore((s) => s.channels);
  const currentChannelId = useChannelStore((s) => s.currentChannelId);
  const setCurrentChannel = useChannelStore((s) => s.setCurrentChannel);

  const textChannels = useMemo(
    () => channels.filter((c) => c.type === "text").sort((a, b) => a.position - b.position),
    [channels],
  );
  const voiceChannels = useMemo(
    () => channels.filter((c) => c.type === "voice").sort((a, b) => a.position - b.position),
    [channels],
  );

  const myMembership = useMemberStore((s) =>
    s.members.find((m) => m.userId === user?.id),
  );
  const isAdminOrOwner =
    myMembership?.role === "owner" || myMembership?.role === "admin";

  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);

  return (
    <>
      <aside className="flex h-full w-60 shrink-0 flex-col bg-[#2b2d31]">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/20 px-4 shadow-sm">
          <span className="truncate text-[15px] font-semibold text-white">
            {currentServer?.name ?? "Select a server"}
          </span>
          {currentServer && (
            <div className="flex items-center gap-1">
              {isAdminOrOwner && (
                <button
                  type="button"
                  title="Server settings"
                  onClick={() => setServerSettingsOpen(true)}
                  className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
                >
                  <GearIcon />
                </button>
              )}
              <button
                type="button"
                title="Invite people"
                onClick={() => setInviteOpen(true)}
                className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
              >
                <InviteIcon />
              </button>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
          {channelsLoading && !textChannels.length && currentServer ? (
            <div className="space-y-2 px-1">
              <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
              <div className="h-8 w-full animate-pulse rounded bg-white/5" />
              <div className="h-8 w-full animate-pulse rounded bg-white/5" />
            </div>
          ) : null}

          <div className="group/header flex items-center justify-between px-2 pt-1">
            <span className="text-[11px] font-semibold tracking-wide text-gray-400">
              TEXT CHANNELS
            </span>
            <button
              type="button"
              title="Create channel"
              disabled={!currentServer}
              onClick={() => setChannelModalOpen(true)}
              className="rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/header:opacity-100 disabled:opacity-0"
            >
              <PlusSmallIcon />
            </button>
          </div>

          <ul className="space-y-0.5">
            {textChannels.map((ch) => {
              const active = ch.id === currentChannelId;
              return (
                <li key={ch.id}>
                  <button
                    type="button"
                    onClick={() => setCurrentChannel(ch.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[15px] transition ${
                      active
                        ? "bg-[#404249] text-white"
                        : "text-gray-300 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <HashIcon />
                    <span className="truncate">{ch.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between px-2 pt-1">
            <span className="text-[11px] font-semibold tracking-wide text-gray-400">
              VOICE CHANNELS
            </span>
          </div>

          <ul className="space-y-1">
            {voiceChannels.map((ch) => (
              <li key={ch.id}>
                <div
                  className={`rounded-md px-2 py-1.5 text-[15px] text-gray-300`}
                >
                  <div className="flex items-center gap-2">
                    <SpeakerIcon />
                    <span className="truncate">{ch.name}</span>
                  </div>
                  <p className="mt-1 pl-7 text-xs text-gray-500">
                    No one connected
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex h-[52px] shrink-0 items-center gap-2 bg-[#232428] px-2">
          <UserAvatar
            username={user?.username ?? "User"}
            avatarUrl={user?.avatarUrl}
            size="md"
            showStatus
            status={user?.status ?? "online"}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {user?.username ?? "…"}
            </p>
            <p className="truncate text-xs text-gray-400 capitalize">
              {user?.status ?? "online"}
            </p>
          </div>
          <button
            type="button"
            title="User settings"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <GearIcon />
          </button>
        </div>
      </aside>

      <CreateChannelModal
        open={channelModalOpen}
        onClose={() => setChannelModalOpen(false)}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      {inviteOpen && currentServer && (
        <InviteModal
          serverId={currentServer.id}
          serverName={currentServer.name}
          onClose={() => setInviteOpen(false)}
        />
      )}
      {serverSettingsOpen && currentServer && (
        <ServerSettingsModal
          server={currentServer}
          onClose={() => setServerSettingsOpen(false)}
        />
      )}
    </>
  );
}
