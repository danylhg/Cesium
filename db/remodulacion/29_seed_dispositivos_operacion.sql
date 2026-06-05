-- =========================================================
-- 29_seed_dispositivos_operacion.sql
-- Seed persistente de dispositivos moviles y asignacion por numero de serie
-- =========================================================

WITH dispositivo_seed AS (
  SELECT *
  FROM (VALUES
    (
      './uploads/dispositivo/galaxy-tab-s6-lite-sm-p620.jpg',
      'TABLET',
      'Samsung',
      'Galaxy Tab S6 Lite',
      NULL::TEXT,
      NULL::TEXT,
      'R52XC0BJRYP',
      'Android',
      'DISPONIBLE'::estado_dispositivo_enum,
      'Modelo tecnico: SM-P620; asignada a mcruz.'
    ),
    (
      './uploads/dispositivo/galaxy-s24-ultra-sm-s928b.jpg',
      'TELEFONO',
      'Samsung',
      'Galaxy S24 Ultra',
      '522841036710',
      '357425221904731',
      'R5CY21M4JKB',
      'Android',
      'DISPONIBLE'::estado_dispositivo_enum,
      'Modelo tecnico: SM-S928B; Red: BAIT'
    ),
    (
      './uploads/dispositivo/SONIM-RS80-1.jpg',
      'TABLET',
      'Generica',
      'M17X',
      NULL::TEXT,
      NULL::TEXT,
      'OR00806TA14N06228',
      'Android',
      'DISPONIBLE'::estado_dispositivo_enum,
      'Serie capturada desde Ajustes > Modelo; tablet generica sin asignacion activa.'
    ),
    (
      './uploads/dispositivo/galaxy-watch8-classic-sm-l500.jpg',
      'SMARTWATCH',
      'Samsung',
      'Galaxy Watch8 Classic',
      NULL::TEXT,
      NULL::TEXT,
      'RFGL22D6RQK',
      'Wear OS',
      'DISPONIBLE'::estado_dispositivo_enum,
      'Codigo visible: 6RQK; Modelo tecnico: SM-L500'
    )
  ) AS v(
    imagen_disp,
    tipo,
    marca,
    modelo,
    numero_telefono,
    imei,
    numero_serie,
    sistema_operativo,
    estado,
    detalles
  )
)
INSERT INTO dispositivo (
  imagen_disp,
  tipo,
  marca,
  modelo,
  numero_telefono,
  imei,
  numero_serie,
  sistema_operativo,
  estado,
  detalles
)
SELECT
  imagen_disp,
  tipo,
  marca,
  modelo,
  numero_telefono,
  imei,
  numero_serie,
  sistema_operativo,
  estado,
  detalles
FROM dispositivo_seed
ON CONFLICT (numero_serie) WHERE numero_serie IS NOT NULL AND btrim(numero_serie) <> '' DO UPDATE SET
  imagen_disp = EXCLUDED.imagen_disp,
  tipo = EXCLUDED.tipo,
  marca = EXCLUDED.marca,
  modelo = EXCLUDED.modelo,
  numero_telefono = EXCLUDED.numero_telefono,
  imei = EXCLUDED.imei,
  sistema_operativo = EXCLUDED.sistema_operativo,
  estado = EXCLUDED.estado,
  detalles = EXCLUDED.detalles;

-- La tablet queda libre; si alguna prueba/login anterior le vinculo Android ID,
-- se limpia para que no vuelva a identificarse como dispositivo activo de Maria.
UPDATE dispositivo
SET identificador_app = NULL
WHERE numero_serie IN ('R52XC0BJRYP', 'OR00806TA14N06228');

WITH operacion_activa AS (
  SELECT id_operacion
  FROM operacion
  WHERE estado = 'ACTIVA'
  ORDER BY fecha_inicio DESC NULLS LAST, id_operacion DESC
  LIMIT 1
),
admin_seed AS (
  SELECT id_usuario
  FROM usuario
  ORDER BY CASE WHEN rol = 'ADMIN' THEN 0 ELSE 1 END, id_usuario
  LIMIT 1
),
asignacion_deseada AS (
  SELECT *
  FROM (VALUES
    ('R52XC0BJRYP', 'mcruz'),
    ('R5CY21M4JKB', 'mlopez'),
    ('OR00806TA14N06228', NULL::TEXT),
    ('RFGL22D6RQK', 'mlopez')
  ) AS v(numero_serie, username)
),
liberados AS (
  UPDATE operacion_dispositivo od
  SET
    estado_asignacion = 'LIBERADO',
    fecha_devolucion = COALESCE(od.fecha_devolucion, NOW())
  FROM operacion_activa op
  JOIN dispositivo d ON TRUE
  JOIN asignacion_deseada ad ON ad.numero_serie = d.numero_serie
  WHERE ad.username IS NULL
    AND od.id_operacion = op.id_operacion
    AND od.id_dispositivo = d.id_dispositivo
    AND od.estado_asignacion = 'ASIGNADO'
    AND od.fecha_devolucion IS NULL
  RETURNING od.id_dispositivo
)
INSERT INTO operacion_dispositivo (
  id_operacion,
  id_dispositivo,
  id_personal,
  estado_asignacion,
  asignado_por
)
SELECT
  op.id_operacion,
  d.id_dispositivo,
  p.id_personal,
  'ASIGNADO',
  admin_seed.id_usuario
FROM asignacion_deseada ad
JOIN dispositivo d ON d.numero_serie = ad.numero_serie
JOIN personal p ON p.username = ad.username
JOIN operacion_activa op ON TRUE
JOIN admin_seed ON TRUE
JOIN asignacion_operacion_personal aop
  ON aop.id_operacion = op.id_operacion
 AND aop.id_personal = p.id_personal
 AND aop.estado_asignacion NOT IN ('LIBERADO')
WHERE ad.username IS NOT NULL
ON CONFLICT (id_operacion, id_dispositivo) DO UPDATE SET
  id_personal = EXCLUDED.id_personal,
  estado_asignacion = 'ASIGNADO',
  fecha_devolucion = NULL,
  asignado_por = EXCLUDED.asignado_por,
  fecha_asignacion = NOW();
