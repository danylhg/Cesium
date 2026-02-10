import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// ruta de prueba
app.get("/health", (req, res) => {
  res.json({ ok: true, mensaje: "API funcionando" });
});

// prueba de DB
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      conectado: true,
      hora_db: result.rows[0].now,
    });
  } catch (err) {
    res.status(500).json({
      conectado: false,
      error: err.message,
    });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};

    if (!username || !password) {
      return res.status(400).json({ ok: false, mensaje: "Faltan credenciales" });
    }

    const q = `
      SELECT id_usuario, username, password_hash, rol, nombre, apellido, activo
      FROM usuario
      WHERE username = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(q, [username]);

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }

    const user = rows[0];

    if (!user.activo) {
      return res.status(403).json({ ok: false, mensaje: "Usuario inactivo" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }

    await pool.query(`UPDATE usuario SET ultimo_acceso = NOW() WHERE id_usuario = $1`, [user.id_usuario]);

    const token = jwt.sign(
      { sub: user.id_usuario, username: user.username, rol: user.rol },
      process.env.JWT_SECRET || "cambia_esto",
      { expiresIn: "8h" }
    );

    return res.json({
      ok: true,
      token,
      usuario: {
        id_usuario: user.id_usuario,
        username: user.username,
        rol: user.rol,
        nombre: user.nombre,
        apellido: user.apellido,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error interno", error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API en http://localhost:${PORT}`);
});

// ====== LISTADOS (TEMP, sin auth todavía) ======

// usuarios (para asignar personal)
app.get("/usuarios", async (req, res) => {
  try {
    const q = `
      SELECT id_usuario, rol, nombre, apellido, puesto, username, activo
      FROM usuario
      WHERE activo = TRUE
      ORDER BY rol, apellido, nombre
    `;
    const { rows } = await pool.query(q);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error listando usuarios", error: err.message });
  }
});

// equipo
app.get("/equipo", async (req, res) => {
  try {
    const q = `
      SELECT id_equipo, numero_serie, nombre, categoria, marca, modelo, estado, activo
      FROM equipo
      WHERE activo = TRUE
      ORDER BY nombre
    `;
    const { rows } = await pool.query(q);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error listando equipo", error: err.message });
  }
});

// vehiculos
app.get("/vehiculos", async (req, res) => {
  try {
    const q = `
      SELECT id_vehiculo, codigo_interno, tipo, marca, modelo, estado, activo
      FROM vehiculo
      WHERE activo = TRUE
      ORDER BY tipo, codigo_interno
    `;
    const { rows } = await pool.query(q);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error listando vehiculos", error: err.message });
  }
});
