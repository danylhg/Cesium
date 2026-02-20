-- =========================================================
-- 1) TIPOS ENUM
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario_enum') THEN
    CREATE TYPE rol_usuario_enum AS ENUM ('ADMIN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_personal_enum') THEN
    CREATE TYPE rol_personal_enum AS ENUM ('CUT','CET','CELL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_participante_enum') THEN
    CREATE TYPE tipo_participante_enum AS ENUM ('USUARIO','PERSONAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_equipo_enum') THEN
    CREATE TYPE estado_equipo_enum AS ENUM ('DISPONIBLE','ASIGNADO','MANTENIMIENTO','BAJA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_equipo_enum') THEN
    CREATE TYPE estado_asig_equipo_enum AS ENUM ('ASIGNADO','DEVUELTO','DAÑADO','PERDIDO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_vehiculo_enum') THEN
    CREATE TYPE estado_vehiculo_enum AS ENUM ('DISPONIBLE','ASIGNADO','MANTENIMIENTO','BAJA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_instalacion_enum') THEN
    CREATE TYPE estado_instalacion_enum AS ENUM ('INSTALADO','RETIRADO','DAÑADO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prioridad_operacion_enum') THEN
    CREATE TYPE prioridad_operacion_enum AS ENUM ('BAJA','MEDIA','ALTA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_operacion_enum') THEN
    CREATE TYPE estado_operacion_enum AS ENUM ('PLANIFICADA','ACTIVA','CERRADA','CANCELADA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asignacion_enum') THEN
    CREATE TYPE estado_asignacion_enum AS ENUM ('ASIGNADO','CONFIRMADO','EN_CURSO','LIBERADO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_mensaje_enum') THEN
    CREATE TYPE tipo_mensaje_enum AS ENUM ('NORMAL','SISTEMA','URGENTE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_vehiculo_enum') THEN
    CREATE TYPE estado_asig_vehiculo_enum AS ENUM ('ASIGNADO','EN_USO','LIBERADO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_equipo_operacion_enum') THEN
    CREATE TYPE estado_asig_equipo_operacion_enum AS ENUM ('ASIGNADO','EN_USO','LIBERADO','PERDIDO','DAÑADO');
  END IF;
END $$;


-- =========================================================
-- 2) TABLAS BASE (USUARIOS / PERSONAL)
-- =========================================================
CREATE TABLE IF NOT EXISTS usuario (
  id_usuario SERIAL PRIMARY KEY,
  rol rol_usuario_enum NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  puesto TEXT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_acceso TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS personal (
  id_personal SERIAL PRIMARY KEY,
  rol rol_personal_enum NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  puesto TEXT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  ultimo_acceso TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS puntos_interes (
  id_poi SERIAL PRIMARY KEY,
  id_usuario INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_personal INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo_poi TEXT NOT NULL,
  latitud NUMERIC(9,6) NOT NULL,
  longitud NUMERIC(9,6) NOT NULL,
  descripcion TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- 3) INVENTARIO (EQUIPO / SUBTIPOS / VEHICULO)
-- =========================================================
CREATE TABLE IF NOT EXISTS equipo (
  id_equipo SERIAL PRIMARY KEY,
  numero_serie TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  estado estado_equipo_enum NOT NULL DEFAULT 'DISPONIBLE'
);

CREATE TABLE IF NOT EXISTS equipo_comunicacion (
  id_equipo INT PRIMARY KEY REFERENCES equipo(id_equipo) ON DELETE CASCADE,
  imagen_eqcom TEXT,
  marca TEXT,
  modelo TEXT,
  notas TEXT
);

CREATE TABLE IF NOT EXISTS equipo_tactico (
  id_equipo INT PRIMARY KEY REFERENCES equipo(id_equipo) ON DELETE CASCADE,
  imagen_eqtac TEXT,
  tipo_tactico TEXT,
  calibre TEXT,
  nivel TEXT,
  notas TEXT
);

CREATE TABLE IF NOT EXISTS vehiculo (
  id_vehiculo SERIAL PRIMARY KEY,
  imagen_veh TEXT,
  codigo_interno TEXT NOT NULL UNIQUE,
  marca TEXT,
  modelo TEXT,
  estado estado_vehiculo_enum NOT NULL DEFAULT 'DISPONIBLE',
  capacidad INT
);


-- =========================================================
-- 4) OPERACIÓN
-- =========================================================
CREATE TABLE IF NOT EXISTS operacion (
  id_operacion SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  prioridad prioridad_operacion_enum NOT NULL DEFAULT 'MEDIA',
  estado estado_operacion_enum NOT NULL DEFAULT 'PLANIFICADA',
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creada_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);


-- =========================================================
-- 5) TABLAS PUENTE / ASIGNACIONES (OPERACIÓN)
-- =========================================================

-- Personal <-> Equipo (inventario entregado a personal, fuera o dentro de operación)
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
  uso_en_operacion TEXT,
  estado_asignacion estado_asig_vehiculo_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_operacion, id_vehiculo),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion)
);

-- Operación <-> Equipo (inventario “reservado” para la operación)
CREATE TABLE IF NOT EXISTS operacion_equipo (
  id_operacion_equipo SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_equipo INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
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

-- Uso de equipo por persona dentro de operación (equipo “en mano”)
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

-- Asegura: si alguien usa (id_operacion,id_equipo), ese equipo ya debe estar en operacion_equipo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_uso_equipo_operacion_a_operacion_equipo'
  ) THEN
    ALTER TABLE uso_equipo_operacion
      ADD CONSTRAINT fk_uso_equipo_operacion_a_operacion_equipo
      FOREIGN KEY (id_operacion, id_equipo)
      REFERENCES operacion_equipo (id_operacion, id_equipo)
      ON DELETE CASCADE;
  END IF;
END $$;


-- =========================================================
-- 6) GRUPOS DENTRO DE OPERACIÓN (N GRUPOS POR OPERACIÓN)
-- =========================================================

-- Un grupo pertenece a una operación
CREATE TABLE IF NOT EXISTS grupo_operacion (
  id_grupo_operacion SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  creado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_grupo_operacion_nombre UNIQUE (id_operacion, nombre)
);

-- Miembros del grupo (CET/CELL/CUT si quieres), y rol dentro del grupo
CREATE TABLE IF NOT EXISTS grupo_personal (
  id_grupo_operacion INT NOT NULL REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE CASCADE,
  id_personal INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  rol_en_grupo TEXT,
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_grupo_operacion, id_personal)
);

-- Equipo asignado a un grupo, pero solo si ya está asignado a la operación (confirmación)
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

  -- “Confirmación”: este equipo debe existir en operacion_equipo para esa operación
  CONSTRAINT fk_grupo_equipo_a_operacion_equipo
    FOREIGN KEY (id_operacion, id_equipo)
    REFERENCES operacion_equipo (id_operacion, id_equipo)
    ON DELETE CASCADE
);

-- Vehículo asignado a un grupo, pero solo si ya está asignado a la operación (confirmación)
CREATE TABLE IF NOT EXISTS grupo_vehiculo (
  id_grupo_operacion INT NOT NULL REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE CASCADE,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_vehiculo INT NOT NULL REFERENCES vehiculo(id_vehiculo) ON DELETE RESTRICT,

  uso_en_grupo TEXT,
  estado_asignacion estado_asig_vehiculo_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,

  PRIMARY KEY (id_grupo_operacion, id_vehiculo),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion),

  -- “Confirmación”: este vehículo debe existir en vehiculo_operacion para esa operación
  CONSTRAINT fk_grupo_vehiculo_a_vehiculo_operacion
    FOREIGN KEY (id_operacion, id_vehiculo)
    REFERENCES vehiculo_operacion (id_operacion, id_vehiculo)
    ON DELETE CASCADE
);

-- Regla útil: un vehículo NO puede estar en 2 grupos de la misma operación
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_vehiculo_unico_por_operacion
  ON grupo_vehiculo (id_operacion, id_vehiculo);

-- Regla útil: un equipo NO puede estar en 2 grupos de la misma operación (si quieres permitirlo, quita este índice)
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_equipo_unico_por_operacion
  ON grupo_equipo (id_operacion, id_equipo);

CREATE OR REPLACE FUNCTION fn_validar_grupo_operacion_consistente()
RETURNS TRIGGER AS $$
DECLARE
  op_grupo INT;
BEGIN
  SELECT id_operacion INTO op_grupo
  FROM grupo_operacion
  WHERE id_grupo_operacion = NEW.id_grupo_operacion;

  IF op_grupo IS NULL THEN
    RAISE EXCEPTION 'No existe grupo_operacion id=%', NEW.id_grupo_operacion;
  END IF;

  IF NEW.id_operacion <> op_grupo THEN
    RAISE EXCEPTION 'id_operacion (%) no coincide con la operación del grupo (%)', NEW.id_operacion, op_grupo;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_grupo_equipo_op_consistente') THEN
    CREATE TRIGGER tr_grupo_equipo_op_consistente
    BEFORE INSERT OR UPDATE ON grupo_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_grupo_operacion_consistente();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_grupo_vehiculo_op_consistente') THEN
    CREATE TRIGGER tr_grupo_vehiculo_op_consistente
    BEFORE INSERT OR UPDATE ON grupo_vehiculo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_grupo_operacion_consistente();
  END IF;
END $$;


-- =========================================================
-- 6.X) JERARQUÍA DE MANDO EN OPERACIÓN (CELL -> CET)
-- =========================================================

CREATE TABLE IF NOT EXISTS mando_operacion (
  id_operacion  INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_cet        INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  id_cell       INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,

  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  asignado_por     INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,

  -- Cada CELL solo puede tener 1 CET por operación
  CONSTRAINT pk_mando_operacion PRIMARY KEY (id_operacion, id_cell),

  -- Evita que se asignen a sí mismos
  CONSTRAINT chk_mando_distinto CHECK (id_cet <> id_cell),

  -- Confirma que ambos (CET y CELL) estén asignados a la operación
  CONSTRAINT fk_mando_cet_en_operacion
    FOREIGN KEY (id_operacion, id_cet)
    REFERENCES asignacion_operacion_personal (id_operacion, id_personal)
    ON DELETE CASCADE,

  CONSTRAINT fk_mando_cell_en_operacion
    FOREIGN KEY (id_operacion, id_cell)
    REFERENCES asignacion_operacion_personal (id_operacion, id_personal)
    ON DELETE CASCADE
);

-- Índices útiles para consultas (ver cells de un CET, etc.)
CREATE INDEX IF NOT EXISTS idx_mando_operacion_cet
  ON mando_operacion (id_operacion, id_cet);

CREATE INDEX IF NOT EXISTS idx_mando_operacion_cell
  ON mando_operacion (id_operacion, id_cell);

-- =========================================================
-- VALIDACIÓN: el mando debe ser CET y el subordinado debe ser CELL
-- (CHECK no puede consultar otras tablas, por eso usamos trigger)
-- =========================================================

CREATE OR REPLACE FUNCTION fn_validar_mando_operacion()
RETURNS TRIGGER AS $$
DECLARE
  rol_cet  rol_personal_enum;
  rol_cell rol_personal_enum;
BEGIN
  SELECT p.rol INTO rol_cet
  FROM personal p
  WHERE p.id_personal = NEW.id_cet;

  SELECT p.rol INTO rol_cell
  FROM personal p
  WHERE p.id_personal = NEW.id_cell;

  IF rol_cet IS NULL THEN
    RAISE EXCEPTION 'id_cet % no existe en personal', NEW.id_cet;
  END IF;

  IF rol_cell IS NULL THEN
    RAISE EXCEPTION 'id_cell % no existe en personal', NEW.id_cell;
  END IF;

  IF rol_cet <> 'CET' THEN
    RAISE EXCEPTION 'El mando debe ser CET. id_cet=% tiene rol=%', NEW.id_cet, rol_cet;
  END IF;

  IF rol_cell <> 'CELL' THEN
    RAISE EXCEPTION 'El subordinado debe ser CELL. id_cell=% tiene rol=%', NEW.id_cell, rol_cell;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'tr_validar_mando_operacion'
  ) THEN
    CREATE TRIGGER tr_validar_mando_operacion
    BEFORE INSERT OR UPDATE ON mando_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_mando_operacion();
  END IF;
END $$;

-- =========================================================
-- 7) CHAT OPERACIONAL
-- =========================================================
CREATE TABLE IF NOT EXISTS chat_operacion (
  id_chat SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL UNIQUE REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_cierre TIMESTAMPTZ,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (fecha_cierre IS NULL OR fecha_cierre >= fecha_creacion)
);

CREATE TABLE IF NOT EXISTS participante_chat (
  id_participante SERIAL PRIMARY KEY,
  id_chat INT NOT NULL REFERENCES chat_operacion(id_chat) ON DELETE CASCADE,
  tipo tipo_participante_enum NOT NULL,
  id_usuario INT REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_personal INT REFERENCES personal(id_personal) ON DELETE CASCADE,
  CHECK (
    (tipo='USUARIO' AND id_usuario IS NOT NULL AND id_personal IS NULL) OR
    (tipo='PERSONAL' AND id_personal IS NOT NULL AND id_usuario IS NULL)
  ),
  UNIQUE (id_chat, id_usuario),
  UNIQUE (id_chat, id_personal)
);

CREATE TABLE IF NOT EXISTS mensaje_chat (
  id_mensaje SERIAL PRIMARY KEY,
  id_chat INT NOT NULL REFERENCES chat_operacion(id_chat) ON DELETE CASCADE,
  id_participante INT NOT NULL REFERENCES participante_chat(id_participante) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  tipo_mensaje tipo_mensaje_enum NOT NULL DEFAULT 'NORMAL',
  fecha_envio TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- 8) ÍNDICES ÚTILES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_poi_usuario           ON puntos_interes(id_usuario);
CREATE INDEX IF NOT EXISTS idx_asig_op_personal      ON asignacion_operacion_personal(id_personal);
CREATE INDEX IF NOT EXISTS idx_veh_op_op             ON vehiculo_operacion(id_operacion);
CREATE INDEX IF NOT EXISTS idx_op_eq_busqueda        ON operacion_equipo(id_operacion, id_equipo);
CREATE INDEX IF NOT EXISTS idx_uso_eq_op_operacion   ON uso_equipo_operacion(id_operacion);
CREATE INDEX IF NOT EXISTS idx_uso_eq_op_personal    ON uso_equipo_operacion(id_personal);


-- =========================================================
-- 9) SEED (INVENTARIO)
-- =========================================================
INSERT INTO vehiculo (imagen_veh, codigo_interno, marca, modelo, estado)
VALUES
('./uploads/vehiculo/Alacran.jpeg','VH-001','Alacran','Táctico','DISPONIBLE'),
('./uploads/vehiculo/Dron vant 01.jpeg','VH-002','Dron','VANT 01','DISPONIBLE'),
('./uploads/vehiculo/Ford F-150.jpeg','VH-003','Ford','F-150','DISPONIBLE'),
('./uploads/vehiculo/Panther.jpeg','VH-004','Panther','Blindado','DISPONIBLE'),
('./uploads/vehiculo/Scualo.jpeg','VH-005','Scualo','Interceptor','DISPONIBLE')
ON CONFLICT (codigo_interno) DO NOTHING;

INSERT INTO equipo (numero_serie, nombre, categoria, estado)
VALUES ('HFC-001','Harris Falcon','COMUNICACION','DISPONIBLE')
ON CONFLICT (numero_serie) DO NOTHING;

-- Nota: currval funciona si el INSERT anterior realmente insertó en esta ejecución.
-- Si ya existía (ON CONFLICT DO NOTHING), currval NO cambia.
-- Para seed robusto, insertamos el subtipo apuntando por lookup al número_serie:

INSERT INTO equipo_comunicacion (id_equipo, imagen_eqcom, marca, modelo, notas)
SELECT
  e.id_equipo,
  './uploads/equipo/comunicacion/Harris Falcon.jpeg',
  'Harris',
  'Falcon III',
  'Radio táctico multibanda'
FROM equipo e
WHERE e.numero_serie = 'HFC-001'
ON CONFLICT (id_equipo) DO NOTHING;
