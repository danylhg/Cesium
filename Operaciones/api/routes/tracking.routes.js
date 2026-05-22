import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middlewares/auth.js";
import { sendDbError } from "../utils/dbErrors.js";
import { ensureExtendedTrackingSchema } from "../utils/trackingSchema.js";
import { isInt } from "../utils/validators.js";

const router = Router();

async function getLatestPersonalPosition(id_operacion, id_personal) {
  const { rows } = await pool.query(
    `SELECT * FROM v_ultima_posicion_personal
     WHERE id_operacion = $1 AND id_personal = $2
     LIMIT 1`,
    [id_operacion, id_personal]
  );
  return rows[0] || null;
}

async function getLatestVehiculoPosition(id_operacion, id_vehiculo) {
  const { rows } = await pool.query(
    `SELECT * FROM v_ultima_posicion_vehiculo
     WHERE id_operacion = $1 AND id_vehiculo = $2
     LIMIT 1`,
    [id_operacion, id_vehiculo]
  );
  return rows[0] || null;
}

async function getLatestEquipoPosition(id_operacion, id_equipo) {
  await ensureExtendedTrackingSchema();
  const { rows } = await pool.query(
    `SELECT * FROM v_ultima_posicion_equipo
     WHERE id_operacion = $1 AND id_equipo = $2
     LIMIT 1`,
    [id_operacion, id_equipo]
  );
  return rows[0] || null;
}

async function getLatestDispositivoPosition(id_operacion, id_dispositivo) {
  await ensureExtendedTrackingSchema();
  const { rows } = await pool.query(
    `SELECT * FROM v_ultima_posicion_dispositivo
     WHERE id_operacion = $1 AND id_dispositivo = $2
     LIMIT 1`,
    [id_operacion, id_dispositivo]
  );
  return rows[0] || null;
}

function optionalNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validCoords(latitud, longitud) {
  const lat = Number(latitud);
  const lon = Number(longitud);
  return Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180;
}

// ===============================
// TRACKING PERSONAL
// ===============================

// POST /ops/:id/tracking/personal — registrar posición GPS de personal
router.post("/ops/:id/tracking/personal", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const { id_personal, latitud, longitud, altitud, precision_m } = req.body ?? {};
  if (!isInt(Number(id_personal))) return res.status(400).json({ ok: false, mensaje: "Falta id_personal" });
  if (latitud == null || longitud == null) return res.status(400).json({ ok: false, mensaje: "Falta latitud/longitud" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO tracking_personal (id_operacion, id_personal, latitud, longitud, altitud, precision_m)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_tracking, timestamp, estado_operacion_creacion`,
      [id_operacion, Number(id_personal), Number(latitud), Number(longitud),
        altitud != null ? Number(altitud) : null, precision_m != null ? Number(precision_m) : null]
    );

    const latest = await getLatestPersonalPosition(id_operacion, Number(id_personal));
    const io = req.app.get("io");
    io?.to(`op_${id_operacion}`).emit("tracking_personal", latest || {
      id_operacion,
      id_personal: Number(id_personal),
      latitud: Number(latitud),
      longitud: Number(longitud),
      altitud: altitud != null ? Number(altitud) : null,
      precision_m: precision_m != null ? Number(precision_m) : null
    });

    res.json({ ok: true, tracking: rows[0] });
  } catch (err) {
    sendDbError(res, err, "Error registrando tracking personal");
  }
});

// GET /ops/:id/tracking/personal — última posición de todo el personal
router.get("/ops/:id/tracking/personal", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM v_ultima_posicion_personal WHERE id_operacion=$1`, [id_operacion]);
    res.json({ ok: true, items: rows });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo posiciones personal");
  }
});

// GET /ops/:id/tracking/personal/:id_personal/historial — historial de posiciones
router.get("/ops/:id/tracking/personal/:id_personal/historial", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  const id_personal = Number(req.params.id_personal);
  if (!isInt(id_operacion) || !isInt(id_personal))
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT id_tracking, latitud, longitud, altitud, precision_m, timestamp,
              estado_operacion_creacion
       FROM tracking_personal
       WHERE id_operacion=$1 AND id_personal=$2
       ORDER BY timestamp ASC`,
      [id_operacion, id_personal]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo historial personal");
  }
});

// ===============================
// TRACKING VEHÍCULOS
// ===============================

// POST /ops/:id/tracking/vehiculos — registrar posición GPS de vehículo
router.post("/ops/:id/tracking/vehiculos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const { id_vehiculo, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m } = req.body ?? {};
  if (!isInt(Number(id_vehiculo))) return res.status(400).json({ ok: false, mensaje: "Falta id_vehiculo" });
  if (latitud == null || longitud == null) return res.status(400).json({ ok: false, mensaje: "Falta latitud/longitud" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO tracking_vehiculo (id_operacion, id_vehiculo, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id_tracking, timestamp, estado_operacion_creacion`,
      [id_operacion, Number(id_vehiculo), Number(latitud), Number(longitud),
        altitud != null ? Number(altitud) : null,
        velocidad_kmh != null ? Number(velocidad_kmh) : null,
        rumbo_grados != null ? Number(rumbo_grados) : null,
        precision_m != null ? Number(precision_m) : null]
    );

    const latest = await getLatestVehiculoPosition(id_operacion, Number(id_vehiculo));
    const io = req.app.get("io");
    io?.to(`op_${id_operacion}`).emit("tracking_vehiculo", latest || {
      id_operacion,
      id_vehiculo: Number(id_vehiculo),
      latitud: Number(latitud),
      longitud: Number(longitud),
      altitud: altitud != null ? Number(altitud) : null,
      velocidad_kmh: velocidad_kmh != null ? Number(velocidad_kmh) : null,
      rumbo_grados: rumbo_grados != null ? Number(rumbo_grados) : null,
      precision_m: precision_m != null ? Number(precision_m) : null
    });

    res.json({ ok: true, tracking: rows[0] });
  } catch (err) {
    sendDbError(res, err, "Error registrando tracking vehiculo");
  }
});

// GET /ops/:id/tracking/vehiculos — última posición de todos los vehículos
router.get("/ops/:id/tracking/vehiculos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM v_ultima_posicion_vehiculo WHERE id_operacion=$1`, [id_operacion]);
    res.json({ ok: true, items: rows });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo posiciones vehiculos");
  }
});

// GET /ops/:id/tracking/vehiculos/:id_vehiculo/historial — historial de posiciones
router.get("/ops/:id/tracking/vehiculos/:id_vehiculo/historial", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  const id_vehiculo = Number(req.params.id_vehiculo);
  if (!isInt(id_operacion) || !isInt(id_vehiculo))
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT id_tracking, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m, timestamp,
              estado_operacion_creacion
       FROM tracking_vehiculo
       WHERE id_operacion=$1 AND id_vehiculo=$2
       ORDER BY timestamp ASC`,
      [id_operacion, id_vehiculo]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo historial vehiculo");
  }
});

// ===============================
// TRACKING EQUIPOS
// ===============================

// POST /ops/:id/tracking/equipos - registrar posicion GPS de equipo
router.post("/ops/:id/tracking/equipos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const { id_equipo, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m } = req.body ?? {};
  if (!isInt(Number(id_equipo))) return res.status(400).json({ ok: false, mensaje: "Falta id_equipo" });
  if (!validCoords(latitud, longitud)) return res.status(400).json({ ok: false, mensaje: "Latitud/longitud invalidas" });

  try {
    await ensureExtendedTrackingSchema();
    const { rows } = await pool.query(
      `INSERT INTO tracking_equipo (
         id_operacion, id_equipo, latitud, longitud, altitud,
         velocidad_kmh, rumbo_grados, precision_m
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id_tracking, timestamp, estado_operacion_creacion`,
      [
        id_operacion,
        Number(id_equipo),
        Number(latitud),
        Number(longitud),
        optionalNumber(altitud),
        optionalNumber(velocidad_kmh),
        optionalNumber(rumbo_grados),
        optionalNumber(precision_m)
      ]
    );

    const latest = await getLatestEquipoPosition(id_operacion, Number(id_equipo));
    const io = req.app.get("io");
    io?.to(`op_${id_operacion}`).emit("tracking_equipo", latest || {
      id_operacion,
      id_equipo: Number(id_equipo),
      latitud: Number(latitud),
      longitud: Number(longitud),
      altitud: optionalNumber(altitud),
      velocidad_kmh: optionalNumber(velocidad_kmh),
      rumbo_grados: optionalNumber(rumbo_grados),
      precision_m: optionalNumber(precision_m)
    });

    res.json({ ok: true, tracking: rows[0] });
  } catch (err) {
    sendDbError(res, err, "Error registrando tracking equipo");
  }
});

// GET /ops/:id/tracking/equipos - ultima posicion de todos los equipos
router.get("/ops/:id/tracking/equipos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    await ensureExtendedTrackingSchema();
    const { rows } = await pool.query(
      `SELECT * FROM v_ultima_posicion_equipo WHERE id_operacion=$1`, [id_operacion]);
    res.json({ ok: true, items: rows });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo posiciones equipos");
  }
});

// GET /ops/:id/tracking/equipos/:id_equipo/historial - historial de posiciones
router.get("/ops/:id/tracking/equipos/:id_equipo/historial", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  const id_equipo = Number(req.params.id_equipo);
  if (!isInt(id_operacion) || !isInt(id_equipo))
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    await ensureExtendedTrackingSchema();
    const { rows } = await pool.query(
      `SELECT id_tracking, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m, timestamp,
              estado_operacion_creacion
       FROM tracking_equipo
       WHERE id_operacion=$1 AND id_equipo=$2
       ORDER BY timestamp ASC`,
      [id_operacion, id_equipo]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo historial equipo");
  }
});

// ===============================
// TRACKING DISPOSITIVOS
// ===============================

// POST /ops/:id/tracking/dispositivos - registrar posicion GPS de dispositivo
router.post("/ops/:id/tracking/dispositivos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const {
    id_dispositivo,
    latitud,
    longitud,
    altitud,
    velocidad_kmh,
    rumbo_grados,
    precision_m,
    bateria_pct
  } = req.body ?? {};
  if (!isInt(Number(id_dispositivo))) return res.status(400).json({ ok: false, mensaje: "Falta id_dispositivo" });
  if (!validCoords(latitud, longitud)) return res.status(400).json({ ok: false, mensaje: "Latitud/longitud invalidas" });

  try {
    await ensureExtendedTrackingSchema();
    const { rows } = await pool.query(
      `INSERT INTO tracking_dispositivo (
         id_operacion, id_dispositivo, latitud, longitud, altitud,
         velocidad_kmh, rumbo_grados, precision_m, bateria_pct
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id_tracking, timestamp, estado_operacion_creacion`,
      [
        id_operacion,
        Number(id_dispositivo),
        Number(latitud),
        Number(longitud),
        optionalNumber(altitud),
        optionalNumber(velocidad_kmh),
        optionalNumber(rumbo_grados),
        optionalNumber(precision_m),
        optionalNumber(bateria_pct)
      ]
    );

    const latest = await getLatestDispositivoPosition(id_operacion, Number(id_dispositivo));
    const io = req.app.get("io");
    io?.to(`op_${id_operacion}`).emit("tracking_dispositivo", latest || {
      id_operacion,
      id_dispositivo: Number(id_dispositivo),
      latitud: Number(latitud),
      longitud: Number(longitud),
      altitud: optionalNumber(altitud),
      velocidad_kmh: optionalNumber(velocidad_kmh),
      rumbo_grados: optionalNumber(rumbo_grados),
      precision_m: optionalNumber(precision_m),
      bateria_pct: optionalNumber(bateria_pct)
    });

    res.json({ ok: true, tracking: rows[0] });
  } catch (err) {
    sendDbError(res, err, "Error registrando tracking dispositivo");
  }
});

// GET /ops/:id/tracking/dispositivos - ultima posicion de todos los dispositivos
router.get("/ops/:id/tracking/dispositivos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    await ensureExtendedTrackingSchema();
    const { rows } = await pool.query(
      `SELECT * FROM v_ultima_posicion_dispositivo WHERE id_operacion=$1`, [id_operacion]);
    res.json({ ok: true, items: rows });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo posiciones dispositivos");
  }
});

// GET /ops/:id/tracking/dispositivos/:id_dispositivo/historial - historial de posiciones
router.get("/ops/:id/tracking/dispositivos/:id_dispositivo/historial", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  const id_dispositivo = Number(req.params.id_dispositivo);
  if (!isInt(id_operacion) || !isInt(id_dispositivo))
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    await ensureExtendedTrackingSchema();
    const { rows } = await pool.query(
      `SELECT id_tracking, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m, bateria_pct, timestamp,
              estado_operacion_creacion
       FROM tracking_dispositivo
       WHERE id_operacion=$1 AND id_dispositivo=$2
       ORDER BY timestamp ASC`,
      [id_operacion, id_dispositivo]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo historial dispositivo");
  }
});

export default router;
