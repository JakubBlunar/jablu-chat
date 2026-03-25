-- CreateTable
CREATE TABLE "user_volume_settings" (
    "listener_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "volume" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "user_volume_settings_pkey" PRIMARY KEY ("listener_id","target_user_id")
);
