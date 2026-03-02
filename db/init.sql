-- =========================================================
-- INIT.SQL — Operaciones (PostgreSQL)
-- Usuarios (CUT/admin) + Personal (CET/CELL)
-- Inventario (equipo/vehiculo) + Operación + Asignaciones
-- Grupos jerárquicos: Grupo padre (apodo) -> Subgrupos (Águila 1, Águila 2)
-- Asignación de equipo/vehículo SOLO a subgrupos
-- =========================================================

-- (Opcional) si quieres limpiar todo y recrear:
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;

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
  apodo TEXT NOT NULL UNIQUE,
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
-- 6) GRUPOS DENTRO DE OPERACIÓN (PADRE -> SUBGRUPOS)
-- =========================================================

-- Grupo padre: id_grupo_padre = NULL (apodo ej: "Águila")
-- Subgrupo: id_grupo_padre = id del padre (nombre ej: "Águila 1")
CREATE TABLE IF NOT EXISTS grupo_operacion (
  id_grupo_operacion SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  nombre TEXT NOT NULL,
  apodo TEXT, -- recomendado para el padre

  id_grupo_padre INT REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE CASCADE,

  descripcion TEXT,
  creado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_grupo_operacion_nombre UNIQUE (id_operacion, nombre),

  -- Necesario para que el FK compuesto sea válido
  CONSTRAINT uq_grupo_operacion_operacion_grupo UNIQUE (id_operacion, id_grupo_operacion),


  -- Si es subgrupo, obliga a que el padre sea de la misma operación
  CONSTRAINT fk_grupo_padre_misma_operacion
    FOREIGN KEY (id_operacion, id_grupo_padre)
    REFERENCES grupo_operacion (id_operacion, id_grupo_operacion)
    ON DELETE CASCADE,

  CONSTRAINT chk_grupo_no_autopadre
    CHECK (id_grupo_padre IS NULL OR id_grupo_padre <> id_grupo_operacion)
);

CREATE INDEX IF NOT EXISTS idx_grupo_operacion_padre
  ON grupo_operacion (id_grupo_padre);

-- Miembros del grupo (puedes decidir: asignar al padre o solo a subgrupos)
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

  -- Confirmación: debe existir en operacion_equipo para esa operación
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

  -- Confirmación: debe existir en vehiculo_operacion para esa operación
  CONSTRAINT fk_grupo_vehiculo_a_vehiculo_operacion
    FOREIGN KEY (id_operacion, id_vehiculo)
    REFERENCES vehiculo_operacion (id_operacion, id_vehiculo)
    ON DELETE CASCADE
);

-- Regla útil: un vehículo NO puede estar en 2 subgrupos de la misma operación
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_vehiculo_unico_por_operacion
  ON grupo_vehiculo (id_operacion, id_vehiculo);

-- Regla útil: un equipo NO puede estar en 2 subgrupos de la misma operación
CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_equipo_unico_por_operacion
  ON grupo_equipo (id_operacion, id_equipo);

-- =========================================================
-- VALIDACIÓN: id_operacion en grupo_equipo/grupo_vehiculo debe coincidir con la operación del grupo
-- =========================================================
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
-- VALIDACIÓN: SOLO SUBGRUPOS (hijos) reciben equipo/vehículo
-- =========================================================


-- =========================================================
-- VALIDACIÓN: SOLO SUBGRUPOS (hijos) reciben equipo/vehículo
-- =========================================================
CREATE OR REPLACE FUNCTION fn_solo_subgrupos_reciben_asignaciones()
RETURNS TRIGGER AS $$
DECLARE
  padre INT;
BEGIN
  SELECT id_grupo_padre INTO padre
  FROM grupo_operacion
  WHERE id_grupo_operacion = NEW.id_grupo_operacion;

  IF padre IS NULL THEN
    RAISE EXCEPTION 'No se permite asignar recursos al GRUPO PADRE (id_grupo_operacion=%). Asigna a un subgrupo.', NEW.id_grupo_operacion;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_grupo_equipo_solo_hijos') THEN
    CREATE TRIGGER tr_grupo_equipo_solo_hijos
    BEFORE INSERT OR UPDATE ON grupo_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_solo_subgrupos_reciben_asignaciones();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_grupo_vehiculo_solo_hijos') THEN
    CREATE TRIGGER tr_grupo_vehiculo_solo_hijos
    BEFORE INSERT OR UPDATE ON grupo_vehiculo
    FOR EACH ROW
    EXECUTE FUNCTION fn_solo_subgrupos_reciben_asignaciones();
  END IF;

  -- Si quieres que el personal también SOLO se asigne a subgrupos, descomenta:
  -- IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_grupo_personal_solo_hijos') THEN
  --   CREATE TRIGGER tr_grupo_personal_solo_hijos
  --   BEFORE INSERT OR UPDATE ON grupo_personal
  --   FOR EACH ROW
  --   EXECUTE FUNCTION fn_solo_subgrupos_reciben_asignaciones();
  -- END IF;
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

CREATE INDEX IF NOT EXISTS idx_mando_operacion_cet
  ON mando_operacion (id_operacion, id_cet);

CREATE INDEX IF NOT EXISTS idx_mando_operacion_cell
  ON mando_operacion (id_operacion, id_cell);

-- Validación: el mando debe ser CET y el subordinado debe ser CELL
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

-- Seed robusto del subtipo por lookup al número_serie:
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

-- =========================================================
-- EXTRA: VALIDACIÓN DE STOCK POR SUBGRUPOS
-- Regla: SUM(grupo_equipo.cantidad) <= operacion_equipo.cantidad
-- =========================================================

CREATE OR REPLACE FUNCTION fn_validar_stock_equipo_grupo()
RETURNS TRIGGER AS $$
DECLARE
  total_operacion INT;
  total_ya_asignado_grupos INT;
BEGIN
  -- Total reservado para la operación
  SELECT oe.cantidad
    INTO total_operacion
  FROM operacion_equipo oe
  WHERE oe.id_operacion = NEW.id_operacion
    AND oe.id_equipo    = NEW.id_equipo;

  IF total_operacion IS NULL THEN
    RAISE EXCEPTION
      'No existe operacion_equipo para (id_operacion=%, id_equipo=%). Primero asigna el equipo a la operación.',
      NEW.id_operacion, NEW.id_equipo;
  END IF;

  -- Total ya repartido a otros subgrupos (excluyendo el mismo grupo si es UPDATE)
  SELECT COALESCE(SUM(ge.cantidad), 0)
    INTO total_ya_asignado_grupos
  FROM grupo_equipo ge
  WHERE ge.id_operacion = NEW.id_operacion
    AND ge.id_equipo    = NEW.id_equipo
    AND ge.id_grupo_operacion <> NEW.id_grupo_operacion;

  IF (total_ya_asignado_grupos + NEW.cantidad) > total_operacion THEN
    RAISE EXCEPTION
      'Exceso de stock: Operación tiene %, ya repartido %, intento de añadir % (id_operacion=%, id_equipo=%).',
      total_operacion, total_ya_asignado_grupos, NEW.cantidad, NEW.id_operacion, NEW.id_equipo;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_validar_stock_equipo_grupo') THEN
    CREATE TRIGGER tr_validar_stock_equipo_grupo
    BEFORE INSERT OR UPDATE ON grupo_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_stock_equipo_grupo();
  END IF;
END $$;

-- =========================================================
-- VISTAS 
-- =========================================================

-- 1) Resumen de operación (dashboard)
CREATE OR REPLACE VIEW v_operacion_resumen AS
SELECT
  o.id_operacion,
  o.codigo,
  o.nombre,
  o.estado,
  o.prioridad,
  o.fecha_inicio,
  o.fecha_fin,
  o.fecha_creacion,
  o.creada_por,

  -- conteos (DISTINCT para evitar duplicados por joins)
  (SELECT COUNT(*) FROM asignacion_operacion_personal a
    WHERE a.id_operacion = o.id_operacion) AS total_personal,

  (SELECT COUNT(*) FROM vehiculo_operacion vo
    WHERE vo.id_operacion = o.id_operacion) AS total_vehiculos,

  (SELECT COALESCE(SUM(oe.cantidad),0) FROM operacion_equipo oe
    WHERE oe.id_operacion = o.id_operacion) AS total_equipos_reservados,

  (SELECT COUNT(*) FROM grupo_operacion g
    WHERE g.id_operacion = o.id_operacion) AS total_grupos
FROM operacion o;


-- 2) Árbol de grupos (padre/hijo) + etiqueta útil
CREATE OR REPLACE VIEW v_grupo_arbol AS
SELECT
  g.id_operacion,
  g.id_grupo_operacion,
  g.id_grupo_padre,
  gp.nombre  AS nombre_padre,
  gp.apodo   AS apodo_padre,
  g.nombre   AS nombre_grupo,
  g.apodo    AS apodo_grupo,
  CASE
    WHEN g.id_grupo_padre IS NULL THEN 'PADRE'
    ELSE 'SUBGRUPO'
  END AS tipo_grupo,
  -- etiqueta para UI
  CASE
    WHEN g.id_grupo_padre IS NULL THEN COALESCE(g.apodo, g.nombre)
    ELSE g.nombre
  END AS label_ui,
  g.descripcion,
  g.fecha_creacion,
  g.creado_por
FROM grupo_operacion g
LEFT JOIN grupo_operacion gp
  ON gp.id_grupo_operacion = g.id_grupo_padre;


-- 3) Recursos por grupo (equipo + vehículo en una vista)
CREATE OR REPLACE VIEW v_grupo_recursos AS
SELECT
  ge.id_operacion,
  ge.id_grupo_operacion,
  'EQUIPO'::text AS tipo_recurso,
  ge.id_equipo::int AS id_recurso,
  e.nombre AS recurso_nombre,
  e.categoria AS recurso_categoria,
  ge.cantidad,
  ge.estado_asignacion::text AS estado_asignacion,
  ge.uso_en_grupo,
  ge.fecha_asignacion,
  ge.fecha_fin_asignacion,
  ge.asignado_por
FROM grupo_equipo ge
JOIN equipo e ON e.id_equipo = ge.id_equipo

UNION ALL

SELECT
  gv.id_operacion,
  gv.id_grupo_operacion,
  'VEHICULO'::text AS tipo_recurso,
  gv.id_vehiculo::int AS id_recurso,
  v.codigo_interno AS recurso_nombre,
  COALESCE(v.marca,'') || ' ' || COALESCE(v.modelo,'') AS recurso_categoria,
  1 AS cantidad,
  gv.estado_asignacion::text AS estado_asignacion,
  gv.uso_en_grupo,
  gv.fecha_asignacion,
  gv.fecha_fin_asignacion,
  gv.asignado_por
FROM grupo_vehiculo gv
JOIN vehiculo v ON v.id_vehiculo = gv.id_vehiculo;


-- 4) Stock por operación/equipo: reservado vs repartido vs restante
CREATE OR REPLACE VIEW v_stock_operacion_equipo AS
SELECT
  oe.id_operacion,
  oe.id_equipo,
  e.numero_serie,
  e.nombre,
  e.categoria,
  oe.cantidad AS reservado_operacion,
  COALESCE((
    SELECT SUM(ge.cantidad)
    FROM grupo_equipo ge
    WHERE ge.id_operacion = oe.id_operacion
      AND ge.id_equipo = oe.id_equipo
  ),0) AS repartido_a_grupos,
  (oe.cantidad - COALESCE((
    SELECT SUM(ge.cantidad)
    FROM grupo_equipo ge
    WHERE ge.id_operacion = oe.id_operacion
      AND ge.id_equipo = oe.id_equipo
  ),0)) AS restante_sin_repartir
FROM operacion_equipo oe
JOIN equipo e ON e.id_equipo = oe.id_equipo;


-- 5) Uso de equipo por personal en operación (detalle listo para UI)
CREATE OR REPLACE VIEW v_uso_equipo_operacion_detalle AS
SELECT
  ueo.id_operacion,
  ueo.id_personal,
  p.rol AS rol_personal,
  p.apodo,
  p.nombre,
  p.apellido,

  ueo.id_equipo,
  e.numero_serie,
  e.nombre AS equipo_nombre,
  e.categoria AS equipo_categoria,

  ueo.cantidad,
  ueo.fecha_asignacion,
  ueo.fecha_devolucion,
  ueo.asignado_por,
  ueo.notas
FROM uso_equipo_operacion ueo
JOIN personal p ON p.id_personal = ueo.id_personal
JOIN equipo e   ON e.id_equipo   = ueo.id_equipo;


-- 6) Jerarquía de mando (CET -> CELL) con nombres
CREATE OR REPLACE VIEW v_mando_operacion_detalle AS
SELECT
  mo.id_operacion,
  mo.id_cet,
  cet.apodo AS cet_apodo,
  cet.nombre AS cet_nombre,
  cet.apellido AS cet_apellido,

  mo.id_cell,
  cell.apodo AS cell_apodo,
  cell.nombre AS cell_nombre,
  cell.apellido AS cell_apellido,

  mo.fecha_asignacion,
  mo.asignado_por
FROM mando_operacion mo
JOIN personal cet  ON cet.id_personal  = mo.id_cet
JOIN personal cell ON cell.id_personal = mo.id_cell;


-- 7) Feed de chat (mensaje + quién lo mandó)
CREATE OR REPLACE VIEW v_chat_feed AS
SELECT
  co.id_chat,
  co.id_operacion,
  m.id_mensaje,
  m.fecha_envio,
  m.tipo_mensaje,
  m.contenido,

  pc.tipo AS tipo_participante,
  pc.id_usuario,
  pc.id_personal,

  -- display name
  CASE
    WHEN pc.tipo = 'USUARIO' THEN (u.nombre || ' ' || u.apellido)
    ELSE (p.apodo || ' (' || p.rol::text || ')')
  END AS display_name
FROM chat_operacion co
JOIN mensaje_chat m         ON m.id_chat = co.id_chat
JOIN participante_chat pc   ON pc.id_participante = m.id_participante
LEFT JOIN usuario u         ON u.id_usuario = pc.id_usuario
LEFT JOIN personal p        ON p.id_personal = pc.id_personal;


-- 8) POIs listos para mapa (con nombres de creador)
CREATE OR REPLACE VIEW v_poi_detalle AS
SELECT
  poi.id_poi,
  poi.id_usuario,
  (u.nombre || ' ' || u.apellido) AS usuario_nombre,
  poi.id_personal,
  (p.apodo || ' (' || p.rol::text || ')') AS personal_nombre,
  poi.nombre,
  poi.tipo_poi,
  poi.latitud,
  poi.longitud,
  poi.descripcion,
  poi.fecha_creacion
FROM puntos_interes poi
JOIN usuario u  ON u.id_usuario = poi.id_usuario
JOIN personal p ON p.id_personal = poi.id_personal;