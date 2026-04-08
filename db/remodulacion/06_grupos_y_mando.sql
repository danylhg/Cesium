-- =========================================================
-- 06_grupos_y_mando.sql
-- Grupos dentro de operación y asignación de recursos por grupo
-- =========================================================

CREATE TABLE IF NOT EXISTS grupo_operacion (
  id_grupo_operacion SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  nombre TEXT NOT NULL,
  apodo TEXT,

  id_grupo_padre INT REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE CASCADE,

  descripcion TEXT,
  creado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_grupo_operacion_nombre UNIQUE (id_operacion, nombre),

  CONSTRAINT uq_grupo_operacion_operacion_grupo UNIQUE (id_operacion, id_grupo_operacion),

  CONSTRAINT fk_grupo_padre_misma_operacion
    FOREIGN KEY (id_operacion, id_grupo_padre)
    REFERENCES grupo_operacion (id_operacion, id_grupo_operacion)
    ON DELETE CASCADE,

  CONSTRAINT chk_grupo_no_autopadre
    CHECK (id_grupo_padre IS NULL OR id_grupo_padre <> id_grupo_operacion)
);

CREATE INDEX IF NOT EXISTS idx_grupo_operacion_padre
  ON grupo_operacion (id_grupo_padre);

CREATE TABLE IF NOT EXISTS grupo_personal (
  id_grupo_operacion INT NOT NULL REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE CASCADE,
  id_personal INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  rol_en_grupo TEXT,
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_grupo_operacion, id_personal)
);

CREATE TABLE IF NOT EXISTS grupo_equipo (
  id_grupo_operacion INT NOT NULL REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE CASCADE,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_equipo INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,

  cantidad INT NOT NULL DEFAULT 1,
  uso_en_grupo TEXT,
  estado_asignacion estado_asig_equipo_operacion_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,

  PRIMARY KEY (id_grupo_operacion, id_equipo),
  CHECK (cantidad > 0),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion),

  CONSTRAINT fk_grupo_equipo_a_operacion_equipo
    FOREIGN KEY (id_operacion, id_equipo)
    REFERENCES operacion_equipo (id_operacion, id_equipo)
    ON DELETE CASCADE
);

-- TABLA MODIFICADA: Ahora vincula Vehículo -> Persona -> Grupo
CREATE TABLE IF NOT EXISTS grupo_vehiculo (
  id_grupo_operacion INT NOT NULL REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE CASCADE,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_vehiculo INT NOT NULL REFERENCES vehiculo(id_vehiculo) ON DELETE RESTRICT,
  id_personal INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE, -- El responsable humano

  uso_en_grupo TEXT,
  estado_asignacion estado_asig_vehiculo_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,

  -- La PK ahora incluye a la persona para permitir la jerarquía de responsables
  PRIMARY KEY (id_grupo_operacion, id_vehiculo, id_personal),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion),

  -- FK ajustada a la nueva PK de vehiculo_operacion
  CONSTRAINT fk_grupo_vehiculo_a_vehiculo_operacion
    FOREIGN KEY (id_operacion, id_vehiculo, id_personal)
    REFERENCES vehiculo_operacion (id_operacion, id_vehiculo, id_personal)
    ON DELETE CASCADE,

  -- Asegura que la persona responsable realmente pertenezca a este grupo
  CONSTRAINT fk_grupo_vehiculo_personal_en_grupo
    FOREIGN KEY (id_grupo_operacion, id_personal)
    REFERENCES grupo_personal (id_grupo_operacion, id_personal)
    ON DELETE CASCADE
);

DROP INDEX IF EXISTS uq_grupo_vehiculo_unico_por_operacion;

CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_equipo_unico_por_operacion
  ON grupo_equipo (id_operacion, id_equipo);

  -- =========================================================
-- Jerarquía de mando (CET -> CELL)
-- =========================================================

CREATE TABLE IF NOT EXISTS mando_operacion (
  id_operacion  INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_cet        INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  id_cell       INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,

  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  asignado_por     INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,

  CONSTRAINT pk_mando_operacion PRIMARY KEY (id_operacion, id_cell),
  CONSTRAINT chk_mando_distinto CHECK (id_cet <> id_cell),

  CONSTRAINT fk_mando_cet_en_operacion
    FOREIGN KEY (id_operacion, id_cet)
    REFERENCES asignacion_operacion_personal (id_operacion, id_personal)
    ON DELETE CASCADE,

  CONSTRAINT fk_mando_cell_en_operacion
    FOREIGN KEY (id_operacion, id_cell)
    REFERENCES asignacion_operacion_personal (id_operacion, id_personal)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mando_operacion_cet
  ON mando_operacion (id_operacion, id_cet);

CREATE INDEX IF NOT EXISTS idx_mando_operacion_cell
  ON mando_operacion (id_operacion, id_cell);