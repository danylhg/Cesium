-- =========================================================
-- 21_patch_operacion_evento.sql
-- Bitacora/timeline para replay de operaciones cerradas.
-- Guarda eventos normalizados de mapa, chat, rutas y otros cambios.
-- =========================================================

CREATE TABLE IF NOT EXISTS operacion_evento (
  id_evento BIGSERIAL PRIMARY KEY,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  tipo_evento TEXT NOT NULL,
  entidad_tipo TEXT NOT NULL,
  entidad_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_tipo TEXT,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  id_personal INT REFERENCES personal(id_personal) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operacion_evento_op_time
  ON operacion_evento(id_operacion, occurred_at ASC, id_evento ASC);

CREATE INDEX IF NOT EXISTS idx_operacion_evento_entidad
  ON operacion_evento(id_operacion, entidad_tipo, entidad_id);
