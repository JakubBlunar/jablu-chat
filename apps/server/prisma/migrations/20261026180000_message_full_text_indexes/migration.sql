-- Match the two separate expressions in SearchService. Combining title and
-- content would change whether a multi-word query can match across fields.
CREATE INDEX "messages_content_search_idx" ON "messages"
USING GIN (to_tsvector('simple', coalesce("content", '')))
WHERE "deleted" = false;

CREATE INDEX "messages_title_search_idx" ON "messages"
USING GIN (to_tsvector('simple', coalesce("title", '')))
WHERE "deleted" = false;
