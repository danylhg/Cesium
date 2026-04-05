-- =========================================================
-- 06b_patch_flotilla.sql
-- PATCH: DESTINOS FLEXIBLES (GRUPO / PERSONAL / VEHICULO)
-- Flotilla es solo agrupación visual, no recibe recursos.
-- Depende de grupo_operacion (creada en 06_grupos_y_mando.sql)
-- =========================================================

-- ─── vehiculo_operacion ───────────────────────────────────
ALTER TABLE vehiculo_operacion
  ADD COLUMN IF NOT EXISTS tipo_destino      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS id_grupo_operacion INT
    REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE SET NULL;

-- Destinos válidos para vehículo:
--   PERSONAL  → id_personal requerido
--   GRUPO     → id_grupo_operacion requerido
--   NULL      → sin destino aún (planificación en curso)
DO $$
BEGIN
  ALTER TABLE vehiculo_operacion ADD CONSTRAINT chk_vehiculo_destino CHECK (
    (tipo_destino = 'PERSONAL' AND id_personal IS NOT NULL) OR
    (tipo_destino = 'GRUPO'    AND id_grupo_operacion IS NOT NULL) OR
    (tipo_destino IS NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── uso_equipo_operacion ─────────────────────────────────

-- 1. Quitar PK antigua (usaba id_personal, que puede ser NULL)
ALTER TABLE uso_equipo_operacion DROP CONSTRAINT IF EXISTS uso_equipo_operacion_pkey;

-- 2. Agregar columnas de destino flexible
ALTER TABLE uso_equipo_operacion
  ALTER COLUMN id_personal DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS id_uso_equipo_operacion SERIAL,
  ADD COLUMN IF NOT EXISTS tipo_destino            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS id_vehiculo             INT
    REFERENCES vehiculo(id_vehiculo) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_grupo_operacion      INT
    REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE SET NULL;

-- 3. Nueva PK sobre columna serial — no depende de ningún destino
DO $$
BEGIN
  ALTER TABLE uso_equipo_operacion
    ADD CONSTRAINT uso_equipo_operacion_pkey
    PRIMARY KEY (id_uso_equipo_operacion);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Índice único para upsert por destino PERSONAL (permite ON CONFLICT en seeds/API)
CREATE UNIQUE INDEX IF NOT EXISTS uq_uso_equipo_personal
  ON uso_equipo_operacion (id_operacion, id_equipo, id_personal)
  WHERE id_personal IS NOT NULL;

-- 5. Destinos válidos para equipo:
--   PERSONAL  → id_personal requerido
--   VEHICULO  → id_vehiculo requerido
--   GRUPO     → id_grupo_operacion requerido
--   NULL      → sin destino aún (planificación en curso)
DO $$
BEGIN
  ALTER TABLE uso_equipo_operacion ADD CONSTRAINT chk_equipo_destino CHECK (
    (tipo_destino = 'PERSONAL' AND id_personal IS NOT NULL) OR
    (tipo_destino = 'VEHICULO' AND id_vehiculo IS NOT NULL) OR
    (tipo_destino = 'GRUPO'    AND id_grupo_operacion IS NOT NULL) OR
    (tipo_destino IS NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
