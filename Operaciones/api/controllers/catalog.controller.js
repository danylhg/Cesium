import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { sendDbError } from "../utils/dbErrors.js";
import { isInt } from "../utils/validators.js";
import {
  slug,
  generateUniqueUsername,
  generateUniqueApodo,
} from "../utils/usernames.js";

const TIPOS_DISPOSITIVO = ["TELEFONO", "TABLET", "SMARTWATCH", "LORA", "LAPTOP", "RADIO", "GPS", "OTRO"];
const ESTADOS_DISPOSITIVO = ["DISPONIBLE", "ASIGNADO", "MANTENIMIENTO", "BAJA"];

function cleanText(value) {
  return (value ?? "").toString().trim();
}

function cleanOptionalText(value) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

// Lista personal filtrado por rol y marca si ya esta ocupado en otra operacion.
export async function listPersonal(req, res) {
  try {
    // El catalogo se consulta por rol operativo: CUT, CET o CELL.
    const rol = (req.query.rol || "").toString().toUpperCase();

    if (!["CUT", "CET", "CELL"].includes(rol)) {
      return res.status(400).json({ ok: false, mensaje: "rol inválido (CUT|CET|CELL)" });
    }

    // Operación a excluir del chequeo de ocupación (modo edición)
    const excludeOp = req.query.exclude_op ? Number(req.query.exclude_op) : null;

    // LEFT JOIN LATERAL calcula, por cada persona, si esta en otra
    // operacion ACTIVA o PLANIFICADA distinta de excludeOp.
    const { rows } = await pool.query(
      `SELECT
         p.id_personal, p.rol, p.apodo, p.nombre, p.apellido,
         p.puesto, p.username, p.activo, p.ultimo_acceso,
         -- Indica si ya está asignado a otra operación activa/planificada
         CASE WHEN opa.id_operacion IS NOT NULL THEN TRUE ELSE FALSE END AS en_operacion,
         opa.nombre AS nombre_operacion
       FROM personal p
       LEFT JOIN LATERAL (
         SELECT a.id_personal, o.id_operacion, o.nombre
         FROM asignacion_operacion_personal a
         JOIN operacion o ON o.id_operacion = a.id_operacion
         WHERE a.id_personal = p.id_personal
           AND o.estado IN ('ACTIVA', 'PLANIFICADA')
           AND a.estado_asignacion NOT IN ('LIBERADO')
           AND ($2::int IS NULL OR o.id_operacion != $2::int)
         ORDER BY CASE o.estado WHEN 'ACTIVA' THEN 1 WHEN 'PLANIFICADA' THEN 2 ELSE 3 END
         LIMIT 1
       ) opa ON TRUE
       WHERE p.rol = $1
       ORDER BY p.apellido, p.nombre`,
      [rol, excludeOp]
    );

    return res.json({ ok: true, items: rows });
  } catch (err) {
    return sendDbError(res, err, "Error catálogo personal");
  }
}

// Devuelve todos los vehiculos del inventario para catalogos y asignaciones.
export async function listVehiculos(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        id_vehiculo,
        imagen_veh,
        codigo_interno,
        tipo,
        alias,
        estado,
        capacidad,
        fecha_creacion AS fecha_registro
      FROM vehiculo
      ORDER BY codigo_interno ASC
    `);

    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error("GET /catalog/vehiculos:", err);
    return sendDbError(res, err, "Error obteniendo vehículos");
  }
}

// Crea personal operativo con username/apodo unicos y password inicial.
export async function createPersonal(req, res) {
  try {
    // Normaliza campos de entrada antes de validarlos.
    const rol = (req.body?.rol || "").toString().toUpperCase();
    const nombre = (req.body?.nombre || "").toString().trim();
    const apellido = (req.body?.apellido || "").toString().trim();
    const puesto = (req.body?.puesto || "").toString().trim() || null;
    const apodoIn = (req.body?.apodo || "").toString().trim();

    if (!["CUT", "CET", "CELL"].includes(rol)) {
      return res.status(400).json({ ok: false, mensaje: "rol inválido (CUT|CET|CELL)" });
    }
    if (!nombre) {
      return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
    }
    if (!apellido) {
      return res.status(400).json({ ok: false, mensaje: "Falta apellido" });
    }

    // El usuario autenticado queda como responsable de la creacion.
    const creado_por = Number(req.user.sub);
    if (!isInt(creado_por)) {
      return res.status(401).json({ ok: false, mensaje: "Usuario inválido" });
    }

    // La transaccion mantiene atomica la creacion y las validaciones de unicidad.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Base sugerida para username: inicial del nombre + apellido normalizado.
      const nombreSlug = slug(nombre);
      const apellidoSlug = slug(apellido);
      const base = `${(nombreSlug[0] || "")}${apellidoSlug}`.slice(0, 35);

      // Si no se envia apodo, se deriva del nombre completo.
      const apodoBase = apodoIn || `${nombre} ${apellido}`;
      const apodo = await generateUniqueApodo(apodoBase, client);

      // Username opcional propuesto por el cliente.
      const usernameIn = (req.body?.username || "").toString().trim();
      if (usernameIn && !/^[a-zA-Z0-9._-]+$/.test(usernameIn)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          mensaje: "username inválido: solo letras, números, punto, guion y guion bajo.",
        });
      }

      // Asegura que el username final no choque con registros existentes.
      const finalUsername = usernameIn
        ? await generateUniqueUsername(usernameIn, client)
        : await generateUniqueUsername(base, client);

      // Si no se envia password, se genera una temporal para entregar al usuario.
      const passwordIn = (req.body?.password || "").toString();
      const tempPassword = passwordIn || `Temp-${Math.floor(100000 + Math.random() * 900000)}`;
      const password_hash = await bcrypt.hash(tempPassword, 10);

      const { rows } = await client.query(
        `INSERT INTO personal (rol, apodo, nombre, apellido, puesto, username, password_hash, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id_personal, rol, apodo, nombre, apellido, puesto, activo, fecha_creacion, username, ultimo_acceso`,
        [rol, apodo, nombre, apellido, puesto, finalUsername, password_hash, creado_por]
      );

      await client.query("COMMIT");

      return res.json({ ok: true, item: rows[0], tempPassword });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return sendDbError(res, err, "Error creando personal");
  }
}

// Actualiza datos editables de personal y recalcula username si aplica.
export async function updatePersonal(req, res) {
  // El id llega por parametro de ruta y debe ser entero.
  const id_personal = Number(req.params.id);
  if (!isInt(id_personal)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  // La transaccion protege la lectura actual, validaciones y UPDATE final.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Carga el estado actual para combinarlo con campos parciales del body.
    const { rows: currentRows } = await client.query(
      `SELECT * FROM personal WHERE id_personal = $1`,
      [id_personal]
    );

    if (!currentRows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, mensaje: "Personal no existe" });
    }

    const current = currentRows[0];

    // null significa "no actualizar"; valores presentes se validan abajo.
    const apodo = req.body?.apodo != null ? String(req.body.apodo).trim() : null;
    const nombre = req.body?.nombre != null ? String(req.body.nombre).trim() : null;
    const apellido = req.body?.apellido != null ? String(req.body.apellido).trim() : null;
    const puesto = req.body?.puesto != null ? (String(req.body.puesto).trim() || null) : null;
    const activo = req.body?.activo != null ? !!req.body.activo : null;
    const usernameIn = req.body?.username != null ? String(req.body.username).trim() : null;
    const passwordIn = req.body?.password != null ? String(req.body.password) : null;

    if (usernameIn !== null) {
      if (!usernameIn) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, mensaje: "username no puede estar vacío" });
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(usernameIn)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, mensaje: "username inválido: solo letras, números, punto, guion y guion bajo." });
      }
    }

    if (apodo !== null && !apodo) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, mensaje: "apodo inválido" });
    }
    if (nombre !== null && !nombre) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, mensaje: "nombre inválido" });
    }
    if (apellido !== null && !apellido) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, mensaje: "apellido inválido" });
    }

    const finalNombre = nombre ?? current.nombre;
    const finalApellido = apellido ?? current.apellido;

    // Construye dinamicamente el SET para modificar solo campos enviados.
    const sets = [];
    const vals = [];
    let i = 1;

    if (apodo !== null) {
      const apodoUnique = await generateUniqueApodo(apodo, client);
      sets.push(`apodo = $${i++}`);
      vals.push(apodoUnique);
    }

    if (nombre !== null) {
      sets.push(`nombre = $${i++}`);
      vals.push(nombre);
    }

    if (apellido !== null) {
      sets.push(`apellido = $${i++}`);
      vals.push(apellido);
    }

    if (req.body?.puesto !== undefined) {
      sets.push(`puesto = $${i++}`);
      vals.push(puesto);
    }

    if (req.body?.activo !== undefined) {
      sets.push(`activo = $${i++}`);
      vals.push(activo);
    }

    if (usernameIn !== null) {
      // Username explicito: se respeta, ajustandolo si ya existe.
      const usernameUnique = await generateUniqueUsername(usernameIn, client, id_personal);
      sets.push(`username = $${i++}`);
      vals.push(usernameUnique);
    } else if (nombre !== null || apellido !== null) {
      // Si cambia nombre/apellido y no hay username explicito, se recalcula.
      const nombreSlug = slug(finalNombre);
      const apellidoSlug = slug(finalApellido);
      const base = `${(nombreSlug[0] || "")}${apellidoSlug}`.slice(0, 35);
      const username = await generateUniqueUsername(base, client, id_personal);
      sets.push(`username = $${i++}`);
      vals.push(username);
    }

    if (passwordIn) {
      // Solo actualiza password cuando llega uno nuevo en el body.
      const newHash = await bcrypt.hash(passwordIn, 10);
      sets.push(`password_hash = $${i++}`);
      vals.push(newHash);
    }

    if (sets.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, mensaje: "Nada para actualizar" });
    }

    vals.push(id_personal);

    const { rows } = await client.query(
      `UPDATE personal
       SET ${sets.join(", ")}
       WHERE id_personal = $${i}
       RETURNING id_personal, rol, apodo, nombre, apellido, puesto, activo, username, ultimo_acceso`,
      vals
    );

    await client.query("COMMIT");

    return res.json({ ok: true, item: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return sendDbError(res, err, "Error editando personal");
  } finally {
    client.release();
  }
}

// Elimina personal: por default desactiva; con ?hard=1 intenta borrado fisico.
export async function deletePersonal(req, res) {
  const id_personal = Number(req.params.id);
  if (!isInt(id_personal)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  const hard = String(req.query.hard || "").trim() === "1";

  try {
    // Borrado fisico solo para casos controlados; puede fallar por referencias.
    if (hard) {
      await pool.query(`DELETE FROM personal WHERE id_personal = $1`, [id_personal]);
      return res.json({ ok: true, deleted: true, hard: true, id_personal });
    }

    // Borrado logico: conserva historial y relaciones, pero desactiva acceso.
    const { rows } = await pool.query(
      `UPDATE personal
       SET activo = FALSE
       WHERE id_personal = $1
       RETURNING id_personal, activo`,
      [id_personal]
    );

    if (!rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Personal no existe" });
    }

    return res.json({ ok: true, item: rows[0], hard: false });
  } catch (err) {
    // 23503 indica FK: el personal esta referenciado por otras tablas.
    if (err.code === "23503") {
      return res.status(409).json({
        ok: false,
        mensaje: "No se puede borrar porque está referenciado (asignaciones/operaciones). Desactívalo o borra referencias primero.",
        error: err.detail || err.message,
      });
    }
    return sendDbError(res, err, "Error eliminando personal");
  }
}

// Devuelve todos los dispositivos, marcando responsable si estan asignados
// en una operacion activa o planificada.
export async function listDispositivos(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        d.id_dispositivo,
        d.tipo,
        d.marca,
        d.modelo,
        d.numero_telefono,
        d.imei,
        d.numero_serie,
        d.sistema_operativo,
        CASE
          WHEN od.id_operacion IS NOT NULL THEN 'ASIGNADO'
          ELSE d.estado::text
        END AS estado,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', p.puesto, p.nombre, p.apellido)), ''),
          p.apodo,
          ''
        ) AS responsable,
        od.id_operacion AS id_operacion_responsable,
        o.nombre AS operacion_responsable,
        d.detalles,
        d.fecha_creacion AS fecha_registro
      FROM dispositivo d
      LEFT JOIN LATERAL (
        SELECT od2.*
        FROM operacion_dispositivo od2
        JOIN operacion o2 ON o2.id_operacion = od2.id_operacion
        WHERE od2.id_dispositivo = d.id_dispositivo
          AND od2.estado_asignacion = 'ASIGNADO'
          AND od2.fecha_devolucion IS NULL
          AND o2.estado IN ('ACTIVA', 'PLANIFICADA')
        ORDER BY
          CASE o2.estado WHEN 'ACTIVA' THEN 1 WHEN 'PLANIFICADA' THEN 2 ELSE 3 END,
          od2.fecha_asignacion DESC
        LIMIT 1
      ) od ON TRUE
      LEFT JOIN personal p ON p.id_personal = od.id_personal
      LEFT JOIN operacion o ON o.id_operacion = od.id_operacion
      ORDER BY d.tipo, d.marca, d.modelo, d.numero_serie NULLS LAST
    `);

    return res.json({ ok: true, items: rows });
  } catch (err) {
    return sendDbError(res, err, "Error obteniendo dispositivos");
  }
}

export async function createDispositivo(req, res) {
  try {
    const tipo = cleanText(req.body?.tipo).toUpperCase();
    const marca = cleanText(req.body?.marca);
    const modelo = cleanText(req.body?.modelo);
    const numero_telefono = cleanOptionalText(req.body?.numero_telefono);
    const imei = cleanOptionalText(req.body?.imei);
    const numero_serie = cleanOptionalText(req.body?.numero_serie);
    const sistema_operativo = cleanOptionalText(req.body?.sistema_operativo);
    const estado = cleanText(req.body?.estado || "DISPONIBLE").toUpperCase();
    const detalles = cleanOptionalText(req.body?.detalles);

    if (!tipo || !marca || !modelo) {
      return res.status(400).json({ ok: false, mensaje: "Faltan tipo, marca o modelo" });
    }

    if (!TIPOS_DISPOSITIVO.includes(tipo)) {
      return res.status(400).json({
        ok: false,
        mensaje: `tipo invalido (${TIPOS_DISPOSITIVO.join("|")})`,
      });
    }

    if (!ESTADOS_DISPOSITIVO.includes(estado)) {
      return res.status(400).json({
        ok: false,
        mensaje: `estado invalido (${ESTADOS_DISPOSITIVO.join("|")})`,
      });
    }

    if (numero_telefono && !/^\d{7,15}$/.test(numero_telefono)) {
      return res.status(400).json({
        ok: false,
        mensaje: "numero_telefono invalido: usa solo digitos (7 a 15).",
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO dispositivo
         (tipo, marca, modelo, numero_telefono, imei, numero_serie,
          sistema_operativo, estado, detalles)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id_dispositivo, tipo, marca, modelo, numero_telefono, imei,
                 numero_serie, sistema_operativo, estado, detalles,
                 fecha_creacion AS fecha_registro`,
      [
        tipo,
        marca,
        modelo,
        numero_telefono,
        imei,
        numero_serie,
        sistema_operativo,
        estado,
        detalles,
      ]
    );

    return res.json({ ok: true, item: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        ok: false,
        mensaje: "Ya existe un dispositivo con ese telefono, IMEI o numero de serie",
        error: err.detail || err.message,
      });
    }

    return sendDbError(res, err, "Error creando dispositivo");
  }
}

export async function updateDispositivo(req, res) {
  const id_dispositivo = Number(req.params.id);

  if (!isInt(id_dispositivo)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    const tipo = req.body?.tipo != null ? cleanText(req.body.tipo).toUpperCase() : null;
    const marca = req.body?.marca != null ? cleanText(req.body.marca) : null;
    const modelo = req.body?.modelo != null ? cleanText(req.body.modelo) : null;
    const numero_telefono = req.body?.numero_telefono != null ? cleanOptionalText(req.body.numero_telefono) : undefined;
    const imei = req.body?.imei != null ? cleanOptionalText(req.body.imei) : undefined;
    const numero_serie = req.body?.numero_serie != null ? cleanOptionalText(req.body.numero_serie) : undefined;
    const sistema_operativo = req.body?.sistema_operativo != null ? cleanOptionalText(req.body.sistema_operativo) : undefined;
    const estado = req.body?.estado != null ? cleanText(req.body.estado).toUpperCase() : null;
    const detalles = req.body?.detalles != null ? cleanOptionalText(req.body.detalles) : undefined;

    if (tipo !== null && (!tipo || !TIPOS_DISPOSITIVO.includes(tipo))) {
      return res.status(400).json({
        ok: false,
        mensaje: `tipo invalido (${TIPOS_DISPOSITIVO.join("|")})`,
      });
    }

    if (marca !== null && !marca) {
      return res.status(400).json({ ok: false, mensaje: "marca invalida" });
    }

    if (modelo !== null && !modelo) {
      return res.status(400).json({ ok: false, mensaje: "modelo invalido" });
    }

    if (estado !== null && !ESTADOS_DISPOSITIVO.includes(estado)) {
      return res.status(400).json({
        ok: false,
        mensaje: `estado invalido (${ESTADOS_DISPOSITIVO.join("|")})`,
      });
    }

    if (numero_telefono && !/^\d{7,15}$/.test(numero_telefono)) {
      return res.status(400).json({
        ok: false,
        mensaje: "numero_telefono invalido: usa solo digitos (7 a 15).",
      });
    }

    const sets = [];
    const vals = [];
    let i = 1;

    if (tipo !== null) { sets.push(`tipo = $${i++}`); vals.push(tipo); }
    if (marca !== null) { sets.push(`marca = $${i++}`); vals.push(marca); }
    if (modelo !== null) { sets.push(`modelo = $${i++}`); vals.push(modelo); }
    if (numero_telefono !== undefined) { sets.push(`numero_telefono = $${i++}`); vals.push(numero_telefono); }
    if (imei !== undefined) { sets.push(`imei = $${i++}`); vals.push(imei); }
    if (numero_serie !== undefined) { sets.push(`numero_serie = $${i++}`); vals.push(numero_serie); }
    if (sistema_operativo !== undefined) { sets.push(`sistema_operativo = $${i++}`); vals.push(sistema_operativo); }
    if (estado !== null) { sets.push(`estado = $${i++}`); vals.push(estado); }
    if (detalles !== undefined) { sets.push(`detalles = $${i++}`); vals.push(detalles); }

    if (sets.length === 0) {
      return res.status(400).json({ ok: false, mensaje: "Nada para actualizar" });
    }

    vals.push(id_dispositivo);

    const { rows } = await pool.query(
      `UPDATE dispositivo
       SET ${sets.join(", ")}
       WHERE id_dispositivo = $${i}
       RETURNING id_dispositivo, tipo, marca, modelo, numero_telefono, imei,
                 numero_serie, sistema_operativo, estado, detalles,
                 fecha_creacion AS fecha_registro`,
      vals
    );

    if (!rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Dispositivo no existe" });
    }

    return res.json({ ok: true, item: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        ok: false,
        mensaje: "Ya existe un dispositivo con ese telefono, IMEI o numero de serie",
        error: err.detail || err.message,
      });
    }

    return sendDbError(res, err, "Error editando dispositivo");
  }
}

export async function deleteDispositivo(req, res) {
  const id_dispositivo = Number(req.params.id);

  if (!isInt(id_dispositivo)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    await pool.query(`DELETE FROM dispositivo WHERE id_dispositivo = $1`, [id_dispositivo]);
    return res.json({ ok: true, deleted: true, id_dispositivo });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({
        ok: false,
        mensaje: "No se puede borrar porque el dispositivo esta referenciado en operaciones.",
        error: err.detail || err.message,
      });
    }

    return sendDbError(res, err, "Error eliminando dispositivo");
  }
}
