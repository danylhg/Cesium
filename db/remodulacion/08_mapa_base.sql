-- =========================================================
-- 08_mapa_base.sql
-- Mapa base: puntos de interes y zona de operacion
-- =========================================================

CREATE TABLE IF NOT EXISTS puntos_interes (
  id_poi SERIAL PRIMARY KEY,

  tipo_creador tipo_participante_enum NOT NULL,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_personal INT REFERENCES personal(id_personal) ON DELETE CASCADE,

  nombre TEXT NOT NULL,
  tipo_poi TEXT NOT NULL,
  latitud NUMERIC(9,6) NOT NULL,
  longitud NUMERIC(9,6) NOT NULL,
  descripcion TEXT,
  color TEXT NOT NULL DEFAULT '#FFD700',
  icono_src TEXT,
  sidc TEXT,
  id_operacion INT REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (tipo_creador='USUARIO'  AND id_usuario IS NOT NULL  AND id_personal IS NULL) OR
    (tipo_creador='PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_poi_usuario
  ON puntos_interes(id_usuario, id_operacion, nombre)
  WHERE id_usuario IS NOT NULL AND activo = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_poi_personal
  ON puntos_interes(id_personal, id_operacion, nombre)
  WHERE id_personal IS NOT NULL AND activo = TRUE;

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

CREATE INDEX IF NOT EXISTS idx_dibujo_libre_operacion_activo
  ON dibujo_libre_operacion(id_operacion, activo, fecha_creacion DESC);
