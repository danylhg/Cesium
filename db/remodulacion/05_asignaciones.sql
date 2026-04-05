-- =========================================================
-- 05_asignaciones.sql
-- Tablas puente y asignaciones de operación
-- =========================================================

-- Personal <-> Equipo (inventario entregado a personal)
CREATE TABLE IF NOT EXISTS personal_equipo (
  id_personal INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  id_equipo INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
  cantidad INT NOT NULL DEFAULT 1,
  estado estado_asig_equipo_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_devolucion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_personal, id_equipo),
  CHECK (cantidad > 0),
  CHECK (fecha_devolucion IS NULL OR fecha_devolucion >= fecha_asignacion)
);

-- Vehiculo <-> Equipo (equipo instalado a un vehículo)
CREATE TABLE IF NOT EXISTS vehiculo_equipo (
  id_vehiculo INT NOT NULL REFERENCES vehiculo(id_vehiculo) ON DELETE CASCADE,
  id_equipo INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
  cantidad INT NOT NULL DEFAULT 1,
  estado estado_instalacion_enum NOT NULL DEFAULT 'INSTALADO',
  fecha_instalacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_retiro TIMESTAMPTZ,
  PRIMARY KEY (id_vehiculo, id_equipo),
  CHECK (cantidad > 0),
  CHECK (fecha_retiro IS NULL OR fecha_retiro >= fecha_instalacion)
);

-- Operación <-> Personal
CREATE TABLE IF NOT EXISTS asignacion_operacion_personal (
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_personal INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  rol_en_operacion TEXT,
  estado_asignacion estado_asignacion_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_operacion, id_personal),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion)
);

-- Operación <-> Vehículo
CREATE TABLE IF NOT EXISTS vehiculo_operacion (
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_vehiculo INT NOT NULL REFERENCES vehiculo(id_vehiculo) ON DELETE RESTRICT,
  id_personal INT REFERENCES personal(id_personal) ON DELETE SET NULL,
  uso_en_operacion TEXT,
  estado_asignacion estado_asig_vehiculo_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_operacion, id_vehiculo),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion)
);

-- Operación <-> Equipo
CREATE TABLE IF NOT EXISTS operacion_equipo (
  id_operacion_equipo SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_equipo INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
  id_personal INT REFERENCES personal(id_personal) ON DELETE SET NULL,
  id_vehiculo INT REFERENCES vehiculo(id_vehiculo) ON DELETE SET NULL,
  cantidad INT NOT NULL DEFAULT 1,
  uso_en_operacion TEXT,
  estado_asignacion estado_asig_equipo_operacion_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  CONSTRAINT uq_operacion_equipo UNIQUE (id_operacion, id_equipo),
  CHECK (cantidad > 0),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion)
);

-- Uso de equipo por persona dentro de operación
CREATE TABLE IF NOT EXISTS uso_equipo_operacion (
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_equipo INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
  id_personal INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  cantidad INT NOT NULL DEFAULT 1,
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_devolucion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  notas TEXT,
  PRIMARY KEY (id_operacion, id_equipo, id_personal),
  CHECK (cantidad > 0),
  CHECK (fecha_devolucion IS NULL OR fecha_devolucion >= fecha_asignacion)
);

-- Asegura que el equipo usado en operación exista previamente en operacion_equipo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_uso_equipo_operacion_a_operacion_equipo'
  ) THEN
    ALTER TABLE uso_equipo_operacion
      ADD CONSTRAINT fk_uso_equipo_operacion_a_operacion_equipo
      FOREIGN KEY (id_operacion, id_equipo)
      REFERENCES operacion_equipo (id_operacion, id_equipo)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_asig_op_personal
  ON asignacion_operacion_personal(id_personal);

CREATE INDEX IF NOT EXISTS idx_veh_op_op
  ON vehiculo_operacion(id_operacion);

CREATE INDEX IF NOT EXISTS idx_op_eq_busqueda
  ON operacion_equipo(id_operacion, id_equipo);

CREATE INDEX IF NOT EXISTS idx_uso_eq_op_operacion
  ON uso_equipo_operacion(id_operacion);

CREATE INDEX IF NOT EXISTS idx_uso_eq_op_personal
  ON uso_equipo_operacion(id_personal);

