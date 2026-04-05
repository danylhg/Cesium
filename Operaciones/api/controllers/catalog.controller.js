import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { sendDbError } from "../utils/dbErrors.js";
import { isInt } from "../utils/validators.js";
import {
  slug,
  generateUniqueUsername,
  generateUniqueApodo,
} from "../utils/usernames.js";

export async function listPersonal(req, res) {
  try {
    const rol = (req.query.rol || "").toString().toUpperCase();

    if (!["CUT", "CET", "CELL"].includes(rol)) {
      return res.status(400).json({ ok: false, mensaje: "rol inválido (CUT|CET|CELL)" });
    }

    const { rows } = await pool.query(
      `SELECT id_personal, rol, apodo, nombre, apellido, puesto, username, activo, ultimo_acceso
       FROM personal
       WHERE rol = $1
       ORDER BY apellido, nombre`,
      [rol]
    );

    return res.json({ ok: true, items: rows });
  } catch (err) {
    return sendDbError(res, err, "Error catálogo personal");
  }
}

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

export async function createPersonal(req, res) {
  try {
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

    const creado_por = Number(req.user.sub);
    if (!isInt(creado_por)) {
      return res.status(401).json({ ok: false, mensaje: "Usuario inválido" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const nombreSlug = slug(nombre);
      const apellidoSlug = slug(apellido);
      const base = `${(nombreSlug[0] || "")}${apellidoSlug}`.slice(0, 35);

      const apodoBase = apodoIn || `${nombre} ${apellido}`;
      const apodo = await generateUniqueApodo(apodoBase, client);

      const usernameIn = (req.body?.username || "").toString().trim();
      if (usernameIn && !/^[a-zA-Z0-9._-]+$/.test(usernameIn)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          ok: false,
          mensaje: "username inválido: solo letras, números, punto, guion y guion bajo.",
        });
      }

      const finalUsername = usernameIn
        ? await generateUniqueUsername(usernameIn, client)
        : await generateUniqueUsername(base, client);

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

export async function updatePersonal(req, res) {
  const id_personal = Number(req.params.id);
  if (!isInt(id_personal)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: currentRows } = await client.query(
      `SELECT * FROM personal WHERE id_personal = $1`,
      [id_personal]
    );

    if (!currentRows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, mensaje: "Personal no existe" });
    }

    const current = currentRows[0];

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
      const usernameUnique = await generateUniqueUsername(usernameIn, client, id_personal);
      sets.push(`username = $${i++}`);
      vals.push(usernameUnique);
    } else if (nombre !== null || apellido !== null) {
      const nombreSlug = slug(finalNombre);
      const apellidoSlug = slug(finalApellido);
      const base = `${(nombreSlug[0] || "")}${apellidoSlug}`.slice(0, 35);
      const username = await generateUniqueUsername(base, client, id_personal);
      sets.push(`username = $${i++}`);
      vals.push(username);
    }

    if (passwordIn) {
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

export async function deletePersonal(req, res) {
  const id_personal = Number(req.params.id);
  if (!isInt(id_personal)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  const hard = String(req.query.hard || "").trim() === "1";

  try {
    if (hard) {
      await pool.query(`DELETE FROM personal WHERE id_personal = $1`, [id_personal]);
      return res.json({ ok: true, deleted: true, hard: true, id_personal });
    }

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
