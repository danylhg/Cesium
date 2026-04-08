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
  ('./uploads/vehiculo/Alacran.jpeg',    'VH-001', 'TACTICO',     'Alacran 4x4',            'DISPONIBLE', 6),
  ('./uploads/vehiculo/Alacran.jpeg',    'VH-002', 'TACTICO',     'Alacran 4x4 II',         'DISPONIBLE', 6),
  ('./uploads/vehiculo/Alacran.jpeg',    'VH-009', 'TACTICO',     'Alacran 4x4 III',        'DISPONIBLE', 6),
  ('./uploads/vehiculo/Alacran.jpeg',    'VH-010', 'TACTICO',     'Alacran 4x4 IV',         'DISPONIBLE', 6),
  ('./uploads/vehiculo/Alacran.jpeg',    'VH-011', 'TACTICO',     'Alacran 4x4 V',          'DISPONIBLE', 6),
  ('./uploads/vehiculo/Ford F-150.jpeg', 'VH-003', 'PICKUP',      'Ford F-150',             'DISPONIBLE', 5),
  ('./uploads/vehiculo/Ford F-150.jpeg', 'VH-006', 'PICKUP',      'Ford F-150 II',          'DISPONIBLE', 5),
  ('./uploads/vehiculo/Ford F-150.jpeg', 'VH-012', 'PICKUP',      'Ford F-150 III',         'DISPONIBLE', 5),
  ('./uploads/vehiculo/Ford F-150.jpeg', 'VH-013', 'PICKUP',      'Ford F-150 IV',          'DISPONIBLE', 5),
  ('./uploads/vehiculo/Ford F-150.jpeg', 'VH-014', 'PICKUP',      'Ford F-150 V',           'DISPONIBLE', 5),
  ('./uploads/vehiculo/Panther.jpeg',    'VH-004', 'BLINDADO',    'Panther Blindado',       'DISPONIBLE', 8),
  ('./uploads/vehiculo/Panther.jpeg',    'VH-007', 'BLINDADO',    'Panther Blindado II',    'DISPONIBLE', 8),
  ('./uploads/vehiculo/Panther.jpeg',    'VH-015', 'BLINDADO',    'Panther Blindado III',   'DISPONIBLE', 8),
  ('./uploads/vehiculo/Panther.jpeg',    'VH-016', 'BLINDADO',    'Panther Blindado IV',    'DISPONIBLE', 8),
  ('./uploads/vehiculo/Panther.jpeg',    'VH-017', 'BLINDADO',    'Panther Blindado V',     'DISPONIBLE', 8),
  ('./uploads/vehiculo/Scualo.jpeg',     'VH-005', 'INTERCEPTOR', 'Scualo Interceptor',     'DISPONIBLE', 4),
  ('./uploads/vehiculo/Scualo.jpeg',     'VH-008', 'INTERCEPTOR', 'Scualo Interceptor II',  'DISPONIBLE', 4),
  ('./uploads/vehiculo/Scualo.jpeg',     'VH-018', 'INTERCEPTOR', 'Scualo Interceptor III', 'DISPONIBLE', 4),
  ('./uploads/vehiculo/Scualo.jpeg',     'VH-019', 'INTERCEPTOR', 'Scualo Interceptor IV',  'DISPONIBLE', 4),
  ('./uploads/vehiculo/Scualo.jpeg',     'VH-020', 'INTERCEPTOR', 'Scualo Interceptor V',   'DISPONIBLE', 4)
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
  ('HFC-001', 'Harris Falcon',     'COMUNICACION', 'DISPONIBLE'),
  ('HFC-002', 'Harris Falcon II',  'COMUNICACION', 'DISPONIBLE'),
  ('HFC-003', 'Harris Falcon III', 'COMUNICACION', 'DISPONIBLE'),
  ('HFC-004', 'Harris Falcon IV',  'COMUNICACION', 'DISPONIBLE'),
  ('HFC-005', 'Harris Falcon V',   'COMUNICACION', 'DISPONIBLE'),
  ('HFC-006', 'Harris Falcon VI',  'COMUNICACION', 'DISPONIBLE'),
  ('HFC-007', 'Harris Falcon VII', 'COMUNICACION', 'DISPONIBLE'),
  ('DRN-001', 'Dron VANT 01',      'TACTICO',      'DISPONIBLE'),
  ('DRN-002', 'Dron VANT 02',      'TACTICO',      'DISPONIBLE'),
  ('DRN-003', 'Dron VANT 03',      'TACTICO',      'DISPONIBLE'),
  ('DRN-004', 'Dron VANT 04',      'TACTICO',      'DISPONIBLE'),
  ('DRN-005', 'Dron VANT 05',      'TACTICO',      'DISPONIBLE'),
  ('DRN-006', 'Dron VANT 06',      'TACTICO',      'DISPONIBLE'),
  ('DRN-007', 'Dron VANT 07',      'TACTICO',      'DISPONIBLE')
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
WHERE e.numero_serie IN ('DRN-001', 'DRN-002', 'DRN-003', 'DRN-004', 'DRN-005', 'DRN-006', 'DRN-007')
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
WHERE e.numero_serie IN ('HFC-001', 'HFC-002', 'HFC-003', 'HFC-004', 'HFC-005', 'HFC-006', 'HFC-007')
ON CONFLICT (id_equipo) DO NOTHING;