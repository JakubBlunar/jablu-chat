-- CreateIndex
CREATE INDEX "messages_channel_id_pinned_idx" ON "messages"("channel_id", "pinned");
