CREATE INDEX "reactions_message_emoji_user_idx" ON "reactions" ("message_id", "emoji", "user_id");
