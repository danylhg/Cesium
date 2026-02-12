import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();

// ===============================
// MIDDLEWARES
// ===============================
app.use(cors());
app.use(express.json());

// ===============================
// RUTAS DE PRUEBA
// ===============================
app.get("/health", (req, res) => {
  res.json({ ok: true, mensaje: "API funcionando" });
});

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

// ===============================
// AUTH
// ===============================
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

// ===============================
// LISTADOS (TEMP, sin auth todavía)
// ===============================
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

// ===============================
// CATALOGO (para tu botón CUT/CET/CELL)
// ===============================
app.get("/catalog/personal", async (req, res) => {
  try {
    const cutQ = `
      SELECT id_personal AS id,
             (nombre || ' ' || apellido) AS nombre
      FROM personal
      WHERE activo = TRUE AND rol = 'CUT'
      ORDER BY apellido, nombre;
    `;

    const cetQ = `
      SELECT id_personal AS id,
             (nombre || ' ' || apellido) AS nombre
      FROM personal
      WHERE activo = TRUE AND rol = 'CET'
      ORDER BY apellido, nombre;
    `;

    const celQ = `
      SELECT id_personal AS id,
             (nombre || ' ' || apellido) AS nombre
      FROM personal
      WHERE activo = TRUE AND rol = 'CELL'
      ORDER BY apellido, nombre;
    `;

    const [cut, cet, celulas] = await Promise.all([
      pool.query(cutQ),
      pool.query(cetQ),
      pool.query(celQ),
    ]);

    return res.json({
      cut: cut.rows,
      cet: cet.rows,
      celulas: celulas.rows,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error en catálogo", error: err.message });
  }
});

function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, mensaje: "Falta token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "cambia_esto");
    req.user = payload; // { sub, username, rol }
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, mensaje: "Token inválido" });
  }
}

app.get("/ops", requireAuth, async (req, res) => {
  try {
    const q = `
      SELECT 
        o.id_operacion AS id,
        o.codigo,
        o.nombre AS name,
        o.descripcion AS desc,
        o.fecha_creacion,
        (u.nombre || ' ' || u.apellido) AS creada_por_nombre
      FROM operacion o
      JOIN usuario u ON u.id_usuario = o.creada_por
      ORDER BY o.id_operacion DESC
    `;
    const { rows } = await pool.query(q);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error listando ops", error: err.message });
  }
});

app.post("/ops", requireAuth, async (req, res) => {
  try {
    const { name, desc, created_at, start_at, end_at } = req.body ?? {};

    if (!name || !desc) {
      return res.status(400).json({ ok: false, mensaje: "Faltan name/desc" });
    }
    if (!created_at || !start_at || !end_at) {
      return res.status(400).json({ ok: false, mensaje: "Faltan fechas" });
    }
    if (end_at < start_at) {
      return res.status(400).json({ ok: false, mensaje: "Fin no puede ser menor que inicio" });
    }

    // codigo único simple
    const codigo = `OP-${Date.now()}`;

    const q = `
      INSERT INTO operacion
        (codigo, nombre, descripcion, fecha_creacion, fecha_inicio, fecha_fin, creada_por)
      VALUES
        ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6::timestamptz, $7)
      RETURNING id_operacion AS id, codigo, nombre AS name
    `;

    const createdBy = req.user.sub; // ID del usuario logueado (del token)
    const { rows } = await pool.query(q, [
      codigo,
      name.trim(),
      desc.trim(),
      `${created_at}T00:00:00Z`,
      `${start_at}T00:00:00Z`,
      `${end_at}T00:00:00Z`,
      createdBy
    ]);

    await pool.query(
      `INSERT INTO operacion_asignaciones (id_operacion, assignments)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (id_operacion) DO NOTHING`,
      [rows[0].id, JSON.stringify({
        cut: null,
        cet: [],
        celulasByCET: {},
        activeCETIndex: 0,
        celulasDraft: []
      })]
    );

    return res.json({ ok: true, op: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error creando operación", error: err.message });
  }
});

// ===============================
// ASIGNACIONES POR OPERACIÓN (JSON)
// ===============================
app.get("/ops/:id/assignments", requireAuth, async (req, res) => {
  try {
    const opId = Number(req.params.id);
    if (!Number.isFinite(opId)) {
      return res.status(400).json({ ok: false, mensaje: "id inválido" });
    }

    const q = `
      SELECT assignments
      FROM operacion_asignaciones
      WHERE id_operacion = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(q, [opId]);

    const fallback = {
      cut: null,
      cet: [],
      celulasByCET: {},
      activeCETIndex: 0,
      celulasDraft: []
    };

    return res.json({ ok: true, assignments: rows[0]?.assignments ?? fallback });
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error cargando asignaciones", error: err.message });
  }
});

app.put("/ops/:id/assignments", requireAuth, async (req, res) => {
  try {
    const opId = Number(req.params.id);
    if (!Number.isFinite(opId)) {
      return res.status(400).json({ ok: false, mensaje: "id inválido" });
    }

    const obj = req.body ?? {};
    const clean = {
      cut: obj.cut ?? null,
      cet: Array.isArray(obj.cet) ? obj.cet : [],
      celulasByCET: (obj.celulasByCET && typeof obj.celulasByCET === "object") ? obj.celulasByCET : {},
      activeCETIndex: Number.isFinite(obj.activeCETIndex) ? obj.activeCETIndex : 0,
      celulasDraft: Array.isArray(obj.celulasDraft) ? obj.celulasDraft : [],
    };

    const q = `
      INSERT INTO operacion_asignaciones (id_operacion, assignments, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (id_operacion)
      DO UPDATE SET assignments = EXCLUDED.assignments, updated_at = NOW()
      RETURNING assignments
    `;
    const { rows } = await pool.query(q, [opId, JSON.stringify(clean)]);

    return res.json({ ok: true, assignments: rows[0].assignments });
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error guardando asignaciones", error: err.message });
  }
});

// ===============================
// LISTEN (SIEMPRE AL FINAL)
// ===============================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API en http://localhost:${PORT}`);
});
