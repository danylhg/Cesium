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
// ===============================
// AUTH — reemplaza el bloque /auth/login en tu server.js
// Busca primero en `usuario` (ADMIN), luego en `personal` (CUT/CET/CELL)
// Web:    ADMIN, CUT  pueden entrar
// Móvil:  CET, CELL   pueden entrar   (filtro en LoginActivity.kt)
// ===============================
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, mensaje: "Faltan credenciales" });
    }

    let user = null;
    let tabla = null;

    // 1) Buscar en tabla `usuario` (ADMIN)
    const resUsuario = await pool.query(
      `SELECT id_usuario AS id, username, password_hash, rol, nombre, apellido, puesto, activo
       FROM usuario WHERE username = $1 LIMIT 1`,
      [username]
    );

    if (resUsuario.rows.length > 0) {
      user  = resUsuario.rows[0];
      tabla = "usuario";
    } else {
      // 2) Buscar en tabla `personal` (CUT / CET / CELL)
      const resPersonal = await pool.query(
        `SELECT id_personal AS id, username, password_hash, rol, nombre, apellido, puesto, activo
         FROM personal WHERE username = $1 LIMIT 1`,
        [username]
      );
      if (resPersonal.rows.length > 0) {
        user  = resPersonal.rows[0];
        tabla = "personal";
      }
    }

    // No encontrado en ninguna tabla
    if (!user) {
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }

    // Inactivo
    if (!user.activo) {
      return res.status(403).json({ ok: false, mensaje: "Usuario inactivo" });
    }

    // Verificar contraseña
    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
    }

    // Actualizar último acceso en la tabla correcta
    if (tabla === "usuario") {
      await pool.query(
        `UPDATE usuario SET ultimo_acceso = NOW() WHERE id_usuario = $1`, [user.id]
      );
    } else {
      await pool.query(
        `UPDATE personal SET ultimo_acceso = NOW() WHERE id_personal = $1`, [user.id]
      );
    }

    // Generar JWT — incluye tabla para distinguir en /me y otras rutas
    const token = jwt.sign(
      { sub: user.id, username: user.username, rol: user.rol, tabla },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.json({
      ok: true,
      token,
      usuario: {
        id_usuario: user.id,
        username:   user.username,
        rol:        user.rol,
        nombre:     user.nombre,
        apellido:   user.apellido,
        puesto:     user.puesto ?? "",
        tabla,      // "usuario" | "personal"  → útil en el cliente
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

    async function getOrCreateParticipante(id_chat, id_usuario) {
      const { rows } = await client.query(
        `INSERT INTO participante_chat (id_chat, tipo, id_usuario) VALUES ($1,'USUARIO',$2)
         ON CONFLICT (id_chat, id_usuario) DO NOTHING RETURNING id_participante`, [id_chat, id_usuario]);
      if (rows[0]) return rows[0].id_participante;
      const { rows: ex } = await client.query(
        `SELECT id_participante FROM participante_chat WHERE id_chat=$1 AND id_usuario=$2 LIMIT 1`, [id_chat, id_usuario]);
      return ex[0]?.id_participante;
    }

    if (nuevoEstado === "ACTIVA") {
      const { rows: cr } = await client.query(
        `INSERT INTO chat_operacion (id_operacion) VALUES ($1)
         ON CONFLICT (id_operacion) DO UPDATE SET activo=TRUE RETURNING id_chat`, [id_operacion]);
      const id_chat = cr[0].id_chat;
      const id_participante = await getOrCreateParticipante(id_chat, id_usuario);
      await client.query(
        `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje) VALUES ($1,$2,$3,'SISTEMA')`,
        [id_chat, id_participante, `OPERACION ACTIVADA\nCodigo: ${codigoOp}\nNombre: ${nombreOp}\nHora oficial de inicio: ${horaStr()}`]
      );
    }

    if (nuevoEstado === "CERRADA") {
      const { rows: cr } = await client.query(`SELECT id_chat FROM chat_operacion WHERE id_operacion=$1 LIMIT 1`, [id_operacion]);
      if (cr[0]) {
        const id_chat = cr[0].id_chat;
        const id_participante = await getOrCreateParticipante(id_chat, id_usuario);
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

  const id_usuario = Number(req.user.sub);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Obtener o crear chat
    const { rows: cr } = await client.query(
      `SELECT id_chat FROM chat_operacion WHERE id_operacion=$1 AND activo=TRUE LIMIT 1`, [id_operacion]);
    if (!cr[0]) { await client.query("ROLLBACK"); return res.status(409).json({ ok: false, mensaje: "El chat no esta activo o no existe" }); }
    const id_chat = cr[0].id_chat;

    // Obtener o crear participante
    const { rows: pr } = await client.query(
      `INSERT INTO participante_chat (id_chat, tipo, id_usuario) VALUES ($1,'USUARIO',$2)
       ON CONFLICT (id_chat, id_usuario) DO NOTHING RETURNING id_participante`, [id_chat, id_usuario]);
    let id_participante = pr[0]?.id_participante;
    if (!id_participante) {
      const { rows: ex } = await client.query(
        `SELECT id_participante FROM participante_chat WHERE id_chat=$1 AND id_usuario=$2 LIMIT 1`, [id_chat, id_usuario]);
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