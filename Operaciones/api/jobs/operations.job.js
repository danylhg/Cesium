import { pool } from "../db.js";

/**
 * Tarea de limpieza: Borra operaciones CANCELADAS después de 24 horas.
 */
async function runCleanupJob() {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM operacion 
       WHERE estado = 'CANCELADA' 
       AND fecha_fin < NOW() - INTERVAL '1 day'`
    );
    if (rowCount > 0) {
      console.log(`[JOB] Limpieza: Se eliminaron ${rowCount} operaciones canceladas.`);
    }
  } catch (err) {
    console.error("[JOB] Error en limpieza de operaciones canceladas:", err);
  }
}

/**
 * Tarea de activación: Pasa operaciones PLANIFICADAS a ACTIVA si ya llegó su hora.
 */
async function runActivationJob(io) {
  try {
    // 1. Buscar operaciones que deben activarse
    const { rows } = await pool.query(
      `SELECT id_operacion, nombre, codigo, creada_por 
       FROM operacion 
       WHERE estado = 'PLANIFICADA' 
       AND fecha_inicio <= NOW()`
    );

    for (const op of rows) {
      console.log(`[JOB] Activando operación automáticamente: ${op.nombre} (${op.codigo})`);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 2. Cambiar estado a ACTIVA
        await client.query(
          `UPDATE operacion 
           SET estado = 'ACTIVA', fecha_inicio = NOW() 
           WHERE id_operacion = $1`,
          [op.id_operacion]
        );

        // 3. Asegurar que existe el chat y activarlo
        const { rows: chatRows } = await client.query(
          `INSERT INTO chat_operacion (id_operacion) 
           VALUES ($1) 
           ON CONFLICT (id_operacion) DO UPDATE SET activo = TRUE 
           RETURNING id_chat`,
          [op.id_operacion]
        );
        const id_chat = chatRows[0].id_chat;

        // 4. Crear un mensaje del sistema informando la activación automática
        // Intentamos encontrar un participante (el creador)
        const { rows: partRows } = await client.query(
          `INSERT INTO participante_chat (id_chat, tipo, id_usuario) 
           VALUES ($1, 'USUARIO', $2) 
           ON CONFLICT (id_chat, id_usuario) DO NOTHING 
           RETURNING id_participante`,
          [id_chat, op.creada_por]
        );
        
        let id_participante = partRows[0]?.id_participante;
        if (!id_participante) {
          const { rows: exPart } = await client.query(
            `SELECT id_participante FROM participante_chat 
             WHERE id_chat = $1 AND id_usuario = $2 LIMIT 1`,
            [id_chat, op.creada_por]
          );
          id_participante = exPart[0]?.id_participante;
        }

        if (id_participante) {
          await client.query(
            `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje) 
             VALUES ($1, $2, $3, 'SISTEMA')`,
            [
              id_chat,
              id_participante,
              `SISTEMA: Operación activada automáticamente según horario programado.`
            ]
          );
        }

        await client.query("COMMIT");

        // 5. Notificar por Socket
        if (io) {
          io.emit("operation_activated", {
            id_operacion: op.id_operacion,
            nombre: op.nombre,
            codigo: op.codigo
          });
          // También notificar a la sala específica de la operación si existe
          io.to(`operacion_${op.id_operacion}`).emit("status_changed", {
            id_operacion: op.id_operacion,
            nuevo_estado: "ACTIVA"
          });
        }
      } catch (innerErr) {
        await client.query("ROLLBACK");
        console.error(`[JOB] Error activando op ${op.id_operacion}:`, innerErr);
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error("[JOB] Error en activación de operaciones:", err);
  }
}

/**
 * Inicializa los jobs del sistema.
 */
export function initJobs(io) {
  console.log("[JOB] Inicializando tareas programadas...");

  // Revisar activaciones cada 30 segundos
  setInterval(() => runActivationJob(io), 30000);

  // Revisar limpieza cada hora
  setInterval(() => runCleanupJob(), 3600000);

  // Ejecución inmediata inicial
  runActivationJob(io);
  runCleanupJob();
}
