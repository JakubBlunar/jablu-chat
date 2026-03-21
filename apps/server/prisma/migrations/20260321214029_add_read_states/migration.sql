-- CreateTable
CREATE TABLE "channel_read_states" (
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL,
    "mention_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "channel_read_states_pkey" PRIMARY KEY ("user_id","channel_id")
);

-- CreateTable
CREATE TABLE "dm_read_states" (
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL,
    "mention_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dm_read_states_pkey" PRIMARY KEY ("user_id","conversation_id")
);

-- AddForeignKey
ALTER TABLE "channel_read_states" ADD CONSTRAINT "channel_read_states_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_read_states" ADD CONSTRAINT "dm_read_states_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
