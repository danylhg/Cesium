-- =========================================================
-- ESQUEMA: Operaciones (PostgreSQL) - Usuarios CUT + Personal (CET/CELL)
-- + Subtipos de equipo: equipo_comunicacion / equipo_tactico
-- + Uso de equipo dentro de operación: uso_equipo_operacion
-- =========================================================

-- (Opcional) si quieres limpiar todo y recrear:
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;

-- -------------------------
-- 1) TIPOS ENUM
-- -------------------------
DO $$
BEGIN
  -- usuario (solo CUT)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario_enum') THEN
    CREATE TYPE rol_usuario_enum AS ENUM ('ADMIN');
  END IF;

  -- personal (CET / CELL)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_personal_enum') THEN
    CREATE TYPE rol_personal_enum AS ENUM ('CUT','CET', 'CELL');
  END IF;

  -- participante chat
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_participante_enum') THEN
    CREATE TYPE tipo_participante_enum AS ENUM ('USUARIO','PERSONAL');
  END IF;

  -- equipo
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_equipo_enum') THEN
    CREATE TYPE estado_equipo_enum AS ENUM ('DISPONIBLE', 'ASIGNADO', 'MANTENIMIENTO', 'BAJA');
  END IF;

  -- asignación equipo (personal_equipo)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_equipo_enum') THEN
    CREATE TYPE estado_asig_equipo_enum AS ENUM ('ASIGNADO', 'DEVUELTO', 'DAÑADO', 'PERDIDO');
  END IF;

  -- vehiculo
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_vehiculo_enum') THEN
    CREATE TYPE estado_vehiculo_enum AS ENUM ('DISPONIBLE', 'ASIGNADO', 'MANTENIMIENTO', 'BAJA');
  END IF;

  -- vehiculo_equipo
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_instalacion_enum') THEN
    CREATE TYPE estado_instalacion_enum AS ENUM ('INSTALADO', 'RETIRADO', 'DAÑADO');
  END IF;

  -- operacion prioridad
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prioridad_operacion_enum') THEN
    CREATE TYPE prioridad_operacion_enum AS ENUM ('BAJA', 'MEDIA', 'ALTA');
  END IF;

  -- operacion estado
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_operacion_enum') THEN
    CREATE TYPE estado_operacion_enum AS ENUM ('PLANIFICADA', 'ACTIVA', 'CERRADA', 'CANCELADA');
  END IF;

  -- asignacion a operación (personal)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asignacion_enum') THEN
    CREATE TYPE estado_asignacion_enum AS ENUM ('ASIGNADO', 'CONFIRMADO', 'EN_CURSO', 'LIBERADO');
  END IF;

  -- mensaje_chat
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_mensaje_enum') THEN
    CREATE TYPE tipo_mensaje_enum AS ENUM ('NORMAL', 'SISTEMA', 'URGENTE');
  END IF;

  -- vehiculo_operacion
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_vehiculo_enum') THEN
    CREATE TYPE estado_asig_vehiculo_enum AS ENUM ('ASIGNADO', 'EN_USO', 'LIBERADO');
  END IF;

  -- equipo operación
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_asig_equipo_operacion_enum') THEN
    CREATE TYPE estado_asig_equipo_operacion_enum AS ENUM ('ASIGNADO', 'EN_USO', 'LIBERADO', 'PERDIDO', 'DAÑADO');
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

CREATE TABLE IF NOT EXISTS personal (
  id_personal     SERIAL PRIMARY KEY,
  rol             rol_personal_enum NOT NULL,
  nombre          TEXT NOT NULL,
  apellido        TEXT NOT NULL,
  puesto          TEXT,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por      INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
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

-- -------------------------
-- 2.1) SUBTIPOS DE EQUIPO
-- -------------------------

-- Comunicación (1:1 con equipo)
CREATE TABLE IF NOT EXISTS equipo_comunicacion (
  id_equipo      INT PRIMARY KEY REFERENCES equipo(id_equipo) ON DELETE CASCADE,
  banda          TEXT,
  frecuencia_mhz NUMERIC(10,3),
  cifrado        BOOLEAN NOT NULL DEFAULT FALSE,
  alcance_km     NUMERIC(10,2),
  notas          TEXT
);

-- Táctico (1:1 con equipo)
CREATE TABLE IF NOT EXISTS equipo_tactico (
  id_equipo      INT PRIMARY KEY REFERENCES equipo(id_equipo) ON DELETE CASCADE,
  tipo_tactico   TEXT,
  calibre        TEXT,
  nivel          TEXT,
  notas          TEXT
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
  fecha_inicio    TIMESTAMPTZ,
  fecha_fin       TIMESTAMPTZ,
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creada_por      INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  CONSTRAINT chk_operacion_fechas
    CHECK (
      fecha_inicio IS NULL
      OR fecha_fin IS NULL
      OR fecha_fin >= fecha_inicio
    )
);

-- -------------------------
-- 3) TABLAS PUENTE / ASIGNACIONES
-- -------------------------

-- Personal <-> Equipo (con auditoría de quién asignó)
CREATE TABLE IF NOT EXISTS personal_equipo (
  id_personal       INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  id_equipo         INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
  cantidad          INT NOT NULL DEFAULT 1,
  estado            estado_asig_equipo_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_devolucion  TIMESTAMPTZ,
  asignado_por      INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_personal, id_equipo),
  CHECK (cantidad > 0),
  CHECK (fecha_devolucion IS NULL OR fecha_devolucion >= fecha_asignacion)
);

-- Uso de equipo dentro de una operación (quién lo trae/usa)
CREATE TABLE IF NOT EXISTS uso_equipo_operacion (
  id_operacion     INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_equipo        INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
  id_personal      INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,

  cantidad         INT NOT NULL DEFAULT 1,
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_devolucion TIMESTAMPTZ,
  asignado_por     INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  notas            TEXT,

  PRIMARY KEY (id_operacion, id_equipo, id_personal),
  CHECK (cantidad > 0),
  CHECK (fecha_devolucion IS NULL OR fecha_devolucion >= fecha_asignacion)
);

CREATE INDEX IF NOT EXISTS idx_uso_eq_op_operacion ON uso_equipo_operacion(id_operacion);
CREATE INDEX IF NOT EXISTS idx_uso_eq_op_personal  ON uso_equipo_operacion(id_personal);

-- Vehiculo <-> Equipo
CREATE TABLE IF NOT EXISTS vehiculo_equipo (
  id_vehiculo        INT NOT NULL REFERENCES vehiculo(id_vehiculo) ON DELETE CASCADE,
  id_equipo          INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
  cantidad           INT NOT NULL DEFAULT 1,
  estado             estado_instalacion_enum NOT NULL DEFAULT 'INSTALADO',
  fecha_instalacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_retiro       TIMESTAMPTZ,
  CONSTRAINT pk_vehiculo_equipo
    PRIMARY KEY (id_vehiculo, id_equipo),
  CONSTRAINT chk_vehiculo_equipo_cantidad
    CHECK (cantidad > 0),
  CONSTRAINT chk_vehiculo_equipo_fechas
    CHECK (
      fecha_retiro IS NULL
      OR fecha_retiro >= fecha_instalacion
    )
);

-- Operacion <-> Personal (con auditoría de quién asignó)
CREATE TABLE IF NOT EXISTS asignacion_operacion_personal (
  id_operacion          INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_personal           INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  rol_en_operacion      TEXT,
  estado_asignacion     estado_asignacion_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion  TIMESTAMPTZ,
  asignado_por          INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_operacion, id_personal),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion)
);

-- Operacion <-> Vehiculo
CREATE TABLE IF NOT EXISTS vehiculo_operacion (
  id_operacion          INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_vehiculo           INT NOT NULL REFERENCES vehiculo(id_vehiculo) ON DELETE RESTRICT,
  uso_en_operacion      TEXT,
  estado_asignacion     estado_asig_vehiculo_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion  TIMESTAMPTZ,
  asignado_por          INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  PRIMARY KEY (id_operacion, id_vehiculo),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion)
);

-- Operacion <-> Equipo
CREATE TABLE IF NOT EXISTS operacion_equipo (
  id_operacion_equipo   SERIAL PRIMARY KEY,
  id_operacion          INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_equipo             INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE RESTRICT,
  cantidad              INT NOT NULL DEFAULT 1,
  uso_en_operacion      TEXT,
  estado_asignacion     estado_asig_equipo_operacion_enum NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin_asignacion  TIMESTAMPTZ,
  asignado_por          INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,

  CONSTRAINT uq_operacion_equipo UNIQUE (id_operacion, id_equipo),
  CHECK (cantidad > 0),
  CHECK (fecha_fin_asignacion IS NULL OR fecha_fin_asignacion >= fecha_asignacion)
);

CREATE INDEX IF NOT EXISTS idx_op_eq_busqueda
  ON operacion_equipo(id_operacion, id_equipo);

-- (Opcional) Asegura que el equipo usado en operación esté previamente asignado a la operación
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_uso_equipo_operacion_a_operacion_equipo'
  ) THEN
    ALTER TABLE uso_equipo_operacion
      ADD CONSTRAINT fk_uso_equipo_operacion_a_operacion_equipo
      FOREIGN KEY (id_operacion, id_equipo)
      REFERENCES operacion_equipo (id_operacion, id_equipo)
      ON DELETE CASCADE;
  END IF;
END $$;

-- -------------------------
-- 4) CHAT
-- -------------------------

-- 1 chat por operación
CREATE TABLE IF NOT EXISTS chat_operacion (
  id_chat         SERIAL PRIMARY KEY,
  id_operacion    INT NOT NULL UNIQUE REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_cierre    TIMESTAMPTZ,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_chat_fechas
    CHECK (
      fecha_cierre IS NULL
      OR fecha_cierre >= fecha_creacion
    )
);

CREATE TABLE IF NOT EXISTS participante_chat (
  id_participante  SERIAL PRIMARY KEY,
  id_chat          INT NOT NULL REFERENCES chat_operacion(id_chat) ON DELETE CASCADE,
  tipo             tipo_participante_enum NOT NULL,
  id_usuario       INT REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  id_personal      INT REFERENCES personal(id_personal) ON DELETE CASCADE,

  CONSTRAINT chk_uno_solo
    CHECK (
      (tipo='USUARIO'  AND id_usuario IS NOT NULL AND id_personal IS NULL) OR
      (tipo='PERSONAL' AND id_personal IS NOT NULL AND id_usuario IS NULL)
    ),

  -- Evita duplicados dentro del mismo chat (nota: UNIQUE permite múltiples NULL, pero el CHECK controla la lógica)
  CONSTRAINT uq_participante_usuario_chat UNIQUE (id_chat, id_usuario),
  CONSTRAINT uq_participante_personal_chat UNIQUE (id_chat, id_personal)
);

CREATE TABLE IF NOT EXISTS mensaje_chat (
  id_mensaje       SERIAL PRIMARY KEY,
  id_chat          INT NOT NULL REFERENCES chat_operacion(id_chat) ON DELETE CASCADE,
  id_participante  INT NOT NULL REFERENCES participante_chat(id_participante) ON DELETE CASCADE,
  contenido        TEXT NOT NULL,
  tipo_mensaje     tipo_mensaje_enum NOT NULL DEFAULT 'NORMAL',
  fecha_envio      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- 5) ÍNDICES ÚTILES (rendimiento)
-- -------------------------
CREATE INDEX IF NOT EXISTS idx_poi_usuario         ON puntos_interes(id_usuario);
CREATE INDEX IF NOT EXISTS idx_msg_chat_fecha      ON mensaje_chat(id_chat, fecha_envio DESC);
CREATE INDEX IF NOT EXISTS idx_asig_op_personal    ON asignacion_operacion_personal(id_personal);
CREATE INDEX IF NOT EXISTS idx_veh_op_op           ON vehiculo_operacion(id_operacion);

CREATE INDEX IF NOT EXISTS idx_equipo_com_banda     ON equipo_comunicacion(banda);
CREATE INDEX IF NOT EXISTS idx_equipo_tac_tipo      ON equipo_tactico(tipo_tactico);

-- ------------------------
-- 6) INSERTS (inventario)
-- ------------------------

INSERT INTO equipo (numero_serie, nombre, categoria, marca, modelo, estado)
VALUES
('EQ-001','Radio Táctico','COMUNICACION','Motorola','XTS5000','DISPONIBLE'),
('EQ-002','GPS Militar','NAVEGACION','Garmin','Foretrex','DISPONIBLE'),
('EQ-003','Visor Nocturno','OPTICA','ATN','NVG-7','DISPONIBLE'),
('EQ-004','Dron Reconocimiento','AEREO','DJI','Mavic','DISPONIBLE'),
('EQ-005','Chaleco Balístico','PROTECCION','5.11','TacTec','DISPONIBLE'),
('EQ-006','Casco Balístico','PROTECCION','Ops-Core','FAST','DISPONIBLE'),
('EQ-007','Tablet Rugerizada','COMPUTO','Panasonic','Toughpad','DISPONIBLE'),
('EQ-008','Cámara Óptica','OPTICA','Sony','Alpha','DISPONIBLE'),
('EQ-009','Antena Táctica','COMUNICACION','Harris','RF-7800','DISPONIBLE'),
('EQ-010','Laptop Operativa','COMPUTO','Dell','Latitude','DISPONIBLE'),
('EQ-011','Binoculares','OPTICA','Bushnell','Legend','DISPONIBLE'),
('EQ-012','Sensor Movimiento','SEGURIDAD','Bosch','MotionX','DISPONIBLE'),
('EQ-013','Router Militar','RED','Cisco','ISR','DISPONIBLE'),
('EQ-014','Batería Portátil','ENERGIA','Duracell','ProCell','DISPONIBLE'),
('EQ-015','Generador Eléctrico','ENERGIA','Honda','EU2200','DISPONIBLE'),
('EQ-016','Linterna Táctica','ILUMINACION','Streamlight','TLR-1','DISPONIBLE'),
('EQ-017','Mochila Operativa','LOGISTICA','Camelbak','MilTac','DISPONIBLE'),
('EQ-018','Arnés Seguridad','SEGURIDAD','Petzl','Tactical','DISPONIBLE'),
('EQ-019','Repetidor Señal','COMUNICACION','Motorola','SLR','DISPONIBLE'),
('EQ-020','Cámara Térmica','OPTICA','FLIR','Scout','DISPONIBLE')
ON CONFLICT (numero_serie) DO NOTHING;

INSERT INTO vehiculo (codigo_interno, tipo, marca, modelo, estado)
VALUES
('VH-001','CAMIONETA','Toyota','Hilux','DISPONIBLE'),
('VH-002','CAMIONETA','Ford','Ranger','DISPONIBLE'),
('VH-003','BLINDADO','Jeep','J8','DISPONIBLE'),
('VH-004','CAMION','Mercedes','Unimog','DISPONIBLE'),
('VH-005','LANCHA','Yamaha','Defender','DISPONIBLE'),
('VH-006','CAMIONETA','Nissan','Frontier','DISPONIBLE'),
('VH-007','BLINDADO','Oshkosh','M-ATV','DISPONIBLE'),
('VH-008','CAMION','MAN','HX','DISPONIBLE'),
('VH-009','MOTO','BMW','GS','DISPONIBLE'),
('VH-010','CAMIONETA','Chevrolet','Colorado','DISPONIBLE'),
('VH-011','BLINDADO','Iveco','LMV','DISPONIBLE'),
('VH-012','CAMION','Volvo','FMX','DISPONIBLE'),
('VH-013','LANCHA','Zodiac','Pro','DISPONIBLE'),
('VH-014','MOTO','Honda','XR','DISPONIBLE'),
('VH-015','CAMIONETA','RAM','2500','DISPONIBLE'),
('VH-016','CAMION','Scania','XT','DISPONIBLE'),
('VH-017','BLINDADO','Toyota','Land Cruiser','DISPONIBLE'),
('VH-018','MOTO','Yamaha','XTZ','DISPONIBLE'),
('VH-019','LANCHA','Boston Whaler','Guardian','DISPONIBLE'),
('VH-020','CAMIONETA','Isuzu','D-Max','DISPONIBLE')
ON CONFLICT (codigo_interno) DO NOTHING;
