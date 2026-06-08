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

function requestedDeviceType(req) {
  const body = req.body ?? {};
  const device = body.device && typeof body.device === "object" ? body.device : {};
  const raw = device.tipo ?? device.plataforma ?? body.tipo ?? body.plataforma ?? body.device_type;
  const text = (raw ?? "").toString().trim().toUpperCase();
  if (["SMARTWATCH", "WEAR", "WEAR_OS", "WEAROS"].includes(text)) return "SMARTWATCH";
  return null;
}

function identifierValueSet(device) {
  return [
    device.identificador_app,
    device.imei,
    device.numero_serie,
    device.numero_telefono,
  ]
    .map(cleanDeviceIdentifier)
    .filter(Boolean)
    .map(value => value.toLowerCase());
}

function primaryAppIdentifierForDevice(device, identifiers) {
  if (!identifiers.length) return null;
  const deviceValues = new Set(identifierValueSet({
    ...device,
    identificador_app: null,
  }));
  return identifiers.find(identifier => !deviceValues.has(identifier)) || identifiers[0];
}

async function bindCurrentIdentifier(client, device, identifiers) {
  const identifier = primaryAppIdentifierForDevice(device, identifiers);
  if (!identifier) {
    return device;
  }

  try {
    await client.query(
      `UPDATE dispositivo
          SET identificador_app = NULL
        WHERE lower(btrim(COALESCE(identificador_app, ''))) = $1
          AND id_dispositivo <> $2`,
      [identifier, device.id_dispositivo]
    );

    const { rows } = await client.query(
      `UPDATE dispositivo
          SET identificador_app = $1
        WHERE id_dispositivo = $2
        RETURNING id_dispositivo, tipo, marca, modelo, numero_telefono,
                  imei, numero_serie, identificador_app, estado`,
      [identifier, device.id_dispositivo]
    );

    return {
      ...device,
      ...(rows[0] || {}),
    };
  } catch (err) {
    if (err.code === "23505") return device;
    throw err;
  }
}

function buildDeviceValidation(device) {
  return {
    ok: true,
    dispositivo: {
      id_dispositivo: device.id_dispositivo,
      tipo: device.tipo,
      marca: device.marca,
      modelo: device.modelo,
      numero_telefono: device.numero_telefono,
      imei: device.imei,
      numero_serie: device.numero_serie,
      identificador_app: device.identificador_app,
      estado: device.estado,
    },
    asignacion: {
      id_operacion: device.id_operacion,
      id_personal: device.id_personal,
      operacion_nombre: device.operacion_nombre,
      operacion_estado: device.operacion_estado,
    },
  };
}

async function findDeviceByLoginIdentity(client, idDispositivo, identifiers, expectedDeviceType) {
  if (idDispositivo) {
    const params = expectedDeviceType
      ? [idDispositivo, expectedDeviceType]
      : [idDispositivo];
    const typePredicate = expectedDeviceType
      ? `AND UPPER(d.tipo) = UPPER($2)`
      : `AND UPPER(d.tipo) <> 'SMARTWATCH'`;
    const { rows } = await client.query(
      `SELECT d.id_dispositivo, d.tipo, d.marca, d.modelo, d.numero_telefono,
              d.imei, d.numero_serie, d.identificador_app, d.estado
         FROM dispositivo d
        WHERE d.id_dispositivo = $1
          ${typePredicate}
          AND d.estado NOT IN ('BAJA', 'MANTENIMIENTO')
        LIMIT 1`,
      params
    );
    if (rows[0]) return rows[0];
  }

  if (!identifiers.length) return null;

  const params = expectedDeviceType
    ? [identifiers, expectedDeviceType]
    : [identifiers];
  const identifierTypePredicate = expectedDeviceType
    ? `AND UPPER(d.tipo) = UPPER($2)`
    : `AND UPPER(d.tipo) <> 'SMARTWATCH'`;

  const { rows } = await client.query(
    `SELECT d.id_dispositivo, d.tipo, d.marca, d.modelo, d.numero_telefono,
            d.imei, d.numero_serie, d.identificador_app, d.estado
       FROM dispositivo d
      WHERE d.estado NOT IN ('BAJA', 'MANTENIMIENTO')
        ${identifierTypePredicate}
        AND (
          lower(btrim(COALESCE(d.identificador_app, ''))) = ANY($1::text[]) OR
          lower(btrim(COALESCE(d.imei, ''))) = ANY($1::text[]) OR
          lower(btrim(COALESCE(d.numero_serie, ''))) = ANY($1::text[]) OR
          lower(btrim(COALESCE(d.numero_telefono, ''))) = ANY($1::text[])
        )
      ORDER BY
        CASE
          WHEN lower(btrim(COALESCE(d.identificador_app, ''))) = ANY($1::text[]) THEN 1
          WHEN lower(btrim(COALESCE(d.imei, ''))) = ANY($1::text[]) THEN 2
          WHEN lower(btrim(COALESCE(d.numero_serie, ''))) = ANY($1::text[]) THEN 3
          ELSE 4
        END,
        d.id_dispositivo
      LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function findFallbackAssignedDevice(client, idPersonal, expectedDeviceType) {
  let assigned = await findAssignedLoginDevices(idPersonal, client);
  if (expectedDeviceType) {
    assigned = assigned.filter(d => String(d.tipo || "").toUpperCase() === expectedDeviceType);
  } else {
    assigned = assigned.filter(d => String(d.tipo || "").toUpperCase() !== "SMARTWATCH");
  }
  return assigned[0] || null;
}

async function getDefaultAssigningUserId(client) {
  const { rows } = await client.query(
    `SELECT id_usuario
       FROM usuario
      ORDER BY CASE WHEN rol = 'ADMIN' THEN 0 ELSE 1 END, id_usuario
      LIMIT 1`
  );
  return rows[0]?.id_usuario || 1;
}

async function upsertDeviceAssignmentForLogin(client, device, idPersonal, operacion, identifiers) {
  const assigningUserId = await getDefaultAssigningUserId(client);

  await client.query(
    `UPDATE operacion_dispositivo od
        SET estado_asignacion = 'LIBERADO',
            fecha_devolucion = COALESCE(od.fecha_devolucion, NOW())
       FROM operacion o
      WHERE od.id_operacion = o.id_operacion
        AND od.id_dispositivo = $1
        AND od.id_operacion <> $2
        AND od.estado_asignacion = 'ASIGNADO'
        AND od.fecha_devolucion IS NULL
        AND o.estado IN ('ACTIVA', 'PLANIFICADA')`,
    [device.id_dispositivo, operacion.id_operacion]
  );

  const { rows } = await client.query(
    `INSERT INTO operacion_dispositivo
       (id_operacion, id_dispositivo, id_personal, estado_asignacion, asignado_por)
     VALUES ($1, $2, $3, 'ASIGNADO', $4)
     ON CONFLICT (id_operacion, id_dispositivo) DO UPDATE SET
       id_personal = EXCLUDED.id_personal,
       estado_asignacion = 'ASIGNADO',
       fecha_devolucion = NULL,
       asignado_por = EXCLUDED.asignado_por,
       fecha_asignacion = NOW()
     RETURNING id_operacion, id_dispositivo, id_personal, estado_asignacion`,
    [operacion.id_operacion, device.id_dispositivo, idPersonal, assigningUserId]
  );

  const boundDevice = await bindCurrentIdentifier(client, device, identifiers);
  return {
    ...boundDevice,
    id_operacion: rows[0].id_operacion,
    id_personal: rows[0].id_personal,
    operacion_nombre: operacion.nombre,
    operacion_estado: operacion.estado,
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

async function findAssignedLoginDevices(idPersonal, db = pool) {
  const { rows } = await db.query(
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
  const expectedDeviceType = requestedDeviceType(req);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const operacion = await fetchAssignedOperationForPersonal(row.id, client);
    if (!operacion) {
      await client.query("COMMIT");
      return null;
    }

    let device = await findDeviceByLoginIdentity(client, id_dispositivo, identifiers, expectedDeviceType);
    if (!device) {
      device = await findFallbackAssignedDevice(client, row.id, expectedDeviceType);
    }

    if (!device) {
      await client.query("COMMIT");
      return null;
    }

    const selected = await upsertDeviceAssignmentForLogin(client, device, row.id, operacion, identifiers);
    await client.query("COMMIT");
    return buildDeviceValidation(selected);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function buildTokenPayload(row, tabla, deviceValidation = null) {
  const tokenPayload = { sub: row.id, username: row.username, rol: row.rol, tabla };
  if (deviceValidation?.ok) {
    tokenPayload.id_dispositivo = deviceValidation.dispositivo.id_dispositivo;
    tokenPayload.id_operacion = deviceValidation.asignacion.id_operacion;
  }
  return tokenPayload;
}

function publicUser(row, tabla, deviceValidation = null) {
  return {
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
  };
}

async function fetchAssignedOperationForPersonal(idPersonal, db = pool) {
  const { rows } = await db.query(
    `SELECT
       o.id_operacion, o.codigo, o.nombre, o.descripcion,
       o.prioridad, o.estado, o.fecha_inicio, o.fecha_fin,
       a.rol_en_operacion, a.estado_asignacion,
       a.estado_operacion_creacion
     FROM asignacion_operacion_personal a
     JOIN operacion o ON o.id_operacion = a.id_operacion
     WHERE a.id_personal = $1
       AND o.estado IN ('ACTIVA', 'PLANIFICADA')
       AND a.estado_asignacion NOT IN ('LIBERADO')
     ORDER BY
       CASE o.estado WHEN 'ACTIVA' THEN 1 WHEN 'PLANIFICADA' THEN 2 ELSE 3 END,
       o.fecha_inicio ASC
     LIMIT 1`,
    [idPersonal]
  );

  const operacion = rows[0];
  if (!operacion) return null;

  const zonaRes = await db.query(
    `SELECT centroide_lat, centroide_lon, zoom_inicial, color, geometria,
            estado_operacion_creacion
       FROM zona_operacion WHERE id_operacion = $1 LIMIT 1`,
    [operacion.id_operacion]
  );

  return {
    ...operacion,
    zona: zonaRes.rows[0] ?? null,
  };
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

    const token = jwt.sign(
      buildTokenPayload(row, tabla, deviceValidation),
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Devuelve un perfil normalizado para tratar ambos origenes igual.
    return res.json({
      ok: true,
      token,
      usuario: publicUser(row, tabla, deviceValidation),
    });
  } catch (err) {
    return sendDbError(res, err, "Error interno");
  }
}

export async function issueWearSession(req, res) {
  try {
    if (req.user?.tabla !== "personal") {
      return res.status(403).json({ ok: false, mensaje: "Solo personal operativo puede sincronizar smartwatch" });
    }

    const idPersonal = Number(req.user.sub);
    const { rows } = await pool.query(
      `SELECT id_personal AS id, username, rol, nombre, apellido, activo, puesto
         FROM personal
        WHERE id_personal = $1
        LIMIT 1`,
      [idPersonal]
    );

    const row = rows[0];
    if (!row) return res.status(404).json({ ok: false, mensaje: "Personal no existe" });
    if (!row.activo) return res.status(403).json({ ok: false, mensaje: "Usuario inactivo" });

    const originalBody = req.body ?? {};
    const incomingDevice = originalBody.device && typeof originalBody.device === "object"
      ? originalBody.device
      : originalBody;
    req.body = {
      ...originalBody,
      plataforma: "SMARTWATCH",
      tipo: "SMARTWATCH",
      device: {
        ...incomingDevice,
        plataforma: "SMARTWATCH",
        tipo: "SMARTWATCH",
      },
    };

    const deviceValidation = await validatePersonalDeviceAccess(row, req);
    if (deviceValidation?.ok === false) {
      return res.status(deviceValidation.status).json({
        ok: false,
        codigo: deviceValidation.codigo,
        mensaje: deviceValidation.mensaje,
        identificador_app: deviceValidation.identificador_app ?? undefined,
      });
    }
    if (!deviceValidation?.ok) {
      return res.status(403).json({
        ok: false,
        codigo: "SMARTWATCH_NO_VALIDADO",
        mensaje: "El smartwatch debe estar registrado y asignado al personal.",
      });
    }

    const token = jwt.sign(
      buildTokenPayload(row, "personal", deviceValidation),
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    const operacion = await fetchAssignedOperationForPersonal(row.id);

    return res.json({
      ok: true,
      token,
      usuario: publicUser(row, "personal", deviceValidation),
      operacion,
    });
  } catch (err) {
    return sendDbError(res, err, "Error sincronizando smartwatch");
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
