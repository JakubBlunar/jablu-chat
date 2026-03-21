import { useCallback, useEffect, useMemo, useRef } from "react";
import { Outlet } from "react-router-dom";
import { ChannelSidebar } from "@/components/ChannelSidebar";
import { DmMessageArea } from "@/components/DmMessageArea";
import { DmSidebar } from "@/components/DmSidebar";
import { MemberSidebar } from "@/components/MemberSidebar";
import { MessageArea } from "@/components/MessageArea";
import { ServerSidebar } from "@/components/ServerSidebar";
import { ScreenSharePicker } from "@/components/voice/ScreenSharePicker";
import { VoiceRoom } from "@/components/voice/VoiceRoom";
import { useIdleDetector } from "@/hooks/useIdleDetector";
import { useSocket } from "@/hooks/useSocket";
import { useAuthStore } from "@/stores/auth.store";
import { useChannelStore } from "@/stores/channel.store";
import { useMemberStore } from "@/stores/member.store";
import { useMessageStore } from "@/stores/message.store";
import { useServerStore } from "@/stores/server.store";
import { useVoiceConnectionStore } from "@/stores/voice-connection.store";

export function MainLayout() {
  const { socket } = useSocket();

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
      prevServerRef.current = currentServerId;
      setCurrentChannel(null);
      clearMessages();
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

  if (viewMode === "dm") {
    return (
      <div className="flex h-screen overflow-hidden bg-[#313338] text-white">
        <ServerSidebar />
        <DmSidebar />
        <DmMessageArea />
      </div>
    );
  }

  const voiceChannelId = useVoiceConnectionStore((s) => s.currentChannelId);
  const isInVoice = !!voiceChannelId;

  return (
    <div className="flex h-screen overflow-hidden bg-[#313338] text-white">
      <ServerSidebar />
      <ChannelSidebar />
      {serversLoading && servers.length === 0 ? (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-600 border-t-[#5865f2]" />
          <p className="text-sm text-gray-400">Loading servers…</p>
        </div>
      ) : servers.length === 0 ? (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-lg font-semibold text-white">No servers yet</p>
          <p className="max-w-md text-sm text-gray-400">
            Use the + button in the server list to create your first server.
          </p>
        </div>
      ) : isInVoice ? (
        <>
          <VoiceRoom />
          <Outlet />
        </>
      ) : (
        <>
          <MessageArea />
          <Outlet />
        </>
      )}
      <MemberSidebar />
      <ScreenSharePicker />
    </div>
  );
}
