import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middlewares/auth.js";
import { sendDbError } from "../utils/dbErrors.js";
import { isInt } from "../utils/validators.js";

const router = Router();

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
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_tracking, timestamp`,
      [id_operacion, Number(id_personal), Number(latitud), Number(longitud),
        altitud != null ? Number(altitud) : null, precision_m != null ? Number(precision_m) : null]
    );
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
      `SELECT id_tracking, latitud, longitud, altitud, precision_m, timestamp
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
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id_tracking, timestamp`,
      [id_operacion, Number(id_vehiculo), Number(latitud), Number(longitud),
        altitud != null ? Number(altitud) : null,
        velocidad_kmh != null ? Number(velocidad_kmh) : null,
        rumbo_grados != null ? Number(rumbo_grados) : null,
        precision_m != null ? Number(precision_m) : null]
    );
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
      `SELECT id_tracking, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m, timestamp
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

export default router;
