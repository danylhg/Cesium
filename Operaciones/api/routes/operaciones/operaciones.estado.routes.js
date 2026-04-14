// Importa Router de Express para definir rutas modulares
import { Router } from "express";

// Pool de PostgreSQL para ejecutar queries
import { pool } from "../../db.js";

// Middleware que exige autenticación antes de usar la ruta
import { requireAuth } from "../../middlewares/auth.js";

// Helper para responder errores de BD/backend de forma consistente
import { sendDbError } from "../../utils/dbErrors.js";

// Helper para validar enteros
import { isInt } from "../../utils/validators.js";

// Crea la instancia de router que se exportará al final
const router = Router();


// =========================================================
// PATCH /ops/:id/estado
// Qué hace:
//   Cambia el estado de una operación.
// Estados válidos:
//   - PLANIFICADA
//   - ACTIVA
//   - CERRADA
//   - CANCELADA
//
// Además:
//   - valida transiciones permitidas
//   - si pasa a ACTIVA, abre/activa chat y genera mensaje automático
//   - si pasa a CANCELADA, libera recursos/asignaciones
//   - si pasa a CERRADA, conserva asignaciones para historial
//   - si pasa a CERRADA, genera mensaje automático de cierre
//   - si cierra/cancela, desactiva el chat
//
// Transiciones permitidas:
//   PLANIFICADA -> ACTIVA | CANCELADA
//   ACTIVA      -> CERRADA | CANCELADA
//   CERRADA     -> ninguna
//   CANCELADA   -> ninguna
// =========================================================
router.patch("/ops/:id/estado", requireAuth, async (req, res) => {
  // Convierte el parámetro :id a número
  const id_operacion = Number(req.params.id);

  // Valida que sea entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  // Toma el nuevo estado desde el body y lo normaliza a mayúsculas
  const nuevoEstado = (req.body?.estado || "").toString().toUpperCase();

  // Catálogo de estados permitidos desde esta ruta
  const estadosValidos = ["PLANIFICADA", "ACTIVA", "CERRADA", "CANCELADA"];

  // Si el estado no está en el catálogo, responde 400
  if (!estadosValidos.includes(nuevoEstado)) {
    return res.status(400).json({
      ok: false,
      mensaje: `estado invalido (${estadosValidos.join("|")})`
    });
  }

  // Abre conexión manual porque aquí se usa transacción
  const client = await pool.connect();
  try {
    // Inicia transacción
    await client.query("BEGIN");

    // Busca la operación actual para conocer:
    // - su estado actual
    // - nombre
    // - código
    const { rows: opRows } = await client.query(
      `SELECT estado, nombre, codigo FROM operacion WHERE id_operacion = $1 LIMIT 1`,
      [id_operacion]
    );

    // Si no existe la operación, rollback + 404
    if (!opRows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, mensaje: "Operacion no existe" });
    }

    // Extrae valores actuales de la operación
    const {
      estado: estadoActual,
      nombre: nombreOp,
      codigo: codigoOp
    } = opRows[0];

    // Define la máquina de estados permitida
    const transiciones = {
      PLANIFICADA: ["ACTIVA", "CANCELADA"],
      ACTIVA: ["CERRADA", "CANCELADA"],
      CERRADA: [],
      CANCELADA: []
    };

    // Si la transición actual -> nuevo estado no está permitida, responde 409
    if (!transiciones[estadoActual]?.includes(nuevoEstado)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        mensaje: `No se puede pasar de ${estadoActual} a ${nuevoEstado}`
      });
    }

    // Helper local para formatear la hora oficial del mensaje automático
    // usando zona horaria de México
    const horaStr = () =>
      new Date().toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        dateStyle: "long",
        timeStyle: "short"
      });

    // Detecta si el actor autenticado pertenece a la tabla personal
    const esPersonal = req.user.tabla === "personal";

    // Id del actor autenticado
    const id_actor = Number(req.user.sub);

    // =========================================================
    // Helper local:
    // getOrCreateParticipante(id_chat, id_actor, esPersonal)
    //
    // Qué hace:
    //   Busca o crea un participante_chat para el actor actual
    //   dentro del chat de la operación.
    //
    // Si el actor es personal:
    //   usa tipo PERSONAL e id_personal
    //
    // Si el actor es usuario:
    //   usa tipo USUARIO e id_usuario
    //
    // Devuelve:
    //   id_participante
    // =========================================================
    async function getOrCreateParticipante(id_chat, id_actor, esPersonal) {
      // Según el tipo de actor decide qué columna usar
      const col = esPersonal ? "id_personal" : "id_usuario";
      const tipo = esPersonal ? "PERSONAL" : "USUARIO";

      // Intenta insertarlo
      const { rows } = await client.query(
        `INSERT INTO participante_chat (id_chat, tipo, ${col}) VALUES ($1,$2,$3)
         ON CONFLICT (id_chat, ${col}) DO NOTHING RETURNING id_participante`,
        [id_chat, tipo, id_actor]
      );

      // Si sí se insertó, devuelve el id nuevo
      if (rows[0]) return rows[0].id_participante;

      // Si no se insertó, es porque ya existía; lo consulta
      const { rows: ex } = await client.query(
        `SELECT id_participante FROM participante_chat WHERE id_chat=$1 AND ${col}=$2 LIMIT 1`,
        [id_chat, id_actor]
      );

      // Devuelve el existente si lo encontró
      return ex[0]?.id_participante;
    }

    // =========================================================
    // Si la operación se va a CERRADA o CANCELADA:
    //   - cierra chat
    //   - si es CERRADA, conserva asignaciones y agrega mensaje de cierre
    //   - si es CANCELADA, libera recursos/asignaciones
    // =========================================================
    if (nuevoEstado === "CERRADA" || nuevoEstado === "CANCELADA") {
      if (nuevoEstado === "CANCELADA") {
        // Timestamp actual en formato ISO
        const ahora = new Date().toISOString();

        // Libera a todo el personal asignado a la operación
        // y marca fecha_fin_asignacion
        await client.query(
          `UPDATE asignacion_operacion_personal
           SET estado_asignacion = 'LIBERADO', fecha_fin_asignacion = $1
           WHERE id_operacion = $2 AND estado_asignacion != 'LIBERADO'`,
          [ahora, id_operacion]
        );

        // Libera todos los vehículos asignados a la operación
        // y marca fecha_fin_asignacion
        await client.query(
          `UPDATE vehiculo_operacion
           SET estado_asignacion = 'LIBERADO', fecha_fin_asignacion = $1
           WHERE id_operacion = $2 AND estado_asignacion != 'LIBERADO'`,
          [ahora, id_operacion]
        );

        // Libera todos los equipos reservados/asignados a la operación
        await client.query(
          `UPDATE operacion_equipo
           SET estado_asignacion = 'LIBERADO'
           WHERE id_operacion = $1 AND estado_asignacion != 'LIBERADO'`,
          [id_operacion]
        );
      }

      // Busca el chat activo actual de la operación
      const { rows: cr } = await client.query(
        `SELECT id_chat FROM chat_operacion WHERE id_operacion = $1 AND activo = TRUE LIMIT 1`,
        [id_operacion]
      );

      // Si existe chat activo, lo usa para registrar el cierre/cancelación
      if (cr[0]) {
        const id_chat = cr[0].id_chat;

        // Obtiene o crea el participante correspondiente al actor actual
        const id_p = await getOrCreateParticipante(id_chat, id_actor, esPersonal);

        // Si realmente está cerrando (no solo cancelando), inserta mensaje automático
        if (nuevoEstado === "CERRADA" && id_p) {
          await client.query(
            `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje) VALUES ($1,$2,$3,'SISTEMA')`,
            [
              id_chat,
              id_p,
              `OPERACION CERRADA\nCodigo: ${codigoOp}\nNombre: ${nombreOp}\nHora oficial de cierre: ${horaStr()}`
            ]
          );
        }

        // Desactiva el chat y marca fecha de cierre
        await client.query(
          `UPDATE chat_operacion SET activo = FALSE, fecha_cierre = NOW() WHERE id_chat = $1`,
          [id_chat]
        );
      }
    }

    // =========================================================
    // Construye dinámicamente el UPDATE de operacion
    //
    // Siempre cambia:
    //   - estado
    //
    // Si pasa a ACTIVA:
    //   - fuerza fecha_inicio = NOW()
    //
    // Si pasa a CERRADA:
    //   - fuerza fecha_fin = NOW()
    // =========================================================
    let q = `UPDATE operacion SET estado = $1`;
    const params = [nuevoEstado, id_operacion];

    if (nuevoEstado === "ACTIVA") q += `, fecha_inicio = NOW()`;
    if (nuevoEstado === "CERRADA") q += `, fecha_fin = NOW()`;
    if (nuevoEstado === "CANCELADA") {
      q += `, nombre = $3`;
      params.push(`${nombreOp} - CANCELADA`);
    }

    // Ejecuta el cambio de estado
    await client.query(q + ` WHERE id_operacion = $2`, params);

    // =========================================================
    // Si la operación pasa a ACTIVA:
    //   - crea el chat si no existe
    //   - lo deja activo
    //   - asegura al actor como participante
    //   - inserta mensaje automático de activación
    // =========================================================
    if (nuevoEstado === "ACTIVA") {
      // Inserta chat_operacion si no existe;
      // si ya existe, lo reactiva
      const { rows: cr } = await client.query(
        `INSERT INTO chat_operacion (id_operacion) VALUES ($1)
         ON CONFLICT (id_operacion) DO UPDATE SET activo=TRUE RETURNING id_chat`,
        [id_operacion]
      );

      // Id del chat creado/reactivado
      const id_chat = cr[0].id_chat;

      // Asegura al actor actual como participante del chat
      const id_participante = await getOrCreateParticipante(id_chat, id_actor, esPersonal);

      // Inserta mensaje automático de inicio de operación
      await client.query(
        `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje) VALUES ($1,$2,$3,'SISTEMA')`,
        [
          id_chat,
          id_participante,
          `OPERACION ACTIVADA\nCodigo: ${codigoOp}\nNombre: ${nombreOp}\nHora oficial de inicio: ${horaStr()}`
        ]
      );
    }

    // Confirma todos los cambios de la transacción
    await client.query("COMMIT");

    // Consulta la operación actualizada ya fuera de la transacción
    const { rows: updated } = await pool.query(
      `SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, fecha_creacion, creada_por
       FROM operacion WHERE id_operacion=$1`,
      [id_operacion]
    );

    // Devuelve operación actualizada
    return res.json({
      ok: true,
      operacion: updated[0]
    });
  } catch (err) {
    // Si algo falla, revierte todo lo hecho dentro de la transacción
    await client.query("ROLLBACK");

    // Responde error uniforme
    return sendDbError(res, err, "Error cambiando estado");
  } finally {
    // Libera la conexión al pool
    client.release();
  }
});

// Exporta el router para montarlo en el archivo principal
export default router;
