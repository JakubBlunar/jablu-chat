-- CreateEnum
CREATE TYPE "EventLocationType" AS ENUM ('voice_channel', 'custom');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('scheduled', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "RecurrenceRule" AS ENUM ('daily', 'weekly', 'biweekly', 'monthly');

-- CreateTable
CREATE TABLE "server_events" (
    "id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location_type" "EventLocationType" NOT NULL,
    "channel_id" TEXT,
    "location_text" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'scheduled',
    "recurrence_rule" "RecurrenceRule",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "server_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_interests" (
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_interests_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateIndex
CREATE INDEX "server_events_server_id_start_at_idx" ON "server_events"("server_id", "start_at");

-- CreateIndex
CREATE INDEX "server_events_server_id_status_idx" ON "server_events"("server_id", "status");

-- AddForeignKey
ALTER TABLE "server_events" ADD CONSTRAINT "server_events_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_events" ADD CONSTRAINT "server_events_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_events" ADD CONSTRAINT "server_events_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_interests" ADD CONSTRAINT "event_interests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "server_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_interests" ADD CONSTRAINT "event_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
