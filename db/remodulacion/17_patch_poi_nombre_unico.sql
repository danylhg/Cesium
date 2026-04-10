-- =========================================================
-- 17_patch_poi_nombre_unico.sql
-- Corrige los índices únicos de puntos_interes para que:
--   1. Se scope por operación (no global por usuario)
--   2. Solo restrinjan POIs activos (activo = TRUE)
-- =========================================================

DROP INDEX IF EXISTS uq_poi_usuario;
DROP INDEX IF EXISTS uq_poi_personal;

CREATE UNIQUE INDEX uq_poi_usuario
  ON puntos_interes(id_usuario, id_operacion, nombre)
  WHERE id_usuario IS NOT NULL AND activo = TRUE;

CREATE UNIQUE INDEX uq_poi_personal
  ON puntos_interes(id_personal, id_operacion, nombre)
  WHERE id_personal IS NOT NULL AND activo = TRUE;
