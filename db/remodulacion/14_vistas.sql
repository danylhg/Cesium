-- =========================================================
-- 14_vistas.sql
-- Vistas del sistema
-- =========================================================

-- 1) Resumen de operación
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
  o.id_cut,
  cut.apodo AS cut_apodo,
  cut.nombre AS cut_nombre,
  cut.apellido AS cut_apellido,

  (SELECT COUNT(*)
   FROM asignacion_operacion_personal a
   WHERE a.id_operacion = o.id_operacion) AS total_personal,

  (SELECT COUNT(*)
   FROM asignacion_operacion_personal a
   JOIN personal p ON p.id_personal = a.id_personal
   WHERE a.id_operacion = o.id_operacion
     AND p.rol = 'CET') AS total_cet,

  (SELECT COUNT(*)
   FROM asignacion_operacion_personal a
   JOIN personal p ON p.id_personal = a.id_personal
   WHERE a.id_operacion = o.id_operacion
     AND p.rol = 'CELL') AS total_cell,

  (SELECT COUNT(*)
   FROM vehiculo_operacion vo
   WHERE vo.id_operacion = o.id_operacion) AS total_vehiculos,

  (SELECT COALESCE(SUM(oe.cantidad), 0)
   FROM operacion_equipo oe
   WHERE oe.id_operacion = o.id_operacion) AS total_equipos_reservados,

  (SELECT COUNT(*)
   FROM grupo_operacion g
   WHERE g.id_operacion = o.id_operacion) AS total_grupos
FROM operacion o
LEFT JOIN personal cut ON cut.id_personal = o.id_cut;

-- 2) Árbol de grupos
CREATE OR REPLACE VIEW v_grupo_arbol AS
SELECT
  g.id_operacion,
  g.id_grupo_operacion,
  g.id_grupo_padre,
  gp.nombre AS nombre_padre,
  gp.apodo AS apodo_padre,
  g.nombre AS nombre_grupo,
  g.apodo AS apodo_grupo,
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

-- 3) Recursos por grupo
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
  COALESCE(v.alias, '') AS recurso_categoria,
  1 AS cantidad,
  gv.estado_asignacion::text AS estado_asignacion,
  gv.uso_en_grupo,
  gv.fecha_asignacion,
  gv.fecha_fin_asignacion,
  gv.asignado_por
FROM grupo_vehiculo gv
JOIN vehiculo v ON v.id_vehiculo = gv.id_vehiculo;

-- 4) Stock por operación/equipo
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
  ), 0) AS repartido_a_grupos,
  (
    oe.cantidad - COALESCE((
      SELECT SUM(ge.cantidad)
      FROM grupo_equipo ge
      WHERE ge.id_operacion = oe.id_operacion
        AND ge.id_equipo = oe.id_equipo
    ), 0)
  ) AS restante_sin_repartir
FROM operacion_equipo oe
JOIN equipo e ON e.id_equipo = oe.id_equipo;

-- 5) Uso de equipo en operación — destino flexible (PERSONAL / VEHICULO / GRUPO)
-- Los tres LEFT JOIN resuelven el destino según tipo_destino.
-- El campo destino_nombre expone el resultado legible sin importar cuál aplica.
-- La flotilla (grupo padre, id_grupo_padre IS NULL) nunca aparece como destino
-- porque los triggers de 13_triggers_operativos.sql lo impiden en la BD.
CREATE OR REPLACE VIEW v_uso_equipo_operacion_detalle AS
SELECT
  ueo.id_uso_equipo_operacion,
  ueo.id_operacion,

  -- equipo
  ueo.id_equipo,
  e.numero_serie       AS equipo_serie,
  e.nombre             AS equipo_nombre,
  e.categoria          AS equipo_categoria,
  ueo.cantidad,

  -- tipo de destino (derivado de las columnas de contexto)
  CASE
    WHEN ueo.id_grupo_operacion IS NOT NULL THEN 'GRUPO'
    WHEN ueo.id_vehiculo_contexto IS NOT NULL THEN 'VEHICULO'
    ELSE 'PERSONAL'
  END AS tipo_destino,

  -- destino: personal
  ueo.id_personal,
  p.rol                AS personal_rol,
  p.apodo              AS personal_apodo,
  p.nombre             AS personal_nombre,
  p.apellido           AS personal_apellido,

  -- destino: vehículo (contexto)
  ueo.id_vehiculo_contexto,
  v.codigo_interno     AS vehiculo_codigo,
  v.alias              AS vehiculo_alias,
  v.tipo               AS vehiculo_tipo,

  -- destino: grupo (solo subgrupos)
  ueo.id_grupo_operacion,
  g.nombre             AS grupo_nombre,
  g.apodo              AS grupo_apodo,

  -- campo resuelto para UI / reportes
  CASE
    WHEN ueo.id_grupo_operacion  IS NOT NULL THEN COALESCE(g.apodo, g.nombre)
    WHEN ueo.id_vehiculo_contexto IS NOT NULL THEN COALESCE(v.alias, v.codigo_interno)
    ELSE COALESCE(p.apodo, p.nombre || ' ' || p.apellido)
  END AS destino_nombre,

  ueo.fecha_asignacion,
  ueo.fecha_devolucion,
  ueo.asignado_por,
  ueo.notas

FROM uso_equipo_operacion ueo
JOIN  equipo          e ON e.id_equipo              = ueo.id_equipo
LEFT JOIN personal    p ON p.id_personal             = ueo.id_personal
LEFT JOIN vehiculo    v ON v.id_vehiculo             = ueo.id_vehiculo_contexto
LEFT JOIN grupo_operacion g ON g.id_grupo_operacion = ueo.id_grupo_operacion;

-- 6) Jerarquía de mando
CREATE OR REPLACE VIEW v_mando_operacion_detalle AS
SELECT
  mo.id_operacion,

  o.id_cut,
  cut.apodo AS cut_apodo,
  cut.nombre AS cut_nombre,
  cut.apellido AS cut_apellido,

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
JOIN operacion o ON o.id_operacion = mo.id_operacion
LEFT JOIN personal cut ON cut.id_personal = o.id_cut
JOIN personal cet ON cet.id_personal = mo.id_cet
JOIN personal cell ON cell.id_personal = mo.id_cell;

-- 7) Feed de chat
CREATE OR REPLACE VIEW v_chat_feed AS
SELECT
  co.id_chat,
  co.id_operacion,
  m.id_mensaje,
  m.fecha_envio,
  m.tipo_mensaje,
  m.contenido,
  m.destinatario_rol,
  m.destino_tipo,
  m.destino_id,
  m.destino_label,

  pc.tipo AS tipo_participante,
  pc.id_usuario,
  pc.id_personal,

  CASE
    WHEN pc.tipo = 'USUARIO' THEN (u.nombre || ' ' || u.apellido)
    ELSE (p.nombre || ' ' || p.apellido || ' (' || p.rol::text || ')')
  END AS autor_nombre
FROM chat_operacion co
JOIN mensaje_chat m ON m.id_chat = co.id_chat
JOIN participante_chat pc ON pc.id_participante = m.id_participante
LEFT JOIN usuario u ON u.id_usuario = pc.id_usuario
LEFT JOIN personal p ON p.id_personal = pc.id_personal;

-- 8) Detalle de puntos de interés
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
  poi.fecha_creacion
FROM puntos_interes poi
LEFT JOIN usuario u ON u.id_usuario = poi.id_usuario
LEFT JOIN personal p ON p.id_personal = poi.id_personal;

-- =========================================================
-- Vistas de tracking y capas de mapa
-- =========================================================

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
  tp."timestamp" AS ultima_actualizacion
FROM tracking_personal tp
JOIN personal p ON p.id_personal = tp.id_personal
ORDER BY tp.id_operacion, tp.id_personal, tp."timestamp" DESC;

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
  tv."timestamp" AS ultima_actualizacion
FROM tracking_vehiculo tv
JOIN vehiculo v ON v.id_vehiculo = tv.id_vehiculo
ORDER BY tv.id_operacion, tv.id_vehiculo, tv."timestamp" DESC;

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

-- =========================================================
-- VISTAS RESUMEN ADICIONALES
-- =========================================================
CREATE OR REPLACE VIEW v_operacion_resumen_extendido AS
SELECT
  o.id_operacion,
  o.codigo,
  o.nombre,
  o.estado,
  o.prioridad,
  o.fecha_inicio,
  o.fecha_fin,
  o.fecha_creacion,
  o.fecha_actualizacion,
  o.creada_por,

  (SELECT COUNT(*) FROM asignacion_operacion_personal a
    WHERE a.id_operacion = o.id_operacion
      AND a.estado_asignacion <> 'LIBERADO') AS total_personal_activo,

  (SELECT COUNT(*) FROM asignacion_operacion_personal a
    JOIN personal p ON p.id_personal = a.id_personal
    WHERE a.id_operacion = o.id_operacion
      AND p.rol = 'CET'
      AND a.estado_asignacion <> 'LIBERADO') AS total_cet,

  (SELECT COUNT(*) FROM asignacion_operacion_personal a
    JOIN personal p ON p.id_personal = a.id_personal
    WHERE a.id_operacion = o.id_operacion
      AND p.rol = 'CELL'
      AND a.estado_asignacion <> 'LIBERADO') AS total_cell,

  (SELECT COUNT(*) FROM grupo_operacion g
    WHERE g.id_operacion = o.id_operacion) AS total_grupos,

  (SELECT COUNT(*) FROM vehiculo_operacion vo
    WHERE vo.id_operacion = o.id_operacion
      AND vo.estado_asignacion <> 'LIBERADO') AS total_vehiculos,

  (SELECT COALESCE(SUM(oe.cantidad),0) FROM operacion_equipo oe
    WHERE oe.id_operacion = o.id_operacion
      AND oe.estado_asignacion <> 'LIBERADO') AS total_equipos_reservados,

  (SELECT COUNT(*) FROM puntos_interes poi
    WHERE poi.id_operacion = o.id_operacion
      AND poi.activo = TRUE) AS total_poi,

  (SELECT COUNT(*) FROM area_interes ai
    WHERE ai.id_operacion = o.id_operacion
      AND ai.estado = 'ACTIVA') AS total_areas,

  (SELECT COUNT(*) FROM ruta_operacion ro
    WHERE ro.id_operacion = o.id_operacion
      AND ro.estado IN ('PLANIFICADA','ACTIVA')) AS total_rutas,

  (SELECT COUNT(*) FROM marca_edificio me
    WHERE me.id_operacion = o.id_operacion
      AND me.estado = 'ACTIVO') AS total_estructuras,

  (SELECT co.activo FROM chat_operacion co
    WHERE co.id_operacion = o.id_operacion
    LIMIT 1) AS chat_activo
FROM operacion o;

CREATE OR REPLACE VIEW v_chat_participantes_operacion AS
SELECT
  co.id_operacion,
  co.id_chat,
  pc.id_participante,
  pc.tipo,
  pc.id_usuario,
  pc.id_personal,
  CASE
    WHEN pc.tipo = 'USUARIO' THEN (u.nombre || ' ' || u.apellido)
    ELSE (p.apodo || ' (' || p.rol::text || ')')
  END AS display_name,
  CASE
    WHEN pc.tipo = 'USUARIO' THEN u.username
    ELSE p.username
  END AS username_ref
FROM chat_operacion co
JOIN participante_chat pc ON pc.id_chat = co.id_chat
LEFT JOIN usuario u ON u.id_usuario = pc.id_usuario
LEFT JOIN personal p ON p.id_personal = pc.id_personal;
