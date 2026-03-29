-- =========================================================
-- INIT.SQL — Operaciones (PostgreSQL)
-- Usuarios (CUT/admin) + Personal (CET/CELL)
-- Inventario (equipo/vehiculo) + Operación + Asignaciones
-- Grupos jerárquicos: Grupo padre (apodo) -> Subgrupos (Águila 1, Águila 2)
-- Asignación de equipo/vehículo SOLO a subgrupos
-- =========================================================

-- (Opcional) si quieres limpiar todo y recrear (DESTRUCTIVO):
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

IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_aviso_enum') THEN
    CREATE TYPE tipo_aviso_enum AS ENUM (
      'NOVEDAD','CONTACTO','EMERGENCIA','INFORMATIVO'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_aviso_enum') THEN
    CREATE TYPE estado_aviso_enum AS ENUM ('ENVIADO','RECIBIDO','ATENDIDO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_area_enum') THEN
    CREATE TYPE estado_area_enum AS ENUM ('ACTIVA','INACTIVA','ELIMINADA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_ruta_enum') THEN
    CREATE TYPE estado_ruta_enum AS ENUM (
      'PLANIFICADA','ACTIVA','COMPLETADA','CANCELADA'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_edificio_enum') THEN
    CREATE TYPE estado_edificio_enum AS ENUM (
      'ACTIVO','INACTIVO','ELIMINADO'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_novedad_enum') THEN
    CREATE TYPE tipo_novedad_enum AS ENUM (
      'SITUACION','DECISION','ORDEN','CAMBIO_PLAN','INCIDENTE','OTRO'
    );
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

-- =========================================================
-- 3) INVENTARIO (EQUIPO / SUBTIPOS / VEHICULO)
-- =========================================================
CREATE TABLE IF NOT EXISTS equipo (
  id_equipo SERIAL PRIMARY KEY,
  numero_serie TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  estado estado_equipo_enum NOT NULL DEFAULT 'DISPONIBLE',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  tipo TEXT,
  alias TEXT,
  estado estado_vehiculo_enum NOT NULL DEFAULT 'DISPONIBLE',
  capacidad INT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- PATCH: agregar fecha_creacion a vehiculo si no existe
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='vehiculo'
    AND column_name='fecha_creacion'
  ) THEN
    ALTER TABLE vehiculo
    ADD COLUMN fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END
$$;

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
  id_cut INT REFERENCES personal(id_personal) ON DELETE RESTRICT,
  CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

-- =========================================================
-- PATCH: agregar id_cut a operacion si no existe
-- Regla de negocio: cada operación puede tener un CUT principal
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'operacion'
      AND column_name = 'id_cut'
  ) THEN
    ALTER TABLE operacion
      ADD COLUMN id_cut INT REFERENCES personal(id_personal) ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_operacion_id_cut
  ON operacion (id_cut);

-- =========================================================
-- VALIDACIÓN: id_cut debe pertenecer a personal y tener rol CUT
-- =========================================================
CREATE OR REPLACE FUNCTION fn_validar_cut_operacion()
RETURNS TRIGGER AS $$
DECLARE
  rol_cut rol_personal_enum;
BEGIN
  IF NEW.id_cut IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.rol INTO rol_cut
  FROM personal p
  WHERE p.id_personal = NEW.id_cut;

  IF rol_cut IS NULL THEN
    RAISE EXCEPTION 'id_cut % no existe en personal', NEW.id_cut;
  END IF;

  IF rol_cut <> 'CUT' THEN
    RAISE EXCEPTION 'El responsable principal de la operación debe tener rol CUT. id_cut=% tiene rol=%', NEW.id_cut, rol_cut;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'tr_validar_cut_operacion'
  ) THEN
    CREATE TRIGGER tr_validar_cut_operacion
    BEFORE INSERT OR UPDATE ON operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_cut_operacion();
  END IF;
END $$;

-- =========================================================
-- 4.1) PUNTOS DE INTERÉS (POI) — CREADOR: USUARIO o PERSONAL (uno u otro)
-- Nota: si ya tenías la versión anterior (id_usuario NOT NULL e id_personal NOT NULL),
-- para aplicar esta estructura en BD ya creada tendrás que DROP/ALTER manualmente.
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
  id_operacion INT REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (tipo_creador='USUARIO'  AND id_usuario IS NOT NULL  AND id_personal IS NULL) OR
    (tipo_creador='PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

-- Índices parciales útiles (evitan problemas con NULL en UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS uq_poi_usuario
  ON puntos_interes(id_usuario, nombre)
  WHERE id_usuario IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_poi_personal
  ON puntos_interes(id_personal, nombre)
  WHERE id_personal IS NOT NULL;

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

  CONSTRAINT fk_grupo_vehiculo_a_vehiculo_operacion
    FOREIGN KEY (id_operacion, id_vehiculo)
    REFERENCES vehiculo_operacion (id_operacion, id_vehiculo)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_grupo_vehiculo_unico_por_operacion
  ON grupo_vehiculo (id_operacion, id_vehiculo);

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

-- ZONA_OPERACION
-- Área geográfica principal de una operación.
-- Se dibuja desde el dashboard web (Admin/CUT) antes de activar la operación.
-- La app Android la usa para centrar el mapa al entrar.
-- =========================================================

CREATE TABLE IF NOT EXISTS zona_operacion (
  id_zona         SERIAL PRIMARY KEY,
  id_operacion    INT NOT NULL UNIQUE   -- una zona por operación
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  nombre          TEXT NOT NULL DEFAULT 'Zona principal',

  -- GeoJSON Polygon: {"type":"Polygon","coordinates":[[[lon,lat],...]]}
  -- El dashboard dibuja el polígono y lo guarda aquí
  geometria       JSONB NOT NULL,

  -- Centroide calculado automáticamente por el backend al guardar
  -- La app usa esto para centrar la cámara sin tener que calcular nada
  centroide_lat   NUMERIC(8,5) NOT NULL,
  centroide_lon   NUMERIC(9,5) NOT NULL,

  -- Altura inicial sugerida para la cámara en metros
  -- El backend la calcula según el tamaño del polígono
  zoom_inicial    INT NOT NULL DEFAULT 8000,

  color           TEXT NOT NULL DEFAULT '#3b82f6',
  creado_por      INT NOT NULL REFERENCES usuario(id_usuario),
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_zona_lat CHECK (centroide_lat BETWEEN -90  AND  90),
  CONSTRAINT chk_zona_lon CHECK (centroide_lon BETWEEN -180 AND 180),
  CONSTRAINT chk_zona_zoom CHECK (zoom_inicial BETWEEN 100 AND 2000000)
);

CREATE INDEX IF NOT EXISTS idx_zona_operacion
  ON zona_operacion(id_operacion);

-- =========================================================
-- 8) ÍNDICES ÚTILES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_poi_usuario           ON puntos_interes(id_usuario);
CREATE INDEX IF NOT EXISTS idx_poi_operacion         ON puntos_interes(id_operacion);
CREATE INDEX IF NOT EXISTS idx_poi_personal          ON puntos_interes(id_personal);

CREATE INDEX IF NOT EXISTS idx_asig_op_personal      ON asignacion_operacion_personal(id_personal);
CREATE INDEX IF NOT EXISTS idx_veh_op_op             ON vehiculo_operacion(id_operacion);
CREATE INDEX IF NOT EXISTS idx_op_eq_busqueda        ON operacion_equipo(id_operacion, id_equipo);
CREATE INDEX IF NOT EXISTS idx_uso_eq_op_operacion   ON uso_equipo_operacion(id_operacion);
CREATE INDEX IF NOT EXISTS idx_uso_eq_op_personal    ON uso_equipo_operacion(id_personal);

-- =========================================================
-- 9) SEED (INVENTARIO)
-- =========================================================

-- -------------------------
-- VEHÍCULOS
-- -------------------------
INSERT INTO vehiculo
  (imagen_veh, codigo_interno, tipo, alias, estado, capacidad)
VALUES
  ('./uploads/vehiculo/Alacran.jpeg',    'VH-001', 'TACTICO',     'Alacran 4x4',        'DISPONIBLE', 6),
  ('./uploads/vehiculo/Ford F-150.jpeg', 'VH-003', 'PICKUP',      'Ford F-150',         'DISPONIBLE', 5),
  ('./uploads/vehiculo/Panther.jpeg',    'VH-004', 'BLINDADO',    'Panther Blindado',   'DISPONIBLE', 8),
  ('./uploads/vehiculo/Scualo.jpeg',     'VH-005', 'INTERCEPTOR', 'Scualo Interceptor', 'DISPONIBLE', 4)
ON CONFLICT (codigo_interno)
DO UPDATE SET
  imagen_veh = EXCLUDED.imagen_veh,
  tipo       = EXCLUDED.tipo,
  alias      = EXCLUDED.alias,
  estado     = EXCLUDED.estado,
  capacidad  = EXCLUDED.capacidad;


-- -------------------------
-- EQUIPO BASE
-- -------------------------
INSERT INTO equipo (
  numero_serie,
  nombre,
  categoria,
  estado
)
VALUES 
('HFC-001', 'Harris Falcon', 'COMUNICACION', 'DISPONIBLE'),
('DRN-001', 'Dron VANT 01',  'TACTICO',      'DISPONIBLE')
ON CONFLICT (numero_serie) DO NOTHING;


-- -------------------------
-- EQUIPO TÁCTICO
-- -------------------------
INSERT INTO equipo_tactico (
  id_equipo,
  imagen_eqtac,
  tipo_tactico,
  calibre,
  nivel,
  notas
)
SELECT
  e.id_equipo,
  './uploads/equipo/tactico/Dron vant 01.jpeg',
  'DRON',
  NULL,
  'VANT',
  'Dron de vigilancia táctica no tripulado'
FROM equipo e
WHERE e.numero_serie = 'DRN-001'
ON CONFLICT (id_equipo) DO NOTHING;


-- -------------------------
-- EQUIPO DE COMUNICACIÓN
-- -------------------------
INSERT INTO equipo_comunicacion (
  id_equipo,
  imagen_eqcom,
  marca,
  modelo,
  notas
)
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
  o.id_cut,
  cut.apodo   AS cut_apodo,
  cut.nombre  AS cut_nombre,
  cut.apellido AS cut_apellido,

  (SELECT COUNT(*) FROM asignacion_operacion_personal a
    WHERE a.id_operacion = o.id_operacion) AS total_personal,

  (SELECT COUNT(*) FROM asignacion_operacion_personal a
    JOIN personal p ON p.id_personal = a.id_personal
    WHERE a.id_operacion = o.id_operacion
      AND p.rol = 'CET') AS total_cet,

  (SELECT COUNT(*) FROM asignacion_operacion_personal a
    JOIN personal p ON p.id_personal = a.id_personal
    WHERE a.id_operacion = o.id_operacion
      AND p.rol = 'CELL') AS total_cell,

  (SELECT COUNT(*) FROM vehiculo_operacion vo
    WHERE vo.id_operacion = o.id_operacion) AS total_vehiculos,

  (SELECT COALESCE(SUM(oe.cantidad),0) FROM operacion_equipo oe
    WHERE oe.id_operacion = o.id_operacion) AS total_equipos_reservados,

  (SELECT COUNT(*) FROM grupo_operacion g
    WHERE g.id_operacion = o.id_operacion) AS total_grupos
FROM operacion o
LEFT JOIN personal cut ON cut.id_personal = o.id_cut;

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
  COALESCE(v.alias,'') AS recurso_categoria,
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

-- 6) Jerarquía de mando (CUT -> CET -> CELL) con nombres
CREATE OR REPLACE VIEW v_mando_operacion_detalle AS
SELECT
  mo.id_operacion,

  o.id_cut,
  cut.apodo AS cut_apodo,
  cut.nombre AS cut_nombre,
  cut.apellido AS cut_apellido,

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
JOIN operacion o   ON o.id_operacion    = mo.id_operacion
LEFT JOIN personal cut  ON cut.id_personal  = o.id_cut
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
  poi.tipo_creador,

  poi.id_usuario,
  CASE
    WHEN poi.id_usuario IS NOT NULL THEN (u.nombre || ' ' || u.apellido)
    ELSE NULL
  END AS usuario_nombre,

  poi.id_personal,
  CASE
    WHEN poi.id_personal IS NOT NULL THEN (p.apodo || ' (' || p.rol::text || ')')
    ELSE NULL
  END AS personal_nombre,

  poi.nombre,
  poi.tipo_poi,
  poi.latitud,
  poi.longitud,
  poi.descripcion,
  poi.id_operacion,
  poi.activo,
  poi.fecha_creacion
FROM puntos_interes poi
LEFT JOIN usuario u  ON u.id_usuario = poi.id_usuario
LEFT JOIN personal p ON p.id_personal = poi.id_personal;

-- =========================================================
-- NUEVAS TABLAS Y ESTRUCTURAS (PATCH)
-- =========================================================

-- =========================================================
-- NUEVOS ENUMs
-- =========================================================
-- =========================================================
-- 10) AVISOS OPERACIONALES OPERACIONALES
--    Comunicación jerárquica dirigida (CELL/CET → mando)
--    Diferente al chat: tiene receptor, tipo y acuse de recibo
-- =========================================================
CREATE TABLE IF NOT EXISTS aviso_operacion (
  id_aviso            SERIAL PRIMARY KEY,
  id_operacion        INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  -- Emisor (siempre personal: CELL o CET)
  id_personal_emisor  INT NOT NULL
    REFERENCES personal(id_personal) ON DELETE CASCADE,

  -- Receptor (puede ser personal o usuario; NULL = su mando directo)
  tipo_receptor       tipo_participante_enum,
  id_personal_receptor INT REFERENCES personal(id_personal) ON DELETE SET NULL,
  id_usuario_receptor  INT REFERENCES usuario(id_usuario)   ON DELETE SET NULL,

  tipo_aviso          tipo_aviso_enum NOT NULL DEFAULT 'INFORMATIVO',
  contenido           TEXT NOT NULL,
  estado              estado_aviso_enum NOT NULL DEFAULT 'ENVIADO',

  fecha_envio         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_atencion      TIMESTAMPTZ,

  CHECK (
    fecha_atencion IS NULL OR fecha_atencion >= fecha_envio
  ),
  CHECK (
    -- Si se especifica receptor, debe coincidir con tipo_receptor
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
-- 11) ÁREAS DE INTERÉS
--    Polígonos sobre el mapa (JSONB GeoJSON)
--    Creadas por cualquier rol durante planeación o ejecución
-- =========================================================
CREATE TABLE IF NOT EXISTS area_interes (
  id_area         SERIAL PRIMARY KEY,
  id_operacion    INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  tipo_creador    tipo_participante_enum NOT NULL,
  id_usuario      INT REFERENCES usuario(id_usuario)   ON DELETE CASCADE,
  id_personal     INT REFERENCES personal(id_personal) ON DELETE CASCADE,

  nombre          TEXT NOT NULL,
  descripcion     TEXT,

  -- GeoJSON Polygon: {"type":"Polygon","coordinates":[[[lon,lat],...]]}
  geometria       JSONB NOT NULL,

  -- Color hex para renderizar en el mapa frontend
  color           TEXT NOT NULL DEFAULT '#FF4500',

  estado          estado_area_enum NOT NULL DEFAULT 'ACTIVA',
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (tipo_creador = 'USUARIO'  AND id_usuario  IS NOT NULL AND id_personal IS NULL) OR
    (tipo_creador = 'PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_area_operacion
  ON area_interes(id_operacion);

CREATE INDEX IF NOT EXISTS idx_area_estado
  ON area_interes(id_operacion, estado);
-- =========================================================
-- 12) RUTAS
--    LineString sobre el mapa (JSONB GeoJSON)
--    Creadas por cualquier rol durante planeación o ejecución
-- =========================================================
CREATE TABLE IF NOT EXISTS ruta_operacion (
  id_ruta         SERIAL PRIMARY KEY,
  id_operacion    INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  tipo_creador    tipo_participante_enum NOT NULL,
  id_usuario      INT REFERENCES usuario(id_usuario)   ON DELETE CASCADE,
  id_personal     INT REFERENCES personal(id_personal) ON DELETE CASCADE,

  nombre          TEXT NOT NULL,
  descripcion     TEXT,

  -- GeoJSON LineString: {"type":"LineString","coordinates":[[lon,lat],...]}
  geometria       JSONB NOT NULL,

  color           TEXT NOT NULL DEFAULT '#1E90FF',
  estado          estado_ruta_enum NOT NULL DEFAULT 'PLANIFICADA',
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (tipo_creador = 'USUARIO'  AND id_usuario  IS NOT NULL AND id_personal IS NULL) OR
    (tipo_creador = 'PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ruta_operacion_id_operacion
  ON ruta_operacion(id_operacion);

CREATE INDEX IF NOT EXISTS idx_ruta_operacion_fecha
  ON ruta_operacion(id_operacion, fecha_creacion DESC);
-- =========================================================
-- 13) MARCAS DE EDIFICIOS / ESTRUCTURAS
--    Puntos de referencia fijos del terreno, distintos a POIs.
--    Representan infraestructura real: hospitales, bases,
--    puestos de control, objetivos, etc.
--    Solo ADMIN, CUT (usuarios) y CET (personal) pueden crearlas.
--    No llevan polígono ni afiliación táctica — solo punto + tipo.
-- =========================================================
CREATE TABLE IF NOT EXISTS marca_edificio (
  id_marca        SERIAL PRIMARY KEY,
  id_operacion    INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  -- Solo USUARIO (ADMIN/CUT) o PERSONAL con rol CET
  -- La validación de rol CET se hace en el backend (middleware JWT)
  tipo_creador    tipo_participante_enum NOT NULL,
  id_usuario      INT REFERENCES usuario(id_usuario)   ON DELETE CASCADE,
  id_personal     INT REFERENCES personal(id_personal) ON DELETE CASCADE,

  nombre          TEXT NOT NULL,

  -- Tipo de estructura predefinido
  -- Valores sugeridos: 'HOSPITAL','BASE','PUESTO_CONTROL',
  --   'OBJETIVO','INFRAESTRUCTURA','REFUGIO','AMENAZA','OTRO'
  tipo_estructura TEXT NOT NULL,

  -- Coordenada del punto de referencia
  latitud         NUMERIC(8,5) NOT NULL,
  longitud        NUMERIC(9,5) NOT NULL,

  estado          estado_edificio_enum NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_marca_latitud  CHECK (latitud  BETWEEN -90  AND  90),
  CONSTRAINT chk_marca_longitud CHECK (longitud BETWEEN -180 AND 180),

  -- Un creador: o usuario o personal, nunca ambos
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
-- 14) TRACKING DE PERSONAL
--    Registro de posición GPS en tiempo real / historial
--    BIGSERIAL porque habrá millones de registros
-- =========================================================
CREATE TABLE IF NOT EXISTS tracking_personal (
  id_tracking     BIGSERIAL PRIMARY KEY,
  id_operacion    INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_personal     INT NOT NULL
    REFERENCES personal(id_personal) ON DELETE CASCADE,

  -- 5 decimales = precisión ~1.1 m
  latitud         NUMERIC(8,5)  NOT NULL,
  longitud        NUMERIC(9,5)  NOT NULL,
  altitud         NUMERIC(7,2),            -- metros snm, nullable
  precision_m     NUMERIC(6,2),            -- precisión del dispositivo GPS

  "timestamp"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tp_latitud  CHECK (latitud  BETWEEN -90  AND  90),
  CONSTRAINT chk_tp_longitud CHECK (longitud BETWEEN -180 AND 180)
);

-- Índice principal: consultas de historial y última posición
CREATE INDEX IF NOT EXISTS idx_tracking_personal_op_per_ts
  ON tracking_personal(id_operacion, id_personal, "timestamp" DESC);

-- Índice para purgas por tiempo
CREATE INDEX IF NOT EXISTS idx_tracking_personal_ts
  ON tracking_personal("timestamp" DESC);
-- =========================================================
-- 15) TRACKING DE VEHÍCULOS
-- =========================================================
CREATE TABLE IF NOT EXISTS tracking_vehiculo (
  id_tracking     BIGSERIAL PRIMARY KEY,
  id_operacion    INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_vehiculo     INT NOT NULL
    REFERENCES vehiculo(id_vehiculo) ON DELETE CASCADE,

  latitud         NUMERIC(8,5)  NOT NULL,
  longitud        NUMERIC(9,5)  NOT NULL,
  altitud         NUMERIC(7,2),
  velocidad_kmh   NUMERIC(6,2),            -- útil para vehículos
  rumbo_grados    NUMERIC(5,2),            -- 0–360°, dirección de movimiento
  precision_m     NUMERIC(6,2),

  "timestamp"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tv_latitud  CHECK (latitud  BETWEEN -90  AND  90),
  CONSTRAINT chk_tv_longitud CHECK (longitud BETWEEN -180 AND 180),
  CONSTRAINT chk_tv_rumbo    CHECK (
    rumbo_grados IS NULL OR rumbo_grados BETWEEN 0 AND 360
  )
);

CREATE INDEX IF NOT EXISTS idx_tracking_vehiculo_op_veh_ts
  ON tracking_vehiculo(id_operacion, id_vehiculo, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_vehiculo_ts
  ON tracking_vehiculo("timestamp" DESC);
-- =========================================================
-- 16) NOVEDADES / BATTLE STAFF TOOLS / BATTLE STAFF TOOLS
--    Bitácora de mando durante la ejecución.
--    solo_mando = TRUE → solo visible para ADMIN y CUT
--    (el backend filtra por rol JWT antes de retornar)
-- =========================================================
CREATE TABLE IF NOT EXISTS novedad_operacion (
  id_novedad      SERIAL PRIMARY KEY,
  id_operacion    INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  tipo_creador    tipo_participante_enum NOT NULL,
  id_usuario      INT REFERENCES usuario(id_usuario)   ON DELETE SET NULL,
  id_personal     INT REFERENCES personal(id_personal) ON DELETE SET NULL,

  tipo_novedad    tipo_novedad_enum NOT NULL DEFAULT 'OTRO',
  titulo          TEXT NOT NULL,
  descripcion     TEXT,

  -- TRUE = historial post-op solo accesible por ADMIN y CUT
  solo_mando      BOOLEAN NOT NULL DEFAULT TRUE,

  fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (tipo_creador = 'USUARIO'  AND id_usuario  IS NOT NULL AND id_personal IS NULL) OR
    (tipo_creador = 'PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_novedad_operacion
  ON novedad_operacion(id_operacion, fecha_registro DESC);
-- =========================================================
-- VISTAS NUEVAS
-- =========================================================

-- Última posición conocida de cada integrante de personal
CREATE OR REPLACE VIEW v_ultima_posicion_personal AS
SELECT DISTINCT ON (tp.id_operacion, tp.id_personal)
  tp.id_operacion,
  tp.id_personal,
  p.apodo,
  p.rol,
  tp.latitud,
  tp.longitud,
  tp.altitud,
  tp.precision_m,
  tp."timestamp" AS ultima_actualizacion
FROM tracking_personal tp
JOIN personal p ON p.id_personal = tp.id_personal
ORDER BY tp.id_operacion, tp.id_personal, tp."timestamp" DESC;

-- Última posición conocida de cada vehículo en operación
CREATE OR REPLACE VIEW v_ultima_posicion_vehiculo AS
SELECT DISTINCT ON (tv.id_operacion, tv.id_vehiculo)
  tv.id_operacion,
  tv.id_vehiculo,
  v.codigo_interno,
  v.tipo,
  tv.latitud,
  tv.longitud,
  tv.altitud,
  tv.velocidad_kmh,
  tv.rumbo_grados,
  tv.precision_m,
  tv."timestamp" AS ultima_actualizacion
FROM tracking_vehiculo tv
JOIN vehiculo v ON v.id_vehiculo = tv.id_vehiculo
ORDER BY tv.id_operacion, tv.id_vehiculo, tv."timestamp" DESC;

-- Capas geoespaciales de una operación (POIs + Áreas + Rutas + Edificios)
-- Útil para cargar todo el mapa de una operación en una sola consulta
-- Columnas: id_operacion, tipo_capa, id_elemento, nombre, subtipo,
--           latitud, longitud, geometria, color, estado, fecha_creacion
CREATE OR REPLACE VIEW v_capas_mapa_operacion AS
SELECT
  id_operacion,
  'POI'::text     AS tipo_capa,
  id_poi::int     AS id_elemento,
  nombre,
  tipo_poi        AS subtipo,
  latitud,
  longitud,
  NULL::jsonb     AS geometria,
  NULL::text      AS color,
  activo::text    AS estado,
  fecha_creacion
FROM puntos_interes
WHERE activo = TRUE

UNION ALL

SELECT
  id_operacion,
  'AREA'::text,
  id_area,
  nombre,
  NULL,
  NULL, NULL,
  geometria,
  color,
  estado::text,
  fecha_creacion
FROM area_interes
WHERE estado = 'ACTIVA'

UNION ALL

SELECT
  id_operacion,
  'RUTA'::text,
  id_ruta,
  nombre,
  NULL,
  NULL, NULL,
  geometria,
  color,
  estado::text,
  fecha_creacion
FROM ruta_operacion
WHERE estado IN ('PLANIFICADA','ACTIVA')

UNION ALL

SELECT
  id_operacion,
  'EDIFICIO'::text,
  id_marca,
  nombre,
  tipo_estructura,
  latitud,
  longitud,
  NULL::jsonb,
  NULL::text,
  estado::text,
  fecha_creacion
FROM marca_edificio
WHERE estado = 'ACTIVO';


-- =========================================================
-- PATCH 2026-03-12 — REGLAS OPERATIVAS, CHAT, DISPONIBILIDAD,
-- GEOVALIDACIONES, AUDITORÍA Y VISTAS RESUMEN
-- =========================================================

-- =========================================================
-- 17) FECHA_ACTUALIZACION EN TABLAS OPERATIVAS / GEO
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='chat_operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE chat_operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='puntos_interes' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE puntos_interes ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='area_interes' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE area_interes ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='ruta_operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE ruta_operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='marca_edificio' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE marca_edificio ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='zona_operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE zona_operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='aviso_operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE aviso_operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='novedad_operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE novedad_operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_touch_fecha_actualizacion()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fecha_actualizacion := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_operacion_touch') THEN
    CREATE TRIGGER tr_operacion_touch
    BEFORE UPDATE ON operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_chat_operacion_touch') THEN
    CREATE TRIGGER tr_chat_operacion_touch
    BEFORE UPDATE ON chat_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_poi_touch') THEN
    CREATE TRIGGER tr_poi_touch
    BEFORE UPDATE ON puntos_interes
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_area_interes_touch') THEN
    CREATE TRIGGER tr_area_interes_touch
    BEFORE UPDATE ON area_interes
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_ruta_operacion_touch') THEN
    CREATE TRIGGER tr_ruta_operacion_touch
    BEFORE UPDATE ON ruta_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_marca_edificio_touch') THEN
    CREATE TRIGGER tr_marca_edificio_touch
    BEFORE UPDATE ON marca_edificio
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_zona_operacion_touch') THEN
    CREATE TRIGGER tr_zona_operacion_touch
    BEFORE UPDATE ON zona_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_aviso_operacion_touch') THEN
    CREATE TRIGGER tr_aviso_operacion_touch
    BEFORE UPDATE ON aviso_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_novedad_operacion_touch') THEN
    CREATE TRIGGER tr_novedad_operacion_touch
    BEFORE UPDATE ON novedad_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;
END $$;

-- =========================================================
-- 18) NOMBRE DE OPERACIÓN ÚNICO (case-insensitive / trim)
-- =========================================================
DO $$
DECLARE
  duplicados INT;
BEGIN
  SELECT COUNT(*) INTO duplicados
  FROM (
    SELECT LOWER(BTRIM(nombre))
    FROM operacion
    GROUP BY LOWER(BTRIM(nombre))
    HAVING COUNT(*) > 1
  ) t;

  IF duplicados = 0 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'i'
        AND c.relname = 'uq_operacion_nombre_ci'
        AND n.nspname = 'public'
    ) THEN
      CREATE UNIQUE INDEX uq_operacion_nombre_ci
      ON operacion (LOWER(BTRIM(nombre)));
    END IF;
  ELSE
    RAISE NOTICE 'No se creó uq_operacion_nombre_ci porque hay nombres de operación duplicados existentes.';
  END IF;
END $$;

-- =========================================================
-- 19) CHECKS GEO ADICIONALES
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_poi_latitud'
  ) THEN
    ALTER TABLE puntos_interes
      ADD CONSTRAINT chk_poi_latitud CHECK (latitud BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_poi_longitud'
  ) THEN
    ALTER TABLE puntos_interes
      ADD CONSTRAINT chk_poi_longitud CHECK (longitud BETWEEN -180 AND 180);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_area_color_hex'
  ) THEN
    ALTER TABLE area_interes
      ADD CONSTRAINT chk_area_color_hex
      CHECK (color ~* '^#[0-9A-F]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ruta_color_hex'
  ) THEN
    ALTER TABLE ruta_operacion
      ADD CONSTRAINT chk_ruta_color_hex
      CHECK (color ~* '^#[0-9A-F]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_zona_color_hex'
  ) THEN
    ALTER TABLE zona_operacion
      ADD CONSTRAINT chk_zona_color_hex
      CHECK (color ~* '^#[0-9A-F]{6}$');
  END IF;
END $$;

-- =========================================================
-- 20) HELPERS DE OPERACIÓN
-- =========================================================
CREATE OR REPLACE FUNCTION fn_operacion_esta_cerrada_o_cancelada(p_id_operacion INT)
RETURNS BOOLEAN AS $$
DECLARE
  v_estado estado_operacion_enum;
BEGIN
  SELECT estado INTO v_estado
  FROM operacion
  WHERE id_operacion = p_id_operacion;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Operación % no existe', p_id_operacion;
  END IF;

  RETURN v_estado IN ('CERRADA', 'CANCELADA');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_operacion_modificable()
RETURNS TRIGGER AS $$
DECLARE
  v_id_operacion INT;
  v_estado estado_operacion_enum;
BEGIN
  v_id_operacion := NULL;

  -- Tablas con id_operacion directo
  IF TG_TABLE_NAME IN (
    'asignacion_operacion_personal',
    'vehiculo_operacion',
    'operacion_equipo',
    'grupo_operacion',
    'grupo_equipo',
    'grupo_vehiculo',
    'mando_operacion',
    'puntos_interes',
    'area_interes',
    'ruta_operacion',
    'marca_edificio',
    'zona_operacion',
    'chat_operacion',
    'aviso_operacion',
    'novedad_operacion'
  ) THEN
    v_id_operacion := COALESCE(NEW.id_operacion, OLD.id_operacion);
  END IF;

  -- grupo_personal: resolver por grupo_operacion
  IF TG_TABLE_NAME = 'grupo_personal' THEN
    SELECT go.id_operacion
      INTO v_id_operacion
    FROM grupo_operacion go
    WHERE go.id_grupo_operacion = COALESCE(NEW.id_grupo_operacion, OLD.id_grupo_operacion)
    LIMIT 1;
  END IF;

  -- participante_chat: resolver por chat_operacion
  IF TG_TABLE_NAME = 'participante_chat' THEN
    SELECT co.id_operacion
      INTO v_id_operacion
    FROM chat_operacion co
    WHERE co.id_chat = COALESCE(NEW.id_chat, OLD.id_chat)
    LIMIT 1;
  END IF;

  -- mensaje_chat: resolver por chat_operacion
  IF TG_TABLE_NAME = 'mensaje_chat' THEN
    SELECT co.id_operacion
      INTO v_id_operacion
    FROM chat_operacion co
    WHERE co.id_chat = COALESCE(NEW.id_chat, OLD.id_chat)
    LIMIT 1;
  END IF;

  IF v_id_operacion IS NULL THEN
    RAISE EXCEPTION
      'No se pudo resolver id_operacion para la tabla % en fn_validar_operacion_modificable()',
      TG_TABLE_NAME;
  END IF;

  SELECT o.estado
    INTO v_estado
  FROM operacion o
  WHERE o.id_operacion = v_id_operacion
  LIMIT 1;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'No existe la operación %', v_id_operacion;
  END IF;

  IF v_estado IN ('CERRADA', 'CANCELADA') THEN
    -- Permitir mensajes de SISTEMA incluso en operaciones cerradas/canceladas
    -- (esto permite que el trigger de log del sistema funcione)
    IF TG_TABLE_NAME = 'mensaje_chat' AND NEW.tipo_mensaje = 'SISTEMA' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'La operación % está en estado %, no se permiten modificaciones en %',
      v_id_operacion, v_estado, TG_TABLE_NAME;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_fechas_operacion_recurso(p_id_operacion INT)
RETURNS TABLE(fecha_inicio TIMESTAMPTZ, fecha_fin TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT o.fecha_inicio, o.fecha_fin
  FROM operacion o
  WHERE o.id_operacion = p_id_operacion;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operación % no existe', p_id_operacion;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- 21) DISPONIBILIDAD TEMPORAL (PERSONAL / VEHÍCULO / EQUIPO)
-- =========================================================
CREATE OR REPLACE FUNCTION fn_rangos_conflictivos(
  p_ini1 TIMESTAMPTZ,
  p_fin1 TIMESTAMPTZ,
  p_ini2 TIMESTAMPTZ,
  p_fin2 TIMESTAMPTZ,
  p_buffer INTERVAL DEFAULT INTERVAL '0 seconds'
)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_ini1 IS NULL OR p_ini2 IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN (p_ini1 - p_buffer) <= (COALESCE(p_fin2, 'infinity'::timestamptz) + p_buffer)
     AND (p_ini2 - p_buffer) <= (COALESCE(p_fin1, 'infinity'::timestamptz) + p_buffer);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_disponibilidad_personal()
RETURNS TRIGGER AS $$
DECLARE
  v_ini TIMESTAMPTZ;
  v_fin TIMESTAMPTZ;
  r RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT fecha_inicio, fecha_fin INTO v_ini, v_fin
  FROM operacion
  WHERE id_operacion = NEW.id_operacion;

  IF v_ini IS NULL THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT a.id_operacion, o.codigo, o.nombre, o.fecha_inicio, o.fecha_fin
    FROM asignacion_operacion_personal a
    JOIN operacion o ON o.id_operacion = a.id_operacion
    WHERE a.id_personal = NEW.id_personal
      AND a.id_operacion <> NEW.id_operacion
      AND o.estado NOT IN ('CERRADA', 'CANCELADA')
      AND a.estado_asignacion <> 'LIBERADO'
  LOOP
    IF fn_rangos_conflictivos(v_ini, v_fin, r.fecha_inicio, r.fecha_fin, INTERVAL '12 hours') THEN
      RAISE EXCEPTION
        'El personal % ya está asignado a la operación % (%). Conflicto de fechas.',
        NEW.id_personal, r.codigo, r.nombre;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_disponibilidad_vehiculo()
RETURNS TRIGGER AS $$
DECLARE
  v_ini TIMESTAMPTZ;
  v_fin TIMESTAMPTZ;
  r RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT fecha_inicio, fecha_fin INTO v_ini, v_fin
  FROM operacion
  WHERE id_operacion = NEW.id_operacion;

  IF v_ini IS NULL THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT vo.id_operacion, o.codigo, o.nombre, o.fecha_inicio, o.fecha_fin
    FROM vehiculo_operacion vo
    JOIN operacion o ON o.id_operacion = vo.id_operacion
    WHERE vo.id_vehiculo = NEW.id_vehiculo
      AND vo.id_operacion <> NEW.id_operacion
      AND o.estado NOT IN ('CERRADA', 'CANCELADA')
      AND vo.estado_asignacion <> 'LIBERADO'
  LOOP
    IF fn_rangos_conflictivos(v_ini, v_fin, r.fecha_inicio, r.fecha_fin, INTERVAL '0 seconds') THEN
      RAISE EXCEPTION
        'El vehículo % ya está asignado a la operación % (%). Conflicto de fechas.',
        NEW.id_vehiculo, r.codigo, r.nombre;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_disponibilidad_equipo()
RETURNS TRIGGER AS $$
DECLARE
  v_ini TIMESTAMPTZ;
  v_fin TIMESTAMPTZ;
  r RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT fecha_inicio, fecha_fin INTO v_ini, v_fin
  FROM operacion
  WHERE id_operacion = NEW.id_operacion;

  IF v_ini IS NULL THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT oe.id_operacion, o.codigo, o.nombre, o.fecha_inicio, o.fecha_fin
    FROM operacion_equipo oe
    JOIN operacion o ON o.id_operacion = oe.id_operacion
    WHERE oe.id_equipo = NEW.id_equipo
      AND oe.id_operacion <> NEW.id_operacion
      AND o.estado NOT IN ('CERRADA', 'CANCELADA')
      AND oe.estado_asignacion <> 'LIBERADO'
  LOOP
    IF fn_rangos_conflictivos(v_ini, v_fin, r.fecha_inicio, r.fecha_fin, INTERVAL '0 seconds') THEN
      RAISE EXCEPTION
        'El equipo % ya está reservado en la operación % (%). Conflicto de fechas.',
        NEW.id_equipo, r.codigo, r.nombre;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_validar_disponibilidad_personal') THEN
    CREATE TRIGGER tr_validar_disponibilidad_personal
    BEFORE INSERT OR UPDATE ON asignacion_operacion_personal
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_disponibilidad_personal();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_validar_disponibilidad_vehiculo') THEN
    CREATE TRIGGER tr_validar_disponibilidad_vehiculo
    BEFORE INSERT OR UPDATE ON vehiculo_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_disponibilidad_vehiculo();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_validar_disponibilidad_equipo') THEN
    CREATE TRIGGER tr_validar_disponibilidad_equipo
    BEFORE INSERT OR UPDATE ON operacion_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_disponibilidad_equipo();
  END IF;
END $$;

-- =========================================================
-- 22) BLOQUEAR CAMBIOS EN OPERACIONES CERRADAS/CANCELADAS
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_aop_operacion_modificable') THEN
    CREATE TRIGGER tr_aop_operacion_modificable
    BEFORE INSERT OR UPDATE ON asignacion_operacion_personal
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_vo_operacion_modificable') THEN
    CREATE TRIGGER tr_vo_operacion_modificable
    BEFORE INSERT OR UPDATE ON vehiculo_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_oe_operacion_modificable') THEN
    CREATE TRIGGER tr_oe_operacion_modificable
    BEFORE INSERT OR UPDATE ON operacion_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_gp_operacion_modificable') THEN
    CREATE TRIGGER tr_gp_operacion_modificable
    BEFORE INSERT OR UPDATE ON grupo_personal
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_ge_operacion_modificable') THEN
    CREATE TRIGGER tr_ge_operacion_modificable
    BEFORE INSERT OR UPDATE ON grupo_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_gv_operacion_modificable') THEN
    CREATE TRIGGER tr_gv_operacion_modificable
    BEFORE INSERT OR UPDATE ON grupo_vehiculo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_poi_operacion_modificable') THEN
    CREATE TRIGGER tr_poi_operacion_modificable
    BEFORE INSERT OR UPDATE ON puntos_interes
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_area_operacion_modificable') THEN
    CREATE TRIGGER tr_area_operacion_modificable
    BEFORE INSERT OR UPDATE ON area_interes
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_ruta_operacion_modificable') THEN
    CREATE TRIGGER tr_ruta_operacion_modificable
    BEFORE INSERT OR UPDATE ON ruta_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_marca_operacion_modificable') THEN
    CREATE TRIGGER tr_marca_operacion_modificable
    BEFORE INSERT OR UPDATE ON marca_edificio
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_zona_operacion_modificable') THEN
    CREATE TRIGGER tr_zona_operacion_modificable
    BEFORE INSERT OR UPDATE ON zona_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_tracking_personal_op_modificable') THEN
    CREATE TRIGGER tr_tracking_personal_op_modificable
    BEFORE INSERT OR UPDATE ON tracking_personal
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_tracking_vehiculo_op_modificable') THEN
    CREATE TRIGGER tr_tracking_vehiculo_op_modificable
    BEFORE INSERT OR UPDATE ON tracking_vehiculo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_aviso_operacion_modificable') THEN
    CREATE TRIGGER tr_aviso_operacion_modificable
    BEFORE INSERT OR UPDATE ON aviso_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_novedad_operacion_modificable') THEN
    CREATE TRIGGER tr_novedad_operacion_modificable
    BEFORE INSERT OR UPDATE ON novedad_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;
END $$;

-- =========================================================
-- 23) VALIDACIÓN DE GEOMETRÍA PARA ÁREAS Y RUTAS
-- =========================================================
CREATE OR REPLACE FUNCTION fn_validar_geometria_area()
RETURNS TRIGGER AS $$
DECLARE
  v_type TEXT;
  v_points INT;
BEGIN
  v_type := COALESCE(NEW.geometria->>'type','');
  IF v_type NOT IN ('Polygon', 'MultiPolygon') THEN
    RAISE EXCEPTION 'area_interes.geometria debe ser Polygon o MultiPolygon';
  END IF;

  IF jsonb_typeof(NEW.geometria->'coordinates') <> 'array' THEN
    RAISE EXCEPTION 'area_interes.geometria.coordinates debe ser array';
  END IF;

  IF v_type = 'Polygon' THEN
    v_points := COALESCE(jsonb_array_length((NEW.geometria->'coordinates')->0), 0);
    IF v_points < 4 THEN
      RAISE EXCEPTION 'Un Polygon debe tener al menos 4 puntos';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_geometria_ruta()
RETURNS TRIGGER AS $$
DECLARE
  v_type TEXT;
  v_points INT;
BEGIN
  v_type := COALESCE(NEW.geometria->>'type','');
  IF v_type NOT IN ('LineString', 'MultiLineString') THEN
    RAISE EXCEPTION 'ruta_operacion.geometria debe ser LineString o MultiLineString';
  END IF;

  IF jsonb_typeof(NEW.geometria->'coordinates') <> 'array' THEN
    RAISE EXCEPTION 'ruta_operacion.geometria.coordinates debe ser array';
  END IF;

  IF v_type = 'LineString' THEN
    v_points := COALESCE(jsonb_array_length(NEW.geometria->'coordinates'), 0);
    IF v_points < 2 THEN
      RAISE EXCEPTION 'Un LineString debe tener al menos 2 puntos';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_validar_geometria_area') THEN
    CREATE TRIGGER tr_validar_geometria_area
    BEFORE INSERT OR UPDATE ON area_interes
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_geometria_area();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_validar_geometria_ruta') THEN
    CREATE TRIGGER tr_validar_geometria_ruta
    BEFORE INSERT OR UPDATE ON ruta_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_geometria_ruta();
  END IF;
END $$;

-- =========================================================
-- 24) CHAT AUTOMÁTICO Y PARTICIPANTES
-- =========================================================
CREATE OR REPLACE FUNCTION fn_get_or_create_chat_operacion(p_id_operacion INT)
RETURNS INT AS $$
DECLARE
  v_id_chat INT;
BEGIN
  INSERT INTO chat_operacion (id_operacion, activo, fecha_cierre)
  VALUES (p_id_operacion, FALSE, NULL)
  ON CONFLICT (id_operacion) DO UPDATE
    SET id_operacion = EXCLUDED.id_operacion
  RETURNING id_chat INTO v_id_chat;

  RETURN v_id_chat;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_agregar_participante_chat_operacion(
  p_id_operacion INT,
  p_id_usuario INT DEFAULT NULL,
  p_id_personal INT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_id_chat INT;
  v_id_participante INT;
BEGIN
  v_id_chat := fn_get_or_create_chat_operacion(p_id_operacion);

  IF p_id_usuario IS NOT NULL THEN
    INSERT INTO participante_chat (id_chat, tipo, id_usuario, id_personal)
    VALUES (v_id_chat, 'USUARIO', p_id_usuario, NULL)
    ON CONFLICT (id_chat, id_usuario) DO UPDATE
      SET id_usuario = EXCLUDED.id_usuario
    RETURNING id_participante INTO v_id_participante;
  ELSIF p_id_personal IS NOT NULL THEN
    INSERT INTO participante_chat (id_chat, tipo, id_usuario, id_personal)
    VALUES (v_id_chat, 'PERSONAL', NULL, p_id_personal)
    ON CONFLICT (id_chat, id_personal) DO UPDATE
      SET id_personal = EXCLUDED.id_personal
    RETURNING id_participante INTO v_id_participante;
  ELSE
    RAISE EXCEPTION 'Debe enviarse id_usuario o id_personal';
  END IF;

  RETURN v_id_participante;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_sync_chat_operacion()
RETURNS TRIGGER AS $$
DECLARE
  v_id_chat INT;
  v_id_participante INT;
BEGIN
  v_id_chat := fn_get_or_create_chat_operacion(NEW.id_operacion);

  IF TG_OP = 'INSERT' THEN
    UPDATE chat_operacion
    SET activo = (NEW.estado = 'ACTIVA'),
        fecha_cierre = CASE WHEN NEW.estado IN ('CERRADA','CANCELADA') THEN NOW() ELSE NULL END
    WHERE id_chat = v_id_chat;

    PERFORM fn_agregar_participante_chat_operacion(NEW.id_operacion, NEW.creada_por, NULL);
    RETURN NEW;
  END IF;

  IF NEW.estado = 'ACTIVA' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    UPDATE chat_operacion
    SET activo = TRUE,
        fecha_cierre = NULL
    WHERE id_chat = v_id_chat;

    v_id_participante := fn_agregar_participante_chat_operacion(NEW.id_operacion, NEW.creada_por, NULL);

    INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
    VALUES (
      v_id_chat,
      v_id_participante,
      'OPERACION ACTIVADA automáticamente por trigger de BD.',
      'SISTEMA'
    );
  ELSIF NEW.estado IN ('CERRADA','CANCELADA') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    UPDATE chat_operacion
    SET activo = FALSE,
        fecha_cierre = NOW()
    WHERE id_chat = v_id_chat;

    v_id_participante := fn_agregar_participante_chat_operacion(NEW.id_operacion, NEW.creada_por, NULL);

    INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
    VALUES (
      v_id_chat,
      v_id_participante,
      'OPERACION ' || NEW.estado::text || ' automáticamente por trigger de BD.',
      'SISTEMA'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_sync_participante_chat_por_asignacion()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.estado_asignacion <> 'LIBERADO' THEN
      PERFORM fn_agregar_participante_chat_operacion(NEW.id_operacion, NULL, NEW.id_personal);
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_operacion_sync_chat_insert') THEN
    CREATE TRIGGER tr_operacion_sync_chat_insert
    AFTER INSERT ON operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_chat_operacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_operacion_sync_chat_estado') THEN
    CREATE TRIGGER tr_operacion_sync_chat_estado
    AFTER UPDATE OF estado ON operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_chat_operacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_aop_sync_participante_chat') THEN
    CREATE TRIGGER tr_aop_sync_participante_chat
    AFTER INSERT OR UPDATE ON asignacion_operacion_personal
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_participante_chat_por_asignacion();
  END IF;
END $$;

-- =========================================================
-- 25) SINCRONIZAR ESTADOS DE INVENTARIO
-- =========================================================
CREATE OR REPLACE FUNCTION fn_recalcular_estado_vehiculo(p_id_vehiculo INT)
RETURNS VOID AS $$
DECLARE
  v_estado estado_vehiculo_enum;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM vehiculo_operacion vo
    JOIN operacion o ON o.id_operacion = vo.id_operacion
    WHERE vo.id_vehiculo = p_id_vehiculo
      AND vo.estado_asignacion IN ('ASIGNADO','EN_USO')
      AND o.estado NOT IN ('CERRADA','CANCELADA')
  ) THEN
    v_estado := 'ASIGNADO';
  ELSE
    v_estado := 'DISPONIBLE';
  END IF;

  UPDATE vehiculo
  SET estado = v_estado
  WHERE id_vehiculo = p_id_vehiculo
    AND estado <> 'MANTENIMIENTO'
    AND estado <> 'BAJA';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_recalcular_estado_equipo(p_id_equipo INT)
RETURNS VOID AS $$
DECLARE
  v_estado estado_equipo_enum;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM operacion_equipo oe
    JOIN operacion o ON o.id_operacion = oe.id_operacion
    WHERE oe.id_equipo = p_id_equipo
      AND oe.estado_asignacion IN ('ASIGNADO','EN_USO')
      AND o.estado NOT IN ('CERRADA','CANCELADA')
  )
  OR EXISTS (
    SELECT 1
    FROM personal_equipo pe
    WHERE pe.id_equipo = p_id_equipo
      AND pe.estado = 'ASIGNADO'
  ) THEN
    v_estado := 'ASIGNADO';
  ELSE
    v_estado := 'DISPONIBLE';
  END IF;

  UPDATE equipo
  SET estado = v_estado
  WHERE id_equipo = p_id_equipo
    AND estado <> 'MANTENIMIENTO'
    AND estado <> 'BAJA';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_sync_estado_vehiculo_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_recalcular_estado_vehiculo(OLD.id_vehiculo);
    RETURN OLD;
  ELSE
    PERFORM fn_recalcular_estado_vehiculo(NEW.id_vehiculo);
    IF TG_OP = 'UPDATE' AND NEW.id_vehiculo <> OLD.id_vehiculo THEN
      PERFORM fn_recalcular_estado_vehiculo(OLD.id_vehiculo);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_sync_estado_equipo_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_recalcular_estado_equipo(OLD.id_equipo);
    RETURN OLD;
  ELSE
    PERFORM fn_recalcular_estado_equipo(NEW.id_equipo);
    IF TG_OP = 'UPDATE' AND NEW.id_equipo <> OLD.id_equipo THEN
      PERFORM fn_recalcular_estado_equipo(OLD.id_equipo);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_vo_sync_estado_vehiculo') THEN
    CREATE TRIGGER tr_vo_sync_estado_vehiculo
    AFTER INSERT OR UPDATE OR DELETE ON vehiculo_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_estado_vehiculo_trigger();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_oe_sync_estado_equipo') THEN
    CREATE TRIGGER tr_oe_sync_estado_equipo
    AFTER INSERT OR UPDATE OR DELETE ON operacion_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_estado_equipo_trigger();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_pe_sync_estado_equipo') THEN
    CREATE TRIGGER tr_pe_sync_estado_equipo
    AFTER INSERT OR UPDATE OR DELETE ON personal_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_estado_equipo_trigger();
  END IF;
END $$;

DROP TRIGGER IF EXISTS tr_participante_chat_operacion_modificable ON participante_chat;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'tr_mensaje_chat_operacion_modificable'
  ) THEN
    CREATE TRIGGER tr_mensaje_chat_operacion_modificable
    BEFORE INSERT OR UPDATE OR DELETE ON mensaje_chat
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;
END $$;

-- =========================================================
-- 26) VISTAS RESUMEN ADICIONALES
-- =========================================================
CREATE OR REPLACE VIEW v_operacion_resumen_extendido AS
SELECT
  o.id_operacion,
  o.codigo,
  o.nombre,
  o.estado,
  o.prioridad,
  o.fecha_inicio,
  o.fecha_fin,
  o.fecha_creacion,
  o.fecha_actualizacion,
  o.creada_por,

  (SELECT COUNT(*) FROM asignacion_operacion_personal a
    WHERE a.id_operacion = o.id_operacion
      AND a.estado_asignacion <> 'LIBERADO') AS total_personal_activo,

  (SELECT COUNT(*) FROM asignacion_operacion_personal a
    JOIN personal p ON p.id_personal = a.id_personal
    WHERE a.id_operacion = o.id_operacion
      AND p.rol = 'CET'
      AND a.estado_asignacion <> 'LIBERADO') AS total_cet,

  (SELECT COUNT(*) FROM asignacion_operacion_personal a
    JOIN personal p ON p.id_personal = a.id_personal
    WHERE a.id_operacion = o.id_operacion
      AND p.rol = 'CELL'
      AND a.estado_asignacion <> 'LIBERADO') AS total_cell,

  (SELECT COUNT(*) FROM grupo_operacion g
    WHERE g.id_operacion = o.id_operacion) AS total_grupos,

  (SELECT COUNT(*) FROM vehiculo_operacion vo
    WHERE vo.id_operacion = o.id_operacion
      AND vo.estado_asignacion <> 'LIBERADO') AS total_vehiculos,

  (SELECT COALESCE(SUM(oe.cantidad),0) FROM operacion_equipo oe
    WHERE oe.id_operacion = o.id_operacion
      AND oe.estado_asignacion <> 'LIBERADO') AS total_equipos_reservados,

  (SELECT COUNT(*) FROM puntos_interes poi
    WHERE poi.id_operacion = o.id_operacion
      AND poi.activo = TRUE) AS total_poi,

  (SELECT COUNT(*) FROM area_interes ai
    WHERE ai.id_operacion = o.id_operacion
      AND ai.estado = 'ACTIVA') AS total_areas,

  (SELECT COUNT(*) FROM ruta_operacion ro
    WHERE ro.id_operacion = o.id_operacion
      AND ro.estado IN ('PLANIFICADA','ACTIVA')) AS total_rutas,

  (SELECT COUNT(*) FROM marca_edificio me
    WHERE me.id_operacion = o.id_operacion
      AND me.estado = 'ACTIVO') AS total_estructuras,

  (SELECT co.activo FROM chat_operacion co
    WHERE co.id_operacion = o.id_operacion
    LIMIT 1) AS chat_activo
FROM operacion o;

CREATE OR REPLACE VIEW v_chat_participantes_operacion AS
SELECT
  co.id_operacion,
  co.id_chat,
  pc.id_participante,
  pc.tipo,
  pc.id_usuario,
  pc.id_personal,
  CASE
    WHEN pc.tipo = 'USUARIO' THEN (u.nombre || ' ' || u.apellido)
    ELSE (p.apodo || ' (' || p.rol::text || ')')
  END AS display_name,
  CASE
    WHEN pc.tipo = 'USUARIO' THEN u.username
    ELSE p.username
  END AS username_ref
FROM chat_operacion co
JOIN participante_chat pc ON pc.id_chat = co.id_chat
LEFT JOIN usuario u ON u.id_usuario = pc.id_usuario
LEFT JOIN personal p ON p.id_personal = pc.id_personal;

-- =========================================================
-- 27) RUTA DE NAVEGACIÓN
--    Ruta calculada (origin → destination) para vehículos/personal.
--    Diferente a ruta_operacion (que es un trazo GeoJSON dibujado).
--    Esta almacena una ruta computada con waypoints, distancia y duración.
-- =========================================================
CREATE TABLE IF NOT EXISTS ruta_navegacion (
  id_ruta SERIAL PRIMARY KEY,

  id_operacion INTEGER NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  geojson JSONB NOT NULL, -- LineString con la ruta calculada

  origen_lat  DOUBLE PRECISION NOT NULL,
  origen_lon  DOUBLE PRECISION NOT NULL,

  destino_lat DOUBLE PRECISION NOT NULL,
  destino_lon DOUBLE PRECISION NOT NULL,

  distancia_m DOUBLE PRECISION,
  duracion_s  DOUBLE PRECISION,

  -- Quién creó la ruta: USUARIO o PERSONAL (solo uno)
  created_by_tipo VARCHAR(10)
    CHECK (created_by_tipo IN ('USUARIO','PERSONAL')),

  id_usuario  INTEGER REFERENCES usuario(id_usuario)  ON DELETE SET NULL,
  id_personal INTEGER REFERENCES personal(id_personal) ON DELETE SET NULL,
  activo boolean NOT NULL DEFAULT true,
  fecha_eliminacion timestamp NULL,
  eliminado_por_tipo varchar(20) NULL,
  id_usuario_elim integer NULL,
  id_personal_elim integer NULL,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_creador_ruta_nav
    CHECK (
      (created_by_tipo = 'USUARIO'  AND id_usuario  IS NOT NULL AND id_personal IS NULL)
      OR
      (created_by_tipo = 'PERSONAL' AND id_personal IS NOT NULL AND id_usuario  IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_ruta_navegacion_op
  ON ruta_navegacion(id_operacion);

CREATE INDEX IF NOT EXISTS idx_ruta_navegacion_fecha
  ON ruta_navegacion(fecha_creacion DESC);