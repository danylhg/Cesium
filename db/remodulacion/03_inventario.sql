-- =========================================================
-- 03_inventario.sql
-- Inventario: equipo y vehiculos
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
-- PATCH: asegurar fecha_creacion en vehiculo
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