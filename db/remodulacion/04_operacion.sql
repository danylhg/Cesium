-- =========================================================
-- 04_operacion.sql
-- Operaciones
-- =========================================================

CREATE TABLE IF NOT EXISTS operacion (
  id_operacion SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  prioridad prioridad_operacion_enum NOT NULL DEFAULT 'MEDIA',
  estado estado_operacion_enum NOT NULL DEFAULT 'PLANIFICADA',
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creada_por INT NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  id_cut INT REFERENCES personal(id_personal) ON DELETE RESTRICT,
  CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_operacion_id_cut
  ON operacion (id_cut);

CREATE OR REPLACE FUNCTION fn_validar_cut_operacion()
RETURNS TRIGGER AS $$
DECLARE
  rol_cut rol_personal_enum;
BEGIN
  IF NEW.id_cut IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.rol
  INTO rol_cut
  FROM personal p
  WHERE p.id_personal = NEW.id_cut;

  IF rol_cut IS NULL THEN
    RAISE EXCEPTION 'id_cut % no existe en personal', NEW.id_cut;
  END IF;

  IF rol_cut <> 'CUT' THEN
    RAISE EXCEPTION 'El responsable principal de la operación debe tener rol CUT. id_cut=% tiene rol=%', NEW.id_cut, rol_cut;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;