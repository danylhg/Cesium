import { pool } from "../db.js";

let extendedTrackingReady = false;
let personalMotionTrackingReady = false;

export async function ensurePersonalMotionTrackingSchema() {
  if (personalMotionTrackingReady) return;

  await pool.query(`
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

    DROP VIEW IF EXISTS v_ultima_posicion_personal;
    CREATE VIEW v_ultima_posicion_personal AS
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
  `);

  personalMotionTrackingReady = true;
}

export async function ensureExtendedTrackingSchema() {
  if (extendedTrackingReady) return;

  await pool.query(`
    ALTER TABLE dispositivo
      ADD COLUMN IF NOT EXISTS imagen_disp TEXT,
      ADD COLUMN IF NOT EXISTS identificador_app TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_dispositivo_identificador_app
      ON dispositivo(identificador_app)
      WHERE identificador_app IS NOT NULL AND btrim(identificador_app) <> '';

    ALTER TABLE tracking_personal
      ADD COLUMN IF NOT EXISTS velocidad_kmh NUMERIC(6,2),
      ADD COLUMN IF NOT EXISTS rumbo_grados NUMERIC(5,2);

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

    ALTER TABLE tracking_equipo
      ADD COLUMN IF NOT EXISTS bateria_pct NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS conectado BOOLEAN,
      ADD COLUMN IF NOT EXISTS dron_encendido BOOLEAN,
      ADD COLUMN IF NOT EXISTS modo_vuelo TEXT,
      ADD COLUMN IF NOT EXISTS pitch_grados NUMERIC(7,2),
      ADD COLUMN IF NOT EXISTS roll_grados NUMERIC(7,2),
      ADD COLUMN IF NOT EXISTS satelites INT,
      ADD COLUMN IF NOT EXISTS tiempo_vuelo_s NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS serial_dispositivo TEXT;

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

    DO $$
    BEGIN
      IF to_regclass('public.v_ultimos_signos_vitales_personal') IS NOT NULL THEN
        EXECUTE $view$
          DROP VIEW IF EXISTS v_ultima_posicion_personal;
          CREATE VIEW v_ultima_posicion_personal AS
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
          ORDER BY tp.id_operacion, tp.id_personal, tp."timestamp" DESC
        $view$;
      END IF;
    END $$;

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
      te.bateria_pct,
      te.conectado,
      te.dron_encendido,
      te.modo_vuelo,
      te.pitch_grados,
      te.roll_grados,
      te.satelites,
      te.tiempo_vuelo_s,
      te.serial_dispositivo,
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
      d.imagen_disp,
      d.tipo,
      d.marca,
      d.modelo,
      d.numero_telefono,
      d.imei,
      d.numero_serie,
      d.sistema_operativo,
      d.identificador_app,
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

      CREATE TRIGGER tr_estado_operacion_creacion
      BEFORE INSERT ON tracking_equipo
      FOR EACH ROW
      EXECUTE FUNCTION fn_set_estado_operacion_creacion_tracking_ext();

      CREATE TRIGGER tr_estado_operacion_creacion
      BEFORE INSERT ON tracking_dispositivo
      FOR EACH ROW
      EXECUTE FUNCTION fn_set_estado_operacion_creacion_tracking_ext();

      DROP TRIGGER IF EXISTS tr_tracking_equipo_op_modificable ON tracking_equipo;
      DROP TRIGGER IF EXISTS tr_tracking_dispositivo_op_modificable ON tracking_dispositivo;

      CREATE TRIGGER tr_tracking_equipo_op_modificable
      BEFORE INSERT OR UPDATE ON tracking_equipo
      FOR EACH ROW
      EXECUTE FUNCTION fn_validar_tracking_ext_modificable();

      CREATE TRIGGER tr_tracking_dispositivo_op_modificable
      BEFORE INSERT OR UPDATE ON tracking_dispositivo
      FOR EACH ROW
      EXECUTE FUNCTION fn_validar_tracking_ext_modificable();
    END $$;
  `);

  extendedTrackingReady = true;
}
