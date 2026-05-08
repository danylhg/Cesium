import { Router, raw } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";
import { WEBRTC_ICE_SERVERS } from "../config/env.js";
import { requireAuth } from "../middlewares/auth.js";
import { sendDbError } from "../utils/dbErrors.js";
import { sendError } from "../utils/http.js";
import { isInt } from "../utils/validators.js";

const router = Router();
let streamingTablesReady = false;
const routesDir = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(routesDir, "..");
const streamStorageRoot = resolve(apiRoot, "storage", "streams");
const recordingContentTypes = new Set(["video/webm", "audio/webm", "application/octet-stream"]);

function isRecordingContentType(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const mediaType = contentType.split(";")[0].trim();
  return recordingContentTypes.has(mediaType);
}

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

    CREATE TABLE IF NOT EXISTS media_stream_recording (
      id_recording BIGSERIAL PRIMARY KEY,
      id_stream BIGINT NOT NULL REFERENCES media_stream_session(id_stream) ON DELETE CASCADE,
      id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
      mime_type TEXT NOT NULL DEFAULT 'video/webm',
      storage_path TEXT NOT NULL,
      original_filename TEXT,
      size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
      duration_ms BIGINT,
      recorded_by_tabla TEXT,
      recorded_by_id INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_media_stream_recording_stream
      ON media_stream_recording(id_stream, created_at DESC);
  `);

  streamingTablesReady = true;
}

function publicRecording(row) {
  const recording = {
    id_recording: Number(row.id_recording),
    id_stream: Number(row.id_stream),
    id_operacion: row.id_operacion,
    mime_type: row.mime_type,
    original_filename: row.original_filename,
    size_bytes: Number(row.size_bytes || 0),
    duration_ms: row.duration_ms != null ? Number(row.duration_ms) : null,
    created_at: row.created_at,
    download_url: `/ops/${row.id_operacion}/streams/${row.id_stream}/recordings/${row.id_recording}/download`,
  };

  if (row.stream_kind != null) recording.stream_kind = row.stream_kind;
  if (row.stream_status != null) recording.stream_status = row.stream_status;
  if (row.stream_label != null) recording.stream_label = row.stream_label;
  if (row.stream_started_at != null) recording.stream_started_at = row.stream_started_at;
  if (row.stream_ended_at != null) recording.stream_ended_at = row.stream_ended_at;

  return recording;
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

router.get("/ops/:id/streams/recordings", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return sendError(res, 400, "id invalido");

  try {
    await ensureStreamingTables();
    const { rows } = await pool.query(
      `SELECT r.*,
              s.kind AS stream_kind,
              s.status AS stream_status,
              s.label AS stream_label,
              s.started_at AS stream_started_at,
              s.ended_at AS stream_ended_at
       FROM media_stream_recording r
       LEFT JOIN media_stream_session s
         ON s.id_stream = r.id_stream
        AND s.id_operacion = r.id_operacion
       WHERE r.id_operacion = $1
       ORDER BY r.created_at DESC`,
      [id_operacion]
    );
    return res.json({ ok: true, items: rows.map(publicRecording) });
  } catch (err) {
    return sendDbError(res, err, "Error obteniendo grabaciones");
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
    io?.to(stream.signaling_room).to(`op_${id_operacion}`).emit("media_stream_stopped", stream);
    return res.json({ ok: true, stream });
  } catch (err) {
    return sendDbError(res, err, "Error cerrando transmision en vivo");
  }
});

router.get("/ops/:id/streams/:streamId/recordings", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  const id_stream = Number(req.params.streamId);
  if (!isInt(id_operacion) || !isInt(id_stream)) return sendError(res, 400, "id invalido");

  try {
    await ensureStreamingTables();
    const { rows } = await pool.query(
      `SELECT *
       FROM media_stream_recording
       WHERE id_operacion = $1 AND id_stream = $2
       ORDER BY created_at DESC`,
      [id_operacion, id_stream]
    );
    return res.json({ ok: true, items: rows.map(publicRecording) });
  } catch (err) {
    return sendDbError(res, err, "Error obteniendo grabaciones");
  }
});

router.post(
  "/ops/:id/streams/:streamId/recordings",
  requireAuth,
  raw({ type: isRecordingContentType, limit: "500mb" }),
  async (req, res) => {
    const id_operacion = Number(req.params.id);
    const id_stream = Number(req.params.streamId);
    if (!isInt(id_operacion) || !isInt(id_stream)) return sendError(res, 400, "id invalido");

    const buffer = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buffer || buffer.length === 0) return sendError(res, 400, "archivo vacio");

    const mime_type = String(req.headers["content-type"] || "video/webm").split(";")[0].trim();
    const duration_ms = req.query.duration_ms ? Number(req.query.duration_ms) : null;
    const safeDuration = Number.isFinite(duration_ms) && duration_ms >= 0 ? Math.round(duration_ms) : null;

    try {
      await ensureStreamingTables();
      const stream = await getStream(id_operacion, id_stream);
      if (!stream) return sendError(res, 404, "Transmision no existe");

      const actor = getActorColumns(req);
      const dir = resolve(streamStorageRoot, `op_${id_operacion}`, `stream_${id_stream}`);
      await mkdir(dir, { recursive: true });

      const filename = `recording_${Date.now()}_${randomUUID()}.webm`;
      const storagePath = resolve(dir, filename);
      await writeFile(storagePath, buffer);

      const { rows } = await pool.query(
        `INSERT INTO media_stream_recording (
           id_stream, id_operacion, mime_type, storage_path, original_filename,
           size_bytes, duration_ms, recorded_by_tabla, recorded_by_id
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          id_stream,
          id_operacion,
          mime_type,
          storagePath,
          filename,
          buffer.length,
          safeDuration,
          actor.created_by_tabla,
          actor.created_by_id,
        ]
      );

      return res.status(201).json({ ok: true, recording: publicRecording(rows[0]) });
    } catch (err) {
      return sendDbError(res, err, "Error guardando grabacion");
    }
  }
);

router.get("/ops/:id/streams/:streamId/recordings/:recordingId/download", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  const id_stream = Number(req.params.streamId);
  const id_recording = Number(req.params.recordingId);
  if (!isInt(id_operacion) || !isInt(id_stream) || !isInt(id_recording)) {
    return sendError(res, 400, "id invalido");
  }

  try {
    await ensureStreamingTables();
    const { rows } = await pool.query(
      `SELECT *
       FROM media_stream_recording
       WHERE id_operacion = $1 AND id_stream = $2 AND id_recording = $3
       LIMIT 1`,
      [id_operacion, id_stream, id_recording]
    );

    const recording = rows[0];
    if (!recording) return sendError(res, 404, "Grabacion no existe");

    res.setHeader("Content-Type", recording.mime_type || "video/webm");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${recording.original_filename || `stream_${id_stream}.webm`}"`
    );
    return res.sendFile(recording.storage_path);
  } catch (err) {
    return sendDbError(res, err, "Error descargando grabacion");
  }
});

export default router;
