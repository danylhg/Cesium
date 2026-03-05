import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "cambia_esto";

console.log("SERVER.JS CARGADO - build:", Date.now());

// ===============================
// MIDDLEWARES
// ===============================

// CORS bien para Authorization + preflight
app.use(cors({
  origin: true, // o pon "http://127.0.0.1:5500" si usas Live Server
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

// Responde preflight siempre
app.options("*", cors());

app.use(express.json());

// Logger: ver TODO lo que llega
app.use((req, res, next) => {
  console.log("➡️", req.method, req.url);
  next();
});

// ===============================
// Helpers
// ===============================
function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!tok) return res.status(401).json({ ok: false, mensaje: "Falta token" });

  try {
    const payload = jwt.verify(tok, JWT_SECRET);
    req.user = payload; // { sub, username, rol }
    next();
  } catch {
    return res.status(401).json({ ok: false, mensaje: "Token inválido" });
  }
}

function isInt(n) {
  return Number.isInteger(n) && n > 0;
}

// ===============================
// Prueba
// ===============================
app.get("/health", (req, res) => res.json({ ok: true, mensaje: "API funcionando" }));

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ conectado: true, hora_db: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ conectado: false, error: err.message });
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

    const { rows } = await pool.query(
      `SELECT id_usuario, username, password_hash, rol, nombre, apellido, activo
       FROM usuario
       WHERE username = $1
       LIMIT 1`,
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }

    const user = rows[0];
    if (!user.activo) return res.status(403).json({ ok: false, mensaje: "Usuario inactivo" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });

    await pool.query(`UPDATE usuario SET ultimo_acceso = NOW() WHERE id_usuario = $1`, [user.id_usuario]);

    const token = jwt.sign(
      { sub: user.id_usuario, username: user.username, rol: user.rol },
      JWT_SECRET,
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
// /me (SOLO UNA VEZ)
// ===============================
app.get("/me", requireAuth, async (req, res) => {
  try {
    const id = Number(req.user.sub);
    const { rows } = await pool.query(
      `SELECT id_usuario, username, rol, nombre, apellido
       FROM usuario
       WHERE id_usuario = $1
       LIMIT 1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Usuario no existe" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error /me", error: err.message });
  }
});

// ===============================
// CATÁLOGOS
// ===============================
app.get("/catalog/personal", requireAuth, async (req, res) => {
  try {
    const rol = (req.query.rol || "").toString().toUpperCase();
    if (!["CUT", "CET", "CELL"].includes(rol)) {
      return res.status(400).json({ ok: false, mensaje: "rol inválido (CUT|CET|CELL)" });
    }

    // ✅ Ahora sí regresamos todo lo que el frontend necesita
    // Nota: NO filtro por activo para que Control de Personal pueda ver inactivos y filtrarlos.
    const { rows } = await pool.query(
      `SELECT id_personal, rol, apodo, nombre, apellido, puesto, username, activo, ultimo_acceso
       FROM personal
       WHERE rol = $1
       ORDER BY apellido, nombre`,
      [rol]
    );

    return res.json({ ok: true, items: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error catálogo personal", error: err.message });
  }
});

app.get("/catalog/vehiculos", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_vehiculo, codigo_interno, marca, modelo, imagen_veh, estado
       FROM vehiculo
       ORDER BY codigo_interno ASC`
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo vehículos", error: err.message });
  }
});

// ===============================
// CATÁLOGOS - CRUD PERSONAL (para asignacion.js)
// ===============================

// Helper: generar username único tipo: cut.luishernandez.1234
function slug(s = "") {
  return s
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 30);
}

async function generateUniqueUsername(base, client) {
  // base ya viene "cut.nombreapellido"
  let attempt = 0;
  while (attempt < 20) {
    const suffix = attempt === 0 ? "" : `.${Math.floor(1000 + Math.random() * 9000)}`;
    const username = `${base}${suffix}`.slice(0, 40);

    const { rows } = await client.query(
      `SELECT 1 FROM personal WHERE username = $1 LIMIT 1`,
      [username]
    );
    if (rows.length === 0) return username;
    attempt++;
  }
  // última opción
  return `${base}.${Date.now()}`.slice(0, 40);
}

async function generateUniqueApodo(baseApodo, client) {
  // apodo UNIQUE y NOT NULL
  let attempt = 0;
  const cleanBase = (baseApodo || "").toString().trim().slice(0, 40) || "SinApodo";

  while (attempt < 20) {
    const suffix = attempt === 0 ? "" : ` ${Math.floor(10 + Math.random() * 90)}`; // " 34"
    const apodo = `${cleanBase}${suffix}`.slice(0, 40);

    const { rows } = await client.query(
      `SELECT 1 FROM personal WHERE apodo = $1 LIMIT 1`,
      [apodo]
    );
    if (rows.length === 0) return apodo;
    attempt++;
  }

  return `${cleanBase}-${Date.now()}`.slice(0, 40);
}

/**
 * POST /catalog/personal
 * body: { rol: "CUT"|"CET"|"CELL", nombre: string, apellido: string, puesto?: string }
 * crea en tabla personal.
 */
app.post("/catalog/personal", requireAuth, async (req, res) => {
  try {
    const rol = (req.body?.rol || "").toString().toUpperCase();
    const nombre = (req.body?.nombre || "").toString().trim();
    const apellido = (req.body?.apellido || "").toString().trim();
    const puesto = (req.body?.puesto || "").toString().trim() || null;

    // opcional: permitir que el frontend mande apodo (si no manda, lo generamos)
    const apodoIn = (req.body?.apodo || "").toString().trim();

    if (!["CUT", "CET", "CELL"].includes(rol)) {
      return res.status(400).json({ ok: false, mensaje: "rol inválido (CUT|CET|CELL)" });
    }
    if (!nombre) return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
    if (!apellido) return res.status(400).json({ ok: false, mensaje: "Falta apellido" });

    const creado_por = Number(req.user.sub);
    if (!isInt(creado_por)) return res.status(401).json({ ok: false, mensaje: "Usuario inválido" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // username único
      const base = `${rol}.${slug(nombre)}${slug(apellido) ? "." + slug(apellido) : ""}`.slice(0, 35);
      const username = await generateUniqueUsername(base, client);

      // ✅ apodo obligatorio y UNIQUE
      // preferimos el apodo que mande el frontend, si no, usamos "Nombre Apellido"
      const apodoBase = apodoIn || `${nombre} ${apellido}`;
      const apodo = await generateUniqueApodo(apodoBase, client);

      // password temporal
      const tempPassword = `Temp-${Math.floor(100000 + Math.random() * 900000)}`;
      const password_hash = await bcrypt.hash(tempPassword, 10);

      const { rows } = await client.query(
        `INSERT INTO personal (rol, apodo, nombre, apellido, puesto, username, password_hash, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id_personal, rol, apodo, nombre, apellido, puesto, activo, fecha_creacion, username, ultimo_acceso`,
        [rol, apodo, nombre, apellido, puesto, username, password_hash, creado_por]
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
    return res.status(500).json({ ok: false, mensaje: "Error creando personal", error: err.message });
  }
});

/**
 * PUT /catalog/personal/:id
 * body: { nombre?, apellido?, puesto?, activo? }
 * NO cambia rol ni username aquí (para evitar problemas).
 */
app.put("/catalog/personal/:id", requireAuth, async (req, res) => {
  const id_personal = Number(req.params.id);
  if (!isInt(id_personal)) return res.status(400).json({ ok: false, mensaje: "id inválido" });

  try {
    const apodo = req.body?.apodo != null ? String(req.body.apodo).trim() : null;
    const nombre = req.body?.nombre != null ? String(req.body.nombre).trim() : null;
    const apellido = req.body?.apellido != null ? String(req.body.apellido).trim() : null;
    const puesto = req.body?.puesto != null ? (String(req.body.puesto).trim() || null) : null;
    const activo = req.body?.activo != null ? !!req.body.activo : null;

    if (apodo !== null && !apodo) return res.status(400).json({ ok: false, mensaje: "apodo inválido" });
    if (nombre !== null && !nombre) return res.status(400).json({ ok: false, mensaje: "nombre inválido" });
    if (apellido !== null && !apellido) return res.status(400).json({ ok: false, mensaje: "apellido inválido" });

    const sets = [];
    const vals = [];
    let i = 1;

    if (apodo !== null)  { sets.push(`apodo = $${i++}`); vals.push(apodo); }
    if (nombre !== null) { sets.push(`nombre = $${i++}`); vals.push(nombre); }
    if (apellido !== null){ sets.push(`apellido = $${i++}`); vals.push(apellido); }
    if (req.body?.puesto !== undefined){ sets.push(`puesto = $${i++}`); vals.push(puesto); }
    if (req.body?.activo !== undefined){ sets.push(`activo = $${i++}`); vals.push(activo); }

    if (sets.length === 0) {
      return res.status(400).json({ ok: false, mensaje: "Nada para actualizar" });
    }

    vals.push(id_personal);

    const { rows } = await pool.query(
      `UPDATE personal
       SET ${sets.join(", ")}
       WHERE id_personal = $${i}
       RETURNING id_personal, rol, apodo, nombre, apellido, puesto, activo, username, ultimo_acceso`,
      vals
    );

    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Personal no existe" });
    return res.json({ ok: true, item: rows[0] });
  } catch (err) {
    // si apodo choca por UNIQUE, postgres suele dar code 23505
    return res.status(500).json({ ok: false, mensaje: "Error editando personal", error: err.message });
  }
});

/**
 * DELETE /catalog/personal/:id
 * En vez de borrar duro (porque puede estar referenciado por asignaciones),
 * lo desactivamos (activo=false). Si quieres borrar duro, te lo dejo abajo comentado.
 */
app.delete("/catalog/personal/:id", requireAuth, async (req, res) => {
  const id_personal = Number(req.params.id);
  if (!isInt(id_personal)) return res.status(400).json({ ok: false, mensaje: "id inválido" });

  const hard = String(req.query.hard || "").trim() === "1";

  try {
    if (hard) {
      // HARD DELETE: solo si NO hay referencias por FK
      await pool.query(`DELETE FROM personal WHERE id_personal = $1`, [id_personal]);
      return res.json({ ok: true, deleted: true, hard: true, id_personal });
    }

    // SOFT DELETE: desactivar
    const { rows } = await pool.query(
      `UPDATE personal
       SET activo = FALSE
       WHERE id_personal = $1
       RETURNING id_personal, activo`,
      [id_personal]
    );

    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Personal no existe" });

    return res.json({ ok: true, item: rows[0], hard: false });
  } catch (err) {
    // si hard delete falla por FK
    if (err.code === "23503") {
      return res.status(409).json({
        ok: false,
        mensaje: "No se puede borrar porque está referenciado (asignaciones/operaciones). Desactívalo o borra referencias primero.",
        error: err.detail || err.message,
      });
    }
    return res.status(500).json({ ok: false, mensaje: "Error eliminando personal", error: err.message });
  }
});

// ===============================
// OPERACIONES
// ===============================
app.get("/ops", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado,
              fecha_inicio, fecha_fin, fecha_creacion, creada_por
       FROM operacion
       ORDER BY id_operacion DESC`
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error listando ops", error: err.message });
  }
});

app.get("/ops/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!isInt(id)) return res.status(400).json({ ok: false, mensaje: "id inválido" });

  try {
    const { rows } = await pool.query(
      `SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado,
              fecha_inicio, fecha_fin, fecha_creacion, creada_por
       FROM operacion
       WHERE id_operacion = $1
       LIMIT 1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Operación no existe" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo operación", error: err.message });
  }
});

app.get("/ops/by-codigo/:codigo", requireAuth, async (req, res) => {
  const codigo = req.params.codigo;
  try {
    const { rows } = await pool.query(
      `SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado,
              fecha_inicio, fecha_fin, fecha_creacion, creada_por
       FROM operacion
       WHERE codigo = $1
       LIMIT 1`,
      [codigo]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Operación no existe" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error por código", error: err.message });
  }
});

app.post("/ops", requireAuth, async (req, res) => {
  try {
    const { nombre, descripcion, prioridad, fecha_inicio, fecha_fin } = req.body ?? {};
    if (!nombre || !nombre.trim()) return res.status(400).json({ ok: false, mensaje: "Falta nombre" });

    const prio = (prioridad || "MEDIA").toString().toUpperCase();
    if (!["BAJA", "MEDIA", "ALTA"].includes(prio)) {
      return res.status(400).json({ ok: false, mensaje: "prioridad inválida (BAJA|MEDIA|ALTA)" });
    }

    const fi = fecha_inicio ? new Date(fecha_inicio) : null;
    const ff = fecha_fin ? new Date(fecha_fin) : null;
    if (fi && Number.isNaN(fi.getTime())) return res.status(400).json({ ok: false, mensaje: "fecha_inicio inválida" });
    if (ff && Number.isNaN(ff.getTime())) return res.status(400).json({ ok: false, mensaje: "fecha_fin inválida" });
    if (fi && ff && ff < fi) return res.status(400).json({ ok: false, mensaje: "fecha_fin < fecha_inicio" });

    const codigo = `OP-${Date.now()}`;
    const creada_por = Number(req.user.sub);

    const { rows } = await pool.query(
      `INSERT INTO operacion (codigo, nombre, descripcion, prioridad, fecha_inicio, fecha_fin, creada_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id_operacion, codigo, nombre, descripcion, prioridad, fecha_inicio, fecha_fin, fecha_creacion`,
      [
        codigo,
        nombre.trim(),
        (descripcion || "").trim() || null,
        prio,
        fi ? fi.toISOString() : null,
        ff ? ff.toISOString() : null,
        creada_por
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error creando operación", error: err.message });
  }
});

app.post("/ops/:id/personal", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id inválido" });

  try {
    const { asignado_por, items } = req.body ?? {};
    const who = Number(asignado_por || req.user.sub);

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, mensaje: "items vacío" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const it of items) {
        const id_personal = Number(it.id_personal);
        if (!isInt(id_personal)) continue;

        await client.query(
          `INSERT INTO asignacion_operacion_personal
            (id_operacion, id_personal, rol_en_operacion, estado_asignacion, asignado_por)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id_operacion, id_personal)
           DO UPDATE SET
             rol_en_operacion = EXCLUDED.rol_en_operacion,
             estado_asignacion = EXCLUDED.estado_asignacion,
             asignado_por = EXCLUDED.asignado_por,
             fecha_asignacion = NOW()`,
          [
            id_operacion,
            id_personal,
            it.rol_en_operacion ?? null,
            (it.estado_asignacion || "ASIGNADO"),
            who
          ]
        );
      }

      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error guardando personal", error: err.message });
  }
});

app.post("/ops/:id/mando", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id inválido" });

  try {
    const { asignado_por, items } = req.body ?? {};
    const who = Number(asignado_por || req.user.sub);

    if (!Array.isArray(items)) {
      return res.status(400).json({ ok: false, mensaje: "items inválido" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // recalcula mandos desde cero
      await client.query(`DELETE FROM mando_operacion WHERE id_operacion = $1`, [id_operacion]);

      for (const it of items) {
        const id_cet = Number(it.id_cet);
        const id_cell = Number(it.id_cell);
        if (!isInt(id_cet) || !isInt(id_cell)) continue;

        await client.query(
          `INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
           VALUES ($1,$2,$3,$4)`,
          [id_operacion, id_cet, id_cell, who]
        );
      }

      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error guardando mando", error: err.message });
  }
});

app.post("/ops/:id/vehiculos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id inválido" });

  try {
    const { asignado_por, items } = req.body ?? {};
    const who = Number(asignado_por || req.user.sub);

    if (!Array.isArray(items)) {
      return res.status(400).json({ ok: false, mensaje: "items inválido" });
    }

    // Obtener ids de vehículos únicos del payload
    const vehiculoIds = [...new Set(
      items
        .map(it => Number(it.id_vehiculo))
        .filter(id => isInt(id))
    )];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1) Limpiar asignaciones de vehículos previas de esta operación
      await client.query(
        `DELETE FROM vehiculo_operacion WHERE id_operacion = $1`,
        [id_operacion]
      );

      // 2) Insertar cada vehículo único en vehiculo_operacion
      for (const id_vehiculo of vehiculoIds) {
        await client.query(
          `INSERT INTO vehiculo_operacion
             (id_operacion, id_vehiculo, estado_asignacion, asignado_por)
           VALUES ($1, $2, 'ASIGNADO', $3)
           ON CONFLICT (id_operacion, id_vehiculo) DO UPDATE SET
             estado_asignacion = 'ASIGNADO',
             asignado_por = EXCLUDED.asignado_por,
             fecha_asignacion = NOW()`,
          [id_operacion, id_vehiculo, who]
        );
      }

      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error guardando vehículos", error: err.message });
  }
});

// ===============================
// 404 handler (para ver qué falla)
// ===============================
app.use((req, res) => {
  console.log("❌ 404:", req.method, req.url);
  res.status(404).json({ ok: false, mensaje: "Ruta no existe", path: req.url });
});

// ===============================
// LISTEN
// ===============================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API en http://localhost:${PORT}`));