import { pool } from "../db.js";

export async function ensureTimelineSchema(client = pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS operacion_evento (
      id_evento BIGSERIAL PRIMARY KEY,
      id_operacion INT NOT NULL REFERENCES operacion(id_operacion) ON DELETE CASCADE,
      tipo_evento TEXT NOT NULL,
      entidad_tipo TEXT NOT NULL,
      entidad_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      actor_tipo TEXT,
      id_usuario INT REFERENCES usuario(id_usuario) ON DELETE SET NULL,
      id_personal INT REFERENCES personal(id_personal) ON DELETE SET NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_operacion_evento_op_time
      ON operacion_evento(id_operacion, occurred_at ASC, id_evento ASC)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_operacion_evento_entidad
      ON operacion_evento(id_operacion, entidad_tipo, entidad_id)
  `);
}

export function getActorFromRequest(req) {
  const user = req.user || {};
  const tabla = String(user.tabla || "").toLowerCase();
  const idPersonal = user.id_personal ?? (tabla === "personal" ? user.id : null);
  const idUsuario = user.id_usuario ?? (tabla !== "personal" ? user.id : null);

  return {
    actor_tipo: idPersonal ? "PERSONAL" : "USUARIO",
    id_usuario: idPersonal ? null : (idUsuario ? Number(idUsuario) : null),
    id_personal: idPersonal ? Number(idPersonal) : null
  };
}

export async function logOperacionEvento(clientOrPool, {
  id_operacion,
  tipo_evento,
  entidad_tipo,
  entidad_id = null,
  payload = {},
  occurred_at = null,
  actor = {}
}) {
  if (!id_operacion || !tipo_evento || !entidad_tipo) return null;

  await ensureTimelineSchema(clientOrPool);

  const { rows } = await clientOrPool.query(
    `INSERT INTO operacion_evento (
       id_operacion, tipo_evento, entidad_tipo, entidad_id, payload,
       actor_tipo, id_usuario, id_personal, occurred_at
     )
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,COALESCE($9::timestamptz, NOW()))
     RETURNING *`,
    [
      Number(id_operacion),
      String(tipo_evento),
      String(entidad_tipo),
      entidad_id == null ? null : String(entidad_id),
      JSON.stringify(payload ?? {}),
      actor.actor_tipo || null,
      actor.id_usuario ?? null,
      actor.id_personal ?? null,
      occurred_at
    ]
  );

  return rows[0] || null;
}
