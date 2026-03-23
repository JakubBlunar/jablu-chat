-- Add indexes on frequently-queried foreign key columns

-- RefreshToken: session listing/revocation by user
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- PushSubscription: device lookup per user (every push notification)
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- ServerMember: member listing by server, push fan-out, mention resolution
-- PK is (user_id, server_id) so server_id-only queries need a separate index
CREATE INDEX "server_members_server_id_idx" ON "server_members"("server_id");

-- DirectConversationMember: DM room join on socket connect, DM list loading
-- PK is (conversation_id, user_id) so user_id-only queries need a separate index
CREATE INDEX "direct_conversation_members_user_id_idx" ON "direct_conversation_members"("user_id");

-- Attachment: loaded via include on every message fetch, orphan cleanup
CREATE INDEX "attachments_message_id_idx" ON "attachments"("message_id");

-- LinkPreview: loaded via include on every message fetch
CREATE INDEX "link_previews_message_id_idx" ON "link_previews"("message_id");

-- ChannelNotifPref: push notification filtering by channel
-- PK is (user_id, channel_id) so channel_id-only queries need a separate index
CREATE INDEX "channel_notif_prefs_channel_id_idx" ON "channel_notif_prefs"("channel_id");

-- Invite: listing invites per server
CREATE INDEX "invites_server_id_idx" ON "invites"("server_id");

-- Webhook: listing webhooks per channel
CREATE INDEX "webhooks_channel_id_idx" ON "webhooks"("channel_id");
