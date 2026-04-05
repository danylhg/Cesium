-- =========================================================
-- 12_validaciones_generales.sql
-- Validaciones de consistencia de grupos
-- =========================================================

CREATE OR REPLACE FUNCTION fn_validar_grupo_operacion_consistente()
RETURNS TRIGGER AS $$
DECLARE
  op_grupo INT;
BEGIN
  SELECT id_operacion INTO op_grupo
  FROM grupo_operacion
  WHERE id_grupo_operacion = NEW.id_grupo_operacion;

  IF op_grupo IS NULL THEN
    RAISE EXCEPTION 'No existe grupo_operacion id=%', NEW.id_grupo_operacion;
  END IF;

  IF NEW.id_operacion <> op_grupo THEN
    RAISE EXCEPTION 'id_operacion (%) no coincide con la operación del grupo (%)', NEW.id_operacion, op_grupo;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION fn_validar_mando_operacion()
RETURNS TRIGGER AS $$
DECLARE
  rol_cet  rol_personal_enum;
  rol_cell rol_personal_enum;
BEGIN
  SELECT p.rol INTO rol_cet
  FROM personal p
  WHERE p.id_personal = NEW.id_cet;

  SELECT p.rol INTO rol_cell
  FROM personal p
  WHERE p.id_personal = NEW.id_cell;

  IF rol_cet IS NULL THEN
    RAISE EXCEPTION 'id_cet % no existe en personal', NEW.id_cet;
  END IF;

  IF rol_cell IS NULL THEN
    RAISE EXCEPTION 'id_cell % no existe en personal', NEW.id_cell;
  END IF;

  IF rol_cet <> 'CET' THEN
    RAISE EXCEPTION 'El mando debe ser CET. id_cet=% tiene rol=%', NEW.id_cet, rol_cet;
  END IF;

  IF rol_cell <> 'CELL' THEN
    RAISE EXCEPTION 'El subordinado debe ser CELL. id_cell=% tiene rol=%', NEW.id_cell, rol_cell;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- 08_mapa_base.sql
-- Mapa base: puntos de interes y zona de operacion
-- =========================================================

CREATE TABLE IF NOT EXISTS zona_operacion (
  id_zona SERIAL PRIMARY KEY,
  id_operacion INT NOT NULL UNIQUE
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,

  nombre TEXT NOT NULL DEFAULT 'Zona principal',
  geometria JSONB NOT NULL,
  centroide_lat NUMERIC(8,5) NOT NULL,
  centroide_lon NUMERIC(9,5) NOT NULL,
  zoom_inicial INT NOT NULL DEFAULT 8000,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  creado_por INT NOT NULL REFERENCES usuario(id_usuario),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_zona_lat CHECK (centroide_lat BETWEEN -90 AND 90),
  CONSTRAINT chk_zona_lon CHECK (centroide_lon BETWEEN -180 AND 180),
  CONSTRAINT chk_zona_zoom CHECK (zoom_inicial BETWEEN 100 AND 2000000)
);

CREATE INDEX IF NOT EXISTS idx_zona_operacion
  ON zona_operacion(id_operacion);

  CREATE INDEX IF NOT EXISTS idx_poi_usuario
  ON puntos_interes(id_usuario);

CREATE INDEX IF NOT EXISTS idx_poi_operacion
  ON puntos_interes(id_operacion);

CREATE INDEX IF NOT EXISTS idx_poi_personal
  ON puntos_interes(id_personal);

  -- =========================================================
-- Validación: stock de equipo por grupos
-- =========================================================

CREATE OR REPLACE FUNCTION fn_validar_stock_equipo_grupo()
RETURNS TRIGGER AS $$
DECLARE
  total_operacion INT;
  total_ya_asignado_grupos INT;
BEGIN
  SELECT oe.cantidad
    INTO total_operacion
  FROM operacion_equipo oe
  WHERE oe.id_operacion = NEW.id_operacion
    AND oe.id_equipo    = NEW.id_equipo;

  IF total_operacion IS NULL THEN
    RAISE EXCEPTION
      'No existe operacion_equipo para (id_operacion=%, id_equipo=%). Primero asigna el equipo a la operación.',
      NEW.id_operacion, NEW.id_equipo;
  END IF;

  SELECT COALESCE(SUM(ge.cantidad), 0)
    INTO total_ya_asignado_grupos
  FROM grupo_equipo ge
  WHERE ge.id_operacion = NEW.id_operacion
    AND ge.id_equipo    = NEW.id_equipo
    AND ge.id_grupo_operacion <> NEW.id_grupo_operacion;

  IF (total_ya_asignado_grupos + NEW.cantidad) > total_operacion THEN
    RAISE EXCEPTION
      'Exceso de stock: Operación tiene %, ya repartido %, intento de añadir % (id_operacion=%, id_equipo=%).',
      total_operacion, total_ya_asignado_grupos, NEW.cantidad, NEW.id_operacion, NEW.id_equipo;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- 12_validaciones_generales.sql
-- Helpers, validaciones globales y columnas base
-- =========================================================

-- =========================================
-- fecha_actualizacion
-- =========================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='chat_operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE chat_operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='puntos_interes' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE puntos_interes ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='area_interes' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE area_interes ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='ruta_operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE ruta_operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='marca_edificio' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE marca_edificio ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='zona_operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE zona_operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='aviso_operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE aviso_operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='novedad_operacion' AND column_name='fecha_actualizacion'
  ) THEN
    ALTER TABLE novedad_operacion ADD COLUMN fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- =========================================
-- Helper: touch fecha_actualizacion
-- =========================================
CREATE OR REPLACE FUNCTION fn_touch_fecha_actualizacion()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fecha_actualizacion := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- Nombre de operación único (case-insensitive)
-- =========================================
DO $$
DECLARE
  duplicados INT;
BEGIN
  SELECT COUNT(*) INTO duplicados
  FROM (
    SELECT LOWER(BTRIM(nombre))
    FROM operacion
    GROUP BY LOWER(BTRIM(nombre))
    HAVING COUNT(*) > 1
  ) t;

  IF duplicados = 0 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'i'
        AND c.relname = 'uq_operacion_nombre_ci'
        AND n.nspname = 'public'
    ) THEN
      CREATE UNIQUE INDEX uq_operacion_nombre_ci
      ON operacion (LOWER(BTRIM(nombre)));
    END IF;
  ELSE
    RAISE NOTICE 'No se creó uq_operacion_nombre_ci porque hay duplicados.';
  END IF;
END $$;

-- =========================================================
-- CHECKS GEO
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_poi_latitud'
  ) THEN
    ALTER TABLE puntos_interes
      ADD CONSTRAINT chk_poi_latitud CHECK (latitud BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_poi_longitud'
  ) THEN
    ALTER TABLE puntos_interes
      ADD CONSTRAINT chk_poi_longitud CHECK (longitud BETWEEN -180 AND 180);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_area_color_hex'
  ) THEN
    ALTER TABLE area_interes
      ADD CONSTRAINT chk_area_color_hex
      CHECK (color ~* '^#[0-9A-F]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ruta_color_hex'
  ) THEN
    ALTER TABLE ruta_operacion
      ADD CONSTRAINT chk_ruta_color_hex
      CHECK (color ~* '^#[0-9A-F]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_zona_color_hex'
  ) THEN
    ALTER TABLE zona_operacion
      ADD CONSTRAINT chk_zona_color_hex
      CHECK (color ~* '^#[0-9A-F]{6}$');
  END IF;
END $$;


-- =========================================================
-- HELPERS DE OPERACIÓN
-- =========================================================
CREATE OR REPLACE FUNCTION fn_operacion_esta_cerrada_o_cancelada(p_id_operacion INT)
RETURNS BOOLEAN AS $$
DECLARE
  v_estado estado_operacion_enum;
BEGIN
  SELECT estado INTO v_estado
  FROM operacion
  WHERE id_operacion = p_id_operacion;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Operación % no existe', p_id_operacion;
  END IF;

  RETURN v_estado IN ('CERRADA', 'CANCELADA');
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- VALIDACIÓN CENTRAL
-- =========================================================
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
    'novedad_operacion'
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

    IF TG_TABLE_NAME = 'mensaje_chat' AND NEW.tipo_mensaje = 'SISTEMA' THEN
      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'asignacion_operacion_personal'
       AND TG_OP = 'UPDATE'
       AND NEW.estado_asignacion = 'LIBERADO' THEN
      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'vehiculo_operacion'
       AND TG_OP = 'UPDATE'
       AND NEW.estado_asignacion = 'LIBERADO' THEN
      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'operacion_equipo'
       AND TG_OP = 'UPDATE'
       AND NEW.estado_asignacion = 'LIBERADO' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'La operación % está en estado %, no se permiten modificaciones en %',
      v_id_operacion, v_estado, TG_TABLE_NAME;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- DISPONIBILIDAD
-- =========================================================
CREATE OR REPLACE FUNCTION fn_rangos_conflictivos(
  p_ini1 TIMESTAMPTZ,
  p_fin1 TIMESTAMPTZ,
  p_ini2 TIMESTAMPTZ,
  p_fin2 TIMESTAMPTZ,
  p_buffer INTERVAL DEFAULT INTERVAL '0 seconds'
)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_ini1 IS NULL OR p_ini2 IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN (p_ini1 - p_buffer) <= (COALESCE(p_fin2, 'infinity'::timestamptz) + p_buffer)
     AND (p_ini2 - p_buffer) <= (COALESCE(p_fin1, 'infinity'::timestamptz) + p_buffer);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_disponibilidad_personal()
RETURNS TRIGGER AS $$
DECLARE
  v_ini TIMESTAMPTZ;
  v_fin TIMESTAMPTZ;
  r RECORD;
BEGIN
  SELECT fecha_inicio, fecha_fin INTO v_ini, v_fin
  FROM operacion WHERE id_operacion = NEW.id_operacion;

  FOR r IN
    SELECT o.codigo, o.nombre, o.fecha_inicio, o.fecha_fin
    FROM asignacion_operacion_personal a
    JOIN operacion o ON o.id_operacion = a.id_operacion
    WHERE a.id_personal = NEW.id_personal
      AND a.id_operacion <> NEW.id_operacion
      AND o.estado NOT IN ('CERRADA','CANCELADA')
      AND a.estado_asignacion <> 'LIBERADO'
  LOOP
    IF fn_rangos_conflictivos(v_ini,v_fin,r.fecha_inicio,r.fecha_fin,INTERVAL '12 hours') THEN
      RAISE EXCEPTION 'Conflicto de fechas personal %', NEW.id_personal;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_disponibilidad_vehiculo()
RETURNS TRIGGER AS $$
DECLARE
  v_ini TIMESTAMPTZ;
  v_fin TIMESTAMPTZ;
  r RECORD;
BEGIN
  SELECT fecha_inicio, fecha_fin INTO v_ini, v_fin
  FROM operacion WHERE id_operacion = NEW.id_operacion;

  FOR r IN
    SELECT o.codigo, o.nombre, o.fecha_inicio, o.fecha_fin
    FROM vehiculo_operacion vo
    JOIN operacion o ON o.id_operacion = vo.id_operacion
    WHERE vo.id_vehiculo = NEW.id_vehiculo
      AND vo.id_operacion <> NEW.id_operacion
      AND o.estado NOT IN ('CERRADA','CANCELADA')
      AND vo.estado_asignacion <> 'LIBERADO'
  LOOP
    IF fn_rangos_conflictivos(v_ini,v_fin,r.fecha_inicio,r.fecha_fin) THEN
      RAISE EXCEPTION 'Conflicto vehículo %', NEW.id_vehiculo;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_disponibilidad_equipo()
RETURNS TRIGGER AS $$
DECLARE
  v_ini TIMESTAMPTZ;
  v_fin TIMESTAMPTZ;
  r RECORD;
BEGIN
  SELECT fecha_inicio, fecha_fin INTO v_ini, v_fin
  FROM operacion WHERE id_operacion = NEW.id_operacion;

  FOR r IN
    SELECT o.codigo, o.nombre, o.fecha_inicio, o.fecha_fin
    FROM operacion_equipo oe
    JOIN operacion o ON o.id_operacion = oe.id_operacion
    WHERE oe.id_equipo = NEW.id_equipo
      AND oe.id_operacion <> NEW.id_operacion
      AND o.estado NOT IN ('CERRADA','CANCELADA')
      AND oe.estado_asignacion <> 'LIBERADO'
  LOOP
    IF fn_rangos_conflictivos(v_ini,v_fin,r.fecha_inicio,r.fecha_fin) THEN
      RAISE EXCEPTION 'Conflicto equipo %', NEW.id_equipo;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- VALIDACIÓN DE GEOMETRÍA
-- =========================================================
CREATE OR REPLACE FUNCTION fn_validar_geometria_area()
RETURNS TRIGGER AS $$
DECLARE
  v_type TEXT;
  v_points INT;
BEGIN
  v_type := COALESCE(NEW.geometria->>'type','');

  IF v_type NOT IN ('Polygon','MultiPolygon') THEN
    RAISE EXCEPTION 'area_interes.geometria debe ser Polygon o MultiPolygon';
  END IF;

  IF jsonb_typeof(NEW.geometria->'coordinates') <> 'array' THEN
    RAISE EXCEPTION 'coordinates debe ser array';
  END IF;

  IF v_type = 'Polygon' THEN
    v_points := COALESCE(jsonb_array_length((NEW.geometria->'coordinates')->0),0);
    IF v_points < 4 THEN
      RAISE EXCEPTION 'Polygon necesita mínimo 4 puntos';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_geometria_ruta()
RETURNS TRIGGER AS $$
DECLARE
  v_type TEXT;
  v_points INT;
BEGIN
  v_type := COALESCE(NEW.geometria->>'type','');

  IF v_type NOT IN ('LineString','MultiLineString') THEN
    RAISE EXCEPTION 'ruta_operacion.geometria inválida';
  END IF;

  IF jsonb_typeof(NEW.geometria->'coordinates') <> 'array' THEN
    RAISE EXCEPTION 'coordinates debe ser array';
  END IF;

  IF v_type = 'LineString' THEN
    v_points := COALESCE(jsonb_array_length(NEW.geometria->'coordinates'),0);
    IF v_points < 2 THEN
      RAISE EXCEPTION 'LineString necesita mínimo 2 puntos';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- CHAT AUTOMÁTICO Y PARTICIPANTES
-- =========================================================
CREATE OR REPLACE FUNCTION fn_get_or_create_chat_operacion(p_id_operacion INT)
RETURNS INT AS $$
DECLARE
  v_id_chat INT;
BEGIN
  INSERT INTO chat_operacion (id_operacion, activo, fecha_cierre)
  VALUES (p_id_operacion, FALSE, NULL)
  ON CONFLICT (id_operacion) DO UPDATE
    SET id_operacion = EXCLUDED.id_operacion
  RETURNING id_chat INTO v_id_chat;

  RETURN v_id_chat;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_agregar_participante_chat_operacion(
  p_id_operacion INT,
  p_id_usuario INT DEFAULT NULL,
  p_id_personal INT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  v_id_chat INT;
  v_id_participante INT;
BEGIN
  v_id_chat := fn_get_or_create_chat_operacion(p_id_operacion);

  IF p_id_usuario IS NOT NULL THEN
    INSERT INTO participante_chat (id_chat, tipo, id_usuario, id_personal)
    VALUES (v_id_chat, 'USUARIO', p_id_usuario, NULL)
    ON CONFLICT (id_chat, id_usuario) DO UPDATE
      SET id_usuario = EXCLUDED.id_usuario
    RETURNING id_participante INTO v_id_participante;

  ELSIF p_id_personal IS NOT NULL THEN
    INSERT INTO participante_chat (id_chat, tipo, id_usuario, id_personal)
    VALUES (v_id_chat, 'PERSONAL', NULL, p_id_personal)
    ON CONFLICT (id_chat, id_personal) DO UPDATE
      SET id_personal = EXCLUDED.id_personal
    RETURNING id_participante INTO v_id_participante;

  ELSE
    RAISE EXCEPTION 'Debe enviarse id_usuario o id_personal';
  END IF;

  RETURN v_id_participante;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_sync_chat_operacion()
RETURNS TRIGGER AS $$
DECLARE
  v_id_chat INT;
  v_id_participante INT;
BEGIN
  v_id_chat := fn_get_or_create_chat_operacion(NEW.id_operacion);

  IF TG_OP = 'INSERT' THEN
    UPDATE chat_operacion
    SET activo = (NEW.estado = 'ACTIVA'),
        fecha_cierre = CASE
          WHEN NEW.estado IN ('CERRADA','CANCELADA') THEN NOW()
          ELSE NULL
        END
    WHERE id_chat = v_id_chat;

    PERFORM fn_agregar_participante_chat_operacion(NEW.id_operacion, NEW.creada_por, NULL);
    RETURN NEW;
  END IF;

  IF NEW.estado = 'ACTIVA' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    UPDATE chat_operacion
    SET activo = TRUE,
        fecha_cierre = NULL
    WHERE id_chat = v_id_chat;

    v_id_participante := fn_agregar_participante_chat_operacion(NEW.id_operacion, NEW.creada_por, NULL);

    INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
    VALUES (
      v_id_chat,
      v_id_participante,
      'OPERACION ACTIVADA automáticamente por trigger de BD.',
      'SISTEMA'
    );

  ELSIF NEW.estado IN ('CERRADA','CANCELADA') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    UPDATE chat_operacion
    SET activo = FALSE,
        fecha_cierre = NOW()
    WHERE id_chat = v_id_chat;

    v_id_participante := fn_agregar_participante_chat_operacion(NEW.id_operacion, NEW.creada_por, NULL);

    INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
    VALUES (
      v_id_chat,
      v_id_participante,
      'OPERACION ' || NEW.estado::text || ' automáticamente por trigger de BD.',
      'SISTEMA'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_sync_participante_chat_por_asignacion()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.estado_asignacion <> 'LIBERADO' THEN
      PERFORM fn_agregar_participante_chat_operacion(NEW.id_operacion, NULL, NEW.id_personal);
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- SINCRONIZAR ESTADOS DE INVENTARIO (FUNCIONES)
-- =========================================================
CREATE OR REPLACE FUNCTION fn_recalcular_estado_vehiculo(p_id_vehiculo INT)
RETURNS VOID AS $$
DECLARE
  v_estado estado_vehiculo_enum;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM vehiculo_operacion vo
    JOIN operacion o ON o.id_operacion = vo.id_operacion
    WHERE vo.id_vehiculo = p_id_vehiculo
      AND vo.estado_asignacion IN ('ASIGNADO','EN_USO')
      AND o.estado NOT IN ('CERRADA','CANCELADA')
  ) THEN
    v_estado := 'ASIGNADO';
  ELSE
    v_estado := 'DISPONIBLE';
  END IF;

  UPDATE vehiculo
  SET estado = v_estado
  WHERE id_vehiculo = p_id_vehiculo
    AND estado NOT IN ('MANTENIMIENTO','BAJA');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_recalcular_estado_equipo(p_id_equipo INT)
RETURNS VOID AS $$
DECLARE
  v_estado estado_equipo_enum;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM operacion_equipo oe
    JOIN operacion o ON o.id_operacion = oe.id_operacion
    WHERE oe.id_equipo = p_id_equipo
      AND oe.estado_asignacion IN ('ASIGNADO','EN_USO')
      AND o.estado NOT IN ('CERRADA','CANCELADA')
  )
  OR EXISTS (
    SELECT 1
    FROM personal_equipo pe
    WHERE pe.id_equipo = p_id_equipo
      AND pe.estado = 'ASIGNADO'
  ) THEN
    v_estado := 'ASIGNADO';
  ELSE
    v_estado := 'DISPONIBLE';
  END IF;

  UPDATE equipo
  SET estado = v_estado
  WHERE id_equipo = p_id_equipo
    AND estado NOT IN ('MANTENIMIENTO','BAJA');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_sync_estado_vehiculo_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_recalcular_estado_vehiculo(OLD.id_vehiculo);
    RETURN OLD;
  ELSE
    PERFORM fn_recalcular_estado_vehiculo(NEW.id_vehiculo);

    IF TG_OP = 'UPDATE' AND NEW.id_vehiculo <> OLD.id_vehiculo THEN
      PERFORM fn_recalcular_estado_vehiculo(OLD.id_vehiculo);
    END IF;

    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_sync_estado_equipo_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM fn_recalcular_estado_equipo(OLD.id_equipo);
    RETURN OLD;
  ELSE
    PERFORM fn_recalcular_estado_equipo(NEW.id_equipo);

    IF TG_OP = 'UPDATE' AND NEW.id_equipo <> OLD.id_equipo THEN
      PERFORM fn_recalcular_estado_equipo(OLD.id_equipo);
    END IF;

    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- VALIDACIÓN DE DESTINOS FLEXIBLES (PATCH 06b)
-- Aplica la regla: flotilla no recibe recursos.
-- Solo subgrupos (id_grupo_padre IS NOT NULL) pueden recibir
-- asignaciones directas de vehículos y equipos.
-- =========================================================

-- ── vehiculo_operacion ────────────────────────────────────
-- Valida que el destino (tipo_destino + FK) sea coherente
-- y que cuando sea GRUPO, apunte a un subgrupo real, no al padre.
CREATE OR REPLACE FUNCTION fn_validar_destino_vehiculo_operacion()
RETURNS TRIGGER AS $$
DECLARE
  v_op_grupo   INT;
  v_grupo_padre INT;
BEGIN
  -- Sin destino aún → planificación en curso, se permite
  IF NEW.tipo_destino IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo_destino = 'PERSONAL' THEN
    IF NEW.id_personal IS NULL THEN
      RAISE EXCEPTION 'vehiculo_operacion: tipo_destino=PERSONAL requiere id_personal';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM asignacion_operacion_personal
      WHERE id_operacion = NEW.id_operacion
        AND id_personal   = NEW.id_personal
        AND estado_asignacion <> 'LIBERADO'
    ) THEN
      RAISE EXCEPTION
        'vehiculo_operacion: id_personal=% no está asignado a la operación %',
        NEW.id_personal, NEW.id_operacion;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tipo_destino = 'GRUPO' THEN
    IF NEW.id_grupo_operacion IS NULL THEN
      RAISE EXCEPTION 'vehiculo_operacion: tipo_destino=GRUPO requiere id_grupo_operacion';
    END IF;

    -- El grupo debe pertenecer a la misma operación
    SELECT id_operacion, id_grupo_padre
      INTO v_op_grupo, v_grupo_padre
    FROM grupo_operacion
    WHERE id_grupo_operacion = NEW.id_grupo_operacion;

    IF v_op_grupo IS NULL THEN
      RAISE EXCEPTION
        'vehiculo_operacion: id_grupo_operacion=% no existe', NEW.id_grupo_operacion;
    END IF;

    IF v_op_grupo <> NEW.id_operacion THEN
      RAISE EXCEPTION
        'vehiculo_operacion: id_grupo_operacion=% pertenece a la operación %, no a %',
        NEW.id_grupo_operacion, v_op_grupo, NEW.id_operacion;
    END IF;

    -- Solo subgrupos (tienen padre): la flotilla es el grupo raíz y no recibe recursos
    IF v_grupo_padre IS NULL THEN
      RAISE EXCEPTION
        'vehiculo_operacion: id_grupo_operacion=% es un grupo padre (flotilla). Solo los subgrupos pueden recibir vehículos.',
        NEW.id_grupo_operacion;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'vehiculo_operacion: tipo_destino=% no es válido', NEW.tipo_destino;
END;
$$ LANGUAGE plpgsql;


-- ── uso_equipo_operacion ──────────────────────────────────
-- Valida coherencia del destino flexible y aplica la misma
-- regla: solo subgrupos (no la flotilla) reciben equipos.
CREATE OR REPLACE FUNCTION fn_validar_destino_uso_equipo_operacion()
RETURNS TRIGGER AS $$
DECLARE
  v_op_grupo    INT;
  v_grupo_padre INT;
BEGIN
  -- Sin destino aún → planificación en curso, se permite
  IF NEW.tipo_destino IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo_destino = 'PERSONAL' THEN
    IF NEW.id_personal IS NULL THEN
      RAISE EXCEPTION 'uso_equipo_operacion: tipo_destino=PERSONAL requiere id_personal';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM asignacion_operacion_personal
      WHERE id_operacion = NEW.id_operacion
        AND id_personal   = NEW.id_personal
        AND estado_asignacion <> 'LIBERADO'
    ) THEN
      RAISE EXCEPTION
        'uso_equipo_operacion: id_personal=% no está asignado a la operación %',
        NEW.id_personal, NEW.id_operacion;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tipo_destino = 'VEHICULO' THEN
    IF NEW.id_vehiculo IS NULL THEN
      RAISE EXCEPTION 'uso_equipo_operacion: tipo_destino=VEHICULO requiere id_vehiculo';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM vehiculo_operacion
      WHERE id_operacion    = NEW.id_operacion
        AND id_vehiculo     = NEW.id_vehiculo
        AND estado_asignacion <> 'LIBERADO'
    ) THEN
      RAISE EXCEPTION
        'uso_equipo_operacion: id_vehiculo=% no está asignado a la operación %',
        NEW.id_vehiculo, NEW.id_operacion;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tipo_destino = 'GRUPO' THEN
    IF NEW.id_grupo_operacion IS NULL THEN
      RAISE EXCEPTION 'uso_equipo_operacion: tipo_destino=GRUPO requiere id_grupo_operacion';
    END IF;

    -- El grupo debe pertenecer a la misma operación
    SELECT id_operacion, id_grupo_padre
      INTO v_op_grupo, v_grupo_padre
    FROM grupo_operacion
    WHERE id_grupo_operacion = NEW.id_grupo_operacion;

    IF v_op_grupo IS NULL THEN
      RAISE EXCEPTION
        'uso_equipo_operacion: id_grupo_operacion=% no existe', NEW.id_grupo_operacion;
    END IF;

    IF v_op_grupo <> NEW.id_operacion THEN
      RAISE EXCEPTION
        'uso_equipo_operacion: id_grupo_operacion=% pertenece a la operación %, no a %',
        NEW.id_grupo_operacion, v_op_grupo, NEW.id_operacion;
    END IF;

    -- Solo subgrupos: la flotilla es el grupo raíz y no recibe recursos
    IF v_grupo_padre IS NULL THEN
      RAISE EXCEPTION
        'uso_equipo_operacion: id_grupo_operacion=% es un grupo padre (flotilla). Solo los subgrupos pueden recibir equipos.',
        NEW.id_grupo_operacion;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'uso_equipo_operacion: tipo_destino=% no es válido', NEW.tipo_destino;
END;
$$ LANGUAGE plpgsql;