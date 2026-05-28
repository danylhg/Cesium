-- =========================================================
-- 24_signos_vitales.sql
-- Lecturas biometricas recibidas desde smart watch
-- =========================================================

CREATE TABLE IF NOT EXISTS signos_vitales_personal (
  id_signo_vital BIGSERIAL PRIMARY KEY,
  id_operacion INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_personal INT NOT NULL
    REFERENCES personal(id_personal) ON DELETE CASCADE,

  frecuencia_cardiaca_bpm NUMERIC(5,2),
  oxigenacion_spo2 NUMERIC(5,2),
  temperatura_c NUMERIC(4,2),
  frecuencia_respiratoria_rpm NUMERIC(5,2),
  presion_sistolica_mmhg NUMERIC(5,2),
  presion_diastolica_mmhg NUMERIC(5,2),
  pasos BIGINT,
  presion_barometrica_hpa NUMERIC(7,2),
  bateria_pct NUMERIC(5,2),

  latitud NUMERIC(8,5),
  longitud NUMERIC(9,5),
  dispositivo_id TEXT,
  origen TEXT NOT NULL DEFAULT 'SMARTWATCH',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estado_operacion_creacion estado_operacion_enum,

  CONSTRAINT fk_svp_asignacion
    FOREIGN KEY (id_operacion, id_personal)
    REFERENCES asignacion_operacion_personal(id_operacion, id_personal)
    ON DELETE CASCADE,

  CONSTRAINT chk_svp_fc CHECK (
    frecuencia_cardiaca_bpm IS NULL OR frecuencia_cardiaca_bpm BETWEEN 20 AND 240
  ),
  CONSTRAINT chk_svp_spo2 CHECK (
    oxigenacion_spo2 IS NULL OR oxigenacion_spo2 BETWEEN 0 AND 100
  ),
  CONSTRAINT chk_svp_temp CHECK (
    temperatura_c IS NULL OR temperatura_c BETWEEN 25 AND 45
  ),
  CONSTRAINT chk_svp_resp CHECK (
    frecuencia_respiratoria_rpm IS NULL OR frecuencia_respiratoria_rpm BETWEEN 1 AND 80
  ),
  CONSTRAINT chk_svp_presion CHECK (
    (presion_sistolica_mmhg IS NULL OR presion_sistolica_mmhg BETWEEN 30 AND 260)
    AND (presion_diastolica_mmhg IS NULL OR presion_diastolica_mmhg BETWEEN 20 AND 180)
  ),
  CONSTRAINT chk_svp_pasos CHECK (pasos IS NULL OR pasos >= 0),
  CONSTRAINT chk_svp_baro CHECK (
    presion_barometrica_hpa IS NULL OR presion_barometrica_hpa BETWEEN 300 AND 1100
  ),
  CONSTRAINT chk_svp_bateria CHECK (bateria_pct IS NULL OR bateria_pct BETWEEN 0 AND 100),
  CONSTRAINT chk_svp_latitud CHECK (latitud IS NULL OR latitud BETWEEN -90 AND 90),
  CONSTRAINT chk_svp_longitud CHECK (longitud IS NULL OR longitud BETWEEN -180 AND 180),
  CONSTRAINT chk_svp_alguna_medicion CHECK (
    frecuencia_cardiaca_bpm IS NOT NULL
    OR oxigenacion_spo2 IS NOT NULL
    OR temperatura_c IS NOT NULL
    OR frecuencia_respiratoria_rpm IS NOT NULL
    OR presion_sistolica_mmhg IS NOT NULL
    OR presion_diastolica_mmhg IS NOT NULL
    OR pasos IS NOT NULL
    OR presion_barometrica_hpa IS NOT NULL
    OR bateria_pct IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_svp_op_per_ts
  ON signos_vitales_personal(id_operacion, id_personal, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_svp_ts
  ON signos_vitales_personal("timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_svp_estado_operacion_creacion
  ON signos_vitales_personal(id_operacion, estado_operacion_creacion);

CREATE OR REPLACE FUNCTION fn_set_estado_operacion_creacion_signos_vitales()
RETURNS TRIGGER AS $$
DECLARE
  v_estado estado_operacion_enum;
BEGIN
  IF TG_OP <> 'INSERT' OR NEW.estado_operacion_creacion IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT estado INTO v_estado
  FROM operacion
  WHERE id_operacion = NEW.id_operacion
  LIMIT 1;

  NEW.estado_operacion_creacion := v_estado;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_validar_signos_vitales_operacion_modificable()
RETURNS TRIGGER AS $$
DECLARE
  v_estado estado_operacion_enum;
BEGIN
  SELECT estado INTO v_estado
  FROM operacion
  WHERE id_operacion = COALESCE(NEW.id_operacion, OLD.id_operacion)
  LIMIT 1;

  IF v_estado IN ('CERRADA', 'CANCELADA') THEN
    RAISE EXCEPTION
      'La operacion % esta en estado %, no se permiten modificaciones en signos_vitales_personal',
      COALESCE(NEW.id_operacion, OLD.id_operacion),
      v_estado;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS tr_svp_estado_operacion_creacion ON signos_vitales_personal;
  DROP TRIGGER IF EXISTS tr_svp_op_modificable ON signos_vitales_personal;

  CREATE TRIGGER tr_svp_estado_operacion_creacion
  BEFORE INSERT ON signos_vitales_personal
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_estado_operacion_creacion_signos_vitales();

  CREATE TRIGGER tr_svp_op_modificable
  BEFORE INSERT OR UPDATE ON signos_vitales_personal
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_signos_vitales_operacion_modificable();
END $$;

CREATE OR REPLACE VIEW v_ultimos_signos_vitales_personal AS
SELECT DISTINCT ON (svp.id_operacion, svp.id_personal)
  svp.id_signo_vital,
  svp.id_operacion,
  svp.id_personal,
  p.apodo,
  p.nombre,
  p.apellido,
  p.rol,
  svp.frecuencia_cardiaca_bpm,
  svp.frecuencia_cardiaca_bpm AS frecuencia_cardiaca,
  svp.frecuencia_cardiaca_bpm AS fc,
  svp.frecuencia_cardiaca_bpm AS heart_rate,
  svp.oxigenacion_spo2,
  svp.oxigenacion_spo2 AS spo2,
  svp.temperatura_c,
  svp.frecuencia_respiratoria_rpm,
  svp.presion_sistolica_mmhg,
  svp.presion_diastolica_mmhg,
  svp.pasos,
  svp.presion_barometrica_hpa,
  svp.presion_barometrica_hpa AS barometro,
  svp.presion_barometrica_hpa AS baro,
  svp.bateria_pct,
  svp.bateria_pct AS bateria,
  svp.latitud,
  svp.longitud,
  svp.dispositivo_id,
  svp.origen,
  svp.metadata,
  svp."timestamp" AS ultima_actualizacion,
  svp."timestamp" AS signos_actualizacion,
  svp.estado_operacion_creacion
FROM signos_vitales_personal svp
JOIN personal p ON p.id_personal = svp.id_personal
ORDER BY svp.id_operacion, svp.id_personal, svp."timestamp" DESC, svp.id_signo_vital DESC;

CREATE OR REPLACE VIEW v_ultima_posicion_personal AS
SELECT DISTINCT ON (tp.id_operacion, tp.id_personal)
  tp.id_operacion,
  tp.id_personal,
  p.apodo,
  p.rol,
  tp.latitud,
  tp.longitud,
  tp.altitud,
  tp.velocidad_kmh,
  tp.rumbo_grados,
  tp.precision_m,
  tp."timestamp" AS ultima_actualizacion,
  tp.estado_operacion_creacion,
  sv.frecuencia_cardiaca_bpm,
  sv.frecuencia_cardiaca,
  sv.fc,
  sv.heart_rate,
  sv.oxigenacion_spo2,
  sv.spo2,
  sv.temperatura_c,
  sv.frecuencia_respiratoria_rpm,
  sv.presion_sistolica_mmhg,
  sv.presion_diastolica_mmhg,
  sv.pasos,
  sv.presion_barometrica_hpa,
  sv.barometro,
  sv.baro,
  sv.bateria_pct,
  sv.bateria,
  sv.signos_actualizacion
FROM tracking_personal tp
JOIN personal p ON p.id_personal = tp.id_personal
LEFT JOIN v_ultimos_signos_vitales_personal sv
  ON sv.id_operacion = tp.id_operacion
 AND sv.id_personal = tp.id_personal
ORDER BY tp.id_operacion, tp.id_personal, tp."timestamp" DESC;
