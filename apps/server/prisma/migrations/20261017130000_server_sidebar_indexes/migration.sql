-- Run outside a transaction: concurrent index builds keep list writes available.
CREATE INDEX CONCURRENTLY "channels_server_id_position_idx"
ON "channels"("server_id", "position");

CREATE INDEX CONCURRENTLY "channel_categories_server_id_position_idx"
ON "channel_categories"("server_id", "position");
