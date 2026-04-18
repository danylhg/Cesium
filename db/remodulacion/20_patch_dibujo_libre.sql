-- =========================================================
-- 20_patch_dibujo_libre.sql
-- Persistencia de dibujo libre tactico
-- Para entornos existentes que no tienen esta tabla aún.
-- =========================================================

CREATE TABLE IF NOT EXISTS dibujo_libre_operacion (
  id_dibujo      SERIAL PRIMARY KEY,
  tipo_creador   tipo_participante_enum NOT NULL,
  id_usuario     INT REFERENCES usuario(id_usuario)   ON DELETE CASCADE,
  id_personal    INT REFERENCES personal(id_personal) ON DELETE CASCADE,
  id_operacion   INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  puntos         JSONB NOT NULL DEFAULT '[]'::jsonb,
  color          TEXT NOT NULL DEFAULT '#FFFFFF',
  grosor         NUMERIC(6,2) NOT NULL DEFAULT 3,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (tipo_creador='USUARIO'  AND id_usuario IS NOT NULL  AND id_personal IS NULL) OR
    (tipo_creador='PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_dibujo_libre_operacion_activo
  ON dibujo_libre_operacion(id_operacion, activo, fecha_creacion DESC);
