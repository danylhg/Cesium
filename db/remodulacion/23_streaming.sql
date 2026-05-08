-- =========================================================
-- 23_streaming.sql
-- Sesiones WebRTC de audio/video operacional en vivo
-- =========================================================

CREATE TABLE IF NOT EXISTS media_stream_session (
  id_stream BIGSERIAL PRIMARY KEY,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  id_personal INT REFERENCES personal(id_personal) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('AUDIO','VIDEO','AUDIO_VIDEO')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','STOPPED','ERROR')),
  label TEXT,
  stream_key TEXT NOT NULL UNIQUE,
  publisher_socket_id TEXT,
  viewer_count INT NOT NULL DEFAULT 0 CHECK (viewer_count >= 0),
  consent_ack BOOLEAN NOT NULL DEFAULT FALSE,
  foreground_notice BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_tabla TEXT,
  created_by_id INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- Migracion suave desde el prototipo anterior basado en fragmentos.
ALTER TABLE media_stream_session
  ADD COLUMN IF NOT EXISTS stream_key TEXT,
  ADD COLUMN IF NOT EXISTS publisher_socket_id TEXT,
  ADD COLUMN IF NOT EXISTS viewer_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

UPDATE media_stream_session
SET stream_key = 'legacy-' || id_stream::text
WHERE stream_key IS NULL;

ALTER TABLE media_stream_session
  ALTER COLUMN stream_key SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'media_stream_session'
      AND column_name = 'storage_dir'
  ) THEN
    ALTER TABLE media_stream_session ALTER COLUMN storage_dir DROP NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_media_stream_session_stream_key
  ON media_stream_session(stream_key);

CREATE INDEX IF NOT EXISTS idx_media_stream_session_operacion
  ON media_stream_session(id_operacion, status, started_at DESC);

CREATE TABLE IF NOT EXISTS media_stream_recording (
  id_recording BIGSERIAL PRIMARY KEY,
  id_stream BIGINT NOT NULL REFERENCES media_stream_session(id_stream) ON DELETE CASCADE,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  mime_type TEXT NOT NULL DEFAULT 'video/webm',
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  duration_ms BIGINT,
  recorded_by_tabla TEXT,
  recorded_by_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_stream_recording_stream
  ON media_stream_recording(id_stream, created_at DESC);
