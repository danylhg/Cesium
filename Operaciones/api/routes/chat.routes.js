// Importa Router de Express para declarar rutas agrupadas
import { Router } from "express";

// Pool de PostgreSQL para ejecutar consultas
import { pool } from "../db.js";

// Middleware que exige autenticación antes de entrar a estas rutas
import { requireAuth } from "../middlewares/auth.js";

// Helper para responder errores de BD/backend de forma uniforme
import { sendDbError } from "../utils/dbErrors.js";

// Helper para validar enteros
import { isInt } from "../utils/validators.js";

// Crea la instancia del router que se exportará al final
const router = Router();


// ===============================
// CHAT / MENSAJES
// ===============================


// =========================================================
// GET /ops/:id/chat
// Qué hace:
//   Devuelve el feed de mensajes del chat de una operación.
// Además:
//   Aplica filtro de visibilidad según el rol del usuario autenticado.
// Reglas:
//   - ADMIN y CUT ven todo
//   - otros roles solo ven:
//       * mensajes GLOBAL
//       * mensajes dirigidos a su rol
//       * mensajes dirigidos a CELL,CET si son CELL o CET
//       * mensajes donde ellos mismos son el autor/actor
// Fuente:
//   Lee desde la vista v_chat_feed.
// =========================================================
router.get("/ops/:id/chat", requireAuth, async (req, res) => {
  // Convierte id de operación desde la URL
  const id_operacion = Number(req.params.id);

  // Valida que sea entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  // Id del actor autenticado
  const id_actor = Number(req.user.sub);

  // Rol del usuario autenticado
  const user_role = req.user.rol;

  // Indica si el actor pertenece a la tabla personal
  const isPersonal = req.user.tabla === "personal";

  try {
    // Query base: todos los mensajes del feed de esta operación
    let query = `SELECT * FROM v_chat_feed WHERE id_operacion = $1`;
    let params = [id_operacion];

    // Si no es ADMIN ni CUT, aplica filtro de visibilidad
    if (user_role !== 'ADMIN' && user_role !== 'CUT') {
      // Dependiendo si el actor es personal o usuario,
      // la comparación se hace contra id_personal o id_usuario
      const colActor = isPersonal ? 'id_personal' : 'id_usuario';

      // Solo puede ver:
      // - GLOBAL
      // - mensajes dirigidos exactamente a su rol
      // - mensajes compartidos CELL,CET si su rol es CELL o CET
      // - mensajes donde su id coincide con el actor del mensaje
      query += ` AND (
        destinatario_rol = 'GLOBAL'
        OR destinatario_rol = $2
        OR (destinatario_rol = 'CELL,CET' AND $2 IN ('CELL', 'CET'))
        OR (${colActor} = $3)
      )`;

      // Agrega parámetros del filtro
      params.push(user_role, id_actor);
    }

    // Ordena cronológicamente ascendente
    query += ` ORDER BY fecha_envio ASC`;

    // Ejecuta la consulta final
    const { rows } = await pool.query(query, params);

    // Responde con el feed filtrado
    res.json({ ok: true, items: rows });
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error obteniendo chat");
  }
});


// =========================================================
// POST /ops/:id/chat
// Qué hace:
//   Inserta un nuevo mensaje en el chat de la operación.
// Flujo:
//   1. valida operación
//   2. valida contenido, tipo_mensaje y destinatario
//   3. verifica que exista un chat activo
//   4. obtiene o crea participante_chat para el actor actual
//   5. inserta mensaje_chat
//   6. consulta el mensaje enriquecido desde v_chat_feed
//   7. emite evento socket "chat_message" al room de la operación
// Nota:
//   Esta es la versión vieja del endpoint de chat.
// =========================================================
router.post("/ops/:id/chat", requireAuth, async (req, res) => {
  // Convierte id de operación a número
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  // Contenido del mensaje, limpio
  const contenido = (req.body?.contenido || "").toString().trim();

  // Tipo de mensaje: NORMAL, URGENTE o SISTEMA
  const tipo_mensaje = (req.body?.tipo_mensaje || "NORMAL").toString().toUpperCase();

  // Rol destinatario del mensaje; por default GLOBAL
  const destinatario_rol = (req.body?.destinatario_rol || "GLOBAL").toString().toUpperCase();

  // contenido es obligatorio
  if (!contenido) {
    return res.status(400).json({ ok: false, mensaje: "Falta contenido" });
  }

  // Valida catálogo de tipo_mensaje
  if (!["NORMAL", "URGENTE", "SISTEMA"].includes(tipo_mensaje)) {
    return res.status(400).json({ ok: false, mensaje: "tipo_mensaje invalido" });
  }

  // Detecta si el actor es personal
  const esPersonal = req.user.tabla === "personal";

  // Id del actor autenticado
  const id_actor = Number(req.user.sub);

  // Conexión manual por transacción
  const client = await pool.connect();

  try {
    // Inicia transacción
    await client.query("BEGIN");

    // Busca chat activo de la operación
    const { rows: cr } = await client.query(
      `SELECT id_chat FROM chat_operacion WHERE id_operacion=$1 AND activo=TRUE LIMIT 1`,
      [id_operacion]
    );

    // Si no hay chat activo, responde 409
    if (!cr[0]) {
      await client.query("ROLLBACK");
      return res.status(409).json({ ok: false, mensaje: "El chat no esta activo o no existe" });
    }

    // Id del chat encontrado
    const id_chat = cr[0].id_chat;

    // Según el tipo de actor se usa id_personal o id_usuario
    const col = esPersonal ? "id_personal" : "id_usuario";
    const tipo = esPersonal ? "PERSONAL" : "USUARIO";

    // Intenta insertar participante_chat para este actor
    const { rows: pr } = await client.query(
      `INSERT INTO participante_chat (id_chat, tipo, ${col}) VALUES ($1,$2,$3)
       ON CONFLICT (id_chat, ${col}) DO NOTHING RETURNING id_participante`,
      [id_chat, tipo, id_actor]
    );

    // Si se insertó, toma el id nuevo
    let id_participante = pr[0]?.id_participante;

    // Si no se insertó, es porque ya existía; entonces lo consulta
    if (!id_participante) {
      const { rows: ex } = await client.query(
        `SELECT id_participante FROM participante_chat WHERE id_chat=$1 AND ${col}=$2 LIMIT 1`,
        [id_chat, id_actor]
      );
      id_participante = ex[0]?.id_participante;
    }

    // Inserta el mensaje en la tabla mensaje_chat
    const { rows: msgRows } = await client.query(
      `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje, destinatario_rol)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id_chat, id_participante, contenido, tipo_mensaje, destinatario_rol]
    );

    // Confirma transacción
    await client.query("COMMIT");

    // Busca el mensaje ya enriquecido desde la vista v_chat_feed
    const { rows: feedRows } = await pool.query(
      `SELECT * FROM v_chat_feed WHERE id_mensaje = $1 LIMIT 1`,
      [msgRows[0].id_mensaje]
    );

    // Usa la versión enriquecida si existe; si no, usa la cruda
    const messageToBroadcast = feedRows[0] || msgRows[0];

    // Obtiene instancia de socket.io guardada en la app
    const io = req.app.get("io");

    // Emite el evento al room de la operación (agrega autor_rol para que el dashboard filtre por tab)
    io.to(`op_${id_operacion}`).emit("chat_message", { ...messageToBroadcast, autor_rol: req.user.rol });

    // Devuelve el mensaje enviado
    res.json({ ok: true, mensaje: { ...messageToBroadcast, autor_rol: req.user.rol } });
  } catch (err) {
    // Revierte si algo falla
    await client.query("ROLLBACK");
    sendDbError(res, err, "Error enviando mensaje");
  } finally {
    // Libera conexión
    client.release();
  }
});


// ===============================
// AVISOS OPERACIONALES
// ===============================


// =========================================================
// GET /ops/:id/avisos
// Qué hace:
//   Lista todos los avisos operacionales de una operación.
// Además:
//   Enriquecer el resultado con:
//   - apodo y rol del emisor
//   - apodo del receptor personal
//   - nombre del receptor usuario
// Orden:
//   más recientes primero.
// =========================================================
router.get("/ops/:id/avisos", requireAuth, async (req, res) => {
  // Convierte id_operacion
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    // Consulta avisos con joins para emisor y receptores
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

    // Devuelve lista de avisos
    res.json({ ok: true, items: rows });
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error obteniendo avisos");
  }
});


// =========================================================
// POST /ops/:id/avisos
// Qué hace:
//   Crea un nuevo aviso operacional dentro de una operación.
// Campos esperados:
//   - id_personal_emisor
//   - tipo_aviso
//   - contenido
//   - tipo_receptor (opcional)
//   - id_personal_receptor (opcional)
//   - id_usuario_receptor (opcional)
// Validaciones:
//   - id_personal_emisor obligatorio
//   - contenido obligatorio
//   - tipo_aviso dentro del catálogo permitido
// Nota:
//   Aquí no se valida si el emisor realmente pertenece a la operación.
// =========================================================
router.post("/ops/:id/avisos", requireAuth, async (req, res) => {
  // Convierte id_operacion
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  // Extrae datos del body
  const {
    id_personal_emisor,
    tipo_aviso,
    contenido,
    tipo_receptor,
    id_personal_receptor,
    id_usuario_receptor
  } = req.body ?? {};

  // Emisor obligatorio
  if (!isInt(Number(id_personal_emisor))) {
    return res.status(400).json({ ok: false, mensaje: "Falta id_personal_emisor" });
  }

  // Contenido obligatorio
  if (!contenido?.toString().trim()) {
    return res.status(400).json({ ok: false, mensaje: "Falta contenido" });
  }

  // Catálogo de tipos válidos
  const tiposValidos = ["NOVEDAD", "CONTACTO", "EMERGENCIA", "INFORMATIVO"];

  // Normaliza tipo_aviso
  const tipo = (tipo_aviso || "INFORMATIVO").toString().toUpperCase();

  // Valida catálogo
  if (!tiposValidos.includes(tipo)) {
    return res.status(400).json({ ok: false, mensaje: "tipo_aviso invalido" });
  }

  try {
    // Inserta el aviso en la tabla aviso_operacion
    const { rows } = await pool.query(
      `INSERT INTO aviso_operacion
         (id_operacion, id_personal_emisor, tipo_aviso, contenido, tipo_receptor, id_personal_receptor, id_usuario_receptor)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        id_operacion,
        Number(id_personal_emisor),
        tipo,
        contenido.toString().trim(),
        tipo_receptor || null,
        id_personal_receptor ? Number(id_personal_receptor) : null,
        id_usuario_receptor ? Number(id_usuario_receptor) : null
      ]
    );

    // Respuesta con el aviso creado
    res.json({ ok: true, aviso: rows[0] });
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error creando aviso");
  }
});


// =========================================================
// PATCH /ops/:id/avisos/:id_aviso
// Qué hace:
//   Actualiza el estado de un aviso operacional.
// Estados permitidos:
//   - RECIBIDO
//   - ATENDIDO
// Además:
//   guarda fecha_atencion = NOW()
// Nota:
//   No valida aquí que el aviso pertenezca a la operación del path.
// =========================================================
router.patch("/ops/:id/avisos/:id_aviso", requireAuth, async (req, res) => {
  // Convierte id_aviso
  const id_aviso = Number(req.params.id_aviso);

  // Valida entero
  if (!isInt(id_aviso)) {
    return res.status(400).json({ ok: false, mensaje: "id_aviso invalido" });
  }

  // Toma estado nuevo desde body y lo normaliza
  const estado = (req.body?.estado || "ATENDIDO").toString().toUpperCase();

  // Solo permite RECIBIDO o ATENDIDO
  if (!["RECIBIDO", "ATENDIDO"].includes(estado)) {
    return res.status(400).json({ ok: false, mensaje: "estado invalido" });
  }

  try {
    // Actualiza estado y fecha_atencion
    const { rows } = await pool.query(
      `UPDATE aviso_operacion SET estado=$1, fecha_atencion=NOW()
       WHERE id_aviso=$2 RETURNING *`,
      [estado, id_aviso]
    );

    // Si no existe el aviso, 404
    if (!rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Aviso no existe" });
    }

    // Responde con el aviso actualizado
    res.json({ ok: true, aviso: rows[0] });
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error actualizando aviso");
  }
});


// ===============================
// MENSAJES (patrón nuevo /chat/messages)
// ===============================


// =========================================================
// GET /ops/:id/chat/messages
// Qué hace:
//   Devuelve los mensajes del chat de una operación usando
//   un formato más directo que el endpoint viejo.
// Flujo:
//   1. busca el chat de la operación
//   2. si no existe, regresa arreglo vacío
//   3. trae mensajes con autor resuelto
// Orden:
//   por fecha_envio e id_mensaje ascendente.
// Nota:
//   Este endpoint no aplica el filtro de visibilidad por rol
//   que sí tiene GET /ops/:id/chat.
// =========================================================
router.get("/ops/:id/chat/messages", requireAuth, async (req, res) => {
  // Convierte id_operacion
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  try {
    // Busca el chat asociado a la operación
    const chatRes = await pool.query(
      `SELECT id_chat FROM chat_operacion WHERE id_operacion = $1 LIMIT 1`,
      [id_operacion]
    );

    // Si no hay chat, devuelve lista vacía
    if (chatRes.rowCount === 0) {
      return res.json({ ok: true, items: [] });
    }

    // Id del chat encontrado
    const id_chat = chatRes.rows[0].id_chat;

    // Consulta los mensajes del chat con información del autor
    const { rows } = await pool.query(
      `
      SELECT
        m.id_mensaje,
        m.id_chat,
        m.contenido,
        m.tipo_mensaje,
        m.fecha_envio,
        m.destinatario_rol,
        pc.tipo AS tipo_participante,
        pc.id_usuario,
        pc.id_personal,

        -- Rol del autor (para filtrado y coloreado en UI)
        COALESCE(u.rol::text, p.rol::text) AS autor_rol,

        -- Resuelve nombre del autor:
        -- primero usuario, luego personal, y si no hay, "Sistema"
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
        AND m.contenido NOT ILIKE 'OPERACION % automáticamente por trigger de BD.'
        AND m.contenido NOT ILIKE 'OPERACION % automÃ¡ticamente por trigger de BD.'
      ORDER BY m.fecha_envio ASC, m.id_mensaje ASC
      `,
      [id_chat]
    );

    // Responde con los mensajes
    return res.json({ ok: true, items: rows });
  } catch (err) {
    return sendDbError(res, err, "Error obteniendo mensajes del chat");
  }
});


// =========================================================
// POST /ops/:id/chat/messages
// Qué hace:
//   Inserta un nuevo mensaje usando el patrón nuevo /chat/messages.
// Flujo:
//   1. valida operación
//   2. valida contenido y tipo_mensaje
//   3. busca el chat de la operación
//   4. crea/actualiza participante_chat del actor actual
//   5. inserta mensaje_chat
//   6. resuelve datos del autor
//   7. emite socket "chat_message"
// =========================================================
router.post("/ops/:id/chat/messages", requireAuth, async (req, res) => {
  // Convierte id_operacion
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  try {
    // Limpia contenido
    const contenido = String(req.body?.contenido || "").trim();

    // Tipo de mensaje normalizado
    const tipo_mensaje = String(req.body?.tipo_mensaje || "NORMAL").toUpperCase();

    // Destinatario del mensaje (tab activo del dashboard)
    const destinatario_rol = String(req.body?.destinatario_rol || "GLOBAL").toUpperCase();

    // contenido obligatorio
    if (!contenido) {
      return res.status(400).json({ ok: false, mensaje: "contenido vacío" });
    }

    // Valida catálogo de tipo_mensaje
    if (!["NORMAL", "SISTEMA", "URGENTE"].includes(tipo_mensaje)) {
      return res.status(400).json({ ok: false, mensaje: "tipo_mensaje inválido" });
    }

    // Busca el chat asociado a la operación
    const chatRes = await pool.query(
      `SELECT id_chat FROM chat_operacion WHERE id_operacion = $1 LIMIT 1`,
      [id_operacion]
    );

    // Si no hay chat, responde 404
    if (chatRes.rowCount === 0) {
      return res.status(404).json({ ok: false, mensaje: "La operación no tiene chat" });
    }

    // Id del chat
    const id_chat = chatRes.rows[0].id_chat;

    // Aquí se guardará el participante del actor actual
    let id_participante = null;

    // Si el actor viene de tabla usuario
    if (req.user.tabla === "usuario") {
      // Inserta/actualiza participante_chat por id_usuario
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
      // Si el actor viene de tabla personal
      // inserta/actualiza participante_chat por id_personal
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

    // Inserta mensaje en mensaje_chat
    const ins = await pool.query(
      `
      INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje, destinatario_rol)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id_mensaje, id_chat, contenido, tipo_mensaje, fecha_envio, destinatario_rol
      `,
      [id_chat, id_participante, contenido, tipo_mensaje, destinatario_rol]
    );

    // Consulta información del autor
    const autorRes = await pool.query(
      `
      SELECT
        pc.tipo AS tipo_participante,
        pc.id_usuario,
        pc.id_personal,
        COALESCE(u.rol::text, p.rol::text) AS autor_rol,
        COALESCE(
          u.nombre || ' ' || u.apellido,
          p.nombre || ' ' || p.apellido,
          'Sistema'
        ) AS autor_nombre
      FROM participante_chat pc
      LEFT JOIN usuario u ON u.id_usuario = pc.id_usuario
      LEFT JOIN personal p ON p.id_personal = pc.id_personal
      WHERE pc.id_participante = $1
      LIMIT 1
      `,
      [id_participante]
    );

    // Construye payload final mezclando mensaje + autor
    const payload = {
      ...ins.rows[0],
      ...(autorRes.rows[0] || {})
    };

    // Emite el evento al room socket de la operación
    const io = req.app.get("io");
    io.to(`op_${id_operacion}`).emit("chat_message", payload);

    // Respuesta final
    return res.json({ ok: true, item: payload });
  } catch (err) {
    return sendDbError(res, err, "Error enviando mensaje");
  }
});

// Exporta el router para montarlo en app/server
export default router;
