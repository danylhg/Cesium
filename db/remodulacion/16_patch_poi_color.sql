-- =========================================================
-- 16_patch_poi_color.sql
-- Agrega campo color a puntos_interes y actualiza vistas
-- =========================================================

-- 1) Agregar color a puntos_interes
ALTER TABLE puntos_interes
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#FFD700';

ALTER TABLE puntos_interes
  ADD COLUMN IF NOT EXISTS icono_src TEXT;

ALTER TABLE puntos_interes
  ADD COLUMN IF NOT EXISTS sidc TEXT;

-- 2) Actualizar v_poi_detalle para exponer color
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
  poi.icono_src,
  poi.sidc,
  poi.id_operacion,
  poi.activo,
  poi.fecha_creacion,
  poi.color
FROM puntos_interes poi
LEFT JOIN usuario u ON u.id_usuario = poi.id_usuario
LEFT JOIN personal p ON p.id_personal = poi.id_personal;

-- 3) Actualizar v_capas_mapa_operacion para incluir color de POI
CREATE OR REPLACE VIEW v_capas_mapa_operacion AS
SELECT
  id_operacion,
  'POI'::text AS tipo_capa,
  id_poi::int AS id_elemento,
  nombre,
  tipo_poi AS subtipo,
  latitud,
  longitud,
  NULL::jsonb AS geometria,
  color,
  icono_src,
  sidc,
  activo::text AS estado,
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
  NULL::text,
  NULL::text,
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
  NULL::text,
  NULL::text,
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
  NULL::text,
  NULL::text,
  estado::text,
  fecha_creacion
FROM marca_edificio
WHERE estado = 'ACTIVO';
