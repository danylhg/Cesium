-- =========================================================
-- 1) DEFINICIÓN DE TIPOS ENUM (DOMINIOS CONTROLADOS)
-- =========================================================

DO $$
BEGIN
  -- Roles del sistema (usuarios administradores CUT)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario_enum') THEN
    CREATE TYPE rol_usuario_enum AS ENUM ('ADMIN');
  END IF;

  -- Roles del personal operativo
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_personal_enum') THEN
    CREATE TYPE rol_personal_enum AS ENUM ('CUT','CET','CELL');
  END IF;

  -- Tipo de participante en chat
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_participante_enum') THEN
    CREATE TYPE tipo_participante_enum AS ENUM ('USUARIO','PERSONAL');
  END IF;

  -- Estados generales de equipo
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_equipo_enum') THEN
    CREATE TYPE estado_equipo_enum AS ENUM ('DISPONIBLE','ASIGNADO','MANTENIMIENTO','BAJA');
  END IF;

  -- Estados de asignación de equipo a personal
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_equipo_enum') THEN
    CREATE TYPE estado_asig_equipo_enum AS ENUM ('ASIGNADO','DEVUELTO','DAÑADO','PERDIDO');
  END IF;

  -- Estados generales de vehículo
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_vehiculo_enum') THEN
    CREATE TYPE estado_vehiculo_enum AS ENUM ('DISPONIBLE','ASIGNADO','MANTENIMIENTO','BAJA');
  END IF;

  -- Estados de instalación de equipo en vehículo
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_instalacion_enum') THEN
    CREATE TYPE estado_instalacion_enum AS ENUM ('INSTALADO','RETIRADO','DAÑADO');
  END IF;

  -- Prioridad operativa
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prioridad_operacion_enum') THEN
    CREATE TYPE prioridad_operacion_enum AS ENUM ('BAJA','MEDIA','ALTA');
  END IF;

  -- Estado de operación
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_operacion_enum') THEN
    CREATE TYPE estado_operacion_enum AS ENUM ('PLANIFICADA','ACTIVA','CERRADA','CANCELADA');
  END IF;

  -- Estado de asignación de personal a operación
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asignacion_enum') THEN
    CREATE TYPE estado_asignacion_enum AS ENUM ('ASIGNADO','CONFIRMADO','EN_CURSO','LIBERADO');
  END IF;

  -- Tipo de mensaje en chat
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_mensaje_enum') THEN
    CREATE TYPE tipo_mensaje_enum AS ENUM ('NORMAL','SISTEMA','URGENTE');
  END IF;

  -- Estado de asignación de vehículo a operación
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_vehiculo_enum') THEN
    CREATE TYPE estado_asig_vehiculo_enum AS ENUM ('ASIGNADO','EN_USO','LIBERADO');
  END IF;

  -- Estado de equipo dentro de operación
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_equipo_operacion_enum') THEN
    CREATE TYPE estado_asig_equipo_operacion_enum AS ENUM ('ASIGNADO','EN_USO','LIBERADO','PERDIDO','DAÑADO');
  END IF;
END $$;


-- =========================================================
-- 2) TABLAS BASE DEL SISTEMA
-- =========================================================

-- Usuarios administradores (CUT)
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

-- Personal operativo (CUT/CET/CELL)
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

-- Puntos geográficos de interés
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
-- 3) INVENTARIO: EQUIPO Y VEHÍCULOS
-- =========================================================

-- Tabla base de equipo
CREATE TABLE IF NOT EXISTS equipo (
  id_equipo SERIAL PRIMARY KEY,
  numero_serie TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL,
  estado estado_equipo_enum NOT NULL DEFAULT 'DISPONIBLE'
);

-- Subtipo: Equipo de comunicación
CREATE TABLE IF NOT EXISTS equipo_comunicacion (
  id_equipo INT PRIMARY KEY REFERENCES equipo(id_equipo) ON DELETE CASCADE,
  imagen_eqcom TEXT,
  marca TEXT,
  modelo TEXT,
  notas TEXT
);

-- Subtipo: Equipo táctico
CREATE TABLE IF NOT EXISTS equipo_tactico (
  id_equipo INT PRIMARY KEY REFERENCES equipo(id_equipo) ON DELETE CASCADE,
  imagen_eqtac TEXT,
  tipo_tactico TEXT,
  calibre TEXT,
  nivel TEXT,
  notas TEXT
);

-- Inventario de vehículos
CREATE TABLE IF NOT EXISTS vehiculo (
  id_vehiculo SERIAL PRIMARY KEY,
  imagen_veh TEXT,
  codigo_interno TEXT NOT NULL UNIQUE,
  marca TEXT,
  modelo TEXT,
  estado estado_vehiculo_enum NOT NULL DEFAULT 'DISPONIBLE'
);


-- =========================================================
-- 4) GESTIÓN DE OPERACIONES
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
-- 5) RELACIONES Y ASIGNACIONES OPERATIVAS
-- =========================================================

-- Personal asignado a operación
CREATE TABLE IF NOT EXISTS asignacion_operacion_personal (
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_personal INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  rol_en_operacion TEXT,
  estado_asignacion estado_asignacion_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_operacion,id_personal),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion)
);

-- Vehículos asignados a operación
CREATE TABLE IF NOT EXISTS vehiculo_operacion (
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_vehiculo INT NOT NULL REFERENCES vehiculo(id_vehiculo) ON DELETE RESTRICT,
  uso_en_operacion TEXT,
  estado_asignacion estado_asig_vehiculo_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_operacion,id_vehiculo),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion)
);

-- Equipo asignado a operación
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
  UNIQUE (id_operacion,id_equipo),
  CHECK (cantidad > 0),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion)
);


-- =========================================================
-- 6) MÓDULO DE CHAT OPERACIONAL
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
  UNIQUE (id_chat,id_usuario),
  UNIQUE (id_chat,id_personal)
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
-- 7) CONFIGURACIÓN JSON DE ASIGNACIONES (ESTRUCTURA AUXILIAR)
-- =========================================================

CREATE TABLE IF NOT EXISTS operacion_asignaciones (
  id_operacion INT PRIMARY KEY REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  assignments JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- 8) DATOS INICIALES (SEED)
-- =========================================================

-- Vehículos preconfigurados
INSERT INTO vehiculo (imagen_veh, codigo_interno, marca, modelo, estado)
VALUES
('./uploads/vehiculo/Alacran.jpeg','VH-001','Alacran','Táctico','DISPONIBLE'),
('./uploads/vehiculo/Dron vant 01.jpeg','VH-002','Dron','VANT 01','DISPONIBLE'),
('./uploads/vehiculo/Ford F-150.jpeg','VH-003','Ford','F-150','DISPONIBLE'),
('./uploads/vehiculo/Panther.jpeg','VH-004','Panther','Blindado','DISPONIBLE'),
('./uploads/vehiculo/Scualo.jpeg','VH-005','Scualo','Interceptor','DISPONIBLE')
ON CONFLICT (codigo_interno) DO NOTHING;

-- Equipo de comunicación preconfigurado
INSERT INTO equipo (numero_serie, nombre, categoria, estado)
VALUES ('HFC-001','Harris Falcon','COMUNICACION','DISPONIBLE');

INSERT INTO equipo_comunicacion (id_equipo, imagen_eqcom, marca, modelo, notas)
VALUES (
  currval('equipo_id_equipo_seq'),
  './uploads/equipo/comunicacion/Harris Falcon.jpeg',
  'Harris',
  'Falcon III',
  'Radio táctico multibanda'
);
