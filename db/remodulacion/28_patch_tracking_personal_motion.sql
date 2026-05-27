-- Agrega movimiento al tracking de personal (GPS Android)
ALTER TABLE tracking_personal
  ADD COLUMN IF NOT EXISTS velocidad_kmh NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS rumbo_grados NUMERIC(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_tp_rumbo'
  ) THEN
    ALTER TABLE tracking_personal
      ADD CONSTRAINT chk_tp_rumbo CHECK (
        rumbo_grados IS NULL OR rumbo_grados BETWEEN 0 AND 360
      );
  END IF;
END $$;

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
