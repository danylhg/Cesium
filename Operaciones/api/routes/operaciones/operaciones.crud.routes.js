// Importa Router de Express para declarar endpoints modulares
import { Router } from "express";

// Pool de PostgreSQL para ejecutar consultas
import { pool } from "../../db.js";

// Middleware que obliga a que el usuario esté autenticado
import { requireAuth } from "../../middlewares/auth.js";

// Helper para responder errores de BD / backend de forma consistente
import { sendDbError } from "../../utils/dbErrors.js";

// Helper para validar si un valor es entero válido
import { isInt } from "../../utils/validators.js";

// Crea una instancia de router para exportar este módulo
const router = Router();


// =========================================================
// GET /ops
// Qué hace:
//   Lista todas las operaciones registradas en la tabla operacion.
// Qué devuelve:
//   Campos básicos de cada operación:
//   - id_operacion
//   - codigo
//   - nombre
//   - descripcion
//   - prioridad
//   - estado
//   - fechas
//   - creada_por
// Orden:
//   Las más recientes primero según id_operacion DESC.
// Uso típico:
//   menú inicial / listado de operaciones.
// =========================================================
router.get("/ops", requireAuth, async (req, res) => {
  try {
    // Consulta todas las operaciones con sus datos principales
    const { rows } = await pool.query(
      `SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado,
              fecha_inicio, fecha_fin, fecha_creacion, creada_por
       FROM operacion
       ORDER BY id_operacion DESC`
    );

    // Respuesta con arreglo de operaciones
    res.json({ ok: true, items: rows });
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({
        ok: false,
        mensaje: "Ya existe una operación con ese nombre."
      });
    }
    if (err?.code === "23505") {
      return res.status(409).json({
        ok: false,
        mensaje: "Ya existe una operación con ese nombre."
      });
    }
    // Manejo uniforme de error
    sendDbError(res, err, "Error listando ops");
  }
});


// =========================================================
// GET /ops/by-codigo/:codigo
// Qué hace:
//   Busca una operación específica por su código único.
// Qué devuelve:
//   Una sola operación si existe.
// Si no existe:
//   Responde 404.
// Uso típico:
//   búsquedas por código tipo OP-XXXX.
// =========================================================
router.get("/ops/by-codigo/:codigo", requireAuth, async (req, res) => {
  // Toma el código desde la URL
  const codigo = req.params.codigo;

  try {
    // Busca una operación exacta por código
    const { rows } = await pool.query(
      `SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado,
              fecha_inicio, fecha_fin, fecha_creacion, creada_por
       FROM operacion
       WHERE codigo = $1
       LIMIT 1`,
      [codigo]
    );

    // Si no encontró ninguna, responde 404
    if (!rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Operación no existe" });
    }

    // Devuelve directamente el objeto de la operación
    res.json(rows[0]);
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error por código");
  }
});


// =========================================================
// GET /ops/:id
// Qué hace:
//   Busca una operación específica por id_operacion.
// Qué devuelve:
//   Una sola operación si existe.
// Validaciones:
//   - el id debe ser entero
//   - si no existe, responde 404
// Uso típico:
//   cargar detalle básico de una operación.
// =========================================================
router.get("/ops/:id", requireAuth, async (req, res) => {
  // Convierte :id a número
  const id = Number(req.params.id);

  // Valida que sea entero
  if (!isInt(id)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  try {
    // Busca la operación por id primario
    const { rows } = await pool.query(
      `SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado,
              fecha_inicio, fecha_fin, fecha_creacion, creada_por
       FROM operacion
       WHERE id_operacion = $1
       LIMIT 1`,
      [id]
    );

    // Si no existe, responde 404
    if (!rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Operación no existe" });
    }

    // Devuelve directamente la operación encontrada
    res.json(rows[0]);
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error obteniendo operación");
  }
});


// =========================================================
// POST /ops
// Qué hace:
//   Crea una nueva operación en la tabla operacion.
// Campos esperados en body:
//   - nombre (obligatorio)
//   - descripcion (opcional)
//   - prioridad (opcional; default MEDIA)
//   - fecha_inicio (opcional)
// Lógica extra:
//   - genera automáticamente un código tipo OP-{timestamp}
//   - toma creada_por desde el usuario autenticado
//   - fecha_fin se guarda inicialmente como null
// Validaciones:
//   - nombre obligatorio
//   - prioridad debe ser BAJA/MEDIA/ALTA
//   - fecha_inicio debe ser válida si viene
// =========================================================
router.post("/ops", requireAuth, async (req, res) => {
  try {
    // Extrae datos desde el body
    const { nombre, descripcion, prioridad, fecha_inicio } = req.body ?? {};

    // nombre es obligatorio
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
    }

    // Normaliza prioridad a mayúsculas y pone MEDIA por default
    const prio = (prioridad || "MEDIA").toString().toUpperCase();

    // Valida catálogo permitido de prioridad
    if (!["BAJA", "MEDIA", "ALTA"].includes(prio)) {
      return res.status(400).json({
        ok: false,
        mensaje: "prioridad inválida (BAJA|MEDIA|ALTA)"
      });
    }

    // Intenta convertir fecha_inicio a Date si viene
    const fi = fecha_inicio ? new Date(fecha_inicio) : null;

    // Si vino una fecha inválida, corta
    if (fi && Number.isNaN(fi.getTime())) {
      return res.status(400).json({ ok: false, mensaje: "fecha_inicio inválida" });
    }

    // Genera un código único simple con timestamp actual
    const codigo = `OP-${Date.now()}`;

    // El usuario autenticado será el creador
    const creada_por = Number(req.user.sub);

    // Inserta la operación nueva
    const { rows } = await pool.query(
      `INSERT INTO operacion (codigo, nombre, descripcion, prioridad, fecha_inicio, fecha_fin, creada_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id_operacion, codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, fecha_creacion`,
      [
        codigo,                                // código generado automáticamente
        nombre.trim(),                         // nombre limpio
        (descripcion || "").trim() || null,    // descripción opcional
        prio,                                  // prioridad validada
        fi ? fi.toISOString() : null,          // fecha_inicio normalizada
        null,                                  // fecha_fin inicia vacía
        creada_por                             // usuario creador
      ]
    );

    // Devuelve la operación recién creada
    res.json(rows[0]);
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error creando operación");
  }
});


// =========================================================
// PUT /ops/:id
// Qué hace:
//   Actualiza una operación existente.
// Restricción importante:
//   Solo permite editar operaciones en estado PLANIFICADA.
// Campos editables:
//   - nombre
//   - descripcion
//   - prioridad
//   - fecha_inicio
// No cambia:
//   - código
//   - fecha_fin
//   - creada_por
//   - estado (aquí no se toca)
// Validaciones:
//   - id válido
//   - operación existente
//   - estado PLANIFICADA
//   - nombre obligatorio
//   - prioridad válida
//   - fecha_inicio válida
// =========================================================
router.put("/ops/:id", requireAuth, async (req, res) => {
  // Convierte id de la URL a número
  const id_operacion = Number(req.params.id);

  // Valida que sea entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  try {
    // Extrae los datos editables desde el body
    const { nombre, descripcion, prioridad, fecha_inicio } = req.body ?? {};

    // Primero revisa si la operación existe y cuál es su estado
    const { rows: currentRows } = await pool.query(
      "SELECT id_operacion, estado, fecha_fin FROM operacion WHERE id_operacion = $1",
      [id_operacion]
    );

    // Si no existe, responde 404
    if (currentRows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "La operación no existe" });
    }

    // Solo deja editar operaciones planificadas
    if (currentRows[0].estado !== "PLANIFICADA") {
      return res.status(400).json({
        ok: false,
        mensaje: "Solo se pueden editar operaciones en estado PLANIFICADA"
      });
    }

    // nombre sigue siendo obligatorio
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
    }

    // Normaliza prioridad y pone MEDIA por default si no vino
    const prio = (prioridad || "MEDIA").toString().toUpperCase();

    // Valida catálogo permitido
    if (!["BAJA", "MEDIA", "ALTA"].includes(prio)) {
      return res.status(400).json({
        ok: false,
        mensaje: "prioridad inválida (BAJA|MEDIA|ALTA)"
      });
    }

    // Convierte fecha_inicio si viene
    const fi = fecha_inicio ? new Date(fecha_inicio) : null;

    // Si la fecha es inválida, corta
    if (fi && Number.isNaN(fi.getTime())) {
      return res.status(400).json({ ok: false, mensaje: "fecha_inicio inválida" });
    }

    // Si la nueva fecha_inicio supera la fecha_fin almacenada, limpia fecha_fin para
    // evitar violar CHECK (fecha_fin >= fecha_inicio). El usuario deberá reasignarla.
    const currentFechaFin = currentRows[0].fecha_fin ? new Date(currentRows[0].fecha_fin) : null;
    const newFechaFin = (fi && currentFechaFin && fi > currentFechaFin) ? null : currentFechaFin;

    // Actualiza solo los campos permitidos
    const { rows } = await pool.query(
      `UPDATE operacion
       SET nombre = $1, descripcion = $2, prioridad = $3, fecha_inicio = $4, fecha_fin = $5
       WHERE id_operacion = $6
       RETURNING id_operacion, codigo, nombre, descripcion, prioridad, fecha_inicio, fecha_fin, fecha_creacion, estado`,
      [
        nombre.trim(),                              // nuevo nombre
        (descripcion || "").trim() || null,         // nueva descripción o null
        prio,                                       // prioridad validada
        fi ? fi.toISOString() : null,               // nueva fecha_inicio
        newFechaFin ? newFechaFin.toISOString() : null, // fecha_fin ajustada
        id_operacion                                // id a modificar
      ]
    );

    // Devuelve la operación actualizada
    res.json(rows[0]);
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error actualizando operación");
  }
});

// Exporta el router para usarlo en el archivo principal de rutas
export default router;
