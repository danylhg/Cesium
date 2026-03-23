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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logger: ver TODO lo que llega
app.use((req, res, next) => {
  console.log("➡️", req.method, req.url);
  next();
});

// ===============================
// Helpers de respuesta de error
// ===============================

/**
 * Respuesta de error genérica.
 * @param {import('express').Response} res
 * @param {number} status  Código HTTP
 * @param {string} mensaje Mensaje legible
 * @param {any}    [extra] Campos adicionales opcionales
 */
function sendError(res, status, mensaje, extra = {}) {
  return res.status(status).json({ ok: false, mensaje, ...extra });
}

/** Mapa de códigos de error PostgreSQL → mensaje amigable */
const PG_ERROR_MSGS = {
  "23505": "Registro duplicado: ya existe un dato con ese valor único.",
  "23503": "No se puede completar: el registro está referenciado por otro dato.",
  "23502": "Falta un dato obligatorio en la base de datos.",
  "22P02": "Formato de dato inválido.",
  "22001": "El texto enviado es demasiado largo para el campo.",
  "22003": "El número está fuera del rango permitido.",
  "23514": "El valor no cumple con una regla de validación de la base de datos.",
};

/**
 * Respuesta de error de base de datos.
 * Traduce códigos PG conocidos; para el resto manda 500 genérico.
 * @param {import('express').Response} res
 * @param {Error & { code?: string, detail?: string }} err
 * @param {string} [fallbackMsg] Mensaje de contexto si el código no está mapeado
 */
function sendDbError(res, err, fallbackMsg = "Error interno en base de datos") {
  const msg = PG_ERROR_MSGS[err.code];
  if (msg) {
    const status = err.code === "23503" ? 409 : 422;
    return res.status(status).json({
      ok: false,
      mensaje: msg,
      detalle: err.detail || err.message,
      pg_code: err.code,
    });
  }
  console.error("[DB ERROR]", err);
  return res.status(500).json({
    ok: false,
    mensaje: fallbackMsg,
    error: err.message,
  });
}

// ===============================
// Helpers de autenticación / utilidad
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
    return sendDbError(res, err, "Error conectando a la base de datos");
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
    return sendDbError(res, err, "Error interno");
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
    sendDbError(res, err, "Error /me");
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
    return sendDbError(res, err, "Error catálogo personal");
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

async function generateUniqueUsername(base, client, ignoreId = null) {
  let username = base;
  let counter = 1;

  while (true) {
    const { rowCount } = await client.query(
      `SELECT 1 FROM personal 
       WHERE username = $1 
       ${ignoreId ? "AND id_personal <> $2" : ""}`,
      ignoreId ? [username, ignoreId] : [username]
    );

    if (rowCount === 0) break;

    username = `${base}${counter}`;
    counter++;
  }

  return username;
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
 * body: { rol: "CUT"|"CET"|"CELL", nombre: string, apellido: string, puesto?: string, apodo?: string }
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

      // username único: primera letra del nombre + apellido
      const nombreSlug = slug(nombre);
      const apellidoSlug = slug(apellido);

      const base = `${(nombreSlug[0] || "")}${apellidoSlug}`.slice(0, 35);
      const username = await generateUniqueUsername(base, client);

      // apodo obligatorio y UNIQUE
      // preferimos el apodo que mande el frontend, si no, usamos "Nombre Apellido"
      const apodoBase = apodoIn || `${nombre} ${apellido}`;
      const apodo = await generateUniqueApodo(apodoBase, client);

      // username: usar el que mande el frontend si es válido, si no, generar
      const usernameIn = (req.body?.username || "").toString().trim();
      if (usernameIn && !/^[a-zA-Z0-9._-]+$/.test(usernameIn)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ ok: false, mensaje: "username inválido: solo letras, números, punto, guion y guion bajo." });
      }
      const finalUsername = usernameIn
        ? await generateUniqueUsername(usernameIn, client)
        : await generateUniqueUsername(base, client);

      // password: usar el que mande el frontend si no está vacío, si no, generar temporal
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
});

/**
 * PUT /catalog/personal/:id
 * body: { apodo?, nombre?, apellido?, puesto?, activo? }
 * ✔ Regenera username si cambia nombre o apellido
 */
app.put("/catalog/personal/:id", requireAuth, async (req, res) => {
  const id_personal = Number(req.params.id);
  if (!isInt(id_personal)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Obtener registro actual
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

    // Valores finales (si no mandan, usamos los actuales)
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

    // 🔥 username manual tiene prioridad; si no se mandó pero cambiaron nombre/apellido, regenerar
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

    // password: solo si mandan uno no vacío
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
    return sendDbError(res, err, "Error eliminando personal");
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
    sendDbError(res, err, "Error listando ops");
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
    return sendDbError(res, err, "Error obteniendo operacion del personal");
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
    sendDbError(res, err, "Error obteniendo operación");
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
    sendDbError(res, err, "Error por código");
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
    sendDbError(res, err, "Error creando operación");
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
    return sendDbError(res, err, "Error guardando personal");
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
    return sendDbError(res, err, "Error guardando mando");
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
    return sendDbError(res, err, "Error guardando vehículos");
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
    return sendDbError(res, err, "Error obteniendo equipos");
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
    return sendDbError(res, err, "Error creando equipo");
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
    return sendDbError(res, err, "Error actualizando equipo");
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
    return sendDbError(res, err, "Error eliminando equipo");
  }
});

app.post("/ops/:id/equipos", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  try {
    const { asignado_por, items } = req.body ?? {};
    const who = Number(asignado_por || req.user.sub);

    if (!Array.isArray(items)) {
      return res.status(400).json({ ok: false, mensaje: "items inválido" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1) Obtener equipos previamente ligados a la operación
      const prevRes = await client.query(
        `SELECT id_equipo
         FROM operacion_equipo
         WHERE id_operacion = $1`,
        [id_operacion]
      );
      const prevEquipoIds = prevRes.rows
        .map(r => Number(r.id_equipo))
        .filter(id => Number.isInteger(id) && id > 0);

      // 2) Limpiar relaciones derivadas de esos equipos
      if (prevEquipoIds.length > 0) {
        await client.query(
          `DELETE FROM uso_equipo_operacion
           WHERE id_operacion = $1`,
          [id_operacion]
        );

        await client.query(
          `DELETE FROM personal_equipo
           WHERE id_equipo = ANY($1::int[])`,
          [prevEquipoIds]
        );

        await client.query(
          `DELETE FROM vehiculo_equipo
           WHERE id_equipo = ANY($1::int[])`,
          [prevEquipoIds]
        );
      }

      // 3) Limpiar la reserva de equipos en la operación
      await client.query(
        `DELETE FROM operacion_equipo
         WHERE id_operacion = $1`,
        [id_operacion]
      );

      // 4) Reinsertar todo desde cero
      for (const it of items) {
        const id_equipo = Number(it.id_equipo);
        const cantidad = Number(it.cantidad || 1);
        const estado_asignacion = String(it.estado_asignacion || "ASIGNADO").toUpperCase().trim();
        const uso_en_operacion =
          it.uso_en_operacion != null
            ? String(it.uso_en_operacion).trim() || null
            : null;

        const id_personal =
          it.id_personal != null ? Number(it.id_personal) : null;
        const id_vehiculo =
          it.id_vehiculo != null ? Number(it.id_vehiculo) : null;

        if (!isInt(id_equipo)) continue;
        if (!Number.isInteger(cantidad) || cantidad <= 0) continue;

        // No permitir destino doble
        if (isInt(id_personal) && isInt(id_vehiculo)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            ok: false,
            mensaje: `El equipo ${id_equipo} no puede asignarse a personal y vehículo al mismo tiempo`
          });
        }

        // 4.1 Reservar equipo para la operación
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
             fecha_asignacion = NOW(),
             fecha_fin_asignacion = NULL`,
          [id_operacion, id_equipo, cantidad, uso_en_operacion, estado_asignacion, who]
        );

        // 4.2 Si va a persona: inventario entregado a personal
        if (isInt(id_personal)) {
          await client.query(
            `INSERT INTO personal_equipo
               (id_personal, id_equipo, cantidad, estado, asignado_por)
             VALUES ($1,$2,$3,'ASIGNADO',$4)
             ON CONFLICT (id_personal, id_equipo)
             DO UPDATE SET
               cantidad = EXCLUDED.cantidad,
               estado = EXCLUDED.estado,
               asignado_por = EXCLUDED.asignado_por,
               fecha_asignacion = NOW(),
               fecha_devolucion = NULL`,
            [id_personal, id_equipo, cantidad, who]
          );

          // 4.3 Si además quieres reflejar uso del equipo dentro de la operación
          await client.query(
            `INSERT INTO uso_equipo_operacion
               (id_operacion, id_equipo, id_personal, cantidad, asignado_por, notas)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (id_operacion, id_equipo, id_personal)
             DO UPDATE SET
               cantidad = EXCLUDED.cantidad,
               asignado_por = EXCLUDED.asignado_por,
               notas = EXCLUDED.notas,
               fecha_asignacion = NOW(),
               fecha_devolucion = NULL`,
            [
              id_operacion,
              id_equipo,
              id_personal,
              cantidad,
              who,
              uso_en_operacion
            ]
          );
        }

        // 4.4 Si va a vehículo: equipo instalado en vehículo
        if (isInt(id_vehiculo)) {
          await client.query(
            `INSERT INTO vehiculo_equipo
               (id_vehiculo, id_equipo, cantidad, estado)
             VALUES ($1,$2,$3,'INSTALADO')
             ON CONFLICT (id_vehiculo, id_equipo)
             DO UPDATE SET
               cantidad = EXCLUDED.cantidad,
               estado = EXCLUDED.estado,
               fecha_instalacion = NOW(),
               fecha_retiro = NULL`,
            [id_vehiculo, id_equipo, cantidad]
          );
        }
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
    return sendDbError(res, err, "Error guardando equipos");
  }
});

// ===============================
// CATÁLOGOS - VEHÍCULOS
// ===============================
app.post("/catalog/vehiculos", requireAuth, async (req, res) => {
  try {
    const codigo_interno = (req.body?.codigo_interno || "").toString().trim();
    const tipo = (req.body?.tipo || "").toString().trim() || null;
    const alias = (req.body?.alias || "").toString().trim() || null;
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
      `INSERT INTO vehiculo (codigo_interno, tipo, alias, imagen_veh, estado, capacidad)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id_vehiculo, codigo_interno, tipo, alias, imagen_veh, estado, capacidad`,
      [codigo_interno, tipo, alias, imagen_veh, estado, capacidad]
    );

    return res.json({ ok: true, item: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ ok: false, mensaje: "El código interno ya existe", error: err.detail || err.message });
    }
    return sendDbError(res, err, "Error creando vehículo");
  }
});

app.put("/catalog/vehiculos/:id", requireAuth, async (req, res) => {
  const id_vehiculo = Number(req.params.id);
  if (!isInt(id_vehiculo)) return res.status(400).json({ ok: false, mensaje: "id inválido" });

  try {
    const codigo_interno = req.body?.codigo_interno != null ? String(req.body.codigo_interno).trim() : null;
    const tipo = req.body?.tipo != null ? (String(req.body.tipo).trim() || null) : null;
    const alias = req.body?.alias != null ? (String(req.body.alias).trim() || null) : null;
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
    if (req.body?.alias !== undefined)    { sets.push(`alias = $${i++}`); vals.push(alias); }
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
       RETURNING id_vehiculo, codigo_interno, tipo, alias, imagen_veh, estado, capacidad`,
      vals
    );

    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: "Vehículo no existe" });
    return res.json({ ok: true, item: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ ok: false, mensaje: "El código interno ya existe", error: err.detail || err.message });
    }
    return sendDbError(res, err, "Error editando vehículo");
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
    return sendDbError(res, err, "Error eliminando vehículo");
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
    return sendDbError(res, err, "Error cambiando estado");
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
    sendDbError(res, err, "Error obteniendo chat");
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
    sendDbError(res, err, "Error enviando mensaje");
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
    sendDbError(res, err, "Error obteniendo avisos");
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
    sendDbError(res, err, "Error creando aviso");
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
    sendDbError(res, err, "Error actualizando aviso");
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
    sendDbError(res, err, "Error obteniendo POIs");
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
    sendDbError(res, err, "Error creando POI");
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
    sendDbError(res, err, "Error eliminando POI");
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
    sendDbError(res, err, "Error obteniendo areas");
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
    sendDbError(res, err, "Error creando area");
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
    sendDbError(res, err, "Error eliminando area");
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
    sendDbError(res, err, "Error obteniendo rutas");
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
    sendDbError(res, err, "Error creando ruta");
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
    sendDbError(res, err, "Error actualizando ruta");
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
    sendDbError(res, err, "Error obteniendo edificios");
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
    sendDbError(res, err, "Error creando edificio");
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
    sendDbError(res, err, "Error eliminando edificio");
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
    sendDbError(res, err, "Error registrando tracking personal");
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
    sendDbError(res, err, "Error obteniendo posiciones personal");
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
    sendDbError(res, err, "Error obteniendo historial personal");
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
    sendDbError(res, err, "Error registrando tracking vehiculo");
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
    sendDbError(res, err, "Error obteniendo posiciones vehiculos");
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
    sendDbError(res, err, "Error obteniendo historial vehiculo");
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
    sendDbError(res, err, "Error obteniendo zona");
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
    sendDbError(res, err, "Error guardando zona");
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
    sendDbError(res, err, "Error eliminando zona");
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
    sendDbError(res, err, "Error obteniendo mapa");
  }
});


// ===============================
// PERSONAL ASIGNADO A OPERACIÓN (para paneles de la app móvil)
// ===============================

// GET /ops/:id/personal — lista el personal asignado, no requiere tracking
app.get("/ops/:id/personal", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT DISTINCT ON (p.id_personal)
        p.id_personal,
        p.apodo,
        p.nombre,
        p.apellido,
        p.rol,
        p.puesto,
        a.rol_en_operacion,
        a.estado_asignacion,
        go.id_grupo_operacion,
        go.nombre AS grupo_nombre,
        go.apodo AS grupo_apodo,
        gp_padre.nombre AS grupo_padre_nombre,
        gp_padre.apodo AS grupo_padre_apodo,
        t.latitud,
        t.longitud,
        t.ultima_actualizacion
      FROM asignacion_operacion_personal a
      JOIN personal p
        ON p.id_personal = a.id_personal
      LEFT JOIN grupo_personal gper
        ON gper.id_personal = p.id_personal
      LEFT JOIN grupo_operacion go
        ON go.id_grupo_operacion = gper.id_grupo_operacion
       AND go.id_operacion = a.id_operacion
      LEFT JOIN grupo_operacion gp_padre
        ON gp_padre.id_grupo_operacion = go.id_grupo_padre
      LEFT JOIN v_ultima_posicion_personal t
        ON t.id_personal = a.id_personal
       AND t.id_operacion = a.id_operacion
      WHERE a.id_operacion = $1
        AND a.estado_asignacion NOT IN ('LIBERADO')
      ORDER BY
        p.id_personal,
        CASE WHEN go.id_grupo_operacion IS NULL THEN 1 ELSE 0 END,
        go.id_grupo_operacion
      `,
      [id_operacion]
    );

    return res.json({ ok: true, items: rows });
  } catch (err) {
    return sendDbError(res, err, "Error obteniendo personal");
  }
});

// GET /ops/:id/vehiculos-asignados — vehículos asignados (para panel de la app móvil)
app.get("/ops/:id/vehiculos-asignados", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        v.id_vehiculo,
        v.codigo_interno,
        v.tipo,
        v.alias,
        vo.uso_en_operacion,
        vo.estado_asignacion,
        gv.id_grupo_operacion,
        gv.grupo_nombre,
        gv.grupo_apodo,
        gv.grupo_padre_nombre,
        gv.grupo_padre_apodo,
        t.latitud,
        t.longitud,
        t.ultima_actualizacion
      FROM vehiculo_operacion vo
      JOIN vehiculo v
        ON v.id_vehiculo = vo.id_vehiculo
      LEFT JOIN LATERAL (
        SELECT
          go.id_grupo_operacion,
          go.nombre AS grupo_nombre,
          go.apodo AS grupo_apodo,
          gp_padre.nombre AS grupo_padre_nombre,
          gp_padre.apodo AS grupo_padre_apodo
        FROM grupo_vehiculo gv
        JOIN grupo_operacion go
          ON go.id_grupo_operacion = gv.id_grupo_operacion
        LEFT JOIN grupo_operacion gp_padre
          ON gp_padre.id_grupo_operacion = go.id_grupo_padre
        WHERE gv.id_vehiculo = v.id_vehiculo
          AND go.id_operacion = vo.id_operacion
        ORDER BY
          CASE WHEN go.id_grupo_padre IS NULL THEN 0 ELSE 1 END,
          go.id_grupo_operacion
        LIMIT 1
      ) gv ON TRUE
      LEFT JOIN v_ultima_posicion_vehiculo t
        ON t.id_vehiculo = vo.id_vehiculo
       AND t.id_operacion = vo.id_operacion
      WHERE vo.id_operacion = $1
        AND vo.estado_asignacion != 'LIBERADO'
      ORDER BY
        COALESCE(gv.grupo_padre_nombre, gv.grupo_nombre, ''),
        COALESCE(gv.grupo_nombre, ''),
        v.tipo,
        v.codigo_interno
      `,
      [id_operacion]
    );

    return res.json({ ok: true, items: rows });
  } catch (err) {
    return sendDbError(res, err, "Error obteniendo vehiculos");
  }
});

// GET /ops/:id/equipos-asignados — equipos asignados (para panel de la app móvil)
app.get("/ops/:id/equipos-asignados", requireAuth, async (req, res) => {
  const id_operacion = Number(req.params.id);
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        e.id_equipo,
        e.numero_serie,
        e.nombre,
        e.categoria,
        e.estado,
        oe.cantidad,
        oe.uso_en_operacion,
        oe.estado_asignacion,
        COALESCE(ec.imagen_eqcom, et.imagen_eqtac) AS imagen_eq,

        CONCAT_WS(' ', p.nombre, p.apellido) AS personal_asignado,
        p.apodo AS personal_apodo,

        v.codigo_interno AS vehiculo_asignado,
        v.alias AS vehiculo_alias

      FROM operacion_equipo oe
      JOIN equipo e
        ON e.id_equipo = oe.id_equipo
      LEFT JOIN equipo_comunicacion ec
        ON ec.id_equipo = e.id_equipo
      LEFT JOIN equipo_tactico et
        ON et.id_equipo = e.id_equipo

      LEFT JOIN uso_equipo_operacion ueo
        ON ueo.id_operacion = oe.id_operacion
       AND ueo.id_equipo = oe.id_equipo
      LEFT JOIN personal p
        ON p.id_personal = ueo.id_personal

      LEFT JOIN vehiculo_equipo ve
        ON ve.id_equipo = e.id_equipo
      LEFT JOIN vehiculo v
        ON v.id_vehiculo = ve.id_vehiculo

      WHERE oe.id_operacion = $1
        AND oe.estado_asignacion != 'LIBERADO'
      ORDER BY e.categoria, e.nombre, e.numero_serie
      `,
      [id_operacion]
    );

    return res.json({ ok: true, items: rows });
  } catch (err) {
    return sendDbError(res, err, "Error obteniendo equipos");
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
    return sendDbError(res, err, "Error obteniendo mensajes del chat");
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
    return sendDbError(res, err, "Error enviando mensaje");
  }
});


// ===============================
// POST /validate/disponibilidad
// Verifica si personal, vehículos o equipos están ocupados
// en operaciones cuyas fechas se solapan con las dadas.
// body: { fecha_inicio?, fecha_fin?, personal_ids:[], vehiculo_ids:[], equipo_ids:[] }
// ===============================
app.post("/validate/disponibilidad", requireAuth, async (req, res) => {
  try {
    const {
      fecha_inicio = null,
      fecha_fin    = null,
      personal_ids = [],
      vehiculo_ids = [],
      equipo_ids   = [],
    } = req.body ?? {};

    // Al menos un array debe tener elementos
    const pIds = (Array.isArray(personal_ids) ? personal_ids : []).map(Number).filter(isInt);
    const vIds = (Array.isArray(vehiculo_ids) ? vehiculo_ids : []).map(Number).filter(isInt);
    const eIds = (Array.isArray(equipo_ids)   ? equipo_ids   : []).map(Number).filter(isInt);

    if (!pIds.length && !vIds.length && !eIds.length) {
      return res.status(400).json({ ok: false, mensaje: "Debes enviar al menos un id en personal_ids, vehiculo_ids o equipo_ids." });
    }

    // Función auxiliar: construye la condición de solapamiento de fechas.
    // Dos rangos [A_ini, A_fin] y [B_ini, B_fin] se solapan si A_ini <= B_fin AND A_fin >= B_ini.
    // Si no se manda fecha consideramos que se solapa con todo (null = abierto).
    function overlapCondition(aliasIni, aliasFin) {
      if (!fecha_inicio && !fecha_fin) return "TRUE"; // sin fechas = verificar contra cualquier op activa
      const parts = [];
      if (fecha_fin)   parts.push(`(${aliasIni} IS NULL OR ${aliasIni} <= $FIN)`);
      if (fecha_inicio) parts.push(`(${aliasFin} IS NULL OR ${aliasFin} >= $INI)`);
      return parts.length ? parts.join(" AND ") : "TRUE";
    }

    const conflictos = { personal: [], vehiculos: [], equipos: [] };

    // ── Personal ──────────────────────────────────────────────────────────
    if (pIds.length) {
      const params = [pIds];
      let cond = "TRUE";
      if (fecha_inicio || fecha_fin) {
        if (fecha_fin)    { params.push(fecha_fin);    cond  = `(o.fecha_inicio IS NULL OR o.fecha_inicio <= $${params.length})`; }
        if (fecha_inicio) { params.push(fecha_inicio); cond += ` AND (o.fecha_fin IS NULL OR o.fecha_fin >= $${params.length})`; }
      }

      const { rows } = await pool.query(
        `SELECT
           a.id_personal,
           p.nombre,
           p.apellido,
           p.apodo,
           o.id_operacion,
           o.codigo   AS op_codigo,
           o.nombre   AS op_nombre,
           o.estado   AS op_estado,
           o.fecha_inicio AS op_inicio,
           o.fecha_fin    AS op_fin
         FROM asignacion_operacion_personal a
         JOIN personal  p ON p.id_personal  = a.id_personal
         JOIN operacion o ON o.id_operacion = a.id_operacion
         WHERE a.id_personal = ANY($1::int[])
           AND a.estado_asignacion NOT IN ('LIBERADO')
           AND o.estado NOT IN ('CANCELADA', 'CERRADA', 'FINALIZADA')
           AND ${cond}
         ORDER BY a.id_personal, o.id_operacion`,
        params
      );
      conflictos.personal = rows;
    }

    // ── Vehículos ─────────────────────────────────────────────────────────
    if (vIds.length) {
      const params = [vIds];
      let cond = "TRUE";
      if (fecha_inicio || fecha_fin) {
        if (fecha_fin)    { params.push(fecha_fin);    cond  = `(o.fecha_inicio IS NULL OR o.fecha_inicio <= $${params.length})`; }
        if (fecha_inicio) { params.push(fecha_inicio); cond += ` AND (o.fecha_fin IS NULL OR o.fecha_fin >= $${params.length})`; }
      }

      const { rows } = await pool.query(
        `SELECT
           vo.id_vehiculo,
           v.codigo_interno,
           v.alias,
           v.tipo,
           o.id_operacion,
           o.codigo   AS op_codigo,
           o.nombre   AS op_nombre,
           o.estado   AS op_estado,
           o.fecha_inicio AS op_inicio,
           o.fecha_fin    AS op_fin
         FROM vehiculo_operacion vo
         JOIN vehiculo  v ON v.id_vehiculo  = vo.id_vehiculo
         JOIN operacion o ON o.id_operacion = vo.id_operacion
         WHERE vo.id_vehiculo = ANY($1::int[])
           AND vo.estado_asignacion NOT IN ('LIBERADO')
           AND o.estado NOT IN ('CANCELADA', 'CERRADA', 'FINALIZADA')
           AND ${cond}
         ORDER BY vo.id_vehiculo, o.id_operacion`,
        params
      );
      conflictos.vehiculos = rows;
    }

    // ── Equipos ───────────────────────────────────────────────────────────
    if (eIds.length) {
      const params = [eIds];
      let cond = "TRUE";
      if (fecha_inicio || fecha_fin) {
        if (fecha_fin)    { params.push(fecha_fin);    cond  = `(o.fecha_inicio IS NULL OR o.fecha_inicio <= $${params.length})`; }
        if (fecha_inicio) { params.push(fecha_inicio); cond += ` AND (o.fecha_fin IS NULL OR o.fecha_fin >= $${params.length})`; }
      }

      const { rows } = await pool.query(
        `SELECT
           oe.id_equipo,
           e.nombre   AS equipo_nombre,
           e.numero_serie,
           e.categoria,
           o.id_operacion,
           o.codigo   AS op_codigo,
           o.nombre   AS op_nombre,
           o.estado   AS op_estado,
           o.fecha_inicio AS op_inicio,
           o.fecha_fin    AS op_fin
         FROM operacion_equipo oe
         JOIN equipo    e ON e.id_equipo    = oe.id_equipo
         JOIN operacion o ON o.id_operacion = oe.id_operacion
         WHERE oe.id_equipo = ANY($1::int[])
           AND oe.estado_asignacion NOT IN ('LIBERADO')
           AND o.estado NOT IN ('CANCELADA', 'CERRADA', 'FINALIZADA')
           AND ${cond}
         ORDER BY oe.id_equipo, o.id_operacion`,
        params
      );
      conflictos.equipos = rows;
    }

    const hayConflictos =
      conflictos.personal.length > 0 ||
      conflictos.vehiculos.length > 0 ||
      conflictos.equipos.length > 0;

    return res.json({
      ok: true,
      disponible: !hayConflictos,
      conflictos,
    });

  } catch (err) {
    return sendDbError(res, err, "Error verificando disponibilidad");
  }
});

// ===============================
// Manejadores globales de error
// ===============================

// 413 - Payload demasiado grande
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    return sendError(res, 413, "El cuerpo de la petición supera el límite permitido (10 MB).");
  }
  next(err);
});

// JSON mal formado
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return sendError(res, 400, "JSON inválido. Revisa la sintaxis del cuerpo enviado.", {
      detalle: err.message,
    });
  }
  next(err);
});

// Catch-all: cualquier error no manejado antes
app.use((err, req, res, _next) => {
  console.error("[UNHANDLED ERROR]", err);
  return sendDbError(res, err, "Error interno no controlado");
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