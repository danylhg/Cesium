import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { JWT_SECRET } from "../config/env.js";
import { sendDbError } from "../utils/dbErrors.js";

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

    // Guarda el ultimo acceso en la tabla que realmente autentico al actor.
    if (tabla === "usuario") {
      await pool.query(`UPDATE usuario SET ultimo_acceso = NOW() WHERE id_usuario = $1`, [row.id]);
    } else {
      await pool.query(`UPDATE personal SET ultimo_acceso = NOW() WHERE id_personal = $1`, [row.id]);
    }

    // El token conserva el id, rol y origen de tabla para aplicar permisos.
    const token = jwt.sign(
      { sub: row.id, username: row.username, rol: row.rol, tabla },
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
