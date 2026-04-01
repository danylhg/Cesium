-- =========================================================
-- 09_mapa_avanzado.sql
-- Capas geoespaciales avanzadas
-- =========================================================

CREATE TABLE IF NOT EXISTS area_interes (
  id_area SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  tipo_creador tipo_participante_enum NOT NULL,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_personal INT REFERENCES personal(id_personal) ON DELETE CASCADE,

  nombre TEXT NOT NULL,
  descripcion TEXT,
  geometria JSONB NOT NULL,
  color TEXT NOT NULL DEFAULT '#FF4500',
  estado estado_area_enum NOT NULL DEFAULT 'ACTIVA',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (tipo_creador = 'USUARIO'  AND id_usuario  IS NOT NULL AND id_personal IS NULL) OR
    (tipo_creador = 'PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_area_operacion
  ON area_interes(id_operacion);

CREATE INDEX IF NOT EXISTS idx_area_estado
  ON area_interes(id_operacion, estado);

CREATE TABLE IF NOT EXISTS ruta_operacion (
  id_ruta SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  tipo_creador tipo_participante_enum NOT NULL,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_personal INT REFERENCES personal(id_personal) ON DELETE CASCADE,

  nombre TEXT NOT NULL,
  descripcion TEXT,
  geometria JSONB NOT NULL,
  color TEXT NOT NULL DEFAULT '#1E90FF',
  estado estado_ruta_enum NOT NULL DEFAULT 'PLANIFICADA',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (tipo_creador = 'USUARIO'  AND id_usuario  IS NOT NULL AND id_personal IS NULL) OR
    (tipo_creador = 'PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ruta_operacion_id_operacion
  ON ruta_operacion(id_operacion);

CREATE INDEX IF NOT EXISTS idx_ruta_operacion_fecha
  ON ruta_operacion(id_operacion, fecha_creacion DESC);

CREATE TABLE IF NOT EXISTS marca_edificio (
  id_marca SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  tipo_creador tipo_participante_enum NOT NULL,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_personal INT REFERENCES personal(id_personal) ON DELETE CASCADE,

  nombre TEXT NOT NULL,
  tipo_estructura TEXT NOT NULL,
  latitud NUMERIC(8,5) NOT NULL,
  longitud NUMERIC(9,5) NOT NULL,

  estado estado_edificio_enum NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_marca_latitud CHECK (latitud BETWEEN -90 AND 90),
  CONSTRAINT chk_marca_longitud CHECK (longitud BETWEEN -180 AND 180),

  CHECK (
    (tipo_creador = 'USUARIO'  AND id_usuario  IS NOT NULL AND id_personal IS NULL) OR
    (tipo_creador = 'PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_marca_edificio_operacion
  ON marca_edificio(id_operacion);

CREATE INDEX IF NOT EXISTS idx_marca_edificio_tipo
  ON marca_edificio(id_operacion, tipo_estructura);

  -- =========================================================
-- RUTA DE NAVEGACIÓN
-- =========================================================
CREATE TABLE IF NOT EXISTS ruta_navegacion (
  id_ruta SERIAL PRIMARY KEY,

  id_operacion INTEGER NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  geojson JSONB NOT NULL,

  origen_lat  DOUBLE PRECISION NOT NULL,
  origen_lon  DOUBLE PRECISION NOT NULL,
  destino_lat DOUBLE PRECISION NOT NULL,
  destino_lon DOUBLE PRECISION NOT NULL,

  distancia_m DOUBLE PRECISION,
  duracion_s  DOUBLE PRECISION,

  created_by_tipo VARCHAR(10)
    CHECK (created_by_tipo IN ('USUARIO','PERSONAL')),

  id_usuario  INTEGER REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  id_personal INTEGER REFERENCES personal(id_personal) ON DELETE SET NULL,

  activo BOOLEAN NOT NULL DEFAULT true,
  fecha_eliminacion TIMESTAMP NULL,
  eliminado_por_tipo VARCHAR(20) NULL,
  id_usuario_elim INTEGER NULL,
  id_personal_elim INTEGER NULL,

  fecha_creacion TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_creador_ruta_nav CHECK (
    (created_by_tipo = 'USUARIO'  AND id_usuario  IS NOT NULL AND id_personal IS NULL)
    OR
    (created_by_tipo = 'PERSONAL' AND id_personal IS NOT NULL AND id_usuario IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ruta_navegacion_op
  ON ruta_navegacion(id_operacion);

CREATE INDEX IF NOT EXISTS idx_ruta_navegacion_fecha
  ON ruta_navegacion(fecha_creacion DESC);