-- Normalize local upload URLs once for indexed ownership checks, including
-- absolute URLs, percent-encoded path segments, and cache-busting query strings.
CREATE FUNCTION cleanup_decode_uri(input TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
DECLARE output BYTEA := ''::bytea; i INTEGER := 1; c TEXT;
BEGIN
  IF strpos(input, '%') = 0 THEN RETURN input; END IF;
  WHILE i <= length(input) LOOP
    c := substr(input, i, 1);
    IF c = '%' AND substr(input, i + 1, 2) ~ '^[0-9A-Fa-f]{2}$' THEN
      output := output || decode(substr(input, i + 1, 2), 'hex'); i := i + 3;
    ELSE
      output := output || convert_to(c, 'UTF8'); i := i + 1;
    END IF;
  END LOOP;
  RETURN convert_from(output, 'UTF8');
EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN RETURN input;
END $$;
CREATE FUNCTION cleanup_upload_url(input TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT substring(cleanup_decode_uri(input) FROM '(/api/uploads/[^?#\s"<>]+)')
$$;
CREATE INDEX attachments_cleanup_url_idx ON attachments (cleanup_upload_url(url));
CREATE INDEX attachments_cleanup_thumbnail_idx ON attachments (cleanup_upload_url(thumbnail_url));
CREATE INDEX users_cleanup_avatar_idx ON users (cleanup_upload_url(avatar_url));
CREATE INDEX servers_cleanup_icon_idx ON servers (cleanup_upload_url(icon_url));
CREATE INDEX emojis_cleanup_image_idx ON custom_emojis (cleanup_upload_url(image_url));
CREATE INDEX webhooks_cleanup_avatar_idx ON webhooks (cleanup_upload_url(avatar_url));
CREATE INDEX games_cleanup_icon_idx ON registered_games (cleanup_upload_url(icon_url));
CREATE INDEX conversations_cleanup_avatar_idx ON direct_conversations (cleanup_upload_url(group_avatar_url));
CREATE INDEX previews_cleanup_image_idx ON link_previews (cleanup_upload_url(image_url));
-- Most messages contain no local image references; avoid scanning all message
-- bodies for every file whose ownership is revalidated before unlink.
CREATE INDEX messages_cleanup_references_idx ON messages (id)
WHERE webhook_avatar_url IS NOT NULL
   OR strpos(COALESCE(content, ''), '/api/uploads/') > 0
   OR strpos(embeds::text, '/api/uploads/') > 0;
