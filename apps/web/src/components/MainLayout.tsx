import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { ChannelSidebar } from "@/components/ChannelSidebar";
import { DmMessageArea } from "@/components/DmMessageArea";
import { DmSidebar } from "@/components/DmSidebar";
import { MemberDrawer } from "@/components/MemberDrawer";
import { MemberSidebar } from "@/components/MemberSidebar";
import { MessageArea } from "@/components/MessageArea";
import { MobileNavDrawer } from "@/components/MobileNavDrawer";
import { ServerSidebar } from "@/components/ServerSidebar";
import { ScreenSharePicker } from "@/components/voice/ScreenSharePicker";
import { VoiceRoom } from "@/components/voice/VoiceRoom";
import { useIdleDetector } from "@/hooks/useIdleDetector";
import { useIsMobile, useIsTablet } from "@/hooks/useMobile";
import { useSocket } from "@/hooks/useSocket";
import { useAuthStore } from "@/stores/auth.store";
import { useChannelStore } from "@/stores/channel.store";
import { useLayoutStore } from "@/stores/layout.store";
import { useMemberStore } from "@/stores/member.store";
import { useMessageStore } from "@/stores/message.store";
import { useServerStore } from "@/stores/server.store";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";

function ConnectionBanner({ isConnected }: { isConnected: boolean }) {
  const [showReconnected, setShowReconnected] = useState(false);
  const hasConnected = useRef(false);
  const wasDisconnected = useRef(false);

  useEffect(() => {
    if (!isConnected) {
      if (hasConnected.current) {
        wasDisconnected.current = true;
      }
      setShowReconnected(false);
    } else {
      hasConnected.current = true;
      if (wasDisconnected.current) {
        wasDisconnected.current = false;
        setShowReconnected(true);
        const t = setTimeout(() => setShowReconnected(false), 3000);
        return () => clearTimeout(t);
      }
    }
  }, [isConnected]);

  if (!isConnected && hasConnected.current) {
    return (
      <div className="shrink-0 bg-amber-600 px-4 py-1.5 text-center text-xs font-medium text-white">
        Connection lost. Reconnecting...
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div className="shrink-0 bg-emerald-600 px-4 py-1.5 text-center text-xs font-medium text-white">
        Reconnected
      </div>
    );
  }

  return null;
}

function HamburgerIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function MembersIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6M23 11h-6" />
    </svg>
  );
}

function MobileTopBar({
  title,
  onMenuClick,
  onMembersClick,
  showMembers,
}: {
  title: string;
  onMenuClick: () => void;
  onMembersClick?: () => void;
  showMembers?: boolean;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/20 bg-surface px-3 shadow-sm">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
      >
        <HamburgerIcon />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-white">
        {title}
      </h1>
      {showMembers && onMembersClick && (
        <button
          type="button"
          onClick={onMembersClick}
          className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <MembersIcon />
        </button>
      )}
    </header>
  );
}

export function MainLayout() {
  const { socket, isConnected } = useSocket();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  const openNavDrawer = useLayoutStore((s) => s.openNavDrawer);
  const openMemberDrawer = useLayoutStore((s) => s.openMemberDrawer);
  const memberSidebarVisible = useLayoutStore((s) => s.memberSidebarVisible);

  const onIdle = useCallback(() => {
    const s = socket;
    if (s?.connected) {
      s.emit("activity:idle");
    }
    const user = useAuthStore.getState().user;
    if (user && user.status === "online") {
      useAuthStore.getState().setUser({ ...user, status: "idle" });
    }
  }, [socket]);

  const onActive = useCallback(() => {
    const s = socket;
    if (s?.connected) {
      s.emit("activity:active");
    }
    const user = useAuthStore.getState().user;
    if (user && user.status === "idle") {
      useAuthStore.getState().setUser({ ...user, status: "online" });
    }
  }, [socket]);

  useIdleDetector(onIdle, onActive);

  const viewMode = useServerStore((s) => s.viewMode);
  const fetchServers = useServerStore((s) => s.fetchServers);
  const servers = useServerStore((s) => s.servers);
  const serversLoading = useServerStore((s) => s.isLoading);
  const currentServerId = useServerStore((s) => s.currentServerId);
  const setCurrentServer = useServerStore((s) => s.setCurrentServer);
  const currentServer = useServerStore((s) => {
    if (!s.currentServerId) return null;
    return s.servers.find((x) => x.id === s.currentServerId) ?? null;
  });

  const channels = useChannelStore((s) => s.channels);
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const setCurrentChannel = useChannelStore((s) => s.setCurrentChannel);
  const currentChannelId = useChannelStore((s) => s.currentChannelId);

  const textChannels = useMemo(
    () => channels.filter((c) => c.type === "text").sort((a, b) => a.position - b.position),
    [channels],
  );

  const fetchMembers = useMemberStore((s) => s.fetchMembers);
  const clearMessages = useMessageStore((s) => s.clearMessages);

  const viewingVoiceRoom = useVoiceConnectionStore((s) => s.viewingVoiceRoom);
  const voiceChannelName = useVoiceConnectionStore((s) => s.currentChannelName);

  const prevServerRef = useRef<string | null>(null);

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    if (viewMode !== "server") return;
    if (servers.length === 0) return;
    if (!currentServerId) {
      setCurrentServer(servers[0].id);
    }
  }, [viewMode, servers, currentServerId, setCurrentServer]);

  useEffect(() => {
    if (viewMode !== "server") return;
    if (!currentServerId) {
      prevServerRef.current = null;
      setCurrentChannel(null);
      clearMessages();
      return;
    }

    if (prevServerRef.current !== currentServerId) {
      const isInitialLoad = prevServerRef.current === null;
      prevServerRef.current = currentServerId;
      if (!isInitialLoad) {
        setCurrentChannel(null);
        clearMessages();
      }
      void fetchChannels(currentServerId);
      void fetchMembers(currentServerId);
    }
  }, [
    viewMode,
    currentServerId,
    clearMessages,
    fetchChannels,
    fetchMembers,
    setCurrentChannel,
  ]);

  useEffect(() => {
    if (viewMode !== "server") return;
    if (!currentServerId || channels.length === 0) return;
    const valid =
      currentChannelId != null &&
      channels.some((c) => c.id === currentChannelId);
    if (valid) return;
    const firstText = textChannels[0];
    setCurrentChannel(firstText?.id ?? null);
  }, [
    viewMode,
    currentServerId,
    channels,
    currentChannelId,
    textChannels,
    setCurrentChannel,
  ]);

  const mobileTitle = useMemo(() => {
    if (viewMode === "dm") return "Direct Messages";
    if (viewingVoiceRoom && voiceChannelName) return voiceChannelName;
    if (currentServer) return currentServer.name;
    return "Jablu";
  }, [viewMode, viewingVoiceRoom, voiceChannelName, currentServer]);

  const showMemberSidebar = !isMobile && (isTablet ? memberSidebarVisible : memberSidebarVisible);

  // ─── Mobile layout ───
  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface text-white">
        <ConnectionBanner isConnected={isConnected} />
        <MobileTopBar
          title={mobileTitle}
          onMenuClick={openNavDrawer}
          onMembersClick={viewMode === "server" ? openMemberDrawer : undefined}
          showMembers={viewMode === "server"}
        />
        <div className="flex min-h-0 flex-1">
          {viewMode === "dm" ? (
            <DmMessageArea />
          ) : serversLoading && servers.length === 0 ? (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
              <p className="text-sm text-gray-400">Loading servers...</p>
            </div>
          ) : servers.length === 0 ? (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-lg font-semibold text-white">No servers yet</p>
              <p className="max-w-md text-sm text-gray-400">
                Use the menu to join a server.
              </p>
            </div>
          ) : viewingVoiceRoom ? (
            <VoiceRoom />
          ) : (
            <MessageArea />
          )}
        </div>
        <MobileNavDrawer />
        <MemberDrawer />
        <ScreenSharePicker />
      </div>
    );
  }

  // ─── DM layout (desktop/tablet) ───
  if (viewMode === "dm") {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-surface text-white">
        <ConnectionBanner isConnected={isConnected} />
        <div className="flex min-h-0 flex-1">
          <ServerSidebar />
          <DmSidebar />
          <DmMessageArea />
        </div>
      </div>
    );
  }

  // ─── Server layout (desktop/tablet) ───
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-white">
      <ConnectionBanner isConnected={isConnected} />
      <div className="flex min-h-0 flex-1">
        <ServerSidebar />
        <ChannelSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {serversLoading && servers.length === 0 ? (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
              <p className="text-sm text-gray-400">Loading servers...</p>
            </div>
          ) : servers.length === 0 ? (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-lg font-semibold text-white">No servers yet</p>
              <p className="max-w-md text-sm text-gray-400">
                Use the + button in the server list to create your first server.
              </p>
            </div>
          ) : viewingVoiceRoom ? (
            <VoiceRoom />
          ) : (
            <MessageArea memberSidebar={showMemberSidebar ? <MemberSidebar /> : null} />
          )}
          <Outlet />
        </div>
        <ScreenSharePicker />
      </div>
    </div>
  );
}
