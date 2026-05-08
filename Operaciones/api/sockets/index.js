import { Server } from "socket.io";
import { pool } from "../db.js";

function streamRoomName(idStream) {
  return `media_stream_${idStream}`;
}

function normalizeStreamRole(value) {
  const role = String(value || "viewer").trim().toLowerCase();
  return ["publisher", "viewer"].includes(role) ? role : null;
}

function publicSocketStream(row) {
  return {
    id_stream: Number(row.id_stream),
    id_operacion: row.id_operacion,
    id_usuario: row.id_usuario,
    id_personal: row.id_personal,
    kind: row.kind,
    status: row.status,
    label: row.label,
    stream_key: row.stream_key,
    publisher_socket_id: row.publisher_socket_id,
    viewer_count: row.viewer_count,
    consent_ack: row.consent_ack,
    foreground_notice: row.foreground_notice,
    started_at: row.started_at,
    last_seen_at: row.last_seen_at,
    ended_at: row.ended_at,
    signaling_room: streamRoomName(row.id_stream),
  };
}

async function getActiveStream(idOperacion, idStream) {
  const { rows } = await pool.query(
    `SELECT *
     FROM media_stream_session
     WHERE id_operacion = $1 AND id_stream = $2 AND status = 'ACTIVE'
     LIMIT 1`,
    [idOperacion, idStream]
  );
  return rows[0] || null;
}

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
      if (!opId) {
        console.warn("[SOCKET] tracking_personal ignorado: socket sin operacion", data);
        return;
      }

      const { id_personal, latitud, longitud, altitud, precision_m } = data ?? {};
      if (!id_personal || latitud == null || longitud == null) {
        console.warn("[SOCKET] tracking_personal ignorado: payload incompleto", data);
        return;
      }

      console.log(
        `📍 tracking_personal op=${opId} personal=${id_personal} lat=${latitud} lon=${longitud}`
      );

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
      if (!opId) {
        console.warn("[SOCKET] tracking_vehiculo ignorado: socket sin operacion", data);
        return;
      }

      const { id_vehiculo, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m } = data ?? {};
      if (!id_vehiculo || latitud == null || longitud == null) {
        console.warn("[SOCKET] tracking_vehiculo ignorado: payload incompleto", data);
        return;
      }

      console.log(
        `📍 tracking_vehiculo op=${opId} vehiculo=${id_vehiculo} lat=${latitud} lon=${longitud}`
      );

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

    socket.on("stream_join", async (payload, ack) => {
      const idOperacion = Number(payload?.id_operacion || socket.operationId);
      const idStream = Number(payload?.id_stream);
      const role = normalizeStreamRole(payload?.role);

      if (!Number.isFinite(idOperacion) || idOperacion <= 0 || !Number.isFinite(idStream) || idStream <= 0 || !role) {
        const error = { ok: false, mensaje: "stream_join invalido" };
        if (typeof ack === "function") ack(error);
        return;
      }

      try {
        const streamRow = await getActiveStream(idOperacion, idStream);
        if (!streamRow) {
          const error = { ok: false, mensaje: "Transmision no existe o no esta activa" };
          if (typeof ack === "function") ack(error);
          return;
        }

        const room = streamRoomName(idStream);
        socket.join(`op_${idOperacion}`);
        socket.join(room);
        socket.operationId = idOperacion;
        socket.mediaStreamMemberships ||= new Map();
        socket.mediaStreamMemberships.set(`${idStream}:${role}`, { idOperacion, idStream, role });

        let updatedRow = streamRow;
        if (role === "publisher") {
          const { rows } = await pool.query(
            `UPDATE media_stream_session
             SET publisher_socket_id = $3, last_seen_at = NOW()
             WHERE id_operacion = $1 AND id_stream = $2 AND status = 'ACTIVE'
             RETURNING *`,
            [idOperacion, idStream, socket.id]
          );
          updatedRow = rows[0] || streamRow;
          socket.to(`op_${idOperacion}`).emit("media_stream_publisher_ready", publicSocketStream(updatedRow));
          socket.to(room).emit("webrtc_publisher_joined", {
            id_operacion: idOperacion,
            id_stream: idStream,
            publisher_socket_id: socket.id,
          });
        } else {
          const { rows } = await pool.query(
            `UPDATE media_stream_session
             SET viewer_count = viewer_count + 1, last_seen_at = NOW()
             WHERE id_operacion = $1 AND id_stream = $2 AND status = 'ACTIVE'
             RETURNING *`,
            [idOperacion, idStream]
          );
          updatedRow = rows[0] || streamRow;

          if (updatedRow.publisher_socket_id) {
            socket.to(updatedRow.publisher_socket_id).emit("webrtc_viewer_joined", {
              id_operacion: idOperacion,
              id_stream: idStream,
              viewer_socket_id: socket.id,
              viewer: socket.userData || {},
            });
          } else {
            socket.emit("media_stream_waiting_for_publisher", {
              id_operacion: idOperacion,
              id_stream: idStream,
            });
          }
        }

        const stream = publicSocketStream(updatedRow);
        socket.to(`op_${idOperacion}`).emit("media_stream_viewer_count", stream);
        if (typeof ack === "function") ack({ ok: true, socket_id: socket.id, stream });
      } catch (err) {
        console.error("[SOCKET] stream_join:", err.message);
        if (typeof ack === "function") ack({ ok: false, mensaje: "Error uniendo stream" });
      }
    });

    async function leaveStreamMembership(idOperacion, idStream, role, notify = true) {
      const room = streamRoomName(idStream);
      socket.leave(room);
      socket.mediaStreamMemberships?.delete(`${idStream}:${role}`);

      if (role === "viewer") {
        const { rows } = await pool.query(
          `UPDATE media_stream_session
           SET viewer_count = GREATEST(viewer_count - 1, 0), last_seen_at = NOW()
           WHERE id_operacion = $1 AND id_stream = $2
           RETURNING *`,
          [idOperacion, idStream]
        );
        const stream = rows[0] ? publicSocketStream(rows[0]) : null;
        if (notify) {
          socket.to(room).emit("webrtc_viewer_left", {
            id_operacion: idOperacion,
            id_stream: idStream,
            viewer_socket_id: socket.id,
          });
          if (stream) socket.to(`op_${idOperacion}`).emit("media_stream_viewer_count", stream);
        }
        return;
      }

      if (role === "publisher") {
        const { rows } = await pool.query(
          `UPDATE media_stream_session
           SET status = 'STOPPED',
               ended_at = COALESCE(ended_at, NOW()),
               publisher_socket_id = NULL,
               viewer_count = 0,
               last_seen_at = NOW()
           WHERE id_operacion = $1
             AND id_stream = $2
             AND publisher_socket_id = $3
             AND status = 'ACTIVE'
           RETURNING *`,
          [idOperacion, idStream, socket.id]
        );
        const stream = rows[0] ? publicSocketStream(rows[0]) : null;
        if (notify && stream) {
          socket.to(room).to(`op_${idOperacion}`).emit("media_stream_stopped", stream);
        }
      }
    }

    socket.on("stream_leave", async (payload, ack) => {
      const idOperacion = Number(payload?.id_operacion || socket.operationId);
      const idStream = Number(payload?.id_stream);
      const role = normalizeStreamRole(payload?.role);

      try {
        if (Number.isFinite(idStream) && idStream > 0 && role) {
          await leaveStreamMembership(idOperacion, idStream, role);
        } else {
          const memberships = Array.from(socket.mediaStreamMemberships?.values() || []);
          for (const membership of memberships) {
            await leaveStreamMembership(membership.idOperacion, membership.idStream, membership.role);
          }
        }
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        console.error("[SOCKET] stream_leave:", err.message);
        if (typeof ack === "function") ack({ ok: false, mensaje: "Error saliendo del stream" });
      }
    });

    socket.on("stream_stop", async (payload, ack) => {
      const idOperacion = Number(payload?.id_operacion || socket.operationId);
      const idStream = Number(payload?.id_stream);
      const status = String(payload?.status || "STOPPED").trim().toUpperCase();

      if (!Number.isFinite(idOperacion) || idOperacion <= 0 || !Number.isFinite(idStream) || idStream <= 0) {
        if (typeof ack === "function") ack({ ok: false, mensaje: "stream_stop invalido" });
        return;
      }

      try {
        const { rows } = await pool.query(
          `UPDATE media_stream_session
           SET status = $3,
               ended_at = COALESCE(ended_at, NOW()),
               publisher_socket_id = NULL,
               viewer_count = 0,
               last_seen_at = NOW()
           WHERE id_operacion = $1 AND id_stream = $2
           RETURNING *`,
          [idOperacion, idStream, status === "ERROR" ? "ERROR" : "STOPPED"]
        );
        const stream = rows[0] ? publicSocketStream(rows[0]) : null;
        if (!stream) {
          if (typeof ack === "function") ack({ ok: false, mensaje: "Transmision no existe" });
          return;
        }
        io.to(stream.signaling_room).to(`op_${idOperacion}`).emit("media_stream_stopped", stream);
        if (typeof ack === "function") ack({ ok: true, stream });
      } catch (err) {
        console.error("[SOCKET] stream_stop:", err.message);
        if (typeof ack === "function") ack({ ok: false, mensaje: "Error cerrando stream" });
      }
    });

    socket.on("stream_ping", async (payload, ack) => {
      const idOperacion = Number(payload?.id_operacion || socket.operationId);
      const idStream = Number(payload?.id_stream);
      if (!Number.isFinite(idOperacion) || idOperacion <= 0 || !Number.isFinite(idStream) || idStream <= 0) {
        if (typeof ack === "function") ack({ ok: false, mensaje: "stream_ping invalido" });
        return;
      }

      try {
        await pool.query(
          `UPDATE media_stream_session
           SET last_seen_at = NOW()
           WHERE id_operacion = $1 AND id_stream = $2 AND status = 'ACTIVE'`,
          [idOperacion, idStream]
        );
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        console.error("[SOCKET] stream_ping:", err.message);
        if (typeof ack === "function") ack({ ok: false, mensaje: "Error actualizando stream" });
      }
    });

    function relayWebRtc(eventName, payload, ack) {
      const idOperacion = Number(payload?.id_operacion || socket.operationId);
      const idStream = Number(payload?.id_stream);
      const to = String(payload?.to || payload?.to_socket_id || "").trim();

      if (!Number.isFinite(idOperacion) || idOperacion <= 0 || !Number.isFinite(idStream) || idStream <= 0 || !to) {
        if (typeof ack === "function") ack({ ok: false, mensaje: `${eventName} invalido` });
        return;
      }

      socket.to(to).emit(eventName, {
        ...payload,
        id_operacion: idOperacion,
        id_stream: idStream,
        from: socket.id,
        from_socket_id: socket.id,
      });

      if (typeof ack === "function") ack({ ok: true });
    }

    socket.on("webrtc_offer", (payload, ack) => relayWebRtc("webrtc_offer", payload, ack));
    socket.on("webrtc_answer", (payload, ack) => relayWebRtc("webrtc_answer", payload, ack));
    socket.on("webrtc_ice_candidate", (payload, ack) => relayWebRtc("webrtc_ice_candidate", payload, ack));

    socket.on("disconnect", async () => {
      const memberships = Array.from(socket.mediaStreamMemberships?.values() || []);
      for (const membership of memberships) {
        try {
          await leaveStreamMembership(membership.idOperacion, membership.idStream, membership.role);
        } catch (err) {
          console.error("[SOCKET] stream disconnect cleanup:", err.message);
        }
      }
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

export function emitDibujoCreado(io, idOperacion, dibujo) {
  io.to(`op_${idOperacion}`).emit("dibujo_creado", { dibujo });
}

export function emitDibujoEliminado(io, idOperacion, idDibujo) {
  io.to(`op_${idOperacion}`).emit("dibujo_eliminado", { id_dibujo: idDibujo });
}

export function emitRutaOperacionCreada(io, idOperacion, ruta) {
  io.to(`op_${idOperacion}`).emit("ruta_operacion_creada", { ruta });
}

export function emitRutaOperacionEliminada(io, idOperacion, idRuta) {
  io.to(`op_${idOperacion}`).emit("ruta_operacion_eliminada", { id_ruta: idRuta });
}

// ── Visibilidad de mensajes de chat ──────────────────────────
async function canReceiveChatMessage(sock, msg, idOperacion) {
  const { rol, id_personal } = sock.userData || {};
  const tipo   = (msg.destino_tipo || '').toUpperCase().trim();
  const destId = msg.destino_id != null ? String(msg.destino_id).trim() : null;

  if (!tipo || tipo === 'GLOBAL') return true;
  if (!rol) return true;                          // dashboard sin rol → ve todo
  if (rol === 'ADMIN' || rol === 'CUT') return true;

  switch (tipo) {
    case 'CETS': return rol === 'CET';
    case 'CET':  return rol === 'CET'  && id_personal != null && String(id_personal) === destId;
    case 'CUTS': return rol === 'CUT' || rol === 'CET';
    case 'CUT':  return id_personal != null && (
      (rol === 'CUT' && String(id_personal) === destId)
      || (rol === 'CET' && msg.id_personal != null && String(msg.id_personal) === String(id_personal))
    );

    case 'CELL': {
      if (!id_personal) return false;
      if (rol === 'CELL') return String(id_personal) === destId;
      if (rol === 'CET' && destId) {
        try {
          const { rows } = await pool.query(
            `SELECT 1
             FROM grupo_personal gp_cell
             JOIN grupo_operacion g_cell ON g_cell.id_grupo_operacion = gp_cell.id_grupo_operacion
             JOIN grupo_personal gp_cet ON TRUE
             JOIN grupo_operacion g_cet ON g_cet.id_grupo_operacion = gp_cet.id_grupo_operacion
             WHERE g_cell.id_operacion          = $1
               AND g_cet.id_operacion           = $1
               AND gp_cell.id_personal::text    = $2
               AND gp_cet.id_personal           = $3
               AND COALESCE(g_cell.id_grupo_padre, g_cell.id_grupo_operacion) =
                   COALESCE(g_cet.id_grupo_padre,  g_cet.id_grupo_operacion)
             LIMIT 1`,
            [idOperacion, destId, id_personal]
          );
          return rows.length > 0;
        } catch (err) {
          console.error('[SOCKET] canReceiveChatMessage CELL:', err.message);
          return false;
        }
      }
      return false;
    }

    case 'FLOTILLA':
    case 'GRUPO': {
      if (!id_personal || !destId) return false;
      try {
        const { rows } = await pool.query(
          `SELECT 1
           FROM grupo_personal gper
           JOIN grupo_operacion g  ON g.id_grupo_operacion  = gper.id_grupo_operacion
           LEFT JOIN grupo_operacion gp ON gp.id_grupo_operacion = g.id_grupo_padre
           WHERE g.id_operacion    = $1
             AND gper.id_personal  = $2
             AND (g.id_grupo_operacion::text = $3
                  OR gp.id_grupo_operacion::text = $3
                  OR g.nombre = $3 OR g.apodo = $3
                  OR gp.nombre = $3 OR gp.apodo = $3)
           LIMIT 1`,
          [idOperacion, id_personal, destId]
        );
        return rows.length > 0;
      } catch (err) {
        console.error('[SOCKET] canReceiveChatMessage FLOTILLA/GRUPO:', err.message);
        return false;
      }
    }

    default: return true;
  }
}

export async function emitChatMessage(io, idOperacion, payload) {
  const room    = `op_${idOperacion}`;
  const sockets = await io.in(room).fetchSockets();
  for (const sock of sockets) {
    try {
      if (await canReceiveChatMessage(sock, payload, idOperacion))
        sock.emit('chat_message', payload);
    } catch (err) {
      console.error('[SOCKET] emitChatMessage error:', err.message);
      sock.emit('chat_message', payload); // fallback: mejor mostrar que perder
    }
  }
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
