-- =========================================================
-- 11_novedades_y_avisos.sql
-- Avisos operacionales y novedades
-- =========================================================

CREATE TABLE IF NOT EXISTS aviso_operacion (
  id_aviso SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  id_personal_emisor INT NOT NULL
    REFERENCES personal(id_personal) ON DELETE CASCADE,

  tipo_receptor tipo_participante_enum,
  id_personal_receptor INT REFERENCES personal(id_personal) ON DELETE SET NULL,
  id_usuario_receptor INT REFERENCES usuario(id_usuario) ON DELETE SET NULL,

  tipo_aviso tipo_aviso_enum NOT NULL DEFAULT 'INFORMATIVO',
  contenido TEXT NOT NULL,
  estado estado_aviso_enum NOT NULL DEFAULT 'ENVIADO',

  fecha_envio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_atencion TIMESTAMPTZ,

  CHECK (
    fecha_atencion IS NULL OR fecha_atencion >= fecha_envio
  ),
  CHECK (
    (tipo_receptor IS NULL) OR
    (tipo_receptor = 'PERSONAL' AND id_personal_receptor IS NOT NULL AND id_usuario_receptor IS NULL) OR
    (tipo_receptor = 'USUARIO'  AND id_usuario_receptor  IS NOT NULL AND id_personal_receptor IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_aviso_operacion
  ON aviso_operacion(id_operacion, fecha_envio DESC);

CREATE INDEX IF NOT EXISTS idx_aviso_receptor_personal
  ON aviso_operacion(id_personal_receptor)
  WHERE id_personal_receptor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aviso_receptor_usuario
  ON aviso_operacion(id_usuario_receptor)
  WHERE id_usuario_receptor IS NOT NULL;

  -- =========================================================
-- Novedades operacionales
-- =========================================================

CREATE TABLE IF NOT EXISTS novedad_operacion (
  id_novedad SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  tipo_creador tipo_participante_enum NOT NULL,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  id_personal INT REFERENCES personal(id_personal) ON DELETE SET NULL,

  tipo_novedad tipo_novedad_enum NOT NULL DEFAULT 'OTRO',
  titulo TEXT NOT NULL,
  descripcion TEXT,
  solo_mando BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (tipo_creador = 'USUARIO'  AND id_usuario  IS NOT NULL AND id_personal IS NULL) OR
    (tipo_creador = 'PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_novedad_operacion
  ON novedad_operacion(id_operacion, fecha_registro DESC);