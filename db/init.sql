-- =========================================================
-- ESQUEMA: Operaciones (PostgreSQL)
-- =========================================================

-- (Opcional) si quieres limpiar todo y recrear:
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;

-- -------------------------
-- 1) TIPOS ENUM
-- -------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario_enum') THEN
    CREATE TYPE rol_usuario_enum AS ENUM ('CUT', 'CET', 'CEL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_equipo_enum') THEN
    CREATE TYPE estado_equipo_enum AS ENUM ('DISPONIBLE', 'ASIGNADO', 'MANTENIMIENTO', 'BAJA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_equipo_enum') THEN
    CREATE TYPE estado_asig_equipo_enum AS ENUM ('ASIGNADO', 'DEVUELTO', 'DAÑADO', 'PERDIDO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_vehiculo_enum') THEN
    CREATE TYPE estado_vehiculo_enum AS ENUM ('DISPONIBLE', 'ASIGNADO', 'MANTENIMIENTO', 'BAJA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_instalacion_enum') THEN
    CREATE TYPE estado_instalacion_enum AS ENUM ('INSTALADO', 'RETIRADO', 'DAÑADO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prioridad_operacion_enum') THEN
    CREATE TYPE prioridad_operacion_enum AS ENUM ('BAJA', 'MEDIA', 'ALTA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_operacion_enum') THEN
    CREATE TYPE estado_operacion_enum AS ENUM ('PLANIFICADA', 'ACTIVA', 'CERRADA', 'CANCELADA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asignacion_enum') THEN
    CREATE TYPE estado_asignacion_enum AS ENUM ('ASIGNADO', 'CONFIRMADO', 'EN_CURSO', 'LIBERADO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_mensaje_enum') THEN
    CREATE TYPE tipo_mensaje_enum AS ENUM ('NORMAL', 'SISTEMA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_vehiculo_enum') THEN
    CREATE TYPE estado_asig_vehiculo_enum AS ENUM ('ASIGNADO', 'EN_USO', 'LIBERADO');
  END IF;
END $$;

-- -------------------------
-- 2) TABLAS BASE
-- -------------------------

CREATE TABLE IF NOT EXISTS usuario (
  id_usuario      SERIAL PRIMARY KEY,
  rol             rol_usuario_enum NOT NULL,
  nombre          TEXT NOT NULL,
  apellido        TEXT NOT NULL,
  puesto          TEXT,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_acceso   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS puntos_interes (
  id_poi          SERIAL PRIMARY KEY,
  id_usuario      INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  tipo_poi        TEXT NOT NULL,
  latitud         NUMERIC(9,6) NOT NULL,
  longitud        NUMERIC(9,6) NOT NULL,
  descripcion     TEXT,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipo (
  id_equipo      SERIAL PRIMARY KEY,
  numero_serie   TEXT NOT NULL UNIQUE,
  nombre         TEXT NOT NULL,
  categoria      TEXT NOT NULL,
  marca          TEXT,
  modelo         TEXT,
  estado         estado_equipo_enum NOT NULL DEFAULT 'DISPONIBLE',
  activo         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS vehiculo (
  id_vehiculo     SERIAL PRIMARY KEY,
  codigo_interno  TEXT NOT NULL UNIQUE,
  tipo            TEXT NOT NULL,
  marca           TEXT,
  modelo          TEXT,
  estado          estado_vehiculo_enum NOT NULL DEFAULT 'DISPONIBLE',
  activo          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS operacion (
  id_operacion    SERIAL PRIMARY KEY,
  codigo          TEXT NOT NULL UNIQUE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  prioridad       prioridad_operacion_enum NOT NULL DEFAULT 'MEDIA',
  estado          estado_operacion_enum NOT NULL DEFAULT 'PLANIFICADA',
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creada_por      INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT
);

-- -------------------------
-- 3) TABLAS PUENTE / ASIGNACIONES
-- -------------------------

-- Usuario <-> Equipo
CREATE TABLE IF NOT EXISTS usuario_equipo (
  id_usuario        INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_equipo         INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
  cantidad          INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  estado            estado_asig_equipo_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_devolucion  TIMESTAMPTZ,
  PRIMARY KEY (id_usuario, id_equipo)
);

-- Vehiculo <-> Equipo
CREATE TABLE IF NOT EXISTS vehiculo_equipo (
  id_vehiculo        INT NOT NULL REFERENCES vehiculo(id_vehiculo) ON DELETE CASCADE,
  id_equipo          INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
  cantidad           INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  estado             estado_instalacion_enum NOT NULL DEFAULT 'INSTALADO',
  fecha_instalacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_retiro       TIMESTAMPTZ,
  PRIMARY KEY (id_vehiculo, id_equipo)
);

-- Operacion <-> Usuario
CREATE TABLE IF NOT EXISTS asignacion_operacion (
  id_operacion       INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_usuario         INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  rol_en_operacion   TEXT,
  estado_asignacion  estado_asignacion_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id_operacion, id_usuario)
);

-- Operacion <-> Vehiculo
CREATE TABLE IF NOT EXISTS vehiculo_operacion (
  id_operacion       INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_vehiculo        INT NOT NULL REFERENCES vehiculo(id_vehiculo) ON DELETE RESTRICT,
  uso_en_operacion   TEXT,
  estado_asignacion  estado_asig_vehiculo_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id_operacion, id_vehiculo)
);

-- -------------------------
-- 4) CHAT
-- -------------------------

-- 1 chat por operación: id_operacion UNIQUE
CREATE TABLE IF NOT EXISTS chat_operacion (
  id_chat         SERIAL PRIMARY KEY,
  id_operacion    INT NOT NULL UNIQUE REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activo          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS mensaje_chat (
  id_mensaje    SERIAL PRIMARY KEY,
  id_chat       INT NOT NULL REFERENCES chat_operacion(id_chat) ON DELETE CASCADE,
  id_usuario    INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  contenido     TEXT NOT NULL,
  tipo_mensaje  tipo_mensaje_enum NOT NULL DEFAULT 'NORMAL',
  fecha_envio   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- 5) ÍNDICES ÚTILES (rendimiento)
-- -------------------------
CREATE INDEX IF NOT EXISTS idx_poi_usuario       ON puntos_interes(id_usuario);
CREATE INDEX IF NOT EXISTS idx_msg_chat_fecha    ON mensaje_chat(id_chat, fecha_envio DESC);
CREATE INDEX IF NOT EXISTS idx_asig_op_usuario   ON asignacion_operacion(id_usuario);
CREATE INDEX IF NOT EXISTS idx_veh_op_op         ON vehiculo_operacion(id_operacion);
