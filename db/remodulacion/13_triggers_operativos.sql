-- =========================================================
-- 13_triggers_operativos.sql
-- Triggers operativos
-- =========================================================

-- =========================================================
-- Trigger validación CUT en operación
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'tr_validar_cut_operacion'
  ) THEN
    CREATE TRIGGER tr_validar_cut_operacion
    BEFORE INSERT OR UPDATE ON operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_cut_operacion();
  END IF;
END $$;

-- =========================================================
-- Triggers de consistencia para grupos
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_grupo_equipo_op_consistente'
  ) THEN
    CREATE TRIGGER tr_grupo_equipo_op_consistente
    BEFORE INSERT OR UPDATE ON grupo_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_grupo_operacion_consistente();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_grupo_vehiculo_op_consistente'
  ) THEN
    CREATE TRIGGER tr_grupo_vehiculo_op_consistente
    BEFORE INSERT OR UPDATE ON grupo_vehiculo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_grupo_operacion_consistente();
  END IF;
END $$;

-- =========================================================
-- Trigger validación de mando
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'tr_validar_mando_operacion'
  ) THEN
    CREATE TRIGGER tr_validar_mando_operacion
    BEFORE INSERT OR UPDATE ON mando_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_mando_operacion();
  END IF;
END $$;

-- =========================================================
-- Trigger validación de stock por grupo
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_validar_stock_equipo_grupo'
  ) THEN
    CREATE TRIGGER tr_validar_stock_equipo_grupo
    BEFORE INSERT OR UPDATE ON grupo_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_stock_equipo_grupo();
  END IF;
END $$;

-- =========================================================
-- Triggers touch fecha_actualizacion
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_operacion_touch') THEN
    CREATE TRIGGER tr_operacion_touch
    BEFORE UPDATE ON operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_chat_operacion_touch') THEN
    CREATE TRIGGER tr_chat_operacion_touch
    BEFORE UPDATE ON chat_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_poi_touch') THEN
    CREATE TRIGGER tr_poi_touch
    BEFORE UPDATE ON puntos_interes
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_area_interes_touch') THEN
    CREATE TRIGGER tr_area_interes_touch
    BEFORE UPDATE ON area_interes
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_ruta_operacion_touch') THEN
    CREATE TRIGGER tr_ruta_operacion_touch
    BEFORE UPDATE ON ruta_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_marca_edificio_touch') THEN
    CREATE TRIGGER tr_marca_edificio_touch
    BEFORE UPDATE ON marca_edificio
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_zona_operacion_touch') THEN
    CREATE TRIGGER tr_zona_operacion_touch
    BEFORE UPDATE ON zona_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_aviso_operacion_touch') THEN
    CREATE TRIGGER tr_aviso_operacion_touch
    BEFORE UPDATE ON aviso_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_novedad_operacion_touch') THEN
    CREATE TRIGGER tr_novedad_operacion_touch
    BEFORE UPDATE ON novedad_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_touch_fecha_actualizacion();
  END IF;
END $$;

-- =========================================================
-- Triggers de disponibilidad
-- =========================================================
DO $$
BEGIN
  DROP TRIGGER IF EXISTS tr_validar_disponibilidad_personal   ON asignacion_operacion_personal;
  DROP TRIGGER IF EXISTS tr_validar_disponibilidad_vehiculo   ON vehiculo_operacion;
  DROP TRIGGER IF EXISTS tr_validar_disponibilidad_equipo     ON operacion_equipo;
  DROP TRIGGER IF EXISTS tr_validar_disponibilidad_uso_equipo ON uso_equipo_operacion;

  CREATE TRIGGER tr_validar_disponibilidad_personal
  BEFORE INSERT OR UPDATE ON asignacion_operacion_personal
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_disponibilidad_personal();

  CREATE TRIGGER tr_validar_disponibilidad_vehiculo
  BEFORE INSERT OR UPDATE ON vehiculo_operacion
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_disponibilidad_vehiculo();

  CREATE TRIGGER tr_validar_disponibilidad_equipo
  BEFORE INSERT OR UPDATE ON operacion_equipo
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_disponibilidad_equipo();

  -- uso_equipo_operacion es la asignación real dentro de la operación.
  -- Este trigger previene que el mismo equipo aparezca activo en
  -- dos operaciones con rangos de fecha solapados.
  CREATE TRIGGER tr_validar_disponibilidad_uso_equipo
  BEFORE INSERT OR UPDATE ON uso_equipo_operacion
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_disponibilidad_equipo();
END $$;

-- =========================================================
-- Bloquear cambios en operaciones cerradas/canceladas
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_aop_operacion_modificable') THEN
    CREATE TRIGGER tr_aop_operacion_modificable
    BEFORE INSERT OR UPDATE ON asignacion_operacion_personal
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_vo_operacion_modificable') THEN
    CREATE TRIGGER tr_vo_operacion_modificable
    BEFORE INSERT OR UPDATE ON vehiculo_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_oe_operacion_modificable') THEN
    CREATE TRIGGER tr_oe_operacion_modificable
    BEFORE INSERT OR UPDATE ON operacion_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_gp_operacion_modificable') THEN
    CREATE TRIGGER tr_gp_operacion_modificable
    BEFORE INSERT OR UPDATE ON grupo_personal
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_ge_operacion_modificable') THEN
    CREATE TRIGGER tr_ge_operacion_modificable
    BEFORE INSERT OR UPDATE ON grupo_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_gv_operacion_modificable') THEN
    CREATE TRIGGER tr_gv_operacion_modificable
    BEFORE INSERT OR UPDATE ON grupo_vehiculo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_poi_operacion_modificable') THEN
    CREATE TRIGGER tr_poi_operacion_modificable
    BEFORE INSERT OR UPDATE ON puntos_interes
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_area_operacion_modificable') THEN
    CREATE TRIGGER tr_area_operacion_modificable
    BEFORE INSERT OR UPDATE ON area_interes
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_ruta_operacion_modificable') THEN
    CREATE TRIGGER tr_ruta_operacion_modificable
    BEFORE INSERT OR UPDATE ON ruta_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_marca_operacion_modificable') THEN
    CREATE TRIGGER tr_marca_operacion_modificable
    BEFORE INSERT OR UPDATE ON marca_edificio
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_zona_operacion_modificable') THEN
    CREATE TRIGGER tr_zona_operacion_modificable
    BEFORE INSERT OR UPDATE ON zona_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_tracking_personal_op_modificable') THEN
    CREATE TRIGGER tr_tracking_personal_op_modificable
    BEFORE INSERT OR UPDATE ON tracking_personal
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_tracking_vehiculo_op_modificable') THEN
    CREATE TRIGGER tr_tracking_vehiculo_op_modificable
    BEFORE INSERT OR UPDATE ON tracking_vehiculo
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_aviso_operacion_modificable') THEN
    CREATE TRIGGER tr_aviso_operacion_modificable
    BEFORE INSERT OR UPDATE ON aviso_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_novedad_operacion_modificable') THEN
    CREATE TRIGGER tr_novedad_operacion_modificable
    BEFORE INSERT OR UPDATE ON novedad_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;
END $$;

-- =========================================================
-- Triggers de validación geométrica
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_validar_geometria_area') THEN
    CREATE TRIGGER tr_validar_geometria_area
    BEFORE INSERT OR UPDATE ON area_interes
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_geometria_area();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_validar_geometria_ruta') THEN
    CREATE TRIGGER tr_validar_geometria_ruta
    BEFORE INSERT OR UPDATE ON ruta_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_geometria_ruta();
  END IF;
END $$;

-- =========================================================
-- Triggers de chat automático
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_operacion_sync_chat_insert') THEN
    CREATE TRIGGER tr_operacion_sync_chat_insert
    AFTER INSERT ON operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_chat_operacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_operacion_sync_chat_estado') THEN
    CREATE TRIGGER tr_operacion_sync_chat_estado
    AFTER UPDATE OF estado ON operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_chat_operacion();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_aop_sync_participante_chat') THEN
    CREATE TRIGGER tr_aop_sync_participante_chat
    AFTER INSERT OR UPDATE ON asignacion_operacion_personal
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_participante_chat_por_asignacion();
  END IF;
END $$;

-- =========================================================
-- Triggers de sincronización de inventario
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_vo_sync_estado_vehiculo') THEN
    CREATE TRIGGER tr_vo_sync_estado_vehiculo
    AFTER INSERT OR UPDATE OR DELETE ON vehiculo_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_estado_vehiculo_trigger();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_oe_sync_estado_equipo') THEN
    CREATE TRIGGER tr_oe_sync_estado_equipo
    AFTER INSERT OR UPDATE OR DELETE ON operacion_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_estado_equipo_trigger();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tr_pe_sync_estado_equipo') THEN
    CREATE TRIGGER tr_pe_sync_estado_equipo
    AFTER INSERT OR UPDATE OR DELETE ON personal_equipo
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_estado_equipo_trigger();
  END IF;
END $$;

-- =========================================================
-- Triggers de destinos flexibles (PATCH 06b)
-- Conectan las funciones validadoras de 12_validaciones
-- con las tablas parcheadas. Garantizan que:
--   • el tipo_destino sea coherente con la FK usada
--   • cuando el destino es GRUPO, sea subgrupo (no padre/flotilla)
-- =========================================================
DO $$
BEGIN
  -- uso_equipo_operacion: bloquear cambios en operaciones cerradas/canceladas
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_ueo_operacion_modificable'
  ) THEN
    CREATE TRIGGER tr_ueo_operacion_modificable
    BEFORE INSERT OR UPDATE ON uso_equipo_operacion
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;
END $$;

-- =========================================================
-- Bloqueo de chat en operaciones cerradas
-- =========================================================
DROP TRIGGER IF EXISTS tr_participante_chat_operacion_modificable ON participante_chat;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tr_mensaje_chat_operacion_modificable'
  ) THEN
    CREATE TRIGGER tr_mensaje_chat_operacion_modificable
    BEFORE INSERT OR UPDATE OR DELETE ON mensaje_chat
    FOR EACH ROW
    EXECUTE FUNCTION fn_validar_operacion_modificable();
  END IF;
END $$;
