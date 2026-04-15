-- =========================================================
-- 20_patch_dibujo_libre.sql
-- Persistencia de dibujo libre tactico
-- =========================================================

CREATE TABLE IF NOT EXISTS dibujo_libre_operacion (
  id_dibujo SERIAL PRIMARY KEY,
  tipo_creador tipo_participante_enum NOT NULL,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_personal INT REFERENCES personal(id_personal) ON DELETE CASCADE,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  puntos JSONB NOT NULL DEFAULT '[]'::jsonb,
  color TEXT NOT NULL DEFAULT '#FFFFFF',
  grosor NUMERIC(6,2) NOT NULL DEFAULT 3,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (tipo_creador='USUARIO'  AND id_usuario IS NOT NULL  AND id_personal IS NULL) OR
    (tipo_creador='PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

ALTER TABLE dibujo_libre_operacion
  ALTER COLUMN puntos SET DEFAULT '[]'::jsonb;

ALTER TABLE dibujo_libre_operacion
  ALTER COLUMN color SET DEFAULT '#FFFFFF';

ALTER TABLE dibujo_libre_operacion
  ALTER COLUMN grosor SET DEFAULT 3;

ALTER TABLE dibujo_libre_operacion
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE dibujo_libre_operacion
  ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_dibujo_libre_operacion_activo
  ON dibujo_libre_operacion(id_operacion, activo, fecha_creacion DESC);
