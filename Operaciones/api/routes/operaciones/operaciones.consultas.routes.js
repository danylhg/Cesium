// Importa Router de Express para definir rutas agrupadas en este módulo
import { Router } from "express";

// Pool de PostgreSQL para ejecutar queries
import { pool } from "../../db.js";

// Middleware que exige autenticación antes de entrar a cualquier endpoint
import { requireAuth } from "../../middlewares/auth.js";

// Helper para responder errores de BD de forma uniforme
import { sendDbError } from "../../utils/dbErrors.js";

// Helper para validar enteros
import { isInt } from "../../utils/validators.js";

// Crea el router que se exportará al final
const router = Router();


// =========================================================
// GET /ops/personal/:id_personal
// Qué hace:
//   Devuelve la operación activa o planificada más relevante
//   para un elemento de personal específico.
// Además:
//   Si encuentra operación, también intenta traer la zona_operacion.
// Importante:
//   Esta ruta debe declararse antes que /ops/:id para evitar que
//   Express interprete "personal" como si fuera un id.
// =========================================================
router.get("/ops/personal/:id_personal", requireAuth, async (req, res) => {
  // Convierte el parámetro a número
  const id_personal = Number(req.params.id_personal);

  // Valida que sea entero
  if (!isInt(id_personal))
    return res.status(400).json({ ok: false, mensaje: "id_personal invalido" });

  try {
    // Busca la primera operación vigente del personal:
    // - solo ACTIVA o PLANIFICADA
    // - excluye asignaciones LIBERADO
    // - prioriza ACTIVA sobre PLANIFICADA
    // - luego ordena por fecha_inicio
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

    // Si no hay operación asignada, responde 404 con operacion: null
    if (rows.length === 0)
      return res.status(404).json({
        ok: false,
        mensaje: "Sin operacion asignada",
        operacion: null
      });

    // Toma la operación encontrada
    const operacion = rows[0];

    // Busca la zona geográfica principal asociada a esa operación
    const zonaRes = await pool.query(
      `SELECT centroide_lat, centroide_lon, zoom_inicial, color, geometria
       FROM zona_operacion WHERE id_operacion = $1 LIMIT 1`,
      [operacion.id_operacion]
    );

    // Si no hay zona, quedará null
    const zona = zonaRes.rows[0] ?? null;

    // Responde con la operación y, si existe, la zona anidada
    return res.json({
      ok: true,
      operacion: {
        ...operacion,
        zona: zona
          ? {
            centroide_lat: zona.centroide_lat,
            centroide_lon: zona.centroide_lon,
            zoom_inicial: zona.zoom_inicial,
            color: zona.color,
            geometria: zona.geometria,
          }
          : null,
      },
    });
  } catch (err) {
    // Manejo uniforme de error
    return sendDbError(res, err, "Error obteniendo operacion del personal");
  }
});


// =========================================================
// GET /ops/:id/personal
// Qué hace:
//   Devuelve todo el personal asignado a una operación.
// Además intenta enriquecer cada persona con:
//   - datos base del personal
//   - rol y estado dentro de la operación
//   - grupo/subgrupo al que pertenece
//   - grupo padre (flotilla) si aplica
//   - CET de referencia para los CELL
//   - flotilla del CET
//   - bandera de miembro directo de flotilla
//   - última posición conocida desde tracking
// Uso típico:
//   alimentar panel de personal en dashboard / panorama táctico.
// =========================================================
router.get("/ops/:id/personal", requireAuth, async (req, res) => {
  // Convierte id de operación a número
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    // Query principal:
    // Parte de asignacion_operacion_personal y le va colgando
    // personal, grupos, mando y tracking.
    const { rows } = await pool.query(
      `
      SELECT DISTINCT ON (p.id_personal)
        -- Identidad base del personal
        p.id_personal,
        p.apodo,
        p.nombre,
        p.apellido,
        p.rol,
        p.puesto,

        -- Datos de la asignación dentro de la operación
        a.rol_en_operacion,
        a.estado_asignacion,

        -- Grupo al que pertenece directamente el personal
        go.id_grupo_operacion,
        go.nombre AS grupo_nombre,
        go.apodo AS grupo_apodo,

        -- Grupo padre del grupo actual, normalmente flotilla
        gp_padre.nombre AS grupo_padre_nombre,
        gp_padre.apodo AS grupo_padre_apodo,

        -- Si el grupo actual es subgrupo (tiene padre), expone su id
        CASE
          WHEN go.id_grupo_operacion IS NOT NULL AND go.id_grupo_padre IS NOT NULL THEN go.id_grupo_operacion
          ELSE NULL
        END AS grupo_hijo_id,

        -- Si el grupo actual es subgrupo, expone su nombre
        CASE
          WHEN go.id_grupo_operacion IS NOT NULL AND go.id_grupo_padre IS NOT NULL THEN go.nombre
          ELSE NULL
        END AS grupo_hijo_nombre,

        -- CET de referencia:
        -- si la persona ya es CET, ella misma es su referencia;
        -- si es CELL, se toma desde mando_operacion
        CASE
          WHEN p.rol = 'CET' THEN p.id_personal
          ELSE mo.id_cet
        END AS id_cet_ref,

        -- Apodo del CET de referencia
        CASE
          WHEN p.rol = 'CET' THEN p.apodo
          ELSE cet.apodo
        END AS cet_apodo,

        -- Nombre completo del CET de referencia
        CASE
          WHEN p.rol = 'CET' THEN CONCAT_WS(' ', p.nombre, p.apellido)
          ELSE CONCAT_WS(' ', cet.nombre, cet.apellido)
        END AS cet_nombre,

        -- Busca el nombre de la flotilla a la que pertenece el CET
        -- de referencia dentro de esta operación
        (
          SELECT cet_g.nombre
          FROM grupo_personal cet_gper
          JOIN grupo_operacion cet_g ON cet_g.id_grupo_operacion = cet_gper.id_grupo_operacion
          WHERE cet_gper.id_personal = (CASE WHEN p.rol = 'CET' THEN p.id_personal ELSE mo.id_cet END)
            AND cet_g.apodo = 'FLOTILLA'
            AND cet_g.id_operacion = a.id_operacion
          LIMIT 1
        ) AS cet_flotilla,

        -- Bandera para detectar CELL que depende de un CET
        -- pero no está metido en un subgrupo hijo;
        -- o sea, estaría directo en la flotilla
        CASE
          WHEN p.rol = 'CELL'
           AND mo.id_cet IS NOT NULL
           AND (
                go.id_grupo_operacion IS NULL
                OR go.id_grupo_padre IS NULL
               )
          THEN TRUE
          ELSE FALSE
        END AS es_miembro_directo_flotilla,

        -- Última posición conocida del personal
        t.latitud,
        t.longitud,
        t.ultima_actualizacion
      FROM asignacion_operacion_personal a

      -- Datos base del personal asignado
      JOIN personal p
        ON p.id_personal = a.id_personal

      -- Relación del personal con algún grupo
      LEFT JOIN grupo_personal gper
        ON gper.id_personal = p.id_personal
       AND EXISTS (
         -- Asegura que ese grupo pertenezca a la misma operación
         SELECT 1
         FROM grupo_operacion gpx
         WHERE gpx.id_grupo_operacion = gper.id_grupo_operacion
           AND gpx.id_operacion = a.id_operacion
       )

      -- Grupo directo del personal
      LEFT JOIN grupo_operacion go
        ON go.id_grupo_operacion = gper.id_grupo_operacion

      -- Padre del grupo directo (si existe)
      LEFT JOIN grupo_operacion gp_padre
        ON gp_padre.id_grupo_operacion = go.id_grupo_padre

      -- Relación de mando para CELL -> CET
      LEFT JOIN mando_operacion mo
        ON mo.id_operacion = a.id_operacion
       AND mo.id_cell = a.id_personal

      -- Datos del CET asociado
      LEFT JOIN personal cet
        ON cet.id_personal = mo.id_cet

      -- Estos joins parecen intentar relacionar al CET con sus grupos,
      -- aunque en esta query realmente no se usan en el SELECT final
      LEFT JOIN grupo_personal cet_gp
        ON cet_gp.id_personal = mo.id_cet

      LEFT JOIN grupo_operacion cet_go
        ON cet_go.id_grupo_operacion = cet_gp.id_grupo_operacion
       AND cet_go.id_operacion = a.id_operacion

      -- Vista con la última posición registrada del personal
      LEFT JOIN v_ultima_posicion_personal t
        ON t.id_personal = a.id_personal
       AND t.id_operacion = a.id_operacion

      -- Solo personal de esta operación y no liberado
      WHERE a.id_operacion = $1
        AND a.estado_asignacion NOT IN ('LIBERADO')

      -- Ordena agrupando primero por persona (requerido por DISTINCT ON)
      -- y luego prefiriendo registros con grupo (celula) sobre los nulos o flotillas
      ORDER BY
        p.id_personal,
        CASE WHEN go.id_grupo_padre IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN go.id_grupo_operacion IS NULL THEN 1 ELSE 0 END,
        go.id_grupo_operacion
      `,
      [id_operacion]
    );

    // Devuelve todos los registros tal cual para que frontend los organice
    return res.json({ ok: true, items: rows });
  } catch (err) {
    // Manejo uniforme de error
    return sendDbError(res, err, "Error obteniendo personal");
  }
});


// =========================================================
// GET /ops/:id/vehiculos-asignados
// Qué hace:
//   Devuelve todos los vehículos asignados a una operación.
// Además intenta enriquecer cada vehículo con:
//   - datos del vehículo
//   - uso dentro de la operación
//   - estado de asignación
//   - tipo de destino
//   - grupos/subgrupos relacionados
//   - grupo padre si existe
//   - última posición conocida de tracking
// Nota:
//   Aquí la pertenencia a grupo se reconstruye por grupo_vehiculo.
// =========================================================
router.get("/ops/:id/vehiculos-asignados", requireAuth, async (req, res) => {
  // Convierte id de operación
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    // Query para obtener vehículos con su contexto de grupo y tracking
    const { rows } = await pool.query(
      `
      WITH personal_ctx AS (
        SELECT DISTINCT ON (p.id_personal)
          p.id_personal,
          p.apodo,
          p.nombre,
          p.apellido,
          p.puesto,
          aop.rol_en_operacion AS personal_rol,
          go.id_grupo_operacion AS grupo_personal_id,
          go.nombre AS grupo_personal_nombre,
          go.apodo AS grupo_personal_apodo,
          gp_padre.nombre AS grupo_personal_padre_nombre,
          gp_padre.apodo AS grupo_personal_padre_apodo,
          CASE
            WHEN p.rol = 'CET' THEN p.id_personal
            ELSE mo.id_cet
          END AS id_cet_ref,
          CASE
            WHEN p.rol = 'CET' THEN p.apodo
            ELSE cet.apodo
          END AS cet_apodo,
          CASE
            WHEN p.rol = 'CET' THEN CONCAT_WS(' ', p.nombre, p.apellido)
            ELSE CONCAT_WS(' ', cet.nombre, cet.apellido)
          END AS cet_nombre
        FROM asignacion_operacion_personal aop
        JOIN personal p
          ON p.id_personal = aop.id_personal
        LEFT JOIN grupo_personal gper
          ON gper.id_personal = p.id_personal
         AND EXISTS (
           SELECT 1
           FROM grupo_operacion gox
           WHERE gox.id_grupo_operacion = gper.id_grupo_operacion
             AND gox.id_operacion = aop.id_operacion
         )
        LEFT JOIN grupo_operacion go
          ON go.id_grupo_operacion = gper.id_grupo_operacion
        LEFT JOIN grupo_operacion gp_padre
          ON gp_padre.id_grupo_operacion = go.id_grupo_padre
        LEFT JOIN mando_operacion mo
          ON mo.id_operacion = aop.id_operacion
         AND mo.id_cell = aop.id_personal
        LEFT JOIN personal cet
          ON cet.id_personal = mo.id_cet
        WHERE aop.id_operacion = $1
          AND aop.estado_asignacion NOT IN ('LIBERADO')
        ORDER BY
          p.id_personal,
          CASE WHEN go.id_grupo_padre IS NOT NULL THEN 0 ELSE 1 END,
          CASE WHEN go.id_grupo_operacion IS NULL THEN 1 ELSE 0 END,
          go.id_grupo_operacion
      )
      SELECT
        -- Datos base del vehículo
        v.id_vehiculo,
        v.codigo_interno,
        v.tipo,
        v.alias,
        v.estado,

        -- Custodio de esta fila (id_personal NOT NULL en vehiculo_operacion)
        vo.id_personal,
        per_ctx.apodo    AS asignado_a_apodo,
        per_ctx.nombre   AS personal_nombre,
        per_ctx.apellido AS personal_apellido,
        per_ctx.puesto   AS personal_puesto,
        per_ctx.personal_rol,
        per_ctx.id_cet_ref,
        per_ctx.cet_apodo,
        per_ctx.cet_nombre,

        -- Datos de asignación
        vo.nivel_asignacion,
        vo.nivel_asignacion AS tipo_destino,
        vo.nivel_asignacion AS uso_en_operacion,
        vo.estado_asignacion,
        vo.id_grupo_operacion,

        -- Grupo efectivo del vehículo: si tiene grupo explícito se usa ese;
        -- si no, se hereda del custodio.
        COALESCE(go_dest.nombre, per_ctx.grupo_personal_nombre, '') AS grupo_nombre,
        COALESCE(go_dest.apodo, per_ctx.grupo_personal_apodo, '') AS grupo_apodo,
        CASE
          WHEN go_dest.id_grupo_operacion IS NOT NULL THEN go_dest.nombre
          ELSE COALESCE(per_ctx.grupo_personal_nombre, '')
        END AS grupo_directo_nombre,
        CASE
          WHEN go_dest.id_grupo_operacion IS NOT NULL THEN COALESCE(gp_dest.nombre, '')
          ELSE COALESCE(per_ctx.grupo_personal_padre_nombre, '')
        END AS grupo_padre_nombre,

        -- Última posición conocida del vehículo
        t.latitud,
        t.longitud,
        t.ultima_actualizacion
      FROM vehiculo_operacion vo
      JOIN vehiculo v
        ON v.id_vehiculo = vo.id_vehiculo
      LEFT JOIN personal_ctx per_ctx
        ON per_ctx.id_personal = vo.id_personal
      LEFT JOIN grupo_operacion go_dest
        ON go_dest.id_grupo_operacion = vo.id_grupo_operacion
      LEFT JOIN grupo_operacion gp_dest
        ON gp_dest.id_grupo_operacion = go_dest.id_grupo_padre
      LEFT JOIN v_ultima_posicion_vehiculo t
        ON t.id_vehiculo = vo.id_vehiculo AND t.id_operacion = vo.id_operacion
      WHERE vo.id_operacion = $1
        AND vo.estado_asignacion != 'LIBERADO'
      ORDER BY v.tipo, v.codigo_interno,
               CASE per_ctx.personal_rol WHEN 'CET' THEN 0 ELSE 1 END,
               per_ctx.cet_nombre,
               per_ctx.nombre,
               per_ctx.apellido
      `,
      [id_operacion]
    );

    // Respuesta final
    return res.json({ ok: true, items: rows });
  } catch (err) {
    // Manejo uniforme de error
    return sendDbError(res, err, "Error obteniendo vehiculos");
  }
});


// =========================================================
// GET /ops/:id/equipos-asignados
// Qué hace:
//   Devuelve todos los equipos reservados/asignados a una operación.
// Además intenta resolver el destino real actual del equipo
// usando uso_equipo_operacion:
//   - PERSONAL
//   - VEHICULO
//   - GRUPO
// También expone:
//   - imagen del equipo
//   - cantidad reservada
//   - uso en operación
//   - estado de asignación
//   - nombre legible del destino
// =========================================================
router.get("/ops/:id/equipos-asignados", requireAuth, async (req, res) => {
  // Convierte id de operación
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    // Query para obtener el inventario de equipo ligado a la operación
    const { rows } = await pool.query(
      `SELECT
        -- Datos base del equipo
        e.id_equipo,
        e.numero_serie,
        e.nombre,
        e.categoria,
        e.estado,

        -- Datos de reserva/asignación en operación
        oe.cantidad,
        oe.uso_en_operacion,
        oe.estado_asignacion,

        -- Imagen: si es comunicación toma ec, si es táctico toma et
        COALESCE(ec.imagen_eqcom, et.imagen_eqtac) AS imagen_eq,

        -- Custodio directo del equipo (siempre presente)
        ueo.id_personal AS ueo_id_personal,
        ueo.id_vehiculo_contexto,
        ueo.id_grupo_operacion AS ueo_id_grupo_operacion,

        -- Tipo de destino derivado (NULL si no hay registro en uso_equipo_operacion)
        CASE
          WHEN ueo.id_vehiculo_contexto IS NOT NULL THEN 'VEHICULO'
          WHEN ueo.id_grupo_operacion   IS NOT NULL THEN 'GRUPO'
          WHEN ueo.id_personal          IS NOT NULL THEN 'PERSONAL'
          ELSE NULL
        END AS tipo_destino,

        -- Si el destino es PERSONAL, devuelve nombre completo legible
        CASE
          WHEN ueo.id_vehiculo_contexto IS NULL AND ueo.id_grupo_operacion IS NULL
          THEN NULLIF(TRIM(CONCAT_WS(' ', p_ueo.nombre, p_ueo.apellido)), '')
          ELSE NULL
        END AS asignado_a_personal,

        -- Si el destino es VEHICULO, devuelve su código interno
        CASE
          WHEN ueo.id_vehiculo_contexto IS NOT NULL THEN v_ueo.codigo_interno
          ELSE NULL
        END AS asignado_a_vehiculo,

        -- Si el destino es VEHICULO, también devuelve alias del vehículo
        CASE
          WHEN ueo.id_vehiculo_contexto IS NOT NULL THEN v_ueo.alias
          ELSE NULL
        END AS vehiculo_alias,

        -- Si el destino es GRUPO, devuelve nombre del grupo
        CASE
          WHEN ueo.id_grupo_operacion IS NOT NULL THEN go_ueo.nombre
          ELSE NULL
        END AS grupo_asignado
      FROM operacion_equipo oe

      -- Datos base del equipo
      JOIN equipo e ON e.id_equipo = oe.id_equipo

      -- Tabla hija si es equipo de comunicación
      LEFT JOIN equipo_comunicacion ec ON ec.id_equipo = e.id_equipo

      -- Tabla hija si es equipo táctico
      LEFT JOIN equipo_tactico et ON et.id_equipo = e.id_equipo

      -- Uso real del equipo dentro de la operación
      -- Solo toma registros no devueltos
      LEFT JOIN uso_equipo_operacion ueo
        ON ueo.id_operacion = oe.id_operacion
       AND ueo.id_equipo    = oe.id_equipo
       AND ueo.fecha_devolucion IS NULL

      -- Si el destino es personal
      LEFT JOIN personal        p_ueo  ON p_ueo.id_personal        = ueo.id_personal

      -- Si el destino es vehículo
      LEFT JOIN vehiculo        v_ueo  ON v_ueo.id_vehiculo        = ueo.id_vehiculo_contexto

      -- Si el destino es grupo
      LEFT JOIN grupo_operacion go_ueo ON go_ueo.id_grupo_operacion = ueo.id_grupo_operacion

      -- Solo equipos de esta operación y no liberados
      WHERE oe.id_operacion = $1
        AND oe.estado_asignacion != 'LIBERADO'

      -- Orden amigable para UI
      ORDER BY e.categoria, e.nombre, e.numero_serie`,
      [id_operacion]
    );

    // Respuesta final
    return res.json({ ok: true, items: rows });
  } catch (err) {
    // Manejo uniforme de errores
    return sendDbError(res, err, "Error obteniendo equipos");
  }
});

// Exporta el router para montarlo en el módulo principal
export default router;
