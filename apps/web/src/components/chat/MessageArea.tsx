import type { Message } from "@chat/shared";
import { useCallback, useEffect, useState } from "react";
import SimpleBar from "simplebar-react";
import { DelayedRender } from "@/components/DelayedRender";
import { ScrollToBottomButton } from "@/components/ScrollToBottomButton";
import { ProfileCard } from "@/components/ProfileCard";
import { MessageRow } from "@/components/chat/MessageRow";
import { UnifiedInput } from "@/components/chat/UnifiedInput";
import { PinnedPanel } from "@/components/chat/PinnedPanel";
import { DmProfilePanel, UserProfileIcon } from "@/components/dm/DmProfilePanel";
import { useMessageStoreAdapter } from "@/hooks/useMessageStoreAdapter";
import { api } from "@/lib/api";
import { formatDateSeparator, isDifferentDay } from "@/lib/format-time";
import { Virtuoso } from "react-virtuoso";
import { useAuthStore } from "@/stores/auth.store";
import { useChannelStore } from "@/stores/channel.store";
import { useLayoutStore } from "@/stores/layout.store";
import { useMemberStore } from "@/stores/member.store";
import { useServerStore } from "@/stores/server.store";

import { useMessageScroll } from "@/components/chat/hooks/useMessageScroll";
import { useProfileCard } from "@/components/chat/hooks/useProfileCard";
import { usePinnedMessages } from "@/components/chat/hooks/usePinnedMessages";
import { useTypingIndicators, formatTyping } from "@/components/chat/hooks/useTypingIndicators";
import { useReadReceipts } from "@/components/chat/hooks/useReadReceipts";
import { useDmContext, dmMentionChannels } from "@/components/dm/hooks/useDmContext";

import { NotifBellMenu } from "@/components/channel/NotifBellMenu";
import { SearchBar } from "@/components/SearchBar";
import { SearchDrawer } from "@/components/search/SearchDrawer";
import { EditChannelModal } from "@/components/channel/EditChannelModal";

/* ── Small icons ── */

function HashChannelIcon() {
  return (
    <svg className="h-6 w-6 text-gray-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 4h2l1 4h4v2h-3.382l.894 4H19v2h-3.618l1 4h-2.054l-1-4H9.382l-1 4H6.328l1-4H4v-2h3.618L6.724 10H3V8h3.382L5.5 4h2.054l1 4h5.946l-1-4zM10.618 10l.894 4h5.946l-.894-4h-5.946z" />
    </svg>
  );
}

function MembersToggleIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6M23 11h-6" />
    </svg>
  );
}

function ChannelSettingsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  );
}

function PinHeaderIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v8m0 0-3-3m3 3 3-3M9 17h6m-6 0v4m6-4v4M5 12h14" />
    </svg>
  );
}

function AtIcon() {
  return (
    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 1 0 4.4 19 1 1 0 0 0-.8-1.8A8 8 0 1 1 20 12v1.5a2.5 2.5 0 0 1-5 0V8h-2v.3A5 5 0 1 0 15 17a4.5 4.5 0 0 0 7-3.5V12A10 10 0 0 0 12 2zm0 13a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
    </svg>
  );
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="my-2 flex items-center gap-3">
      <div className="h-px flex-1 bg-white/10" />
      <span className="text-[11px] font-semibold text-gray-400">
        {formatDateSeparator(date)}
      </span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

/* ── Constants ── */

const GROUP_GAP_MS = 5 * 60 * 1000;

function isGap(a: Message, b: Message): boolean {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return tb - ta > GROUP_GAP_MS;
}

/* ── MessageArea ── */

export interface MessageAreaProps {
  mode: "channel" | "dm";
  contextId: string | null;
  memberSidebar?: React.ReactNode;
}

export function MessageArea({ mode, contextId, memberSidebar }: MessageAreaProps) {
  const isDm = mode === "dm";
  const store = useMessageStoreAdapter(mode);
  const { messages, isLoading, hasMore, hasNewer, fetchNewerMessages } = store;

  const userId = useAuthStore((s) => s.user?.id);

  const scroll = useMessageScroll(mode, contextId, store);
  const dm = useDmContext(isDm, userId);
  const { cardUser, cardRect, closeCard, handleUserClick, handleMentionClick } = useProfileCard(isDm, dm.currentConv);
  const typingNames = useTypingIndicators(isDm, contextId, userId);
  const { lastOwnMsg, seenByLabel } = useReadReceipts(isDm, contextId, dm.currentConv, userId, messages);

  const channelId = isDm ? null : contextId;
  const pinned = usePinnedMessages(channelId);

  const activeChannel = useChannelStore((s) => {
    if (isDm || !s.currentChannelId) return null;
    const ch = s.channels.find((c) => c.id === s.currentChannelId);
    if (!ch || ch.serverId !== useServerStore.getState().currentServerId) return null;
    return ch;
  });

  const [editingChannel, setEditingChannel] = useState(false);
  const myRole = useMemberStore((s) =>
    s.members.find((m) => m.userId === userId),
  )?.role;
  const isAdminOrOwner = myRole === "admin" || myRole === "owner";

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    content: string | null;
    authorName: string;
  } | null>(null);

  useEffect(() => {
    setReplyTarget(null);
  }, [contextId]);

  const handleReply = useCallback((msg: Message) => {
    setReplyTarget({
      id: msg.id,
      content: msg.content,
      authorName: msg.author?.displayName ?? msg.author?.username ?? "Deleted User",
    });
  }, []);

  const [gifEnabled, setGifEnabled] = useState(false);
  useEffect(() => {
    api.getGifEnabled().then((r) => setGifEnabled(r.enabled)).catch(() => {});
  }, []);

  /* ── Empty states ── */
  if (!contextId) {
    if (isDm) {
      return (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 bg-surface text-center">
          <p className="text-lg font-semibold text-white">Select a conversation</p>
          <p className="max-w-sm text-sm text-gray-400">
            Choose a DM from the sidebar or click on a user to start chatting.
          </p>
        </div>
      );
    }
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
          <h1 className="text-base font-semibold text-gray-400">Select a channel</h1>
        </header>
        <div className="flex min-h-0 flex-1" />
      </section>
    );
  }

  /* ── Render ── */
  const messageList = (
    <>
      {!isDm && pinned.pinnedOpen && channelId && (
        <PinnedPanel
          messages={pinned.pinnedMessages}
          loading={pinned.pinnedLoading}
          onClose={() => pinned.setPinnedOpen(false)}
          isAdminOrOwner={isAdminOrOwner}
          channelId={channelId}
          onJump={scroll.handleJumpToMessage}
        />
      )}

      <div className="relative min-h-0 flex-1">
        <SimpleBar
          className="flex h-full flex-col px-4 py-2"
          scrollableNodeProps={{ ref: scroll.scrollParentRef }}
        >
          {!isDm && !activeChannel ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="rounded-full bg-surface-dark p-6 text-gray-400">
                <HashChannelIcon />
              </div>
              <p className="max-w-sm text-lg font-semibold text-white">
                Welcome to your server
              </p>
              <p className="max-w-sm text-sm text-gray-400">
                Pick a text channel on the left to start chatting, or join a
                server using an invite link.
              </p>
            </div>
          ) : isLoading && messages.length === 0 ? (
            <DelayedRender loading delay={500} fallback={<div className="flex-1" />}>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
                <p className="text-sm text-gray-400">Loading messages...</p>
              </div>
            </DelayedRender>
          ) : !isDm && activeChannel && messages.length === 0 ? (
            <div className="flex flex-1 flex-col justify-end pb-6">
              <div className="border-t border-white/10 pt-4">
                <h2 className="text-2xl font-bold text-white">
                  This is the beginning of{" "}
                  <span className="text-primary">#{activeChannel.name}</span>
                </h2>
                <p className="mt-2 text-[15px] text-gray-400">
                  Send a message to spark the conversation.
                </p>
              </div>
            </div>
          ) : messages.length > 0 && scroll.scrollParent ? (
            <Virtuoso
              key={scroll.virtuosoKey}
              ref={scroll.virtuosoRef}
              customScrollParent={scroll.scrollParent}
              data={messages}
              computeItemKey={(index) => messages[index - scroll.firstItemIndex]?.id ?? index}
              firstItemIndex={scroll.firstItemIndex}
              initialTopMostItemIndex={scroll.scrollTargetIndexRef.current ?? messages.length - 1}
              alignToBottom
              atBottomThreshold={100}
              followOutput={scroll.followOutput}
              atBottomStateChange={scroll.handleAtBottomChange}
              startReached={hasMore ? scroll.startReached : undefined}
              endReached={hasNewer && fetchNewerMessages ? scroll.endReached : undefined}
              increaseViewportBy={400}
              components={{ Footer: () => <div className="h-8" /> }}
              itemContent={(index, msg) => {
                const dataIndex = index - scroll.firstItemIndex;
                const prev = dataIndex > 0 ? messages[dataIndex - 1] : undefined;
                const newDay = !prev || isDifferentDay(prev.createdAt, msg.createdAt);
                const showHead =
                  newDay || !prev || prev.authorId !== msg.authorId || isGap(prev, msg);
                return (
                  <div className="pb-0.5">
                    {newDay && <DateSeparator date={msg.createdAt} />}
                    <MessageRow
                      mode={mode}
                      message={msg}
                      showHead={showHead}
                      contextId={contextId}
                      onReply={handleReply}
                      onUserClick={handleUserClick}
                      onMentionClick={isDm ? undefined : handleMentionClick}
                      channels={dm.channelRefs}
                      onChannelClick={dm.handleChannelClick}
                    />
                    {lastOwnMsg?.id === msg.id && seenByLabel && (
                      <div className="mr-4 mt-0.5 text-right text-[11px] text-gray-500">
                        {seenByLabel}
                      </div>
                    )}
                  </div>
                );
              }}
            />
          ) : null}
        </SimpleBar>

        <ScrollToBottomButton
          atBottom={scroll.atBottom}
          hasNewer={hasNewer}
          isLoading={isLoading}
          messageCount={messages.length}
          contextId={contextId}
          onClick={scroll.handleBottomButtonClick}
        />
      </div>

      {typingNames.length > 0 && (
        <div className="px-4 py-1 text-xs text-gray-400">
          {formatTyping(typingNames)}
        </div>
      )}

      <UnifiedInput
        mode={mode}
        contextId={contextId}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        onSent={scroll.stickToBottom}
        channels={isDm ? dmMentionChannels(dm.mutualServers) : undefined}
        gifEnabled={gifEnabled}
        placeholder={isDm
          ? `Message ${dm.otherMember?.displayName ?? dm.otherMember?.username ?? ""}`
          : activeChannel
            ? (replyTarget ? `Reply to ${replyTarget.authorName}...` : `Message #${activeChannel.name}`)
            : "Message"}
      />

      {cardUser && (
        <ProfileCard user={cardUser} onClose={closeCard} anchorRect={cardRect} />
      )}
    </>
  );

  const channelHeader = !isDm ? (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
      {activeChannel ? (
        <>
          <HashChannelIcon />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-white">
              {activeChannel.name}
            </h1>
          </div>
          <button
            type="button"
            title="Pinned messages"
            onClick={() => void pinned.handleOpenPinned()}
            className="relative rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <PinHeaderIcon />
            {(activeChannel.pinnedCount ?? 0) > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white">
                {activeChannel.pinnedCount}
              </span>
            )}
          </button>
          <NotifBellMenu channelId={activeChannel.id} />
          {isAdminOrOwner && (
            <button
              type="button"
              title="Channel settings"
              onClick={() => setEditingChannel(true)}
              className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              <ChannelSettingsIcon />
            </button>
          )}
          <button
            type="button"
            title="Toggle member list"
            onClick={useLayoutStore.getState().toggleMemberSidebar}
            className="hidden rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white md:block"
          >
            <MembersToggleIcon />
          </button>
          <SearchBar
            searchOpen={searchOpen}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onSearch={(q) => { setSearchQuery(q); setSearchOpen(true); }}
            onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
          />
        </>
      ) : (
        <h1 className="text-base font-semibold text-gray-400">Select a channel</h1>
      )}
    </header>
  ) : null;

  if (isDm) {
    return (
      <div className="relative flex min-w-0 flex-1 bg-surface">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
            <AtIcon />
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">{dm.otherName}</h2>
            {dm.otherMember && !dm.currentConv?.isGroup && (
              <button
                type="button"
                onClick={() => dm.setShowProfile((p) => !p)}
                title="User profile"
                className={`shrink-0 rounded p-1.5 transition ${dm.showProfile ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"}`}
              >
                <UserProfileIcon />
              </button>
            )}
            <div className="shrink-0">
              <SearchBar
                searchOpen={searchOpen}
                query={searchQuery}
                onQueryChange={setSearchQuery}
                onSearch={(q) => { setSearchQuery(q); setSearchOpen(true); }}
                onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
              />
            </div>
          </header>
          {messageList}
        </div>
        {searchOpen ? (
          <div className="absolute inset-0 z-30 md:relative md:inset-auto">
            <SearchDrawer
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
              defaultScope="conversation"
              conversationId={dm.dmConvId ?? undefined}
            />
          </div>
        ) : dm.showProfile && dm.otherMember ? (
          <DmProfilePanel member={dm.otherMember} mutualServers={dm.mutualServers} />
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      {channelHeader}

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {messageList}
        </div>
        {searchOpen ? (
          <div className="absolute inset-0 z-30 md:relative md:inset-auto">
            <SearchDrawer
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
            />
          </div>
        ) : (
          memberSidebar
        )}
      </div>

      {editingChannel && activeChannel && (
        <EditChannelModal
          channel={activeChannel}
          onClose={() => setEditingChannel(false)}
        />
      )}
    </section>
  );
}
