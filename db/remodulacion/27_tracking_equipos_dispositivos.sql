-- =========================================================
-- 27_tracking_equipos_dispositivos.sql
-- Tracking de equipos/dispositivos y streams ligados a inventario
-- =========================================================

CREATE TABLE IF NOT EXISTS tracking_equipo (
  id_tracking BIGSERIAL PRIMARY KEY,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_equipo INT NOT NULL REFERENCES equipo(id_equipo) ON DELETE CASCADE,
  latitud NUMERIC(8,5) NOT NULL,
  longitud NUMERIC(9,5) NOT NULL,
  altitud NUMERIC(7,2),
  velocidad_kmh NUMERIC(6,2),
  rumbo_grados NUMERIC(5,2),
  precision_m NUMERIC(6,2),
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estado_operacion_creacion estado_operacion_enum,
  CONSTRAINT chk_te_latitud CHECK (latitud BETWEEN -90 AND 90),
  CONSTRAINT chk_te_longitud CHECK (longitud BETWEEN -180 AND 180),
  CONSTRAINT chk_te_rumbo CHECK (
    rumbo_grados IS NULL OR rumbo_grados BETWEEN 0 AND 360
  )
);

CREATE INDEX IF NOT EXISTS idx_tracking_equipo_op_eq_ts
  ON tracking_equipo(id_operacion, id_equipo, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_equipo_ts
  ON tracking_equipo("timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_equipo_estado_operacion_creacion
  ON tracking_equipo(id_operacion, estado_operacion_creacion);

CREATE TABLE IF NOT EXISTS tracking_dispositivo (
  id_tracking BIGSERIAL PRIMARY KEY,
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_dispositivo INT NOT NULL REFERENCES dispositivo(id_dispositivo) ON DELETE CASCADE,
  latitud NUMERIC(8,5) NOT NULL,
  longitud NUMERIC(9,5) NOT NULL,
  altitud NUMERIC(7,2),
  velocidad_kmh NUMERIC(6,2),
  rumbo_grados NUMERIC(5,2),
  precision_m NUMERIC(6,2),
  bateria_pct NUMERIC(5,2),
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estado_operacion_creacion estado_operacion_enum,
  CONSTRAINT chk_td_latitud CHECK (latitud BETWEEN -90 AND 90),
  CONSTRAINT chk_td_longitud CHECK (longitud BETWEEN -180 AND 180),
  CONSTRAINT chk_td_rumbo CHECK (
    rumbo_grados IS NULL OR rumbo_grados BETWEEN 0 AND 360
  ),
  CONSTRAINT chk_td_bateria CHECK (
    bateria_pct IS NULL OR bateria_pct BETWEEN 0 AND 100
  )
);

CREATE INDEX IF NOT EXISTS idx_tracking_dispositivo_op_disp_ts
  ON tracking_dispositivo(id_operacion, id_dispositivo, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_dispositivo_ts
  ON tracking_dispositivo("timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_dispositivo_estado_operacion_creacion
  ON tracking_dispositivo(id_operacion, estado_operacion_creacion);

CREATE OR REPLACE VIEW v_ultima_posicion_equipo AS
SELECT DISTINCT ON (te.id_operacion, te.id_equipo)
  te.id_tracking,
  te.id_operacion,
  te.id_equipo,
  e.numero_serie,
  e.nombre,
  e.categoria,
  e.estado,
  ec.marca,
  ec.modelo,
  et.tipo_tactico,
  CASE
    WHEN UPPER(COALESCE(e.categoria, '')) = 'COMUNICACION'
      THEN COALESCE(NULLIF(TRIM(CONCAT_WS(' ', ec.marca, ec.modelo)), ''), 'Equipo de comunicacion')
    WHEN UPPER(COALESCE(e.categoria, '')) = 'TACTICO'
      THEN COALESCE(NULLIF(TRIM(et.tipo_tactico), ''), 'Equipo tactico')
    ELSE COALESCE(NULLIF(TRIM(e.categoria), ''), 'Equipo')
  END AS tipo_equipo,
  te.latitud,
  te.longitud,
  te.altitud,
  te.velocidad_kmh,
  te.rumbo_grados,
  te.precision_m,
  te."timestamp" AS ultima_actualizacion,
  te.estado_operacion_creacion
FROM tracking_equipo te
JOIN equipo e ON e.id_equipo = te.id_equipo
LEFT JOIN equipo_comunicacion ec ON ec.id_equipo = e.id_equipo
LEFT JOIN equipo_tactico et ON et.id_equipo = e.id_equipo
ORDER BY te.id_operacion, te.id_equipo, te."timestamp" DESC;

CREATE OR REPLACE VIEW v_ultima_posicion_dispositivo AS
SELECT DISTINCT ON (td.id_operacion, td.id_dispositivo)
  td.id_tracking,
  td.id_operacion,
  td.id_dispositivo,
  d.tipo,
  d.marca,
  d.modelo,
  d.numero_telefono,
  d.imei,
  d.numero_serie,
  d.sistema_operativo,
  d.estado AS dispositivo_estado,
  od.id_personal,
  p.apodo AS personal_apodo,
  p.nombre AS personal_nombre,
  p.apellido AS personal_apellido,
  p.puesto AS personal_puesto,
  td.latitud,
  td.longitud,
  td.altitud,
  td.velocidad_kmh,
  td.rumbo_grados,
  td.precision_m,
  td.bateria_pct,
  td."timestamp" AS ultima_actualizacion,
  td.estado_operacion_creacion
FROM tracking_dispositivo td
JOIN dispositivo d ON d.id_dispositivo = td.id_dispositivo
LEFT JOIN operacion_dispositivo od
  ON od.id_operacion = td.id_operacion
 AND od.id_dispositivo = td.id_dispositivo
 AND od.estado_asignacion = 'ASIGNADO'
 AND od.fecha_devolucion IS NULL
LEFT JOIN personal p ON p.id_personal = od.id_personal
ORDER BY td.id_operacion, td.id_dispositivo, td."timestamp" DESC;

CREATE OR REPLACE FUNCTION fn_set_estado_operacion_creacion_tracking_ext()
RETURNS TRIGGER AS $$
DECLARE
  v_estado estado_operacion_enum;
BEGIN
  IF TG_OP <> 'INSERT' OR NEW.estado_operacion_creacion IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT estado
    INTO v_estado
  FROM operacion
  WHERE id_operacion = NEW.id_operacion
  LIMIT 1;

  NEW.estado_operacion_creacion := v_estado;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_tracking_ext_modificable()
RETURNS TRIGGER AS $$
DECLARE
  v_id_operacion INT;
  v_estado estado_operacion_enum;
BEGIN
  v_id_operacion := COALESCE(NEW.id_operacion, OLD.id_operacion);

  SELECT estado
    INTO v_estado
  FROM operacion
  WHERE id_operacion = v_id_operacion
  LIMIT 1;

  IF v_estado IN ('CERRADA','CANCELADA') THEN
    RAISE EXCEPTION
      'La operacion % esta en estado %, no se permiten modificaciones en %',
      v_id_operacion, v_estado, TG_TABLE_NAME;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS tr_estado_operacion_creacion ON tracking_equipo;
  DROP TRIGGER IF EXISTS tr_estado_operacion_creacion ON tracking_dispositivo;
  DROP TRIGGER IF EXISTS tr_tracking_equipo_op_modificable ON tracking_equipo;
  DROP TRIGGER IF EXISTS tr_tracking_dispositivo_op_modificable ON tracking_dispositivo;

  CREATE TRIGGER tr_estado_operacion_creacion
  BEFORE INSERT ON tracking_equipo
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_estado_operacion_creacion_tracking_ext();

  CREATE TRIGGER tr_estado_operacion_creacion
  BEFORE INSERT ON tracking_dispositivo
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_estado_operacion_creacion_tracking_ext();

  CREATE TRIGGER tr_tracking_equipo_op_modificable
  BEFORE INSERT OR UPDATE ON tracking_equipo
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_tracking_ext_modificable();

  CREATE TRIGGER tr_tracking_dispositivo_op_modificable
  BEFORE INSERT OR UPDATE ON tracking_dispositivo
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_tracking_ext_modificable();
END $$;

ALTER TABLE media_stream_session
  ADD COLUMN IF NOT EXISTS id_equipo INT REFERENCES equipo(id_equipo) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS id_dispositivo INT REFERENCES dispositivo(id_dispositivo) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_stream_session_equipo
  ON media_stream_session(id_operacion, id_equipo, status);

CREATE INDEX IF NOT EXISTS idx_media_stream_session_dispositivo
  ON media_stream_session(id_operacion, id_dispositivo, status);
