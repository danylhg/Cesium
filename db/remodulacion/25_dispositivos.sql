-- =========================================================
-- 25_dispositivos.sql
-- Inventario y asignacion operativa de dispositivos moviles
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_dispositivo_enum') THEN
    CREATE TYPE estado_dispositivo_enum AS ENUM ('DISPONIBLE','ASIGNADO','MANTENIMIENTO','BAJA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dispositivo (
  id_dispositivo SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  numero_telefono TEXT,
  imei TEXT,
  numero_serie TEXT,
  sistema_operativo TEXT,
  estado estado_dispositivo_enum NOT NULL DEFAULT 'DISPONIBLE',
  detalles TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (tipo IN ('TELEFONO','TABLET','SMARTWATCH','LORA','LAPTOP','RADIO','GPS','OTRO'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dispositivo_numero_telefono
  ON dispositivo(numero_telefono)
  WHERE numero_telefono IS NOT NULL AND btrim(numero_telefono) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_dispositivo_imei
  ON dispositivo(imei)
  WHERE imei IS NOT NULL AND btrim(imei) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_dispositivo_numero_serie
  ON dispositivo(numero_serie)
  WHERE numero_serie IS NOT NULL AND btrim(numero_serie) <> '';

CREATE INDEX IF NOT EXISTS idx_dispositivo_tipo_estado
  ON dispositivo(tipo, estado);

CREATE TABLE IF NOT EXISTS operacion_dispositivo (
  id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
  id_dispositivo INT NOT NULL REFERENCES dispositivo(id_dispositivo) ON DELETE RESTRICT,
  id_personal INT NOT NULL REFERENCES personal(id_personal) ON DELETE CASCADE,
  estado_asignacion TEXT NOT NULL DEFAULT 'ASIGNADO',
  fecha_asignacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_devolucion TIMESTAMPTZ,
  asignado_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  notas TEXT,
  estado_operacion_creacion estado_operacion_enum,
  PRIMARY KEY (id_operacion, id_dispositivo),
  CHECK (estado_asignacion IN ('ASIGNADO','LIBERADO','DEVUELTO','PERDIDO','DANADO')),
  CHECK (fecha_devolucion IS NULL OR fecha_devolucion >= fecha_asignacion)
);

CREATE INDEX IF NOT EXISTS idx_operacion_dispositivo_operacion
  ON operacion_dispositivo(id_operacion);

CREATE INDEX IF NOT EXISTS idx_operacion_dispositivo_personal
  ON operacion_dispositivo(id_personal);

CREATE INDEX IF NOT EXISTS idx_operacion_dispositivo_activo
  ON operacion_dispositivo(id_dispositivo, id_operacion)
  WHERE estado_asignacion = 'ASIGNADO' AND fecha_devolucion IS NULL;

CREATE INDEX IF NOT EXISTS idx_operacion_dispositivo_estado_creacion
  ON operacion_dispositivo(id_operacion, estado_operacion_creacion);

CREATE OR REPLACE FUNCTION fn_set_estado_operacion_creacion_dispositivo()
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

DO $$
BEGIN
  DROP TRIGGER IF EXISTS tr_estado_operacion_creacion_dispositivo ON operacion_dispositivo;

  CREATE TRIGGER tr_estado_operacion_creacion_dispositivo
  BEFORE INSERT ON operacion_dispositivo
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_estado_operacion_creacion_dispositivo();
END $$;
