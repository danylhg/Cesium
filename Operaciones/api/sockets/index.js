import { Server } from "socket.io";
import { pool } from "../db.js";

export function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Cliente conectado:", socket.id);

    socket.on("join_operacion", async (payload) => {
      let idOperacion = null;

      if (typeof payload === "number" || typeof payload === "string") {
        idOperacion = Number(payload);
      } else {
        idOperacion = Number(payload?.id_operacion);
      }

      if (!Number.isFinite(idOperacion) || idOperacion <= 0) {
        console.warn("join_operacion inválido:", payload);
        return;
      }

      socket.join(`op_${idOperacion}`);
      socket.operationId = idOperacion;

      // Guardar info del usuario para filtrar eventos por rol
      // El Android puede enviar { id_operacion, id_personal, rol }
      const idPersonal = payload?.id_personal ? Number(payload.id_personal) : null;
      const rol        = (payload?.rol || "").toUpperCase();
      socket.userData  = { id_personal: idPersonal, rol };

      console.log(`Socket ${socket.id} unido a operación ${idOperacion} [${rol || "sin rol"}]`);
    });

    // Persiste en BD y retransmite al room
    socket.on("tracking_personal", async (data) => {
      const opId = socket.operationId;
      if (!opId) return;

      const { id_personal, latitud, longitud, altitud, precision_m } = data ?? {};
      if (!id_personal || latitud == null || longitud == null) return;

      try {
        await pool.query(
          `INSERT INTO tracking_personal (id_operacion, id_personal, latitud, longitud, altitud, precision_m)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [opId, Number(id_personal), Number(latitud), Number(longitud),
            altitud != null ? Number(altitud) : null,
            precision_m != null ? Number(precision_m) : null]
        );
      } catch (err) {
        console.error("[SOCKET] Error guardando tracking_personal:", err.message);
      }

      // Retransmite a todos los demás en el room (incluye web y otros Android)
      socket.to(`op_${opId}`).emit("tracking_personal", { ...data, id_operacion: opId });
    });

    // Persiste en BD y retransmite al room
    socket.on("tracking_vehiculo", async (data) => {
      const opId = socket.operationId;
      if (!opId) return;

      const { id_vehiculo, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m } = data ?? {};
      if (!id_vehiculo || latitud == null || longitud == null) return;

      try {
        await pool.query(
          `INSERT INTO tracking_vehiculo (id_operacion, id_vehiculo, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [opId, Number(id_vehiculo), Number(latitud), Number(longitud),
            altitud != null ? Number(altitud) : null,
            velocidad_kmh != null ? Number(velocidad_kmh) : null,
            rumbo_grados != null ? Number(rumbo_grados) : null,
            precision_m != null ? Number(precision_m) : null]
        );
      } catch (err) {
        console.error("[SOCKET] Error guardando tracking_vehiculo:", err.message);
      }

      // Retransmite a todos los demás en el room
      socket.to(`op_${opId}`).emit("tracking_vehiculo", { ...data, id_operacion: opId });
    });

    socket.on("disconnect", () => {
      console.log("🔴 Cliente desconectado:", socket.id);
    });
  });

  return io;
}

// ── Emit poi_creado ───────────────────────────────────────────
// Emite el nuevo POI a todos los clientes en el room de la operación.
export function emitPoiCreado(io, idOperacion, poi) {
  io.to(`op_${idOperacion}`).emit("poi_creado", { poi });
}

export function emitPoiActualizado(io, idOperacion, poi) {
  io.to(`op_${idOperacion}`).emit("poi_actualizado", { poi });
  io.to(`op_${idOperacion}`).emit("poi_creado", { poi });
}

// ── Emit poi_eliminado ────────────────────────────────────────
export function emitPoiEliminado(io, idOperacion, idPoi) {
  io.to(`op_${idOperacion}`).emit("poi_eliminado", { id_poi: idPoi });
}

export function emitAreaCreada(io, idOperacion, area) {
  io.to(`op_${idOperacion}`).emit("area_creada", { area });
}

export function emitAreaActualizada(io, idOperacion, area) {
  io.to(`op_${idOperacion}`).emit("area_actualizada", { area });
  io.to(`op_${idOperacion}`).emit("area_creada", { area });
}

export function emitAreaEliminada(io, idOperacion, idArea) {
  io.to(`op_${idOperacion}`).emit("area_eliminada", { id_area: idArea });
}

export function emitEstructuraCreada(io, idOperacion, estructura) {
  io.to(`op_${idOperacion}`).emit("estructura_creada", { estructura });
}

export function emitEstructuraActualizada(io, idOperacion, estructura) {
  io.to(`op_${idOperacion}`).emit("estructura_actualizada", { estructura });
  io.to(`op_${idOperacion}`).emit("estructura_creada", { estructura });
}

export function emitEstructuraEliminada(io, idOperacion, idMarca) {
  io.to(`op_${idOperacion}`).emit("estructura_eliminada", { id_marca: idMarca });
}

// ── Emit filtrado de ruta_navegacion_creada ───────────────────
// Emite la ruta solo a sockets que tienen permiso de verla:
//   - Admin / CUT / CET / sin rol registrado → ven todo
//   - CELL → solo rutas generales (id_vehiculo null)
//            o rutas del vehículo al que están asignados en la operación
export async function emitRutaCreada(io, idOperacion, ruta) {
  const room   = `op_${idOperacion}`;
  const sockets = await io.in(room).fetchSockets();

  for (const sock of sockets) {
    const { rol, id_personal } = sock.userData || {};

    if (!rol || rol !== "CELL") {
      // Admin / CUT / CET / web dashboard → recibe todo
      sock.emit("ruta_navegacion_creada", { ruta });
      continue;
    }

    // CELL: ruta general siempre visible
    if (ruta.id_vehiculo == null) {
      sock.emit("ruta_navegacion_creada", { ruta });
      continue;
    }

    // CELL: verificar si está asignada al vehículo de la ruta
    if (id_personal) {
      try {
        const { rows } = await pool.query(
          `SELECT 1 FROM vehiculo_operacion
           WHERE id_operacion = $1 AND id_vehiculo = $2 AND id_personal = $3
           LIMIT 1`,
          [idOperacion, ruta.id_vehiculo, id_personal]
        );
        if (rows.length > 0) sock.emit("ruta_navegacion_creada", { ruta });
      } catch (err) {
        console.error("[SOCKET] Error filtrando ruta para célula:", err.message);
      }
    }
  }
}
