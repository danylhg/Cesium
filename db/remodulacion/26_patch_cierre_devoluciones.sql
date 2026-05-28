-- =========================================================
-- 26_patch_cierre_devoluciones.sql
-- Permite cerrar/cancelar operaciones sin revalidar como activas
-- las filas que se estan devolviendo o liberando.
-- =========================================================

CREATE OR REPLACE FUNCTION fn_validar_destino_vehiculo_operacion()
RETURNS TRIGGER AS $$
DECLARE
  v_op_grupo INT;
  v_grupo_padre INT;
BEGIN
  IF NEW.estado_asignacion = 'LIBERADO' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM asignacion_operacion_personal
    WHERE id_operacion = NEW.id_operacion
      AND id_personal = NEW.id_personal
      AND estado_asignacion <> 'LIBERADO'
  ) THEN
    RAISE EXCEPTION
      'vehiculo_operacion: id_personal=% no esta asignado activo a la operacion %',
      NEW.id_personal, NEW.id_operacion;
  END IF;

  IF NEW.id_grupo_operacion IS NULL THEN
    RETURN NEW;
  END IF;

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
      'vehiculo_operacion: id_grupo_operacion=% pertenece a la operacion %, no a %',
      NEW.id_grupo_operacion, v_op_grupo, NEW.id_operacion;
  END IF;

  IF v_grupo_padre IS NULL THEN
    RAISE EXCEPTION
      'vehiculo_operacion: id_grupo_operacion=% es una flotilla. Solo los subgrupos pueden recibir vehiculos.',
      NEW.id_grupo_operacion;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM grupo_personal
    WHERE id_grupo_operacion = NEW.id_grupo_operacion
      AND id_personal = NEW.id_personal
  ) THEN
    RAISE EXCEPTION
      'vehiculo_operacion: id_personal=% no pertenece al grupo %',
      NEW.id_personal, NEW.id_grupo_operacion;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_destino_uso_equipo_operacion()
RETURNS TRIGGER AS $$
DECLARE
  v_op_grupo INT;
  v_grupo_padre INT;
BEGIN
  IF NEW.fecha_devolucion IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM asignacion_operacion_personal
    WHERE id_operacion = NEW.id_operacion
      AND id_personal = NEW.id_personal
      AND estado_asignacion <> 'LIBERADO'
  ) THEN
    RAISE EXCEPTION
      'uso_equipo_operacion: id_personal=% no esta asignado activo a la operacion %',
      NEW.id_personal, NEW.id_operacion;
  END IF;

  IF NEW.id_vehiculo_contexto IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM vehiculo_operacion
      WHERE id_operacion = NEW.id_operacion
        AND id_vehiculo = NEW.id_vehiculo_contexto
        AND estado_asignacion <> 'LIBERADO'
    ) THEN
      RAISE EXCEPTION
        'uso_equipo_operacion: id_vehiculo_contexto=% no esta asignado activo a la operacion %',
        NEW.id_vehiculo_contexto, NEW.id_operacion;
    END IF;
  END IF;

  IF NEW.id_grupo_operacion IS NULL THEN
    RETURN NEW;
  END IF;

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
      'uso_equipo_operacion: id_grupo_operacion=% pertenece a la operacion %, no a %',
      NEW.id_grupo_operacion, v_op_grupo, NEW.id_operacion;
  END IF;

  IF v_grupo_padre IS NULL THEN
    RAISE EXCEPTION
      'uso_equipo_operacion: id_grupo_operacion=% es una flotilla. Solo los subgrupos pueden recibir equipos.',
      NEW.id_grupo_operacion;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM grupo_personal
    WHERE id_grupo_operacion = NEW.id_grupo_operacion
      AND id_personal = NEW.id_personal
  ) THEN
    RAISE EXCEPTION
      'uso_equipo_operacion: id_personal=% no pertenece al grupo %',
      NEW.id_personal, NEW.id_grupo_operacion;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
