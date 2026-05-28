-- =========================================================
-- 10_tracking.sql
-- Tracking de personal y vehículos
-- =========================================================

CREATE TABLE IF NOT EXISTS tracking_personal (
  id_tracking BIGSERIAL PRIMARY KEY,
  id_operacion INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_personal INT NOT NULL
    REFERENCES personal(id_personal) ON DELETE CASCADE,

  latitud NUMERIC(8,5) NOT NULL,
  longitud NUMERIC(9,5) NOT NULL,
  altitud NUMERIC(7,2),
  velocidad_kmh NUMERIC(6,2),
  rumbo_grados NUMERIC(5,2),
  precision_m NUMERIC(6,2),

  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tp_latitud CHECK (latitud BETWEEN -90 AND 90),
  CONSTRAINT chk_tp_longitud CHECK (longitud BETWEEN -180 AND 180),
  CONSTRAINT chk_tp_rumbo CHECK (
    rumbo_grados IS NULL OR rumbo_grados BETWEEN 0 AND 360
  )
);

CREATE INDEX IF NOT EXISTS idx_tracking_personal_op_per_ts
  ON tracking_personal(id_operacion, id_personal, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_personal_ts
  ON tracking_personal("timestamp" DESC);

CREATE TABLE IF NOT EXISTS tracking_vehiculo (
  id_tracking BIGSERIAL PRIMARY KEY,
  id_operacion INT NOT NULL
    REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_vehiculo INT NOT NULL
    REFERENCES vehiculo(id_vehiculo) ON DELETE CASCADE,

  latitud NUMERIC(8,5) NOT NULL,
  longitud NUMERIC(9,5) NOT NULL,
  altitud NUMERIC(7,2),
  velocidad_kmh NUMERIC(6,2),
  rumbo_grados NUMERIC(5,2),
  precision_m NUMERIC(6,2),

  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_tv_latitud CHECK (latitud BETWEEN -90 AND 90),
  CONSTRAINT chk_tv_longitud CHECK (longitud BETWEEN -180 AND 180),
  CONSTRAINT chk_tv_rumbo CHECK (
    rumbo_grados IS NULL OR rumbo_grados BETWEEN 0 AND 360
  )
);

CREATE INDEX IF NOT EXISTS idx_tracking_vehiculo_op_veh_ts
  ON tracking_vehiculo(id_operacion, id_vehiculo, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_vehiculo_ts
  ON tracking_vehiculo("timestamp" DESC);
