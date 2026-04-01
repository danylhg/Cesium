-- =========================================================
-- 15_seed.sql
-- Seed inicial de inventario
-- =========================================================

-- -------------------------
-- VEHÍCULOS
-- -------------------------
INSERT INTO vehiculo
  (imagen_veh, codigo_interno, tipo, alias, estado, capacidad)
VALUES
  ('./uploads/vehiculo/Alacran.jpeg',    'VH-001', 'TACTICO',     'Alacran 4x4',        'DISPONIBLE', 6),
  ('./uploads/vehiculo/Ford F-150.jpeg', 'VH-003', 'PICKUP',      'Ford F-150',         'DISPONIBLE', 5),
  ('./uploads/vehiculo/Panther.jpeg',    'VH-004', 'BLINDADO',    'Panther Blindado',   'DISPONIBLE', 8),
  ('./uploads/vehiculo/Scualo.jpeg',     'VH-005', 'INTERCEPTOR', 'Scualo Interceptor', 'DISPONIBLE', 4)
ON CONFLICT (codigo_interno)
DO UPDATE SET
  imagen_veh = EXCLUDED.imagen_veh,
  tipo       = EXCLUDED.tipo,
  alias      = EXCLUDED.alias,
  estado     = EXCLUDED.estado,
  capacidad  = EXCLUDED.capacidad;

-- -------------------------
-- EQUIPO BASE
-- -------------------------
INSERT INTO equipo (
  numero_serie,
  nombre,
  categoria,
  estado
)
VALUES
  ('HFC-001', 'Harris Falcon', 'COMUNICACION', 'DISPONIBLE'),
  ('DRN-001', 'Dron VANT 01',  'TACTICO',      'DISPONIBLE')
ON CONFLICT (numero_serie) DO NOTHING;

-- -------------------------
-- EQUIPO TÁCTICO
-- -------------------------
INSERT INTO equipo_tactico (
  id_equipo,
  imagen_eqtac,
  tipo_tactico,
  calibre,
  nivel,
  notas
)
SELECT
  e.id_equipo,
  './uploads/equipo/tactico/Dron vant 01.jpeg',
  'DRON',
  NULL,
  'VANT',
  'Dron de vigilancia táctica no tripulado'
FROM equipo e
WHERE e.numero_serie = 'DRN-001'
ON CONFLICT (id_equipo) DO NOTHING;

-- -------------------------
-- EQUIPO DE COMUNICACIÓN
-- -------------------------
INSERT INTO equipo_comunicacion (
  id_equipo,
  imagen_eqcom,
  marca,
  modelo,
  notas
)
SELECT
  e.id_equipo,
  './uploads/equipo/comunicacion/Harris Falcon.jpeg',
  'Harris',
  'Falcon III',
  'Radio táctico multibanda'
FROM equipo e
WHERE e.numero_serie = 'HFC-001'
ON CONFLICT (id_equipo) DO NOTHING;