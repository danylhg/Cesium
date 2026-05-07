import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db.js";
import { WEBRTC_ICE_SERVERS } from "../config/env.js";
import { requireAuth } from "../middlewares/auth.js";
import { sendDbError } from "../utils/dbErrors.js";
import { sendError } from "../utils/http.js";
import { isInt } from "../utils/validators.js";

const router = Router();
let streamingTablesReady = false;

function normalizeKind(value) {
  const kind = String(value || "AUDIO_VIDEO").trim().toUpperCase().replace("-", "_");
  return ["AUDIO", "VIDEO", "AUDIO_VIDEO"].includes(kind) ? kind : null;
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  return ["ACTIVE", "STOPPED", "ERROR"].includes(status) ? status : null;
}

function truthy(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function getActorColumns(req) {
  const id = Number(req.user.sub);
  return {
    id_usuario: req.user.tabla === "usuario" ? id : null,
    id_personal: req.user.tabla === "personal" ? id : null,
    created_by_tabla: req.user.tabla,
    created_by_id: id,
  };
}

async function ensureStreamingTables() {
  if (streamingTablesReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_stream_session (
      id_stream BIGSERIAL PRIMARY KEY,
      id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
      id_usuario INT REFERENCES usuario(id_usuario) ON DELETE SET NULL,
      id_personal INT REFERENCES personal(id_personal) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (kind IN ('AUDIO','VIDEO','AUDIO_VIDEO')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','STOPPED','ERROR')),
      label TEXT,
      stream_key TEXT NOT NULL UNIQUE,
      publisher_socket_id TEXT,
      viewer_count INT NOT NULL DEFAULT 0 CHECK (viewer_count >= 0),
      consent_ack BOOLEAN NOT NULL DEFAULT FALSE,
      foreground_notice BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_tabla TEXT,
      created_by_id INT,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ
    );

    ALTER TABLE media_stream_session
      ADD COLUMN IF NOT EXISTS stream_key TEXT,
      ADD COLUMN IF NOT EXISTS publisher_socket_id TEXT,
      ADD COLUMN IF NOT EXISTS viewer_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

    UPDATE media_stream_session
    SET stream_key = 'legacy-' || id_stream::text
    WHERE stream_key IS NULL;

    ALTER TABLE media_stream_session
      ALTER COLUMN stream_key SET NOT NULL;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'media_stream_session'
          AND column_name = 'storage_dir'
      ) THEN
        ALTER TABLE media_stream_session ALTER COLUMN storage_dir DROP NOT NULL;
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_media_stream_session_stream_key
      ON media_stream_session(stream_key);

    CREATE INDEX IF NOT EXISTS idx_media_stream_session_operacion
      ON media_stream_session(id_operacion, status, started_at DESC);
  `);

  streamingTablesReady = true;
}

function publicStream(row) {
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
    signaling_room: `media_stream_${row.id_stream}`,
  };
}

async function getStream(id_operacion, id_stream) {
  const { rows } = await pool.query(
    `SELECT *
     FROM media_stream_session
     WHERE id_operacion = $1 AND id_stream = $2
     LIMIT 1`,
    [id_operacion, id_stream]
  );
  return rows[0] || null;
}

router.get("/ops/:id/streams/webrtc-config", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return sendError(res, 400, "id invalido");

  return res.json({
    ok: true,
    config: {
      iceServers: WEBRTC_ICE_SERVERS,
      signaling: {
        namespace: "/",
        joinEvent: "stream_join",
        leaveEvent: "stream_leave",
        offerEvent: "webrtc_offer",
        answerEvent: "webrtc_answer",
        iceCandidateEvent: "webrtc_ice_candidate",
      },
    },
  });
});

router.get("/ops/:id/streams", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return sendError(res, 400, "id invalido");

  const status = req.query.status ? normalizeStatus(req.query.status) : null;
  if (req.query.status && !status) return sendError(res, 400, "status invalido");

  const params = [id_operacion];
  let where = "WHERE id_operacion = $1";
  if (status) {
    params.push(status);
    where += " AND status = $2";
  }

  try {
    await ensureStreamingTables();
    const { rows } = await pool.query(
      `SELECT *
       FROM media_stream_session
       ${where}
       ORDER BY started_at DESC
       LIMIT 100`,
      params
    );
    return res.json({ ok: true, items: rows.map(publicStream) });
  } catch (err) {
    return sendDbError(res, err, "Error obteniendo transmisiones en vivo");
  }
});

router.get("/ops/:id/streams/:streamId", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  const id_stream = Number(req.params.streamId);
  if (!isInt(id_operacion) || !isInt(id_stream)) return sendError(res, 400, "id invalido");

  try {
    await ensureStreamingTables();
    const stream = await getStream(id_operacion, id_stream);
    if (!stream) return sendError(res, 404, "Transmision no existe");
    return res.json({ ok: true, stream: publicStream(stream) });
  } catch (err) {
    return sendDbError(res, err, "Error obteniendo transmision en vivo");
  }
});

router.post("/ops/:id/streams", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return sendError(res, 400, "id invalido");

  const kind = normalizeKind(req.body?.kind || req.body?.tipo);
  if (!kind) return sendError(res, 400, "kind invalido");

  const consent_ack = truthy(req.body?.consent_ack);
  const foreground_notice = truthy(req.body?.foreground_notice);
  if (!consent_ack || !foreground_notice) {
    return sendError(
      res,
      422,
      "La transmision debe iniciarse con consentimiento explicito y aviso visible en el telefono"
    );
  }

  const label = req.body?.label != null ? String(req.body.label).trim() : null;
  const stream_key = randomUUID();

  try {
    await ensureStreamingTables();
    const actor = getActorColumns(req);
    const { rows } = await pool.query(
      `INSERT INTO media_stream_session (
         id_operacion, id_usuario, id_personal, kind, label, stream_key,
         consent_ack, foreground_notice, created_by_tabla, created_by_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        id_operacion,
        actor.id_usuario,
        actor.id_personal,
        kind,
        label,
        stream_key,
        consent_ack,
        foreground_notice,
        actor.created_by_tabla,
        actor.created_by_id,
      ]
    );

    const stream = publicStream(rows[0]);
    req.app.get("io")?.to(`op_${id_operacion}`).emit("media_stream_started", stream);
    return res.status(201).json({ ok: true, stream });
  } catch (err) {
    return sendDbError(res, err, "Error creando transmision en vivo");
  }
});

router.patch("/ops/:id/streams/:streamId/stop", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  const id_stream = Number(req.params.streamId);
  if (!isInt(id_operacion) || !isInt(id_stream)) return sendError(res, 400, "id invalido");

  const status = String(req.body?.status || "STOPPED").trim().toUpperCase();
  if (!["STOPPED", "ERROR"].includes(status)) return sendError(res, 400, "status invalido");

  try {
    await ensureStreamingTables();
    const { rows } = await pool.query(
      `UPDATE media_stream_session
       SET status = $3,
           ended_at = COALESCE(ended_at, NOW()),
           publisher_socket_id = NULL,
           viewer_count = 0
       WHERE id_operacion = $1 AND id_stream = $2
       RETURNING *`,
      [id_operacion, id_stream, status]
    );

    if (!rows[0]) return sendError(res, 404, "Transmision no existe");
    const stream = publicStream(rows[0]);
    const io = req.app.get("io");
    io?.to(stream.signaling_room).emit("media_stream_stopped", stream);
    io?.to(`op_${id_operacion}`).emit("media_stream_stopped", stream);
    return res.json({ ok: true, stream });
  } catch (err) {
    return sendDbError(res, err, "Error cerrando transmision en vivo");
  }
});

export default router;
