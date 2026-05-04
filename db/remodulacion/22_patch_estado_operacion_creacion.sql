-- =========================================================
-- 22_patch_estado_operacion_creacion.sql
-- Captura el estado de la operacion al crear objetos hijos.
-- =========================================================

-- Campo comun:
--   estado_operacion_creacion
--
-- Significado:
--   Estado real de la operacion al momento de insertar el registro.
--   Permite distinguir objetos creados cuando la operacion estaba
--   PLANIFICADA de los creados cuando ya estaba ACTIVA.

ALTER TABLE asignacion_operacion_personal ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE vehiculo_operacion            ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE operacion_equipo              ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE uso_equipo_operacion          ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE grupo_operacion               ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE grupo_personal                ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE grupo_equipo                  ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE grupo_vehiculo                ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE mando_operacion               ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE chat_operacion                ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE mensaje_chat                  ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE puntos_interes                ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE dibujo_libre_operacion        ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE area_interes                  ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE ruta_operacion                ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE marca_edificio                ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE ruta_navegacion               ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE zona_operacion                ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE tracking_personal             ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE tracking_vehiculo             ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE aviso_operacion               ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE novedad_operacion             ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;
ALTER TABLE operacion_evento              ADD COLUMN IF NOT EXISTS estado_operacion_creacion estado_operacion_enum;

CREATE OR REPLACE FUNCTION fn_set_estado_operacion_creacion()
RETURNS TRIGGER AS $$
DECLARE
  v_id_operacion INT;
  v_estado estado_operacion_enum;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.estado_operacion_creacion IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN (
    'asignacion_operacion_personal',
    'vehiculo_operacion',
    'operacion_equipo',
    'uso_equipo_operacion',
    'grupo_operacion',
    'grupo_equipo',
    'grupo_vehiculo',
    'mando_operacion',
    'chat_operacion',
    'puntos_interes',
    'dibujo_libre_operacion',
    'area_interes',
    'ruta_operacion',
    'marca_edificio',
    'ruta_navegacion',
    'zona_operacion',
    'tracking_personal',
    'tracking_vehiculo',
    'aviso_operacion',
    'novedad_operacion',
    'operacion_evento'
  ) THEN
    v_id_operacion := NEW.id_operacion;
  ELSIF TG_TABLE_NAME = 'grupo_personal' THEN
    SELECT go.id_operacion
      INTO v_id_operacion
    FROM grupo_operacion go
    WHERE go.id_grupo_operacion = NEW.id_grupo_operacion
    LIMIT 1;
  ELSIF TG_TABLE_NAME = 'mensaje_chat' THEN
    SELECT co.id_operacion
      INTO v_id_operacion
    FROM chat_operacion co
    WHERE co.id_chat = NEW.id_chat
    LIMIT 1;
  END IF;

  IF v_id_operacion IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT estado
    INTO v_estado
  FROM operacion
  WHERE id_operacion = v_id_operacion
  LIMIT 1;

  NEW.estado_operacion_creacion := v_estado;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reemplazo seguro del trigger general de modificabilidad. Evita tocar
-- columnas que no existen cuando la funcion corre sobre otra tabla.
CREATE OR REPLACE FUNCTION fn_validar_operacion_modificable()
RETURNS TRIGGER AS $$
DECLARE
  v_id_operacion INT;
  v_estado estado_operacion_enum;
BEGIN
  v_id_operacion := NULL;

  IF TG_TABLE_NAME IN (
    'asignacion_operacion_personal',
    'vehiculo_operacion',
    'uso_equipo_operacion',
    'operacion_equipo',
    'grupo_operacion',
    'grupo_equipo',
    'grupo_vehiculo',
    'mando_operacion',
    'puntos_interes',
    'area_interes',
    'ruta_operacion',
    'marca_edificio',
    'zona_operacion',
    'chat_operacion',
    'aviso_operacion',
    'novedad_operacion',
    'tracking_personal',
    'tracking_vehiculo'
  ) THEN
    v_id_operacion := COALESCE(NEW.id_operacion, OLD.id_operacion);
  END IF;

  IF TG_TABLE_NAME = 'grupo_personal' THEN
    SELECT go.id_operacion
    INTO v_id_operacion
    FROM grupo_operacion go
    WHERE go.id_grupo_operacion = COALESCE(NEW.id_grupo_operacion, OLD.id_grupo_operacion)
    LIMIT 1;
  END IF;

  IF TG_TABLE_NAME = 'participante_chat' THEN
    SELECT co.id_operacion
    INTO v_id_operacion
    FROM chat_operacion co
    WHERE co.id_chat = COALESCE(NEW.id_chat, OLD.id_chat)
    LIMIT 1;
  END IF;

  IF TG_TABLE_NAME = 'mensaje_chat' THEN
    SELECT co.id_operacion
    INTO v_id_operacion
    FROM chat_operacion co
    WHERE co.id_chat = COALESCE(NEW.id_chat, OLD.id_chat)
    LIMIT 1;
  END IF;

  IF v_id_operacion IS NULL THEN
    RAISE EXCEPTION
      'No se pudo resolver id_operacion para la tabla % en fn_validar_operacion_modificable()',
      TG_TABLE_NAME;
  END IF;

  SELECT o.estado INTO v_estado
  FROM operacion o
  WHERE o.id_operacion = v_id_operacion;

  IF v_estado IN ('CERRADA','CANCELADA') THEN
    IF TG_TABLE_NAME = 'mensaje_chat' THEN
      IF NEW.tipo_mensaje = 'SISTEMA' THEN
        RETURN NEW;
      END IF;
    END IF;

    IF TG_TABLE_NAME = 'asignacion_operacion_personal' THEN
      IF TG_OP = 'UPDATE' AND NEW.estado_asignacion = 'LIBERADO' THEN
        RETURN NEW;
      END IF;
    END IF;

    IF TG_TABLE_NAME = 'vehiculo_operacion' THEN
      IF TG_OP = 'UPDATE' AND NEW.estado_asignacion = 'LIBERADO' THEN
        RETURN NEW;
      END IF;
    END IF;

    IF TG_TABLE_NAME = 'operacion_equipo' THEN
      IF TG_OP = 'UPDATE' AND NEW.estado_asignacion = 'LIBERADO' THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION
      'La operacion % esta en estado %, no se permiten modificaciones en %',
      v_id_operacion, v_estado, TG_TABLE_NAME;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('asignacion_operacion_personal'),
      ('vehiculo_operacion'),
      ('operacion_equipo'),
      ('uso_equipo_operacion'),
      ('grupo_operacion'),
      ('grupo_personal'),
      ('grupo_equipo'),
      ('grupo_vehiculo'),
      ('mando_operacion'),
      ('chat_operacion'),
      ('mensaje_chat'),
      ('puntos_interes'),
      ('dibujo_libre_operacion'),
      ('area_interes'),
      ('ruta_operacion'),
      ('marca_edificio'),
      ('ruta_navegacion'),
      ('zona_operacion'),
      ('tracking_personal'),
      ('tracking_vehiculo'),
      ('aviso_operacion'),
      ('novedad_operacion'),
      ('operacion_evento')
    ) AS t(tabla)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tr_estado_operacion_creacion ON %I', r.tabla);
    EXECUTE format(
      'CREATE TRIGGER tr_estado_operacion_creacion
       BEFORE INSERT ON %I
       FOR EACH ROW
       EXECUTE FUNCTION fn_set_estado_operacion_creacion()',
      r.tabla
    );
  END LOOP;
END $$;

-- Backfill para datos existentes. Para registros viejos no se puede saber
-- el estado historico exacto; se usa el estado actual de la operacion.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('asignacion_operacion_personal'),
      ('vehiculo_operacion'),
      ('operacion_equipo'),
      ('uso_equipo_operacion'),
      ('grupo_operacion'),
      ('grupo_personal'),
      ('grupo_equipo'),
      ('grupo_vehiculo'),
      ('mando_operacion'),
      ('chat_operacion'),
      ('mensaje_chat'),
      ('puntos_interes'),
      ('dibujo_libre_operacion'),
      ('area_interes'),
      ('ruta_operacion'),
      ('marca_edificio'),
      ('ruta_navegacion'),
      ('zona_operacion'),
      ('tracking_personal'),
      ('tracking_vehiculo'),
      ('aviso_operacion'),
      ('novedad_operacion'),
      ('operacion_evento')
    ) AS t(tabla)
  LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', r.tabla);
  END LOOP;
END $$;

UPDATE asignacion_operacion_personal t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE vehiculo_operacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE operacion_equipo t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE uso_equipo_operacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE grupo_operacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE grupo_equipo t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE grupo_vehiculo t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE mando_operacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE chat_operacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE puntos_interes t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE dibujo_libre_operacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE area_interes t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE ruta_operacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE marca_edificio t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE ruta_navegacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE zona_operacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE tracking_personal t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE tracking_vehiculo t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE aviso_operacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE novedad_operacion t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;
UPDATE operacion_evento t SET estado_operacion_creacion = o.estado
FROM operacion o WHERE t.id_operacion = o.id_operacion AND t.estado_operacion_creacion IS NULL;

UPDATE grupo_personal gp SET estado_operacion_creacion = o.estado
FROM grupo_operacion go
JOIN operacion o ON o.id_operacion = go.id_operacion
WHERE gp.id_grupo_operacion = go.id_grupo_operacion
  AND gp.estado_operacion_creacion IS NULL;

UPDATE mensaje_chat m SET estado_operacion_creacion = o.estado
FROM chat_operacion co
JOIN operacion o ON o.id_operacion = co.id_operacion
WHERE m.id_chat = co.id_chat
  AND m.estado_operacion_creacion IS NULL;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('asignacion_operacion_personal'),
      ('vehiculo_operacion'),
      ('operacion_equipo'),
      ('uso_equipo_operacion'),
      ('grupo_operacion'),
      ('grupo_personal'),
      ('grupo_equipo'),
      ('grupo_vehiculo'),
      ('mando_operacion'),
      ('chat_operacion'),
      ('mensaje_chat'),
      ('puntos_interes'),
      ('dibujo_libre_operacion'),
      ('area_interes'),
      ('ruta_operacion'),
      ('marca_edificio'),
      ('ruta_navegacion'),
      ('zona_operacion'),
      ('tracking_personal'),
      ('tracking_vehiculo'),
      ('aviso_operacion'),
      ('novedad_operacion'),
      ('operacion_evento')
    ) AS t(tabla)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', r.tabla);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_aop_estado_operacion_creacion
  ON asignacion_operacion_personal(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_vo_estado_operacion_creacion
  ON vehiculo_operacion(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_oe_estado_operacion_creacion
  ON operacion_equipo(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_poi_estado_operacion_creacion
  ON puntos_interes(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_dibujo_estado_operacion_creacion
  ON dibujo_libre_operacion(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_area_estado_operacion_creacion
  ON area_interes(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_ruta_estado_operacion_creacion
  ON ruta_operacion(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_marca_estado_operacion_creacion
  ON marca_edificio(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_ruta_nav_estado_operacion_creacion
  ON ruta_navegacion(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_zona_estado_operacion_creacion
  ON zona_operacion(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_tracking_personal_estado_operacion_creacion
  ON tracking_personal(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_tracking_vehiculo_estado_operacion_creacion
  ON tracking_vehiculo(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_aviso_estado_operacion_creacion
  ON aviso_operacion(id_operacion, estado_operacion_creacion);
CREATE INDEX IF NOT EXISTS idx_mensaje_estado_operacion_creacion
  ON mensaje_chat(estado_operacion_creacion);

-- Vistas que usa la API y el mapa, ahora con estado_operacion_creacion.
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
  poi.color,
  poi.estado_operacion_creacion
FROM puntos_interes poi
LEFT JOIN usuario u ON u.id_usuario = poi.id_usuario
LEFT JOIN personal p ON p.id_personal = poi.id_personal;

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
  tp."timestamp" AS ultima_actualizacion,
  tp.estado_operacion_creacion
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
  tv."timestamp" AS ultima_actualizacion,
  tv.estado_operacion_creacion
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
  fecha_creacion,
  estado_operacion_creacion
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
  fecha_creacion,
  estado_operacion_creacion
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
  fecha_creacion,
  estado_operacion_creacion
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
  fecha_creacion,
  estado_operacion_creacion
FROM marca_edificio
WHERE estado = 'ACTIVO';

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
  END AS autor_nombre,
  m.estado_operacion_creacion
FROM chat_operacion co
JOIN mensaje_chat m ON m.id_chat = co.id_chat
JOIN participante_chat pc ON pc.id_participante = m.id_participante
LEFT JOIN usuario u ON u.id_usuario = pc.id_usuario
LEFT JOIN personal p ON p.id_personal = pc.id_personal;
