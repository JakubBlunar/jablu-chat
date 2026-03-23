import type { Channel } from "@chat/shared";
import { useCallback, useMemo, useState } from "react";
import SimpleBar from "simplebar-react";
import { CreateChannelModal } from "@/components/CreateChannelModal";
import { EditChannelModal } from "@/components/EditChannelModal";
import { InviteModal } from "@/components/InviteModal";
import { MobileDrawer } from "@/components/MobileDrawer";
import { ServerSettingsModal } from "@/components/ServerSettingsModal";
import { UserAvatar } from "@/components/UserAvatar";
import { VoicePanel } from "@/components/voice/VoicePanel";
import { api } from "@/lib/api";
import { useAppNavigate } from "@/hooks/useAppNavigate";
import { useAuthStore } from "@/stores/auth.store";
import { useChannelStore } from "@/stores/channel.store";
import { useDmStore } from "@/stores/dm.store";
import { useLayoutStore } from "@/stores/layout.store";
import { useMemberStore } from "@/stores/member.store";
import { useReadStateStore } from "@/stores/readState.store";
import { type Server, useServerStore } from "@/stores/server.store";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";
import { type VoiceParticipant, useVoiceStore } from "@/stores/voice.store";

function DmIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v10h16V6H4zm2 2h8v2H6V8zm0 4h5v2H6v-2z" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 4h2l1 4h4v2h-3.382l.894 4H19v2h-3.618l1 4h-2.054l-1-4H9.382l-1 4H6.328l1-4H4v-2h3.618L6.724 10H3V8h3.382L5.5 4h2.054l1 4h5.946l-1-4zM10.618 10l.894 4h5.946l-.894-4h-5.946z" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  );
}

function VoiceStatusIcons({ participant }: { participant: VoiceParticipant }) {
  const icons: React.ReactNode[] = [];
  if (participant.muted) {
    icons.push(
      <svg key="m" className="h-3 w-3 text-red-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
      </svg>,
    );
  }
  if (participant.deafened) {
    icons.push(
      <svg key="d" className="h-3 w-3 text-red-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12v4.5C2 18.43 3.57 20 5.5 20H9V12H4c0-4.42 3.58-8 8-8s8 3.58 8 8h-5v8h3.5c1.93 0 3.5-1.57 3.5-3.5V12c0-5.52-4.48-10-10-10z" />
        <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
      </svg>,
    );
  }
  if (icons.length === 0) return null;
  return <span className="flex items-center gap-0.5">{icons}</span>;
}

export function MobileNavDrawer({ onOpenSettings }: { onOpenSettings: () => void }) {
  const open = useLayoutStore((s) => s.navDrawerOpen);
  const close = useLayoutStore((s) => s.closeNavDrawer);

  const { goToServer, goToChannel, goToDms, goToDm } = useAppNavigate();

  const viewMode = useServerStore((s) => s.viewMode);
  const servers = useServerStore((s) => s.servers);
  const currentServerId = useServerStore((s) => s.currentServerId);

  const channels = useChannelStore((s) => s.channels);
  const currentChannelId = useChannelStore((s) => s.currentChannelId);

  const conversations = useDmStore((s) => s.conversations);
  const currentConvId = useDmStore((s) => s.currentConversationId);

  const user = useAuthStore((s) => s.user);
  const onlineIds = useMemberStore((s) => s.onlineUserIds);
  const dmReadStates = useReadStateStore((s) => s.dms);
  const channelReadStates = useReadStateStore((s) => s.channels);
  const viewingVoiceRoom = useVoiceConnectionStore((s) => s.viewingVoiceRoom);
  const voiceParticipants = useVoiceStore((s) => s.participants);
  const currentVoiceChannelId = useVoiceConnectionStore((s) => s.currentChannelId);

  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  const currentServer = useMemo(
    () => servers.find((s) => s.id === currentServerId) ?? null,
    [servers, currentServerId],
  );
  const myMembership = useMemberStore((s) =>
    s.members.find((m) => m.userId === user?.id),
  );
  const isAdminOrOwner =
    myMembership?.role === "owner" || myMembership?.role === "admin";
  const isOwner = currentServer?.ownerId === user?.id;
  const removeServer = useServerStore((s) => s.removeServer);

  const handleLeave = useCallback(async () => {
    if (!currentServer) return;
    if (!confirm(`Leave ${currentServer.name}? You will need a new invite to rejoin.`)) return;
    try {
      await api.leaveServer(currentServer.id);
      removeServer(currentServer.id);
      close();
    } catch {
      /* ignore */
    }
  }, [currentServer, removeServer, close]);

  const hasDmUnread = Array.from(dmReadStates.values()).some(
    (rs) => rs.unreadCount > 0,
  );

  const textChannels = useMemo(
    () => channels.filter((c) => c.type === "text").sort((a, b) => a.position - b.position),
    [channels],
  );
  const voiceChannels = useMemo(
    () => channels.filter((c) => c.type === "voice").sort((a, b) => a.position - b.position),
    [channels],
  );

  const handleServerClick = useCallback(
    (server: Server) => {
      goToServer(server.id);
    },
    [goToServer],
  );

  const handleDmClick = useCallback(() => {
    goToDms();
  }, [goToDms]);

  const handleChannelClick = useCallback(
    (ch: Channel) => {
      if (currentServerId) goToChannel(currentServerId, ch.id);
      useVoiceConnectionStore.getState().setViewingVoiceRoom(false);
      close();
    },
    [currentServerId, goToChannel, close],
  );

  const handleVoiceChannelClick = useCallback(
    (ch: Channel) => {
      const store = useVoiceConnectionStore.getState();
      if (store.currentChannelId === ch.id) {
        store.setViewingVoiceRoom(true);
      } else if (currentServerId) {
        import("@/lib/voiceConnect").then(({ joinVoiceChannel }) =>
          joinVoiceChannel(currentServerId, ch.id, ch.name),
        );
      }
      close();
    },
    [currentServerId, close],
  );

  const handleConvClick = useCallback(
    (convId: string) => {
      goToDm(convId);
      close();
    },
    [goToDm, close],
  );

  const getConvDisplayInfo = useCallback(
    (conv: (typeof conversations)[0]) => {
      if (conv.isGroup) {
        return {
          name: conv.groupName || conv.members.map((m) => m.displayName ?? m.username).join(", "),
          avatarUrl: null as string | null,
          status: "online" as const,
          isGroup: true,
        };
      }
      const other = conv.members.find((m) => m.userId !== user?.id);
      return {
        name: other?.displayName ?? other?.username ?? "Unknown",
        avatarUrl: other?.avatarUrl ?? null,
        status: (onlineIds.has(other?.userId ?? "") ? "online" : "offline") as "online" | "offline",
        isGroup: false,
      };
    },
    [user?.id, onlineIds],
  );

  return (
    <>
      <MobileDrawer open={open} onClose={close} side="left" width="w-72">
        <div className="flex h-full flex-col bg-surface-dark">
          {/* Server row */}
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-black/20 px-3 py-2">
            <button
              type="button"
              onClick={handleDmClick}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                viewMode === "dm"
                  ? "bg-primary text-white"
                  : "bg-surface text-gray-300 hover:bg-primary hover:text-white"
              }`}
            >
              <DmIcon />
            </button>
            {hasDmUnread && viewMode !== "dm" && (
              <span className="absolute h-2 w-2 rounded-full bg-red-500" />
            )}
            <div className="h-6 w-px shrink-0 bg-white/15" />
            {servers.map((s) => {
              const active = viewMode === "server" && s.id === currentServerId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleServerClick(s)}
                  title={s.name}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden text-xs font-semibold text-white transition ${
                    active
                      ? "rounded-xl bg-primary"
                      : "rounded-full bg-surface hover:rounded-xl hover:bg-primary"
                  }`}
                >
                  {s.iconUrl ? (
                    <img src={s.iconUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    s.name.charAt(0).toUpperCase()
                  )}
                </button>
              );
            })}
          </div>

          {/* Server name + actions */}
          {viewMode === "server" && currentServer && (
            <div className="flex shrink-0 items-center gap-1 border-b border-black/20 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                {currentServer.name}
              </span>
              {isAdminOrOwner && (
                <button
                  type="button"
                  title="Server Settings"
                  onClick={() => { close(); setServerSettingsOpen(true); }}
                  className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                >
                  <GearIcon />
                </button>
              )}
              <button
                type="button"
                title="Invite People"
                onClick={() => { close(); setInviteOpen(true); }}
                className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </button>
              {!isOwner && (
                <button
                  type="button"
                  title="Leave Server"
                  onClick={() => void handleLeave()}
                  className="rounded-md p-1.5 text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 00-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Channel / DM list */}
          <SimpleBar className="min-h-0 flex-1 px-2 py-2">
            {viewMode === "server" ? (
              <>
                <div className="mb-1 flex items-center justify-between px-2">
                  <span className="text-[11px] font-semibold tracking-wide text-gray-400">
                    TEXT CHANNELS
                  </span>
                  {isAdminOrOwner && (
                    <button
                      type="button"
                      title="Create channel"
                      onClick={() => { close(); setChannelModalOpen(true); }}
                      className="rounded p-0.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <PlusSmallIcon />
                    </button>
                  )}
                </div>
                <ul className="space-y-0.5">
                  {textChannels.map((ch) => {
                    const active = ch.id === currentChannelId && !viewingVoiceRoom;
                    const rs = channelReadStates.get(ch.id);
                    const hasUnread = !active && rs && rs.unreadCount > 0;
                    return (
                      <li key={ch.id}>
                        <div className="relative flex items-center">
                          <button
                            type="button"
                            onClick={() => handleChannelClick(ch)}
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                              active
                                ? "bg-surface-selected text-white"
                                : hasUnread
                                  ? "font-semibold text-white hover:bg-white/[0.06]"
                                  : "text-gray-300 hover:bg-white/[0.06]"
                            }`}
                          >
                            <HashIcon />
                            <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                            {hasUnread && rs!.mentionCount > 0 && (
                              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                {rs!.mentionCount}
                              </span>
                            )}
                          </button>
                          {isAdminOrOwner && (
                            <button
                              type="button"
                              title="Edit channel"
                              onClick={() => { close(); setEditingChannel(ch); }}
                              className="shrink-0 rounded p-1.5 text-gray-400 transition hover:text-white"
                            >
                              <GearSmallIcon />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="mb-1 mt-3 flex items-center justify-between px-2">
                  <span className="text-[11px] font-semibold tracking-wide text-gray-400">
                    VOICE CHANNELS
                  </span>
                  {isAdminOrOwner && (
                    <button
                      type="button"
                      title="Create channel"
                      onClick={() => { close(); setChannelModalOpen(true); }}
                      className="rounded p-0.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <PlusSmallIcon />
                    </button>
                  )}
                </div>
                <ul className="space-y-0.5">
                  {voiceChannels.map((ch) => {
                    const participants = voiceParticipants[ch.id] ?? [];
                    const inThis = currentVoiceChannelId === ch.id;
                    return (
                      <li key={ch.id}>
                        <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => handleVoiceChannelClick(ch)}
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                              inThis ? "text-white" : "text-gray-300 hover:bg-white/[0.06]"
                            }`}
                          >
                            <SpeakerIcon />
                            <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                            {participants.length > 0 && (
                              <span className="text-xs text-gray-400">{participants.length}</span>
                            )}
                          </button>
                          {isAdminOrOwner && (
                            <button
                              type="button"
                              title="Edit channel"
                              onClick={() => { close(); setEditingChannel(ch); }}
                              className="shrink-0 rounded p-1.5 text-gray-400 transition hover:text-white"
                            >
                              <GearSmallIcon />
                            </button>
                          )}
                        </div>
                        {participants.length > 0 && (
                          <ul className="ml-6 space-y-0.5">
                            {participants.map((p) => (
                              <li key={p.userId} className="flex items-center gap-1.5 py-0.5 text-xs text-gray-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                <span className="min-w-0 flex-1 truncate">{p.username}</span>
                                <VoiceStatusIcons participant={p} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <>
                <p className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-gray-400">
                  DIRECT MESSAGES
                </p>
                <ul className="space-y-0.5">
                  {conversations.map((conv) => {
                    const info = getConvDisplayInfo(conv);
                    const active = conv.id === currentConvId;
                    const rs = dmReadStates.get(conv.id);
                    const hasUnread = !active && rs && rs.unreadCount > 0;
                    return (
                      <li key={conv.id}>
                        <button
                          type="button"
                          onClick={() => handleConvClick(conv.id)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                            active
                              ? "bg-surface-selected text-white"
                              : hasUnread
                                ? "font-semibold text-white hover:bg-white/[0.06]"
                                : "text-gray-300 hover:bg-white/[0.06]"
                          }`}
                        >
                          <UserAvatar
                            username={info.name}
                            avatarUrl={info.avatarUrl}
                            size="sm"
                            showStatus
                            status={info.status}
                          />
                          <span className="min-w-0 flex-1 truncate">{info.name}</span>
                          {hasUnread && (
                            <span className="h-2 w-2 rounded-full bg-white" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </SimpleBar>

          {/* Voice panel */}
          <VoicePanel />

          {/* User footer */}
          <div className="flex shrink-0 items-center gap-2 border-t border-black/20 bg-surface-overlay px-3 py-2">
            <UserAvatar
              username={user?.username ?? "User"}
              avatarUrl={user?.avatarUrl}
              size="md"
              showStatus
              status={user?.status ?? "online"}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {user?.displayName ?? user?.username ?? "..."}
              </p>
              <p className="truncate text-xs capitalize text-gray-400">
                {user?.status ?? "online"}
              </p>
            </div>
            <button
              type="button"
              title="User settings"
              onClick={onOpenSettings}
              className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              <GearIcon />
            </button>
          </div>
        </div>
      </MobileDrawer>

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
      <CreateChannelModal
        open={channelModalOpen}
        onClose={() => setChannelModalOpen(false)}
      />
      {editingChannel && (
        <EditChannelModal
          channel={editingChannel}
          onClose={() => setEditingChannel(null)}
        />
      )}
    </>
  );
}

function PlusSmallIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
    </svg>
  );
}

function GearSmallIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z" />
    </svg>
  );
}
