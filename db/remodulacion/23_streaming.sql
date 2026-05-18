-- =========================================================
-- 23_streaming.sql
-- Sesiones WebRTC de audio/video operacional en vivo
-- =========================================================

CREATE TABLE IF NOT EXISTS media_stream_session (
  id_stream BIGSERIAL PRIMARY KEY,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  id_personal INT REFERENCES personal(id_personal) ON DELETE SET NULL,
  estado_operacion_creacion estado_operacion_enum,
  kind TEXT NOT NULL CHECK (kind IN ('AUDIO','VIDEO','AUDIO_VIDEO')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','STOPPED','ERROR')),
  label TEXT,
  protocol TEXT NOT NULL DEFAULT 'HYBRID',
  source_type TEXT NOT NULL DEFAULT 'ANDROID',
  stream_key TEXT NOT NULL UNIQUE,
  rtmp_publish_url TEXT,
  rtmp_playback_url TEXT,
  playback_url TEXT,
  external_device_id TEXT,
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
  ADD COLUMN IF NOT EXISTS protocol TEXT NOT NULL DEFAULT 'HYBRID',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'ANDROID',
  ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum,
  ADD COLUMN IF NOT EXISTS rtmp_publish_url TEXT,
  ADD COLUMN IF NOT EXISTS rtmp_playback_url TEXT,
  ADD COLUMN IF NOT EXISTS playback_url TEXT,
  ADD COLUMN IF NOT EXISTS external_device_id TEXT,
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
  estado_operacion_creacion estado_operacion_enum,
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

ALTER TABLE media_stream_recording
  ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;

CREATE OR REPLACE FUNCTION fn_set_estado_operacion_creacion_media()
RETURNS TRIGGER AS $$
DECLARE
  v_estado estado_operacion_enum;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.estado_operacion_creacion IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT estado
    INTO v_estado
  FROM operacion
  WHERE id_operacion = NEW.id_operacion
  LIMIT 1;

  NEW.estado_operacion_creacion := v_estado;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_media_stream_modificable()
RETURNS TRIGGER AS $$
DECLARE
  v_id_operacion INT;
  v_estado estado_operacion_enum;
BEGIN
  v_id_operacion := COALESCE(NEW.id_operacion, OLD.id_operacion);

  SELECT estado
    INTO v_estado
  FROM operacion
  WHERE id_operacion = v_id_operacion;

  IF v_estado IN ('CERRADA','CANCELADA') THEN
    IF TG_OP = 'UPDATE' AND NEW.status IN ('STOPPED','ERROR') THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'La operacion % esta en estado %, no se permiten modificaciones en media_stream_session',
      v_id_operacion, v_estado;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS tr_estado_operacion_creacion ON media_stream_session;
  DROP TRIGGER IF EXISTS tr_estado_operacion_creacion ON media_stream_recording;
  DROP TRIGGER IF EXISTS tr_media_stream_session_modificable ON media_stream_session;

  CREATE TRIGGER tr_estado_operacion_creacion
  BEFORE INSERT ON media_stream_session
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_estado_operacion_creacion_media();

  CREATE TRIGGER tr_estado_operacion_creacion
  BEFORE INSERT ON media_stream_recording
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_estado_operacion_creacion_media();

  CREATE TRIGGER tr_media_stream_session_modificable
  BEFORE INSERT OR UPDATE OR DELETE ON media_stream_session
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_media_stream_modificable();
END $$;

UPDATE media_stream_session t
SET estado_operacion_creacion = o.estado
FROM operacion o
WHERE t.id_operacion = o.id_operacion
  AND t.estado_operacion_creacion IS NULL;

UPDATE media_stream_recording t
SET estado_operacion_creacion = o.estado
FROM operacion o
WHERE t.id_operacion = o.id_operacion
  AND t.estado_operacion_creacion IS NULL;

CREATE INDEX IF NOT EXISTS idx_media_stream_session_estado_operacion_creacion
  ON media_stream_session(id_operacion, estado_operacion_creacion);

CREATE INDEX IF NOT EXISTS idx_media_stream_recording_estado_operacion_creacion
  ON media_stream_recording(id_operacion, estado_operacion_creacion);
