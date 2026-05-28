import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { JWT_SECRET } from "../config/env.js";
import { sendDbError } from "../utils/dbErrors.js";

const MOBILE_LOGIN_ROLES = new Set(["CET", "CELL"]);

let loginDeviceSchemaReady = false;

function cleanDeviceIdentifier(value) {
  const text = (value ?? "").toString().trim();
  if (!text) return null;
  if (["unknown", "null", "undefined"].includes(text.toLowerCase())) return null;
  return text;
}

function collectDeviceIdentifiers(req) {
  const body = req.body ?? {};
  const device = body.device && typeof body.device === "object" ? body.device : {};
  const identifiers = new Set();

  const add = (value) => {
    const cleaned = cleanDeviceIdentifier(value);
    if (cleaned) identifiers.add(cleaned.toLowerCase());
  };

  [
    body.identificador_app,
    body.android_id,
    body.androidId,
    body.device_id,
    body.deviceId,
    body.imei,
    body.numero_serie,
    body.serial,
    body.numero_telefono,
    req.headers["x-device-id"],
    req.headers["x-android-id"],
    device.identificador_app,
    device.android_id,
    device.androidId,
    device.device_id,
    device.deviceId,
    device.imei,
    device.numero_serie,
    device.serial,
    device.numero_telefono,
  ].forEach(add);

  const idDispositivoRaw = body.id_dispositivo ?? device.id_dispositivo;
  const id_dispositivo = Number(idDispositivoRaw);

  return {
    id_dispositivo: Number.isInteger(id_dispositivo) && id_dispositivo > 0 ? id_dispositivo : null,
    identifiers: [...identifiers],
  };
}

async function ensureLoginDeviceSchema() {
  if (loginDeviceSchemaReady) return;

  await pool.query(`
    ALTER TABLE dispositivo
      ADD COLUMN IF NOT EXISTS identificador_app TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_dispositivo_identificador_app
      ON dispositivo(identificador_app)
      WHERE identificador_app IS NOT NULL AND btrim(identificador_app) <> '';
  `);

  loginDeviceSchemaReady = true;
}

async function findAssignedLoginDevices(idPersonal) {
  const { rows } = await pool.query(
    `SELECT d.id_dispositivo, d.tipo, d.marca, d.modelo, d.numero_telefono,
            d.imei, d.numero_serie, d.identificador_app, d.estado,
            od.id_operacion, od.id_personal,
            o.nombre AS operacion_nombre, o.estado AS operacion_estado
       FROM operacion_dispositivo od
       JOIN dispositivo d ON d.id_dispositivo = od.id_dispositivo
       JOIN operacion o ON o.id_operacion = od.id_operacion
      WHERE od.id_personal = $1
        AND od.estado_asignacion = 'ASIGNADO'
        AND od.fecha_devolucion IS NULL
        AND o.estado IN ('ACTIVA', 'PLANIFICADA')
        AND d.estado NOT IN ('BAJA', 'MANTENIMIENTO')
      ORDER BY
        CASE o.estado WHEN 'ACTIVA' THEN 1 WHEN 'PLANIFICADA' THEN 2 ELSE 3 END,
        od.fecha_asignacion DESC`,
    [idPersonal]
  );
  return rows;
}

async function validatePersonalDeviceAccess(row, req) {
  const rol = String(row.rol || "").trim().toUpperCase();
  if (!MOBILE_LOGIN_ROLES.has(rol)) return null;

  await ensureLoginDeviceSchema();

  const { id_dispositivo, identifiers } = collectDeviceIdentifiers(req);
  if (!id_dispositivo && identifiers.length === 0) {
    return {
      ok: false,
      status: 403,
      codigo: "DISPOSITIVO_REQUERIDO",
      mensaje: "Este usuario requiere iniciar sesion desde un dispositivo registrado y asignado.",
    };
  }

  const conditions = [];
  const params = [];

  if (id_dispositivo) {
    params.push(id_dispositivo);
    conditions.push(`d.id_dispositivo = $${params.length}`);
  }

  if (identifiers.length > 0) {
    params.push(identifiers);
    const idx = params.length;
    conditions.push(`
      LOWER(BTRIM(COALESCE(d.identificador_app, ''))) = ANY($${idx}::text[])
      OR LOWER(BTRIM(COALESCE(d.imei, ''))) = ANY($${idx}::text[])
      OR LOWER(BTRIM(COALESCE(d.numero_serie, ''))) = ANY($${idx}::text[])
      OR LOWER(BTRIM(COALESCE(d.numero_telefono, ''))) = ANY($${idx}::text[])
    `);
  }

  const { rows: deviceRows } = await pool.query(
    `SELECT d.id_dispositivo, d.tipo, d.marca, d.modelo, d.numero_telefono,
            d.imei, d.numero_serie, d.identificador_app, d.estado
       FROM dispositivo d
      WHERE ${conditions.map(c => `(${c})`).join(" OR ")}
      LIMIT 1`,
    params
  );

  const dispositivo = deviceRows[0];
  if (!dispositivo) {
    const assigned = await findAssignedLoginDevices(row.id);
    if (assigned.length === 1 && identifiers.length > 0 && !cleanDeviceIdentifier(assigned[0].identificador_app)) {
      const identificadorApp = identifiers[0];
      const { rows: updatedRows } = await pool.query(
        `UPDATE dispositivo
            SET identificador_app = $1
          WHERE id_dispositivo = $2
          RETURNING id_dispositivo, tipo, marca, modelo, numero_telefono,
                    imei, numero_serie, identificador_app, estado`,
        [identificadorApp, assigned[0].id_dispositivo]
      );

      return {
        ok: true,
        dispositivo: updatedRows[0],
        asignacion: {
          id_operacion: assigned[0].id_operacion,
          id_personal: assigned[0].id_personal,
          operacion_nombre: assigned[0].operacion_nombre,
          operacion_estado: assigned[0].operacion_estado,
        },
      };
    }

    if (assigned.length > 1) {
      return {
        ok: false,
        status: 403,
        codigo: "DISPOSITIVO_AMBIGUO",
        mensaje: "Este usuario tiene varios dispositivos asignados. Captura el ID app en el dispositivo correcto desde Control de dispositivos.",
        identificador_app: identifiers[0] || null,
      };
    }

    return {
      ok: false,
      status: 403,
      codigo: "DISPOSITIVO_NO_REGISTRADO",
      mensaje: "Dispositivo no registrado. Primero registralo en Control de dispositivos.",
      identificador_app: identifiers[0] || null,
    };
  }

  if (["BAJA", "MANTENIMIENTO"].includes(String(dispositivo.estado || "").toUpperCase())) {
    return {
      ok: false,
      status: 403,
      codigo: "DISPOSITIVO_NO_DISPONIBLE",
      mensaje: "Dispositivo no disponible para iniciar sesion.",
    };
  }

  const { rows: assignmentRows } = await pool.query(
    `SELECT od.id_operacion, od.id_personal, o.nombre AS operacion_nombre, o.estado AS operacion_estado
       FROM operacion_dispositivo od
       JOIN operacion o ON o.id_operacion = od.id_operacion
      WHERE od.id_dispositivo = $1
        AND od.id_personal = $2
        AND od.estado_asignacion = 'ASIGNADO'
        AND od.fecha_devolucion IS NULL
        AND o.estado IN ('ACTIVA', 'PLANIFICADA')
      ORDER BY
        CASE o.estado WHEN 'ACTIVA' THEN 1 WHEN 'PLANIFICADA' THEN 2 ELSE 3 END,
        od.fecha_asignacion DESC
      LIMIT 1`,
    [dispositivo.id_dispositivo, row.id]
  );

  const asignacion = assignmentRows[0];
  if (!asignacion) {
    return {
      ok: false,
      status: 403,
      codigo: "DISPOSITIVO_NO_ASIGNADO",
      mensaje: "Dispositivo no asignado a este usuario en una operacion activa o planificada.",
    };
  }

  return { ok: true, dispositivo, asignacion };
}

// Inicia sesion para usuarios administrativos o personal operativo.
export async function login(req, res) {
  try {
    // El frontend debe enviar usuario y contrasena en el cuerpo de la peticion.
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, mensaje: "Faltan credenciales" });
    }

    let row = null;
    let tabla = "usuario";

    // Primero intenta autenticar contra la tabla de usuarios del sistema.
    {
      const { rows } = await pool.query(
        `SELECT id_usuario AS id, username, password_hash, rol, nombre, apellido, activo
         FROM usuario WHERE username = $1 LIMIT 1`,
        [username]
      );
      if (rows.length > 0) row = rows[0];
    }

    // Si no existe como usuario, intenta autenticarlo como personal operativo.
    if (!row) {
      tabla = "personal";
      const { rows } = await pool.query(
        `SELECT id_personal AS id, username, password_hash, rol, nombre, apellido, activo, puesto
         FROM personal WHERE username = $1 LIMIT 1`,
        [username]
      );
      if (rows.length > 0) row = rows[0];
    }

    if (!row) {
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }

    if (!row.activo) {
      return res.status(403).json({ ok: false, mensaje: "Usuario inactivo" });
    }

    // Compara la contrasena recibida con el hash guardado en la base de datos.
    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }

    const deviceValidation = tabla === "personal"
      ? await validatePersonalDeviceAccess(row, req)
      : null;

    if (deviceValidation?.ok === false) {
      return res.status(deviceValidation.status).json({
        ok: false,
        codigo: deviceValidation.codigo,
        mensaje: deviceValidation.mensaje,
        identificador_app: deviceValidation.identificador_app ?? undefined,
      });
    }

    // Guarda el ultimo acceso en la tabla que realmente autentico al actor.
    if (tabla === "usuario") {
      await pool.query(`UPDATE usuario SET ultimo_acceso = NOW() WHERE id_usuario = $1`, [row.id]);
    } else {
      await pool.query(`UPDATE personal SET ultimo_acceso = NOW() WHERE id_personal = $1`, [row.id]);
    }

    // El token conserva el id, rol y origen de tabla para aplicar permisos.
    const tokenPayload = { sub: row.id, username: row.username, rol: row.rol, tabla };
    if (deviceValidation?.ok) {
      tokenPayload.id_dispositivo = deviceValidation.dispositivo.id_dispositivo;
      tokenPayload.id_operacion = deviceValidation.asignacion.id_operacion;
    }

    const token = jwt.sign(
      tokenPayload,
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Devuelve un perfil normalizado para tratar ambos origenes igual.
    return res.json({
      ok: true,
      token,
      usuario: {
        id_usuario: tabla === "usuario" ? row.id : null,
        id_personal: tabla === "personal" ? row.id : null,
        username: row.username,
        rol: row.rol,
        nombre: row.nombre,
        apellido: row.apellido,
        puesto: row.puesto ?? null,
        tabla,
        id_dispositivo: deviceValidation?.dispositivo?.id_dispositivo ?? null,
        dispositivo: deviceValidation?.dispositivo
          ? {
            id_dispositivo: deviceValidation.dispositivo.id_dispositivo,
            tipo: deviceValidation.dispositivo.tipo,
            marca: deviceValidation.dispositivo.marca,
            modelo: deviceValidation.dispositivo.modelo,
            numero_serie: deviceValidation.dispositivo.numero_serie,
            imei: deviceValidation.dispositivo.imei,
            identificador_app: deviceValidation.dispositivo.identificador_app,
          }
          : null,
      },
    });
  } catch (err) {
    return sendDbError(res, err, "Error interno");
  }
}

// Devuelve los datos basicos del usuario autenticado usando el id del JWT.
export async function me(req, res) {
  try {
    const id = Number(req.user.sub);
    const { rows } = await pool.query(
      `SELECT id_usuario, username, rol, nombre, apellido
       FROM usuario
       WHERE id_usuario = $1
       LIMIT 1`,
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Usuario no existe" });
    }

    res.json(rows[0]);
  } catch (err) {
    sendDbError(res, err, "Error /me");
  }
}
