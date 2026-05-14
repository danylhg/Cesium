import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middlewares/auth.js";
import { sendDbError } from "../utils/dbErrors.js";
import { isInt } from "../utils/validators.js";
import { ensureTimelineSchema } from "../utils/timeline.js";

const router = Router();

function rowsToEvents(rows, mapFn) {
  return rows.map(mapFn).filter(Boolean);
}

router.get("/ops/:id/replay", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    await ensureTimelineSchema(pool);

    const { rows: opRows } = await pool.query(
      `SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado,
              fecha_inicio, fecha_fin, fecha_creacion, fecha_actualizacion, creada_por, id_cut
         FROM operacion
        WHERE id_operacion = $1
        LIMIT 1`,
      [id_operacion]
    );

    if (!opRows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Operacion no existe" });
    }

    const [zona, eventos, chat, trackingPersonal, trackingVehiculos, capas] = await Promise.all([
      pool.query(
        `SELECT id_zona, id_operacion, nombre, geometria, centroide_lat, centroide_lon, zoom_inicial, color
           FROM zona_operacion
          WHERE id_operacion = $1
          ORDER BY id_zona ASC
          LIMIT 1`,
        [id_operacion]
      ),
      pool.query(
        `SELECT *
           FROM operacion_evento
          WHERE id_operacion = $1
          ORDER BY occurred_at ASC, id_evento ASC`,
        [id_operacion]
      ),
      pool.query(
        `SELECT v.*
           FROM v_chat_feed v
           JOIN chat_operacion co ON co.id_chat = v.id_chat
          WHERE co.id_operacion = $1
          ORDER BY v.fecha_envio ASC, v.id_mensaje ASC`,
        [id_operacion]
      ),
      pool.query(
        `SELECT tp.*, p.rol, p.apodo, p.nombre, p.apellido
           FROM tracking_personal tp
           LEFT JOIN personal p ON p.id_personal = tp.id_personal
          WHERE tp.id_operacion = $1
          ORDER BY tp.timestamp ASC, tp.id_tracking ASC`,
        [id_operacion]
      ),
      pool.query(
        `SELECT tv.*, v.tipo, v.codigo_interno, v.alias
           FROM tracking_vehiculo tv
           LEFT JOIN vehiculo v ON v.id_vehiculo = tv.id_vehiculo
          WHERE tv.id_operacion = $1
          ORDER BY tv.timestamp ASC, tv.id_tracking ASC`,
        [id_operacion]
      ),
      Promise.all([
        pool.query(`SELECT * FROM puntos_interes WHERE id_operacion = $1 ORDER BY fecha_creacion ASC`, [id_operacion]),
        pool.query(`SELECT * FROM area_interes WHERE id_operacion = $1 ORDER BY fecha_creacion ASC`, [id_operacion]),
        pool.query(`SELECT * FROM marca_edificio WHERE id_operacion = $1 ORDER BY fecha_creacion ASC`, [id_operacion]),
        pool.query(`SELECT * FROM ruta_operacion WHERE id_operacion = $1 ORDER BY fecha_creacion ASC`, [id_operacion]),
        pool.query(`SELECT * FROM ruta_navegacion WHERE id_operacion = $1 ORDER BY fecha_creacion ASC`, [id_operacion]),
        pool.query(`SELECT * FROM dibujo_libre_operacion WHERE id_operacion = $1 ORDER BY fecha_creacion ASC`, [id_operacion]),
        pool.query(`SELECT * FROM zona_operacion WHERE id_operacion = $1 ORDER BY fecha_creacion ASC`, [id_operacion])
      ])
    ]);

    const [pois, areas, estructuras, rutasTacticas, rutasNavegacion, dibujos, zonas] = capas;
    const loggedKeys = new Set(
      eventos.rows.map(e => `${e.tipo_evento}:${e.entidad_tipo}:${e.entidad_id ?? ""}`)
    );
    const eventIfMissing = (tipo_evento, entidad_tipo, entidad_id, occurred_at, payload) => {
      const key = `${tipo_evento}:${entidad_tipo}:${entidad_id ?? ""}`;
      if (!occurred_at || loggedKeys.has(key)) return null;
      return {
        tipo_evento,
        entidad_tipo,
        entidad_id: entidad_id == null ? null : String(entidad_id),
        occurred_at,
        payload
      };
    };

    const generatedEvents = [
      ...rowsToEvents(chat.rows, row => eventIfMissing("chat_mensaje", "mensaje_chat", row.id_mensaje, row.fecha_envio, row)),
      ...rowsToEvents(trackingPersonal.rows, row => ({
        tipo_evento: "tracking_personal",
        entidad_tipo: "tracking_personal",
        entidad_id: String(row.id_tracking),
        occurred_at: row.timestamp,
        payload: row
      })),
      ...rowsToEvents(trackingVehiculos.rows, row => ({
        tipo_evento: "tracking_vehiculo",
        entidad_tipo: "tracking_vehiculo",
        entidad_id: String(row.id_tracking),
        occurred_at: row.timestamp,
        payload: row
      })),
      ...rowsToEvents(pois.rows, row => eventIfMissing("poi_creado", "poi", row.id_poi, row.fecha_creacion, row)),
      ...rowsToEvents(pois.rows, row => !row.activo
        ? eventIfMissing("poi_eliminado", "poi", row.id_poi, row.fecha_actualizacion, row)
        : null),
      ...rowsToEvents(areas.rows, row => eventIfMissing("area_creada", "area", row.id_area, row.fecha_creacion, row)),
      ...rowsToEvents(areas.rows, row => row.estado === "ELIMINADA"
        ? eventIfMissing("area_eliminada", "area", row.id_area, row.fecha_actualizacion, row)
        : null),
      ...rowsToEvents(estructuras.rows, row => eventIfMissing("estructura_creada", "estructura", row.id_marca, row.fecha_creacion, row)),
      ...rowsToEvents(estructuras.rows, row => row.estado === "INACTIVO"
        ? eventIfMissing("estructura_eliminada", "estructura", row.id_marca, row.fecha_actualizacion, row)
        : null),
      ...rowsToEvents(rutasTacticas.rows, row => eventIfMissing("ruta_tactica_creada", "ruta_operacion", row.id_ruta, row.fecha_creacion, row)),
      ...rowsToEvents(rutasTacticas.rows, row => row.estado === "CANCELADA"
        ? eventIfMissing("ruta_tactica_eliminada", "ruta_operacion", row.id_ruta, row.fecha_actualizacion, row)
        : null),
      ...rowsToEvents(rutasNavegacion.rows, row => eventIfMissing("ruta_navegacion_creada", "ruta_navegacion", row.id_ruta, row.fecha_creacion, row)),
      ...rowsToEvents(rutasNavegacion.rows, row => row.activo === false
        ? eventIfMissing("ruta_navegacion_eliminada", "ruta_navegacion", row.id_ruta, row.fecha_eliminacion, row)
        : null),
      ...rowsToEvents(dibujos.rows, row => eventIfMissing("dibujo_creado", "dibujo", row.id_dibujo, row.fecha_creacion, row)),
      ...rowsToEvents(zonas.rows, row => eventIfMissing("zona_creada", "zona", row.id_zona, row.fecha_creacion, row))
    ];

    const allEvents = [...eventos.rows, ...generatedEvents].sort((a, b) => {
      const at = new Date(a.occurred_at).getTime();
      const bt = new Date(b.occurred_at).getTime();
      return at - bt;
    });
    const eventTimes = allEvents
      .map(event => new Date(event.occurred_at).getTime())
      .filter(Number.isFinite);
    const opStartMs = new Date(opRows[0].fecha_inicio || opRows[0].fecha_creacion).getTime();
    const opEndMs = new Date(opRows[0].fecha_fin || opRows[0].fecha_actualizacion).getTime();
    const timelineStart = new Date(Math.min(opStartMs, ...eventTimes)).toISOString();
    const timelineEnd = new Date(Math.max(opEndMs, ...eventTimes)).toISOString();

    res.json({
      ok: true,
      operacion: opRows[0],
      zona_operacion: zona.rows[0] || null,
      timeline: {
        inicio: timelineStart,
        fin: timelineEnd,
        eventos: allEvents
      },
      snapshots: {
        pois: pois.rows,
        areas: areas.rows,
        estructuras: estructuras.rows,
        rutas_tacticas: rutasTacticas.rows,
        rutas_navegacion: rutasNavegacion.rows,
        dibujos: dibujos.rows,
        zonas: zonas.rows
      }
    });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo replay de operacion");
  }
});

export default router;
