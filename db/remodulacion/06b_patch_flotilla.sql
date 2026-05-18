-- =========================================================
-- 06b_patch_flotilla.sql
-- PATCH: RESPONSABILIDAD HUMANA Y NIVELES JERÁRQUICOS
-- Ajuste para que los recursos siempre cuelguen de personas
-- con contexto de grupo/flotilla.
-- =========================================================

-- ─── grupo_operacion: nombre de flotilla obligatorio ──────
-- Se mantiene: la agrupación visual requiere un nombre claro.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_flotilla_nombre_requerido') THEN
    ALTER TABLE grupo_operacion ADD CONSTRAINT chk_flotilla_nombre_requerido CHECK (
      apodo IS DISTINCT FROM 'FLOTILLA'
      OR (nombre IS NOT NULL AND trim(nombre) <> '')
    );
  END IF;
END $$;

-- ─── vehiculo_operacion ───────────────────────────────────
-- Eliminamos el concepto de "tipo_destino" excluyente.
-- Ahora usamos "nivel_asignacion" para el árbol jerárquico.

ALTER TABLE vehiculo_operacion
  ADD COLUMN IF NOT EXISTS id_grupo_operacion INT
    REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE SET NULL;

-- Eliminamos la restricción antigua que obligaba a elegir entre Persona o Grupo.
-- En el nuevo modelo, id_personal es obligatorio (ya definido en 05_asignaciones.sql)
-- e id_grupo_operacion es el contexto opcional.
ALTER TABLE vehiculo_operacion DROP CONSTRAINT IF EXISTS chk_vehiculo_destino;

DO $$
BEGIN
  -- Nueva validación: El vehículo siempre debe tener un humano responsable.
  -- El id_grupo_operacion indica en qué parte del árbol aparece esa responsabilidad.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vehiculo_responsable_humano') THEN
    ALTER TABLE vehiculo_operacion ADD CONSTRAINT chk_vehiculo_responsable_humano CHECK (
      id_personal IS NOT NULL
    );
  END IF;
END $$;


-- ─── uso_equipo_operacion ─────────────────────────────────

-- 1. Asegurar PK sobre columna serial para permitir múltiples asignaciones del mismo equipo
ALTER TABLE uso_equipo_operacion DROP CONSTRAINT IF EXISTS uso_equipo_operacion_pkey;

ALTER TABLE uso_equipo_operacion
  ADD COLUMN IF NOT EXISTS id_uso_equipo_operacion SERIAL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uso_equipo_operacion_pkey') THEN
    ALTER TABLE uso_equipo_operacion ADD CONSTRAINT uso_equipo_operacion_pkey PRIMARY KEY (id_uso_equipo_operacion);
  END IF;
END $$;

-- 2. Ajustar columnas de contexto para equipo
ALTER TABLE uso_equipo_operacion
  ALTER COLUMN id_personal SET NOT NULL, -- Siempre debe haber un humano responsable
  ADD COLUMN IF NOT EXISTS id_vehiculo_contexto INT 
    REFERENCES vehiculo(id_vehiculo) ON DELETE SET NULL, -- Si el equipo está asignado vía un vehículo
  ADD COLUMN IF NOT EXISTS id_grupo_operacion INT
    REFERENCES grupo_operacion(id_grupo_operacion) ON DELETE SET NULL;

-- 3. Eliminar validación de destino excluyente para equipos
ALTER TABLE uso_equipo_operacion DROP CONSTRAINT IF EXISTS chk_equipo_destino;

-- 4. Índice para evitar duplicar la misma responsabilidad exacta
-- (Mismo equipo, misma persona, mismo contexto de grupo).
-- NULLS NOT DISTINCT evita duplicados cuando el contexto es NULL.
DROP INDEX IF EXISTS uq_uso_equipo_personal;
DROP INDEX IF EXISTS uq_uso_equipo_responsable_contexto;
CREATE UNIQUE INDEX uq_uso_equipo_responsable_contexto
  ON uso_equipo_operacion (
    id_operacion,
    id_equipo,
    id_personal,
    id_grupo_operacion
  )
  NULLS NOT DISTINCT;

-- 5. Nueva validación simple para equipos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_equipo_siempre_personal') THEN
    ALTER TABLE uso_equipo_operacion ADD CONSTRAINT chk_equipo_siempre_personal CHECK (
      id_personal IS NOT NULL
    );
  END IF;
END $$;
