-- =========================================================
-- 19_patch_poi_sidc.sql
-- Compatibilidad explícita para SIDC persistido en POIs
-- =========================================================

ALTER TABLE puntos_interes
  ADD COLUMN IF NOT EXISTS sidc TEXT;
