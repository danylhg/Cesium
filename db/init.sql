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

CREATE INDEX IF NOT EXISTS idx_ruta_operacion
  ON ruta_operacion(id_operacion);
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

  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tp_latitud  CHECK (latitud  BETWEEN -90  AND  90),
  CONSTRAINT chk_tp_longitud CHECK (longitud BETWEEN -180 AND 180)
);

-- Índice principal: consultas de historial y última posición
CREATE INDEX IF NOT EXISTS idx_tracking_personal_op_per_ts
  ON tracking_personal(id_operacion, id_personal, timestamp DESC);

-- Índice para purgas por tiempo
CREATE INDEX IF NOT EXISTS idx_tracking_personal_ts
  ON tracking_personal(timestamp DESC);
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

  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tv_latitud  CHECK (latitud  BETWEEN -90  AND  90),
  CONSTRAINT chk_tv_longitud CHECK (longitud BETWEEN -180 AND 180),
  CONSTRAINT chk_tv_rumbo    CHECK (
    rumbo_grados IS NULL OR rumbo_grados BETWEEN 0 AND 360
  )
);

CREATE INDEX IF NOT EXISTS idx_tracking_vehiculo_op_veh_ts
  ON tracking_vehiculo(id_operacion, id_vehiculo, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_vehiculo_ts
  ON tracking_vehiculo(timestamp DESC);
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
  tp.timestamp AS ultima_actualizacion
FROM tracking_personal tp
JOIN personal p ON p.id_personal = tp.id_personal
ORDER BY tp.id_operacion, tp.id_personal, tp.timestamp DESC;

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
  tv.timestamp AS ultima_actualizacion
FROM tracking_vehiculo tv
JOIN vehiculo v ON v.id_vehiculo = tv.id_vehiculo
ORDER BY tv.id_operacion, tv.id_vehiculo, tv.timestamp DESC;

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