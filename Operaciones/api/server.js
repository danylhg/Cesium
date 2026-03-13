import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import http from "http";
import { Server } from "socket.io";


const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "cambia_esto";
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  socket.on("join_operacion", (id_operacion) => {
    socket.join(`op_${id_operacion}`);
    console.log(`Socket ${socket.id} unido a operación ${id_operacion}`);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
  });
});


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
    if (!username || !password)
      return res.status(400).json({ ok: false, mensaje: "Faltan credenciales" });

    // 1) Buscar en usuario (ADMIN)
    let row = null;
    let tabla = "usuario";
    {
      const { rows } = await pool.query(
        `SELECT id_usuario AS id, username, password_hash, rol, nombre, apellido, activo
         FROM usuario WHERE username = $1 LIMIT 1`,
        [username]
      );
      if (rows.length > 0) row = rows[0];
    }

    // 2) Si no está, buscar en personal (CUT/CET/CELL)
    if (!row) {
      tabla = "personal";
      const { rows } = await pool.query(
        `SELECT id_personal AS id, username, password_hash, rol, nombre, apellido, activo, puesto
         FROM personal WHERE username = $1 LIMIT 1`,
        [username]
      );
      if (rows.length > 0) row = rows[0];
    }

    if (!row)
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });

    if (!row.activo)
      return res.status(403).json({ ok: false, mensaje: "Usuario inactivo" });

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match)
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });

    if (tabla === "usuario") {
      await pool.query(`UPDATE usuario SET ultimo_acceso = NOW() WHERE id_usuario = $1`, [row.id]);
    } else {
      await pool.query(`UPDATE personal SET ultimo_acceso = NOW() WHERE id_personal = $1`, [row.id]);
    }

    const token = jwt.sign(
      { sub: row.id, username: row.username, rol: row.rol, tabla },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.json({
      ok: true,
      token,
      usuario: {
        id_usuario:  tabla === "usuario"  ? row.id : null,
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
    const { rows } = await pool.query(`
      SELECT
        id_vehiculo,
        imagen_veh,
        codigo_interno,
        tipo,
        marca,
        modelo,
        estado,
        capacidad,
        fecha_creacion AS fecha_registro
      FROM vehiculo
      ORDER BY codigo_interno ASC
    `);

    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error("GET /catalog/vehiculos:", err);
    return res.status(500).json({
      ok: false,
      mensaje: "Error obteniendo vehículos",
      error: err.message
    });
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
// HELPERS ZONA OPERACION
// ===============================

// Calcula centroide de un GeoJSON Polygon
function calcularCentroide(geojson) {
  try {
    const coords = geojson.coordinates[0];
    let sumLat = 0, sumLon = 0;
    const n = coords.length - 1;
    for (let i = 0; i < n; i++) {
      sumLon += coords[i][0];
      sumLat += coords[i][1];
    }
    return { lat: sumLat / n, lon: sumLon / n };
  } catch {
    return null;
  }
}

// Estima zoom según el tamaño del bounding box del polígono
function calcularZoom(geojson) {
  try {
    const coords = geojson.coordinates[0];
    const lats = coords.map(c => c[1]);
    const lons = coords.map(c => c[0]);
    const deltaLat = Math.max(...lats) - Math.min(...lats);
    const deltaLon = Math.max(...lons) - Math.min(...lons);
    const delta = Math.max(deltaLat, deltaLon);
    const metros = delta * 111000 * 1.5;
    return Math.min(Math.max(Math.round(metros), 500), 500000);
  } catch {
    return 8000;
  }
}

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

// ── GET /ops/personal/:id_personal ───────────────────────────────────────────
// IMPORTANTE: va ANTES de /ops/:id para que Express no confunda "personal" con un id
app.get("/ops/personal/:id_personal", requireAuth, async (req, res) => {
  const id_personal = Number(req.params.id_personal);
  if (!isInt(id_personal))
    return res.status(400).json({ ok: false, mensaje: "id_personal invalido" });

  try {
    // 1) Operación asignada (ACTIVA primero, luego PLANIFICADA)
    const { rows } = await pool.query(
      `SELECT
         o.id_operacion, o.codigo, o.nombre, o.descripcion,
         o.prioridad, o.estado, o.fecha_inicio, o.fecha_fin,
         a.rol_en_operacion, a.estado_asignacion
       FROM asignacion_operacion_personal a
       JOIN operacion o ON o.id_operacion = a.id_operacion
       WHERE a.id_personal = $1
         AND o.estado IN ('ACTIVA', 'PLANIFICADA')
         AND a.estado_asignacion NOT IN ('LIBERADO')
       ORDER BY
         CASE o.estado WHEN 'ACTIVA' THEN 1 WHEN 'PLANIFICADA' THEN 2 ELSE 3 END,
         o.fecha_inicio ASC
       LIMIT 1`,
      [id_personal]
    );

    if (rows.length === 0)
      return res.status(404).json({ ok: false, mensaje: "Sin operacion asignada", operacion: null });

    const operacion = rows[0];

    // 2) Zona principal (null si el admin aún no la dibujó)
    const zonaRes = await pool.query(
      `SELECT centroide_lat, centroide_lon, zoom_inicial, color, geometria
       FROM zona_operacion WHERE id_operacion = $1 LIMIT 1`,
      [operacion.id_operacion]
    );
    const zona = zonaRes.rows[0] ?? null;

    return res.json({
      ok: true,
      operacion: {
        ...operacion,
        zona: zona ? {
          centroide_lat: zona.centroide_lat,
          centroide_lon: zona.centroide_lon,
          zoom_inicial:  zona.zoom_inicial,
          color:         zona.color,
          geometria:     zona.geometria,
        } : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, mensaje: "Error obteniendo operacion del personal", error: err.message });
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
// CATÁLOGOS - EQUIPOS
// ===============================
app.get("/catalog/equipos", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        e.id_equipo,
        e.numero_serie,
        e.nombre,
        e.categoria,
        e.estado,
        COALESCE(ec.imagen_eqcom, et.imagen_eqtac) AS imagen_eq,
        COALESCE(ec.notas, et.notas) AS detalles,
        e.fecha_creacion AS fecha_registro
      FROM equipo e
      LEFT JOIN equipo_comunicacion ec
        ON ec.id_equipo = e.id_equipo
      LEFT JOIN equipo_tactico et
        ON et.id_equipo = e.id_equipo
      ORDER BY e.nombre ASC, e.numero_serie ASC
    `);

    return res.json({ ok: true, items: rows });
  } catch (err) {
    console.error("GET /catalog/equipos ERROR:", err);
    return res.status(500).json({
      ok: false,
      mensaje: "Error obteniendo equipos",
      error: err.message
    });
  }
});

app.post("/catalog/equipos", requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const numero_serie = (req.body?.numero_serie || "").trim();
    const nombre = (req.body?.nombre || "").trim();
    const categoria = (req.body?.categoria || "").trim().toUpperCase();
    const estado = (req.body?.estado || "DISPONIBLE").trim().toUpperCase();
    const imagen_eq = req.body?.imagen_eq || null;
    const detalles = req.body?.detalles || null;

    if (!numero_serie || !nombre || !categoria) {
      return res.status(400).json({ ok: false, mensaje: "Faltan campos obligatorios" });
    }

    if (!["COMUNICACION", "TACTICO"].includes(categoria)) {
      return res.status(400).json({ ok: false, mensaje: "Categoría inválida. Solo se permite COMUNICACION o TACTICO" });
    }

    await client.query("BEGIN");

    const insEquipo = await client.query(
      `INSERT INTO equipo (numero_serie, nombre, categoria, estado)
       VALUES ($1, $2, $3, $4)
       RETURNING id_equipo, numero_serie, nombre, categoria, estado, fecha_creacion`,
      [numero_serie, nombre, categoria, estado]
    );

    const equipo = insEquipo.rows[0];

    if (categoria === "COMUNICACION") {
      await client.query(
        `INSERT INTO equipo_comunicacion (id_equipo, imagen_eqcom, marca, modelo, notas)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id_equipo) DO UPDATE SET
           imagen_eqcom = EXCLUDED.imagen_eqcom,
           marca = EXCLUDED.marca,
           modelo = EXCLUDED.modelo,
           notas = EXCLUDED.notas`,
        [
          equipo.id_equipo,
          imagen_eq,
          req.body?.marca || null,
          req.body?.modelo || null,
          detalles
        ]
      );

      await client.query(`DELETE FROM equipo_tactico WHERE id_equipo = $1`, [equipo.id_equipo]);
    } else {
      await client.query(
        `INSERT INTO equipo_tactico (id_equipo, imagen_eqtac, tipo_tactico, calibre, nivel, notas)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id_equipo) DO UPDATE SET
           imagen_eqtac = EXCLUDED.imagen_eqtac,
           tipo_tactico = EXCLUDED.tipo_tactico,
           calibre = EXCLUDED.calibre,
           nivel = EXCLUDED.nivel,
           notas = EXCLUDED.notas`,
        [
          equipo.id_equipo,
          imagen_eq,
          req.body?.tipo_tactico || "GENERAL",
          req.body?.calibre || null,
          req.body?.nivel || null,
          detalles
        ]
      );

      await client.query(`DELETE FROM equipo_comunicacion WHERE id_equipo = $1`, [equipo.id_equipo]);
    }

    await client.query("COMMIT");

    const { rows } = await client.query(
      `SELECT
         e.id_equipo,
         e.numero_serie,
         e.nombre,
         e.categoria,
         e.estado,
         COALESCE(ec.imagen_eqcom, et.imagen_eqtac) AS imagen_eq,
         COALESCE(ec.notas, et.notas) AS detalles,
         e.fecha_creacion AS fecha_registro
       FROM equipo e
       LEFT JOIN equipo_comunicacion ec ON ec.id_equipo = e.id_equipo
       LEFT JOIN equipo_tactico et ON et.id_equipo = e.id_equipo
       WHERE e.id_equipo = $1`,
      [equipo.id_equipo]
    );

    return res.json({ ok: true, item: rows[0] });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /catalog/equipos ERROR:", err);
    return res.status(500).json({
      ok: false,
      mensaje: "Error creando equipo",
      error: err.message
    });
  } finally {
    client.release();
  }
});

app.put("/catalog/equipos/:id", requireAuth, async (req, res) => {
  const id_equipo = Number(req.params.id);
  const client = await pool.connect();

  try {
    if (!Number.isInteger(id_equipo)) {
      return res.status(400).json({ ok: false, mensaje: "id inválido" });
    }

    const numero_serie = (req.body?.numero_serie || "").trim();
    const nombre = (req.body?.nombre || "").trim();
    const categoria = (req.body?.categoria || "").trim().toUpperCase();
    const estado = (req.body?.estado || "DISPONIBLE").trim().toUpperCase();
    const imagen_eq = req.body?.imagen_eq || null;
    const detalles = req.body?.detalles || null;

    if (!numero_serie || !nombre || !categoria) {
      return res.status(400).json({ ok: false, mensaje: "Faltan campos obligatorios" });
    }

    if (!["COMUNICACION", "TACTICO"].includes(categoria)) {
      return res.status(400).json({ ok: false, mensaje: "Categoría inválida. Solo se permite COMUNICACION o TACTICO" });
    }

    await client.query("BEGIN");

    await client.query(
      `UPDATE equipo
       SET numero_serie = $1,
           nombre = $2,
           categoria = $3,
           estado = $4
       WHERE id_equipo = $5`,
      [numero_serie, nombre, categoria, estado, id_equipo]
    );

    if (categoria === "COMUNICACION") {
      await client.query(
        `INSERT INTO equipo_comunicacion (id_equipo, imagen_eqcom, marca, modelo, notas)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id_equipo)
         DO UPDATE SET
           imagen_eqcom = EXCLUDED.imagen_eqcom,
           marca = EXCLUDED.marca,
           modelo = EXCLUDED.modelo,
           notas = EXCLUDED.notas`,
        [
          id_equipo,
          imagen_eq,
          req.body?.marca || null,
          req.body?.modelo || null,
          detalles
        ]
      );

      await client.query(`DELETE FROM equipo_tactico WHERE id_equipo = $1`, [id_equipo]);
    } else {
      await client.query(
        `INSERT INTO equipo_tactico (id_equipo, imagen_eqtac, tipo_tactico, calibre, nivel, notas)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id_equipo)
         DO UPDATE SET
           imagen_eqtac = EXCLUDED.imagen_eqtac,
           tipo_tactico = EXCLUDED.tipo_tactico,
           calibre = EXCLUDED.calibre,
           nivel = EXCLUDED.nivel,
           notas = EXCLUDED.notas`,
        [
          id_equipo,
          imagen_eq,
          req.body?.tipo_tactico || "GENERAL",
          req.body?.calibre || null,
          req.body?.nivel || null,
          detalles
        ]
      );

      await client.query(`DELETE FROM equipo_comunicacion WHERE id_equipo = $1`, [id_equipo]);
    }

    await client.query("COMMIT");

    const { rows } = await client.query(
      `SELECT
         e.id_equipo,
         e.numero_serie,
         e.nombre,
         e.categoria,
         e.estado,
         COALESCE(ec.imagen_eqcom, et.imagen_eqtac) AS imagen_eq,
         COALESCE(ec.notas, et.notas) AS detalles,
         e.fecha_creacion AS fecha_registro
       FROM equipo e
       LEFT JOIN equipo_comunicacion ec ON ec.id_equipo = e.id_equipo
       LEFT JOIN equipo_tactico et ON et.id_equipo = e.id_equipo
       WHERE e.id_equipo = $1`,
      [id_equipo]
    );

    if (!rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Equipo no existe" });
    }

    return res.json({ ok: true, item: rows[0] });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PUT /catalog/equipos/:id ERROR:", err);
    return res.status(500).json({
      ok: false,
      mensaje: "Error actualizando equipo",
      error: err.message
    });
  } finally {
    client.release();
  }
});

app.delete("/catalog/equipos/:id", requireAuth, async (req, res) => {
  const id_equipo = Number(req.params.id);
  if (!isInt(id_equipo)) return res.status(400).json({ ok: false, mensaje: "id inválido" });

  try {
    await pool.query(`DELETE FROM equipo WHERE id_equipo = $1`, [id_equipo]);
    return res.json({ ok: true, deleted: true, id_equipo });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({
        ok: false,
        mensaje: "No se puede borrar porque el equipo está referenciado en operaciones, grupos o asignaciones.",
        error: err.detail || err.message,
      });
    }
    return res.status(500).json({ ok: false, mensaje: "Error eliminando equipo", error: err.message });
  }
});

app.post("/ops/:id/equipos", requireAuth, async (req, res) => {
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

      await client.query(`DELETE FROM operacion_equipo WHERE id_operacion = $1`, [id_operacion]);

      for (const it of items) {
        const id_equipo = Number(it.id_equipo);
        const cantidad = Number(it.cantidad || 1);
        const uso_en_operacion = it.uso_en_operacion != null ? String(it.uso_en_operacion).trim() || null : null;
        const estado_asignacion = (it.estado_asignacion || "ASIGNADO").toString().trim().toUpperCase();

        if (!isInt(id_equipo)) continue;
        if (!Number.isInteger(cantidad) || cantidad <= 0) continue;

        await client.query(
          `INSERT INTO operacion_equipo
             (id_operacion, id_equipo, cantidad, uso_en_operacion, estado_asignacion, asignado_por)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (id_operacion, id_equipo)
           DO UPDATE SET
             cantidad = EXCLUDED.cantidad,
             uso_en_operacion = EXCLUDED.uso_en_operacion,
             estado_asignacion = EXCLUDED.estado_asignacion,
             asignado_por = EXCLUDED.asignado_por,
             fecha_asignacion = NOW()`,
          [id_operacion, id_equipo, cantidad, uso_en_operacion, estado_asignacion, who]
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
    return res.status(500).json({ ok: false, mensaje: "Error guardando equipos", error: err.message });
  }
});

// ===============================
// CATÁLOGOS - VEHÍCULOS
// ===============================
app.post("/catalog/vehiculos", requireAuth, async (req, res) => {
  try {
    const codigo_interno = (req.body?.codigo_interno || "").toString().trim();
    const tipo = (req.body?.tipo || "").toString().trim() || null;
    const marca = (req.body?.marca || "").toString().trim() || null;
    const modelo = (req.body?.modelo || "").toString().trim() || null;
    const imagen_veh = (req.body?.imagen_veh || "").toString().trim() || null;
    const capacidad = req.body?.capacidad != null ? Number(req.body.capacidad) : null;
    const estado = (req.body?.estado || "DISPONIBLE").toString().trim().toUpperCase();

    if (!codigo_interno) return res.status(400).json({ ok: false, mensaje: "Falta codigo_interno" });
    if (capacidad != null && (!Number.isInteger(capacidad) || capacidad < 0)) {
      return res.status(400).json({ ok: false, mensaje: "capacidad inválida" });
    }

    const estadosValidos = ["DISPONIBLE", "ASIGNADO", "MANTENIMIENTO", "BAJA"];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ ok: false, mensaje: `estado inválido (${estadosValidos.join("|")})` });
    }

    const { rows } = await pool.query(
      `INSERT INTO vehiculo (codigo_interno, tipo, marca, modelo, imagen_veh, estado, capacidad)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id_vehiculo, codigo_interno, tipo, marca, modelo, imagen_veh, estado, capacidad`,
      [codigo_interno, tipo, marca, modelo, imagen_veh, estado, capacidad]
    );

    return res.json({ ok: true, item: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ ok: false, mensaje: "El código interno ya existe", error: err.detail || err.message });
    }
    return res.status(500).json({ ok: false, mensaje: "Error creando vehículo", error: err.message });
  }
});

app.put("/catalog/vehiculos/:id", requireAuth, async (req, res) => {
  const id_vehiculo = Number(req.params.id);
  if (!isInt(id_vehiculo)) return res.status(400).json({ ok: false, mensaje: "id inválido" });

  try {
    const codigo_interno = req.body?.codigo_interno != null ? String(req.body.codigo_interno).trim() : null;
    const tipo = req.body?.tipo != null ? (String(req.body.tipo).trim() || null) : null;
    const marca = req.body?.marca != null ? (String(req.body.marca).trim() || null) : null;
    const modelo = req.body?.modelo != null ? (String(req.body.modelo).trim() || null) : null;
    const imagen_veh = req.body?.imagen_veh != null ? (String(req.body.imagen_veh).trim() || null) : null;
    const capacidad = req.body?.capacidad != null ? Number(req.body.capacidad) : undefined;
    const estado = req.body?.estado != null ? String(req.body.estado).trim().toUpperCase() : null;

    if (codigo_interno !== null && !codigo_interno) {
      return res.status(400).json({ ok: false, mensaje: "codigo_interno inválido" });
    }

    if (capacidad !== undefined && (!Number.isInteger(capacidad) || capacidad < 0)) {
      return res.status(400).json({ ok: false, mensaje: "capacidad inválida" });
    }

    if (estado !== null) {
      const estadosValidos = ["DISPONIBLE", "ASIGNADO", "MANTENIMIENTO", "BAJA"];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ ok: false, mensaje: `estado inválido (${estadosValidos.join("|")})` });
      }
    }

    const sets = [];
    const vals = [];
    let i = 1;

    if (codigo_interno !== null)          { sets.push(`codigo_interno = $${i++}`); vals.push(codigo_interno); }
    if (req.body?.tipo !== undefined)     { sets.push(`tipo = $${i++}`); vals.push(tipo); }
    if (req.body?.marca !== undefined)    { sets.push(`marca = $${i++}`); vals.push(marca); }
    if (req.body?.modelo !== undefined)   { sets.push(`modelo = $${i++}`); vals.push(modelo); }
    if (req.body?.imagen_veh !== undefined){ sets.push(`imagen_veh = $${i++}`); vals.push(imagen_veh); }
    if (req.body?.capacidad !== undefined){ sets.push(`capacidad = $${i++}`); vals.push(capacidad); }
    if (estado !== null)                  { sets.push(`estado = $${i++}`); vals.push(estado); }

    if (sets.length === 0) {
      return res.status(400).json({ ok: false, mensaje: "Nada para actualizar" });
    }

    vals.push(id_vehiculo);

    const { rows } = await pool.query(
      `UPDATE vehiculo
       SET ${sets.join(", ")}
       WHERE id_vehiculo = $${i}
       RETURNING id_vehiculo, codigo_interno, tipo, marca, modelo, imagen_veh, estado, capacidad`,
      vals
    );

    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Vehículo no existe" });
    return res.json({ ok: true, item: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ ok: false, mensaje: "El código interno ya existe", error: err.detail || err.message });
    }
    return res.status(500).json({ ok: false, mensaje: "Error editando vehículo", error: err.message });
  }
});

app.delete("/catalog/vehiculos/:id", requireAuth, async (req, res) => {
  const id_vehiculo = Number(req.params.id);
  if (!isInt(id_vehiculo)) return res.status(400).json({ ok: false, mensaje: "id inválido" });

  try {
    await pool.query(`DELETE FROM vehiculo WHERE id_vehiculo = $1`, [id_vehiculo]);
    return res.json({ ok: true, deleted: true, id_vehiculo });
  } catch (err) {
    if (err.code === "23503") {
      return res.status(409).json({
        ok: false,
        mensaje: "No se puede borrar porque el vehículo está referenciado en operaciones o grupos.",
        error: err.detail || err.message,
      });
    }
    return res.status(500).json({ ok: false, mensaje: "Error eliminando vehículo", error: err.message });
  }
});

// ===============================
// PATCH /ops/:id/estado
// Cambia estado de operación y genera mensajes automáticos
// ===============================
app.patch("/ops/:id/estado", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const nuevoEstado = (req.body?.estado || "").toString().toUpperCase();
  const estadosValidos = ["PLANIFICADA", "ACTIVA", "CERRADA", "CANCELADA"];
  if (!estadosValidos.includes(nuevoEstado))
    return res.status(400).json({ ok: false, mensaje: `estado invalido (${estadosValidos.join("|")})` });

  const id_usuario = Number(req.user.sub);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: opRows } = await client.query(
      `SELECT estado, nombre, codigo FROM operacion WHERE id_operacion = $1 LIMIT 1`,
      [id_operacion]
    );
    if (!opRows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ ok: false, mensaje: "Operacion no existe" }); }

    const { estado: estadoActual, nombre: nombreOp, codigo: codigoOp } = opRows[0];
    const transiciones = { PLANIFICADA: ["ACTIVA","CANCELADA"], ACTIVA: ["CERRADA","CANCELADA"], CERRADA: [], CANCELADA: [] };
    if (!transiciones[estadoActual]?.includes(nuevoEstado)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, mensaje: `No se puede pasar de ${estadoActual} a ${nuevoEstado}` });
    }

    let q = `UPDATE operacion SET estado = $1`;
    if (nuevoEstado === "ACTIVA")  q += `, fecha_inicio = NOW()`;
    if (nuevoEstado === "CERRADA") q += `, fecha_fin = NOW()`;
    await client.query(q + ` WHERE id_operacion = $2`, [nuevoEstado, id_operacion]);

    const horaStr = () => new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long", timeStyle: "short" });

    // Distingue si quien activa/cierra la op es ADMIN/CUT (tabla usuario) o CET/CELL (tabla personal)
    async function getOrCreateParticipante(id_chat, id_actor, esPersonal) {
      const col  = esPersonal ? "id_personal" : "id_usuario";
      const tipo = esPersonal ? "PERSONAL"    : "USUARIO";
      const { rows } = await client.query(
        `INSERT INTO participante_chat (id_chat, tipo, ${col}) VALUES ($1,$2,$3)
         ON CONFLICT (id_chat, ${col}) DO NOTHING RETURNING id_participante`,
        [id_chat, tipo, id_actor]
      );
      if (rows[0]) return rows[0].id_participante;
      const { rows: ex } = await client.query(
        `SELECT id_participante FROM participante_chat WHERE id_chat=$1 AND ${col}=$2 LIMIT 1`,
        [id_chat, id_actor]
      );
      return ex[0]?.id_participante;
    }
    const esPersonal = req.user.tabla === "personal";
    const id_actor   = Number(req.user.sub);

    if (nuevoEstado === "ACTIVA") {
      const { rows: cr } = await client.query(
        `INSERT INTO chat_operacion (id_operacion) VALUES ($1)
         ON CONFLICT (id_operacion) DO UPDATE SET activo=TRUE RETURNING id_chat`, [id_operacion]);
      const id_chat = cr[0].id_chat;
      const id_participante = await getOrCreateParticipante(id_chat, id_actor, esPersonal);
      await client.query(
        `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje) VALUES ($1,$2,$3,'SISTEMA')`,
        [id_chat, id_participante, `OPERACION ACTIVADA\nCodigo: ${codigoOp}\nNombre: ${nombreOp}\nHora oficial de inicio: ${horaStr()}`]
      );
    }

    if (nuevoEstado === "CERRADA") {
      const { rows: cr } = await client.query(`SELECT id_chat FROM chat_operacion WHERE id_operacion=$1 LIMIT 1`, [id_operacion]);
      if (cr[0]) {
        const id_chat = cr[0].id_chat;
        const id_participante = await getOrCreateParticipante(id_chat, id_actor, esPersonal);
        if (id_participante) {
          await client.query(
            `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje) VALUES ($1,$2,$3,'SISTEMA')`,
            [id_chat, id_participante, `OPERACION CERRADA\nCodigo: ${codigoOp}\nNombre: ${nombreOp}\nHora oficial de cierre: ${horaStr()}`]
          );
        }
        await client.query(`UPDATE chat_operacion SET activo=FALSE, fecha_cierre=NOW() WHERE id_chat=$1`, [id_chat]);
      }
    }

    await client.query("COMMIT");
    const { rows: updated } = await pool.query(
      `SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, fecha_creacion, creada_por
       FROM operacion WHERE id_operacion=$1`, [id_operacion]);
    return res.json({ ok: true, operacion: updated[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, mensaje: "Error cambiando estado", error: err.message });
  } finally { client.release(); }
});

// ===============================
// CHAT / MENSAJES
// ===============================

// GET /ops/:id/chat — obtener feed de mensajes de una operación
app.get("/ops/:id/chat", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM v_chat_feed WHERE id_operacion = $1 ORDER BY fecha_envio ASC`,
      [id_operacion]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo chat", error: err.message });
  }
});

// POST /ops/:id/chat — enviar mensaje al chat de la operación
app.post("/ops/:id/chat", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const contenido = (req.body?.contenido || "").toString().trim();
  const tipo_mensaje = (req.body?.tipo_mensaje || "NORMAL").toString().toUpperCase();
  if (!contenido) return res.status(400).json({ ok: false, mensaje: "Falta contenido" });
  if (!["NORMAL","URGENTE","SISTEMA"].includes(tipo_mensaje))
    return res.status(400).json({ ok: false, mensaje: "tipo_mensaje invalido" });

  const esPersonal = req.user.tabla === "personal";
  const id_actor   = Number(req.user.sub);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Obtener chat activo
    const { rows: cr } = await client.query(
      `SELECT id_chat FROM chat_operacion WHERE id_operacion=$1 AND activo=TRUE LIMIT 1`, [id_operacion]);
    if (!cr[0]) { await client.query("ROLLBACK"); return res.status(409).json({ ok: false, mensaje: "El chat no esta activo o no existe" }); }
    const id_chat = cr[0].id_chat;

    // Obtener o crear participante — distingue PERSONAL vs USUARIO
    const col  = esPersonal ? "id_personal" : "id_usuario";
    const tipo = esPersonal ? "PERSONAL"    : "USUARIO";
    const { rows: pr } = await client.query(
      `INSERT INTO participante_chat (id_chat, tipo, ${col}) VALUES ($1,$2,$3)
       ON CONFLICT (id_chat, ${col}) DO NOTHING RETURNING id_participante`,
      [id_chat, tipo, id_actor]
    );
    let id_participante = pr[0]?.id_participante;
    if (!id_participante) {
      const { rows: ex } = await client.query(
        `SELECT id_participante FROM participante_chat WHERE id_chat=$1 AND ${col}=$2 LIMIT 1`,
        [id_chat, id_actor]
      );
      id_participante = ex[0]?.id_participante;
    }

    const { rows: msg } = await client.query(
      `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
       VALUES ($1,$2,$3,$4) RETURNING *`, [id_chat, id_participante, contenido, tipo_mensaje]);

    await client.query("COMMIT");
    res.json({ ok: true, mensaje: msg[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, mensaje: "Error enviando mensaje", error: err.message });
  } finally { client.release(); }
});

// ===============================
// AVISOS OPERACIONALES
// ===============================

// GET /ops/:id/avisos — listar avisos de una operación
app.get("/ops/:id/avisos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT a.*, 
              pe.apodo AS emisor_apodo, pe.rol AS emisor_rol,
              pr.apodo AS receptor_personal_apodo,
              u.nombre || ' ' || u.apellido AS receptor_usuario_nombre
       FROM aviso_operacion a
       JOIN personal pe ON pe.id_personal = a.id_personal_emisor
       LEFT JOIN personal pr ON pr.id_personal = a.id_personal_receptor
       LEFT JOIN usuario u ON u.id_usuario = a.id_usuario_receptor
       WHERE a.id_operacion = $1
       ORDER BY a.fecha_envio DESC`,
      [id_operacion]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo avisos", error: err.message });
  }
});

// POST /ops/:id/avisos — crear aviso (solo personal: CET o CEL)
app.post("/ops/:id/avisos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const { id_personal_emisor, tipo_aviso, contenido, tipo_receptor, id_personal_receptor, id_usuario_receptor } = req.body ?? {};

  if (!isInt(Number(id_personal_emisor))) return res.status(400).json({ ok: false, mensaje: "Falta id_personal_emisor" });
  if (!contenido?.toString().trim()) return res.status(400).json({ ok: false, mensaje: "Falta contenido" });

  const tiposValidos = ["NOVEDAD","CONTACTO","EMERGENCIA","INFORMATIVO"];
  const tipo = (tipo_aviso || "INFORMATIVO").toString().toUpperCase();
  if (!tiposValidos.includes(tipo)) return res.status(400).json({ ok: false, mensaje: "tipo_aviso invalido" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO aviso_operacion
         (id_operacion, id_personal_emisor, tipo_aviso, contenido, tipo_receptor, id_personal_receptor, id_usuario_receptor)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [id_operacion, Number(id_personal_emisor), tipo, contenido.toString().trim(),
       tipo_receptor || null, id_personal_receptor ? Number(id_personal_receptor) : null,
       id_usuario_receptor ? Number(id_usuario_receptor) : null]
    );
    res.json({ ok: true, aviso: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error creando aviso", error: err.message });
  }
});

// PATCH /ops/:id/avisos/:id_aviso — marcar aviso como atendido
app.patch("/ops/:id/avisos/:id_aviso", requireAuth, async (req, res) => {
  const id_aviso = Number(req.params.id_aviso);
  if (!isInt(id_aviso)) return res.status(400).json({ ok: false, mensaje: "id_aviso invalido" });

  const estado = (req.body?.estado || "ATENDIDO").toString().toUpperCase();
  if (!["RECIBIDO","ATENDIDO"].includes(estado)) return res.status(400).json({ ok: false, mensaje: "estado invalido" });

  try {
    const { rows } = await pool.query(
      `UPDATE aviso_operacion SET estado=$1, fecha_atencion=NOW()
       WHERE id_aviso=$2 RETURNING *`, [estado, id_aviso]);
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Aviso no existe" });
    res.json({ ok: true, aviso: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error actualizando aviso", error: err.message });
  }
});

// ===============================
// PUNTOS DE INTERÉS (POI)
// ===============================

// GET /ops/:id/pois — listar POIs de una operación
app.get("/ops/:id/pois", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM v_poi_detalle WHERE id_operacion=$1 AND activo=TRUE ORDER BY fecha_creacion DESC`,
      [id_operacion]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo POIs", error: err.message });
  }
});

// POST /ops/:id/pois — crear POI
app.post("/ops/:id/pois", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const { nombre, tipo_poi, latitud, longitud, descripcion, tipo_creador, id_usuario, id_personal } = req.body ?? {};
  if (!nombre?.toString().trim()) return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
  if (!tipo_poi?.toString().trim()) return res.status(400).json({ ok: false, mensaje: "Falta tipo_poi" });
  if (latitud == null || longitud == null) return res.status(400).json({ ok: false, mensaje: "Falta latitud/longitud" });

  const tipo = (tipo_creador || "USUARIO").toString().toUpperCase();
  if (!["USUARIO","PERSONAL"].includes(tipo)) return res.status(400).json({ ok: false, mensaje: "tipo_creador invalido" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO puntos_interes (tipo_creador, id_usuario, id_personal, nombre, tipo_poi, latitud, longitud, descripcion, id_operacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tipo, id_usuario ? Number(id_usuario) : null, id_personal ? Number(id_personal) : null,
       nombre.toString().trim(), tipo_poi.toString().trim(), Number(latitud), Number(longitud),
       descripcion?.toString().trim() || null, id_operacion]
    );
    res.json({ ok: true, poi: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error creando POI", error: err.message });
  }
});

// DELETE /ops/:id/pois/:id_poi — desactivar POI
app.delete("/ops/:id/pois/:id_poi", requireAuth, async (req, res) => {
  const id_poi = Number(req.params.id_poi);
  if (!isInt(id_poi)) return res.status(400).json({ ok: false, mensaje: "id_poi invalido" });
  try {
    const { rows } = await pool.query(
      `UPDATE puntos_interes SET activo=FALSE WHERE id_poi=$1 RETURNING id_poi, activo`, [id_poi]);
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "POI no existe" });
    res.json({ ok: true, item: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error eliminando POI", error: err.message });
  }
});

// ===============================
// ÁREAS DE INTERÉS
// ===============================

// GET /ops/:id/areas — listar áreas activas de una operación
app.get("/ops/:id/areas", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM area_interes WHERE id_operacion=$1 AND estado='ACTIVA' ORDER BY fecha_creacion DESC`,
      [id_operacion]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo areas", error: err.message });
  }
});

// POST /ops/:id/areas — crear área de interés
app.post("/ops/:id/areas", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const { nombre, descripcion, geometria, color, tipo_creador, id_usuario, id_personal } = req.body ?? {};
  if (!nombre?.toString().trim()) return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
  if (!geometria) return res.status(400).json({ ok: false, mensaje: "Falta geometria (GeoJSON Polygon)" });

  const tipo = (tipo_creador || "USUARIO").toString().toUpperCase();
  if (!["USUARIO","PERSONAL"].includes(tipo)) return res.status(400).json({ ok: false, mensaje: "tipo_creador invalido" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO area_interes (id_operacion, tipo_creador, id_usuario, id_personal, nombre, descripcion, geometria, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id_operacion, tipo, id_usuario ? Number(id_usuario) : null, id_personal ? Number(id_personal) : null,
       nombre.toString().trim(), descripcion?.toString().trim() || null,
       JSON.stringify(geometria), color || "#FF4500"]
    );
    res.json({ ok: true, area: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error creando area", error: err.message });
  }
});

// DELETE /ops/:id/areas/:id_area — eliminar área (soft)
app.delete("/ops/:id/areas/:id_area", requireAuth, async (req, res) => {
  const id_area = Number(req.params.id_area);
  if (!isInt(id_area)) return res.status(400).json({ ok: false, mensaje: "id_area invalido" });
  try {
    const { rows } = await pool.query(
      `UPDATE area_interes SET estado='ELIMINADA' WHERE id_area=$1 RETURNING id_area, estado`, [id_area]);
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Area no existe" });
    res.json({ ok: true, item: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error eliminando area", error: err.message });
  }
});

// ===============================
// RUTAS
// ===============================

// GET /ops/:id/rutas — listar rutas activas/planificadas de una operación
app.get("/ops/:id/rutas", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ruta_operacion WHERE id_operacion=$1 AND estado IN ('PLANIFICADA','ACTIVA') ORDER BY fecha_creacion DESC`,
      [id_operacion]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo rutas", error: err.message });
  }
});

// POST /ops/:id/rutas — crear ruta
app.post("/ops/:id/rutas", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const { nombre, descripcion, geometria, color, tipo_creador, id_usuario, id_personal } = req.body ?? {};
  if (!nombre?.toString().trim()) return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
  if (!geometria) return res.status(400).json({ ok: false, mensaje: "Falta geometria (GeoJSON LineString)" });

  const tipo = (tipo_creador || "USUARIO").toString().toUpperCase();
  if (!["USUARIO","PERSONAL"].includes(tipo)) return res.status(400).json({ ok: false, mensaje: "tipo_creador invalido" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO ruta_operacion (id_operacion, tipo_creador, id_usuario, id_personal, nombre, descripcion, geometria, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id_operacion, tipo, id_usuario ? Number(id_usuario) : null, id_personal ? Number(id_personal) : null,
       nombre.toString().trim(), descripcion?.toString().trim() || null,
       JSON.stringify(geometria), color || "#1E90FF"]
    );
    res.json({ ok: true, ruta: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error creando ruta", error: err.message });
  }
});

// PATCH /ops/:id/rutas/:id_ruta/estado — cambiar estado de ruta
app.patch("/ops/:id/rutas/:id_ruta/estado", requireAuth, async (req, res) => {
  const id_ruta = Number(req.params.id_ruta);
  if (!isInt(id_ruta)) return res.status(400).json({ ok: false, mensaje: "id_ruta invalido" });

  const estado = (req.body?.estado || "").toString().toUpperCase();
  if (!["PLANIFICADA","ACTIVA","COMPLETADA","CANCELADA"].includes(estado))
    return res.status(400).json({ ok: false, mensaje: "estado invalido" });

  try {
    const { rows } = await pool.query(
      `UPDATE ruta_operacion SET estado=$1 WHERE id_ruta=$2 RETURNING id_ruta, estado`, [estado, id_ruta]);
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Ruta no existe" });
    res.json({ ok: true, item: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error actualizando ruta", error: err.message });
  }
});

// ===============================
// MARCAS DE EDIFICIOS / ESTRUCTURAS
// ===============================

// GET /ops/:id/edificios — listar estructuras activas de una operación
app.get("/ops/:id/edificios", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM marca_edificio WHERE id_operacion=$1 AND estado='ACTIVO' ORDER BY fecha_creacion DESC`,
      [id_operacion]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo edificios", error: err.message });
  }
});

// POST /ops/:id/edificios — crear marca de edificio (solo ADMIN, CUT o CET — validado por backend)
app.post("/ops/:id/edificios", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const { nombre, tipo_estructura, latitud, longitud, tipo_creador, id_usuario, id_personal } = req.body ?? {};
  if (!nombre?.toString().trim()) return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
  if (!tipo_estructura?.toString().trim()) return res.status(400).json({ ok: false, mensaje: "Falta tipo_estructura" });
  if (latitud == null || longitud == null) return res.status(400).json({ ok: false, mensaje: "Falta latitud/longitud" });

  const tipo = (tipo_creador || "USUARIO").toString().toUpperCase();
  if (!["USUARIO","PERSONAL"].includes(tipo)) return res.status(400).json({ ok: false, mensaje: "tipo_creador invalido" });

  // Validar que CEL no pueda crear estructuras
  if (req.user.rol === "CELL")
    return res.status(403).json({ ok: false, mensaje: "Las Celulas no pueden crear estructuras" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO marca_edificio (id_operacion, tipo_creador, id_usuario, id_personal, nombre, tipo_estructura, latitud, longitud)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id_operacion, tipo, id_usuario ? Number(id_usuario) : null, id_personal ? Number(id_personal) : null,
       nombre.toString().trim(), tipo_estructura.toString().trim(), Number(latitud), Number(longitud)]
    );
    res.json({ ok: true, edificio: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error creando edificio", error: err.message });
  }
});

// DELETE /ops/:id/edificios/:id_marca — eliminar estructura (soft)
app.delete("/ops/:id/edificios/:id_marca", requireAuth, async (req, res) => {
  const id_marca = Number(req.params.id_marca);
  if (!isInt(id_marca)) return res.status(400).json({ ok: false, mensaje: "id_marca invalido" });
  try {
    const { rows } = await pool.query(
      `UPDATE marca_edificio SET estado='INACTIVO' WHERE id_marca=$1 RETURNING id_marca, estado`, [id_marca]);
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Edificio no existe" });
    res.json({ ok: true, item: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error eliminando edificio", error: err.message });
  }
});

// ===============================
// TRACKING PERSONAL
// ===============================

// POST /ops/:id/tracking/personal — registrar posición GPS de personal
app.post("/ops/:id/tracking/personal", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const { id_personal, latitud, longitud, altitud, precision_m } = req.body ?? {};
  if (!isInt(Number(id_personal))) return res.status(400).json({ ok: false, mensaje: "Falta id_personal" });
  if (latitud == null || longitud == null) return res.status(400).json({ ok: false, mensaje: "Falta latitud/longitud" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO tracking_personal (id_operacion, id_personal, latitud, longitud, altitud, precision_m)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_tracking, timestamp`,
      [id_operacion, Number(id_personal), Number(latitud), Number(longitud),
       altitud != null ? Number(altitud) : null, precision_m != null ? Number(precision_m) : null]
    );
    res.json({ ok: true, tracking: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error registrando tracking personal", error: err.message });
  }
});

// GET /ops/:id/tracking/personal — última posición de todo el personal
app.get("/ops/:id/tracking/personal", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM v_ultima_posicion_personal WHERE id_operacion=$1`, [id_operacion]);
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo posiciones personal", error: err.message });
  }
});

// GET /ops/:id/tracking/personal/:id_personal/historial — historial de posiciones
app.get("/ops/:id/tracking/personal/:id_personal/historial", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  const id_personal  = Number(req.params.id_personal);
  if (!isInt(id_operacion) || !isInt(id_personal))
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT id_tracking, latitud, longitud, altitud, precision_m, timestamp
       FROM tracking_personal
       WHERE id_operacion=$1 AND id_personal=$2
       ORDER BY timestamp ASC`,
      [id_operacion, id_personal]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo historial personal", error: err.message });
  }
});

// ===============================
// TRACKING VEHÍCULOS
// ===============================

// POST /ops/:id/tracking/vehiculos — registrar posición GPS de vehículo
app.post("/ops/:id/tracking/vehiculos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  const { id_vehiculo, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m } = req.body ?? {};
  if (!isInt(Number(id_vehiculo))) return res.status(400).json({ ok: false, mensaje: "Falta id_vehiculo" });
  if (latitud == null || longitud == null) return res.status(400).json({ ok: false, mensaje: "Falta latitud/longitud" });

  try {
    const { rows } = await pool.query(
      `INSERT INTO tracking_vehiculo (id_operacion, id_vehiculo, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id_tracking, timestamp`,
      [id_operacion, Number(id_vehiculo), Number(latitud), Number(longitud),
       altitud != null ? Number(altitud) : null,
       velocidad_kmh != null ? Number(velocidad_kmh) : null,
       rumbo_grados != null ? Number(rumbo_grados) : null,
       precision_m != null ? Number(precision_m) : null]
    );
    res.json({ ok: true, tracking: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error registrando tracking vehiculo", error: err.message });
  }
});

// GET /ops/:id/tracking/vehiculos — última posición de todos los vehículos
app.get("/ops/:id/tracking/vehiculos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM v_ultima_posicion_vehiculo WHERE id_operacion=$1`, [id_operacion]);
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo posiciones vehiculos", error: err.message });
  }
});

// GET /ops/:id/tracking/vehiculos/:id_vehiculo/historial — historial de posiciones
app.get("/ops/:id/tracking/vehiculos/:id_vehiculo/historial", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  const id_vehiculo  = Number(req.params.id_vehiculo);
  if (!isInt(id_operacion) || !isInt(id_vehiculo))
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT id_tracking, latitud, longitud, altitud, velocidad_kmh, rumbo_grados, precision_m, timestamp
       FROM tracking_vehiculo
       WHERE id_operacion=$1 AND id_vehiculo=$2
       ORDER BY timestamp ASC`,
      [id_operacion, id_vehiculo]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo historial vehiculo", error: err.message });
  }
});

// ===============================
// ZONA OPERACION
// ===============================

// GET /ops/:id/zona — zona principal (la app la usa para centrar el mapa)
app.get("/ops/:id/zona", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT id_zona, id_operacion, nombre, geometria,
              centroide_lat, centroide_lon, zoom_inicial, color
       FROM zona_operacion WHERE id_operacion = $1 LIMIT 1`,
      [id_operacion]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Sin zona definida" });
    res.json({ ok: true, zona: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo zona", error: err.message });
  }
});

// POST /ops/:id/zona — crear o actualizar zona (solo ADMIN o CUT)
app.post("/ops/:id/zona", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  if (!["ADMIN", "CUT"].includes(req.user.rol))
    return res.status(403).json({ ok: false, mensaje: "Solo ADMIN o CUT pueden definir la zona" });

  const { nombre, geometria, color } = req.body ?? {};
  if (!geometria || geometria.type !== "Polygon" || !Array.isArray(geometria.coordinates))
    return res.status(400).json({ ok: false, mensaje: "geometria debe ser un GeoJSON Polygon valido" });

  const centroide = calcularCentroide(geometria);
  if (!centroide)
    return res.status(400).json({ ok: false, mensaje: "No se pudo calcular el centroide" });

  const zoom = calcularZoom(geometria);

  try {
    const { rows } = await pool.query(
      `INSERT INTO zona_operacion
         (id_operacion, nombre, geometria, centroide_lat, centroide_lon, zoom_inicial, color, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id_operacion) DO UPDATE SET
         nombre        = EXCLUDED.nombre,
         geometria     = EXCLUDED.geometria,
         centroide_lat = EXCLUDED.centroide_lat,
         centroide_lon = EXCLUDED.centroide_lon,
         zoom_inicial  = EXCLUDED.zoom_inicial,
         color         = EXCLUDED.color,
         creado_por    = EXCLUDED.creado_por,
         fecha_creacion = NOW()
       RETURNING *`,
      [id_operacion, nombre || "Zona principal", JSON.stringify(geometria),
       centroide.lat, centroide.lon, zoom, color || "#3b82f6", req.user.sub]
    );
    res.json({ ok: true, zona: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error guardando zona", error: err.message });
  }
});

// DELETE /ops/:id/zona
app.delete("/ops/:id/zona", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });

  if (!["ADMIN", "CUT"].includes(req.user.rol))
    return res.status(403).json({ ok: false, mensaje: "Sin permiso" });

  try {
    const { rows } = await pool.query(
      `DELETE FROM zona_operacion WHERE id_operacion = $1 RETURNING id_zona`, [id_operacion]);
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "No existe zona para esta operacion" });
    res.json({ ok: true, deleted: rows[0].id_zona });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error eliminando zona", error: err.message });
  }
});

// ===============================
// MAPA COMPLETO — todas las capas de una operación
// ===============================

// GET /ops/:id/mapa — POIs + areas + rutas + edificios en una sola llamada
app.get("/ops/:id/mapa", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const [capas, personal, vehiculos] = await Promise.all([
      pool.query(`SELECT * FROM v_capas_mapa_operacion WHERE id_operacion=$1`, [id_operacion]),
      pool.query(`SELECT * FROM v_ultima_posicion_personal WHERE id_operacion=$1`, [id_operacion]),
      pool.query(`SELECT * FROM v_ultima_posicion_vehiculo WHERE id_operacion=$1`, [id_operacion]),
    ]);
    res.json({
      ok: true,
      capas: capas.rows,
      personal: personal.rows,
      vehiculos: vehiculos.rows,
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo mapa", error: err.message });
  }
});


// ===============================
// PERSONAL ASIGNADO A OPERACIÓN (para paneles de la app móvil)
// ===============================

// GET /ops/:id/personal — lista el personal asignado, no requiere tracking
app.get("/ops/:id/personal", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT
         p.id_personal,
         p.apodo,
         p.nombre,
         p.apellido,
         p.rol,
         p.puesto,
         a.rol_en_operacion,
         a.estado_asignacion,
         -- última posición conocida (null si no ha enviado tracking)
         t.latitud,
         t.longitud,
         t.ultima_actualizacion
       FROM asignacion_operacion_personal a
       JOIN personal p ON p.id_personal = a.id_personal
       LEFT JOIN v_ultima_posicion_personal t
         ON t.id_personal = a.id_personal AND t.id_operacion = a.id_operacion
       WHERE a.id_operacion = $1
         AND a.estado_asignacion NOT IN ('LIBERADO')
       ORDER BY p.rol, p.apellido`,
      [id_operacion]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo personal", error: err.message });
  }
});

// GET /ops/:id/vehiculos-asignados — vehículos asignados (para panel de la app móvil)
app.get("/ops/:id/vehiculos-asignados", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT
         v.id_vehiculo,
         v.codigo_interno,
         v.tipo,
         v.marca,
         v.modelo,
         vo.uso_en_operacion,
         vo.estado_asignacion,
         -- última posición conocida (null si no ha enviado tracking)
         t.latitud,
         t.longitud,
         t.ultima_actualizacion
       FROM vehiculo_operacion vo
       JOIN vehiculo v ON v.id_vehiculo = vo.id_vehiculo
       LEFT JOIN v_ultima_posicion_vehiculo t
         ON t.id_vehiculo = vo.id_vehiculo AND t.id_operacion = vo.id_operacion
       WHERE vo.id_operacion = $1
         AND vo.estado_asignacion != 'LIBERADO'
       ORDER BY v.tipo, v.codigo_interno`,
      [id_operacion]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo vehiculos", error: err.message });
  }
});

// GET /ops/:id/equipos-asignados — equipos asignados (para panel de la app móvil)
app.get("/ops/:id/equipos-asignados", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) return res.status(400).json({ ok: false, mensaje: "id invalido" });
  try {
    const { rows } = await pool.query(
      `SELECT
         e.id_equipo,
         e.numero_serie,
         e.nombre,
         e.categoria,
         e.estado,
         oe.cantidad,
         oe.uso_en_operacion,
         oe.estado_asignacion,
         COALESCE(ec.imagen_eqcom, et.imagen_eqtac) AS imagen_eq
       FROM operacion_equipo oe
       JOIN equipo e ON e.id_equipo = oe.id_equipo
       LEFT JOIN equipo_comunicacion ec ON ec.id_equipo = e.id_equipo
       LEFT JOIN equipo_tactico et ON et.id_equipo = e.id_equipo
       WHERE oe.id_operacion = $1
         AND oe.estado_asignacion != 'LIBERADO'
       ORDER BY e.categoria, e.nombre`,
      [id_operacion]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: "Error obteniendo equipos", error: err.message });
  }
});

app.get("/ops/:id/chat/messages", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  try {
    const chatRes = await pool.query(
      `SELECT id_chat
       FROM chat_operacion
       WHERE id_operacion = $1
       LIMIT 1`,
      [id_operacion]
    );

    if (chatRes.rowCount === 0) {
      return res.json({ ok: true, items: [] });
    }

    const id_chat = chatRes.rows[0].id_chat;

    const { rows } = await pool.query(
      `
      SELECT
        m.id_mensaje,
        m.id_chat,
        m.contenido,
        m.tipo_mensaje,
        m.fecha_envio,
        pc.tipo AS tipo_participante,
        pc.id_usuario,
        pc.id_personal,
        COALESCE(
          u.nombre || ' ' || u.apellido,
          p.nombre || ' ' || p.apellido,
          'Sistema'
        ) AS autor_nombre
      FROM mensaje_chat m
      JOIN participante_chat pc
        ON pc.id_participante = m.id_participante
      LEFT JOIN usuario u
        ON u.id_usuario = pc.id_usuario
      LEFT JOIN personal p
        ON p.id_personal = pc.id_personal
      WHERE m.id_chat = $1
      ORDER BY m.fecha_envio ASC, m.id_mensaje ASC
      `,
      [id_chat]
    );

    return res.json({ ok: true, items: rows });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      mensaje: "Error obteniendo mensajes del chat",
      error: err.message
    });
  }
});

app.post("/ops/:id/chat/messages", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  try {
    const contenido = String(req.body?.contenido || "").trim();
    const tipo_mensaje = String(req.body?.tipo_mensaje || "NORMAL").toUpperCase();

    if (!contenido) {
      return res.status(400).json({ ok: false, mensaje: "contenido vacío" });
    }

    if (!["NORMAL", "SISTEMA", "URGENTE"].includes(tipo_mensaje)) {
      return res.status(400).json({ ok: false, mensaje: "tipo_mensaje inválido" });
    }

    const chatRes = await pool.query(
      `SELECT id_chat
       FROM chat_operacion
       WHERE id_operacion = $1
       LIMIT 1`,
      [id_operacion]
    );

    if (chatRes.rowCount === 0) {
      return res.status(404).json({ ok: false, mensaje: "La operación no tiene chat" });
    }

    const id_chat = chatRes.rows[0].id_chat;

    let id_participante = null;

    if (req.user.tabla === "usuario") {
      const partRes = await pool.query(
        `
        INSERT INTO participante_chat (id_chat, tipo, id_usuario, id_personal)
        VALUES ($1, 'USUARIO', $2, NULL)
        ON CONFLICT (id_chat, id_usuario) DO UPDATE
          SET id_usuario = EXCLUDED.id_usuario
        RETURNING id_participante
        `,
        [id_chat, Number(req.user.sub)]
      );
      id_participante = partRes.rows[0].id_participante;
    } else {
      const partRes = await pool.query(
        `
        INSERT INTO participante_chat (id_chat, tipo, id_usuario, id_personal)
        VALUES ($1, 'PERSONAL', NULL, $2)
        ON CONFLICT (id_chat, id_personal) DO UPDATE
          SET id_personal = EXCLUDED.id_personal
        RETURNING id_participante
        `,
        [id_chat, Number(req.user.sub)]
      );
      id_participante = partRes.rows[0].id_participante;
    }

    const ins = await pool.query(
      `
      INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
      VALUES ($1, $2, $3, $4)
      RETURNING id_mensaje, id_chat, contenido, tipo_mensaje, fecha_envio
      `,
      [id_chat, id_participante, contenido, tipo_mensaje]
    );

    const autorRes = await pool.query(
      `
      SELECT
        pc.tipo AS tipo_participante,
        pc.id_usuario,
        pc.id_personal,
        COALESCE(
          u.nombre || ' ' || u.apellido,
          p.nombre || ' ' || p.apellido,
          'Sistema'
        ) AS autor_nombre
      FROM participante_chat pc
      LEFT JOIN usuario u
        ON u.id_usuario = pc.id_usuario
      LEFT JOIN personal p
        ON p.id_personal = pc.id_personal
      WHERE pc.id_participante = $1
      LIMIT 1
      `,
      [id_participante]
    );

    const payload = {
      ...ins.rows[0],
      ...(autorRes.rows[0] || {})
    };

    io.to(`op_${id_operacion}`).emit("chat_message", payload);

    return res.json({
      ok: true,
      item: payload
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      mensaje: "Error enviando mensaje",
      error: err.message
    });
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
server.listen(PORT, "0.0.0.0", () => {
  console.log(`API + WS en http://192.168.202.103:${PORT}`);
});