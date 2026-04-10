// Importa Router de Express para declarar rutas agrupadas
import { Router } from "express";

// Pool de PostgreSQL para ejecutar consultas
import { pool } from "../db.js";

// Middleware que exige autenticación antes de acceder a estas rutas
import { requireAuth } from "../middlewares/auth.js";

// Emitters de socket para tiempo real
import { emitPoiCreado, emitPoiEliminado } from "../sockets/index.js";

// Helper para responder errores de BD/backend de forma uniforme
import { sendDbError } from "../utils/dbErrors.js";

// Helper para validar enteros
import { isInt } from "../utils/validators.js";

// Crea la instancia del router
const router = Router();


// ===============================
// PUNTOS DE INTERÉS (POI)
// ===============================


// =========================================================
// GET /ops/:id/pois
// Qué hace:
//   Lista todos los puntos de interés activos de una operación.
// Fuente:
//   Lee desde la vista v_poi_detalle, que ya trae datos enriquecidos
//   del creador (usuario/personal).
// Orden:
//   Los más recientes primero.
// =========================================================
router.get("/ops/:id/pois", requireAuth, async (req, res) => {
  // Convierte id de operación desde la URL
  const id_operacion = Number(req.params.id);

  // Valida que sea entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    // Consulta todos los POIs activos de la operación
    const { rows } = await pool.query(
      `SELECT * FROM v_poi_detalle WHERE id_operacion=$1 AND activo=TRUE ORDER BY fecha_creacion DESC`,
      [id_operacion]
    );

    // Responde con la lista
    res.json({ ok: true, items: rows });
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error obteniendo POIs");
  }
});


// =========================================================
// POST /ops/:id/pois
// Qué hace:
//   Crea un nuevo punto de interés (POI) dentro de una operación.
// Campos esperados:
//   - nombre
//   - tipo_poi
//   - latitud
//   - longitud
//   - descripcion (opcional)
//   - tipo_creador (USUARIO o PERSONAL)
//   - id_usuario / id_personal según corresponda
// Validaciones:
//   - nombre obligatorio
//   - tipo_poi obligatorio
//   - latitud/longitud obligatorias
//   - tipo_creador válido
// Nota:
//   Aquí no se valida que el creador coincida con req.user.
// =========================================================
router.post("/ops/:id/pois", requireAuth, async (req, res) => {
  // Convierte id_operacion
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  // Extrae datos del body
  const {
    nombre,
    tipo_poi,
    latitud,
    longitud,
    descripcion,
    color,
    tipo_creador,
    id_usuario,
    id_personal
  } = req.body ?? {};

  // Valida nombre
  if (!nombre?.toString().trim()) {
    return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
  }

  // Valida tipo_poi
  if (!tipo_poi?.toString().trim()) {
    return res.status(400).json({ ok: false, mensaje: "Falta tipo_poi" });
  }

  // Valida coordenadas
  if (latitud == null || longitud == null) {
    return res.status(400).json({ ok: false, mensaje: "Falta latitud/longitud" });
  }

  // Normaliza tipo_creador
  const tipo = (tipo_creador || "USUARIO").toString().toUpperCase();

  // Solo permite USUARIO o PERSONAL
  if (!["USUARIO", "PERSONAL"].includes(tipo)) {
    return res.status(400).json({ ok: false, mensaje: "tipo_creador invalido" });
  }

  try {
    // Inserta el POI en la tabla puntos_interes
    const { rows } = await pool.query(
      `INSERT INTO puntos_interes (tipo_creador, id_usuario, id_personal, nombre, tipo_poi, latitud, longitud, descripcion, color, id_operacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        tipo,
        id_usuario ? Number(id_usuario) : null,
        id_personal ? Number(id_personal) : null,
        nombre.toString().trim(),
        tipo_poi.toString().trim(),
        Number(latitud),
        Number(longitud),
        descripcion?.toString().trim() || null,
        color?.toString().trim() || '#FFD700',
        id_operacion
      ]
    );

    const poi = rows[0];

    // Emite en tiempo real a todos los clientes de la operación
    const io = req.app.get("io");
    if (io) emitPoiCreado(io, id_operacion, poi);

    // Devuelve el POI creado
    res.json({ ok: true, poi });
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error creando POI");
  }
});


// =========================================================
// DELETE /ops/:id/pois/:id_poi
// Qué hace:
//   "Elimina" un POI de forma lógica.
// En realidad:
//   No lo borra físicamente; solo pone activo = FALSE.
// Validaciones:
//   - id_poi válido
// Nota:
//   No valida aquí que el POI pertenezca a la operación del path.
// =========================================================
router.delete("/ops/:id/pois/:id_poi", requireAuth, async (req, res) => {
  // Convierte id_poi
  const id_poi = Number(req.params.id_poi);

  // Valida entero
  if (!isInt(id_poi)) {
    return res.status(400).json({ ok: false, mensaje: "id_poi invalido" });
  }

  try {
    // Soft delete del POI
    const { rows } = await pool.query(
      `UPDATE puntos_interes SET activo=FALSE WHERE id_poi=$1 RETURNING id_poi, activo`,
      [id_poi]
    );

    // Si no existe, 404
    if (!rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "POI no existe" });
    }

    const io = req.app.get("io");
    if (io) emitPoiEliminado(io, Number(req.params.id), id_poi);

    // Respuesta final
    res.json({ ok: true, item: rows[0] });
  } catch (err) {
    // Manejo uniforme de error
    sendDbError(res, err, "Error eliminando POI");
  }
});


// ===============================
// ÁREAS DE INTERÉS
// ===============================


// =========================================================
// GET /ops/:id/areas
// Qué hace:
//   Lista todas las áreas de interés activas de una operación.
// Fuente:
//   Lee directo desde area_interes.
// Orden:
//   Las más recientes primero.
// =========================================================
router.get("/ops/:id/areas", requireAuth, async (req, res) => {
  // Convierte id_operacion
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    // Consulta áreas activas
    const { rows } = await pool.query(
      `SELECT * FROM area_interes WHERE id_operacion=$1 AND estado='ACTIVA' ORDER BY fecha_creacion DESC`,
      [id_operacion]
    );

    // Respuesta final
    res.json({ ok: true, items: rows });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo areas");
  }
});


// =========================================================
// POST /ops/:id/areas
// Qué hace:
//   Crea una nueva área de interés dentro de una operación.
// Campos esperados:
//   - nombre
//   - descripcion (opcional)
//   - geometria (GeoJSON)
//   - color (opcional)
//   - tipo_creador
//   - id_usuario / id_personal
// Validaciones:
//   - nombre obligatorio
//   - geometria obligatoria
//   - tipo_creador válido
// Nota:
//   Aquí se manda geometria serializada como JSON.stringify.
// =========================================================
router.post("/ops/:id/areas", requireAuth, async (req, res) => {
  // Convierte id_operacion
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  // Extrae datos del body
  const {
    nombre,
    descripcion,
    geometria,
    color,
    tipo_creador,
    id_usuario,
    id_personal
  } = req.body ?? {};

  // Valida nombre
  if (!nombre?.toString().trim()) {
    return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
  }

  // geometria obligatoria
  if (!geometria) {
    return res.status(400).json({ ok: false, mensaje: "Falta geometria (GeoJSON Polygon)" });
  }

  // Normaliza tipo_creador
  const tipo = (tipo_creador || "USUARIO").toString().toUpperCase();

  // Solo permite USUARIO o PERSONAL
  if (!["USUARIO", "PERSONAL"].includes(tipo)) {
    return res.status(400).json({ ok: false, mensaje: "tipo_creador invalido" });
  }

  try {
    // Inserta área de interés
    const { rows } = await pool.query(
      `INSERT INTO area_interes (id_operacion, tipo_creador, id_usuario, id_personal, nombre, descripcion, geometria, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        id_operacion,
        tipo,
        id_usuario ? Number(id_usuario) : null,
        id_personal ? Number(id_personal) : null,
        nombre.toString().trim(),
        descripcion?.toString().trim() || null,
        JSON.stringify(geometria),
        color || "#FF4500"
      ]
    );

    // Devuelve el área creada
    res.json({ ok: true, area: rows[0] });
  } catch (err) {
    sendDbError(res, err, "Error creando area");
  }
});


// =========================================================
// DELETE /ops/:id/areas/:id_area
// Qué hace:
//   Elimina un área de interés de forma lógica.
// En realidad:
//   No borra físicamente; cambia estado a ELIMINADA.
// Validaciones:
//   - id_area válido
// Nota:
//   No valida aquí que el área pertenezca a la operación del path.
// =========================================================
router.delete("/ops/:id/areas/:id_area", requireAuth, async (req, res) => {
  // Convierte id_area
  const id_area = Number(req.params.id_area);

  // Valida entero
  if (!isInt(id_area)) {
    return res.status(400).json({ ok: false, mensaje: "id_area invalido" });
  }

  try {
    // Soft delete del área
    const { rows } = await pool.query(
      `UPDATE area_interes SET estado='ELIMINADA' WHERE id_area=$1 RETURNING id_area, estado`,
      [id_area]
    );

    // Si no existe, 404
    if (!rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Area no existe" });
    }

    // Respuesta final
    res.json({ ok: true, item: rows[0] });
  } catch (err) {
    sendDbError(res, err, "Error eliminando area");
  }
});


// ===============================
// MARCAS DE EDIFICIOS / ESTRUCTURAS
// ===============================


// =========================================================
// GET /ops/:id/edificios
// Qué hace:
//   Lista todas las estructuras/marcas de edificio activas
//   de una operación.
// Fuente:
//   Lee directo desde marca_edificio.
// Orden:
//   Las más recientes primero.
// =========================================================
router.get("/ops/:id/edificios", requireAuth, async (req, res) => {
  // Convierte id_operacion
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  try {
    // Consulta edificios activos
    const { rows } = await pool.query(
      `SELECT * FROM marca_edificio WHERE id_operacion=$1 AND estado='ACTIVO' ORDER BY fecha_creacion DESC`,
      [id_operacion]
    );

    // Respuesta final
    res.json({ ok: true, items: rows });
  } catch (err) {
    sendDbError(res, err, "Error obteniendo edificios");
  }
});


// =========================================================
// POST /ops/:id/edificios
// Qué hace:
//   Crea una nueva marca de estructura/edificio en la operación.
// Campos esperados:
//   - nombre
//   - tipo_estructura
//   - latitud
//   - longitud
//   - tipo_creador
//   - id_usuario / id_personal
// Validaciones:
//   - nombre obligatorio
//   - tipo_estructura obligatorio
//   - latitud/longitud obligatorias
//   - tipo_creador válido
//   - si el usuario tiene rol CELL, se bloquea con 403
// =========================================================
router.post("/ops/:id/edificios", requireAuth, async (req, res) => {
  // Convierte id_operacion
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id invalido" });
  }

  // Extrae datos del body
  const {
    nombre,
    tipo_estructura,
    latitud,
    longitud,
    tipo_creador,
    id_usuario,
    id_personal
  } = req.body ?? {};

  // Valida nombre
  if (!nombre?.toString().trim()) {
    return res.status(400).json({ ok: false, mensaje: "Falta nombre" });
  }

  // Valida tipo_estructura
  if (!tipo_estructura?.toString().trim()) {
    return res.status(400).json({ ok: false, mensaje: "Falta tipo_estructura" });
  }

  // Valida coordenadas
  if (latitud == null || longitud == null) {
    return res.status(400).json({ ok: false, mensaje: "Falta latitud/longitud" });
  }

  // Normaliza tipo_creador
  const tipo = (tipo_creador || "USUARIO").toString().toUpperCase();

  // Solo permite USUARIO o PERSONAL
  if (!["USUARIO", "PERSONAL"].includes(tipo)) {
    return res.status(400).json({ ok: false, mensaje: "tipo_creador invalido" });
  }

  // Regla de negocio: CELL no puede crear estructuras
  if (req.user.rol === "CELL") {
    return res.status(403).json({ ok: false, mensaje: "Las Celulas no pueden crear estructuras" });
  }

  try {
    // Inserta la marca de edificio
    const { rows } = await pool.query(
      `INSERT INTO marca_edificio (id_operacion, tipo_creador, id_usuario, id_personal, nombre, tipo_estructura, latitud, longitud)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        id_operacion,
        tipo,
        id_usuario ? Number(id_usuario) : null,
        id_personal ? Number(id_personal) : null,
        nombre.toString().trim(),
        tipo_estructura.toString().trim(),
        Number(latitud),
        Number(longitud)
      ]
    );

    // Devuelve el edificio creado
    res.json({ ok: true, edificio: rows[0] });
  } catch (err) {
    sendDbError(res, err, "Error creando edificio");
  }
});


// =========================================================
// DELETE /ops/:id/edificios/:id_marca
// Qué hace:
//   Elimina una marca de edificio de forma lógica.
// En realidad:
//   No borra físicamente; cambia estado a INACTIVO.
// Validaciones:
//   - id_marca válido
// Nota:
//   No valida aquí que la marca pertenezca a la operación del path.
// =========================================================
router.delete("/ops/:id/edificios/:id_marca", requireAuth, async (req, res) => {
  // Convierte id_marca
  const id_marca = Number(req.params.id_marca);

  // Valida entero
  if (!isInt(id_marca)) {
    return res.status(400).json({ ok: false, mensaje: "id_marca invalido" });
  }

  try {
    // Soft delete de la estructura
    const { rows } = await pool.query(
      `UPDATE marca_edificio SET estado='INACTIVO' WHERE id_marca=$1 RETURNING id_marca, estado`,
      [id_marca]
    );

    // Si no existe, 404
    if (!rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Edificio no existe" });
    }

    // Respuesta final
    res.json({ ok: true, item: rows[0] });
  } catch (err) {
    sendDbError(res, err, "Error eliminando edificio");
  }
});


// ===============================
// MAPA COMPLETO — todas las capas de una operación
// ===============================


// =========================================================
// GET /ops/:id/mapa
// Qué hace:
//   Devuelve en una sola llamada casi todo el contexto táctico
//   necesario para renderizar el mapa/panel de una operación.
//
// Incluye:
//   - datos básicos de la operación
//   - zona_operacion
//   - capas base del mapa (POIs, áreas, rutas, edificios)
//   - personal asignado con grupo y tracking
//   - vehículos asignados con grupo y tracking
//   - equipos asignados con destino resuelto
//   - rutas de navegación activas
//
// Estrategia:
//   Ejecuta varias queries en paralelo con Promise.all.
// =========================================================
router.get("/ops/:id/mapa", requireAuth, async (req, res) => {
  // Convierte id_operacion
  const id_operacion = Number(req.params.id);

  // Valida entero
  if (!isInt(id_operacion)) {
    return res.status(400).json({ ok: false, mensaje: "id inválido" });
  }

  try {
    // Ejecuta todas las consultas en paralelo
    const [
      operacionRes,
      zonaRes,
      capasRes,
      poisRes,
      personalRes,
      vehiculosRes,
      equiposRes,
      rutasNavegacionRes
    ] = await Promise.all([

      // -------------------------------------------------
      // 1) Datos base de la operación
      // -------------------------------------------------
      pool.query(
        `SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado,
                fecha_inicio, fecha_fin, fecha_creacion, creada_por
         FROM operacion
         WHERE id_operacion = $1
         LIMIT 1`,
        [id_operacion]
      ),

      // -------------------------------------------------
      // 2) Zona principal de la operación
      // -------------------------------------------------
      pool.query(
        `SELECT id_zona, id_operacion, nombre, geometria, centroide_lat, centroide_lon, zoom_inicial, color
         FROM zona_operacion
         WHERE id_operacion = $1
         ORDER BY id_zona ASC
         LIMIT 1`,
        [id_operacion]
      ),

      // -------------------------------------------------
      // 3) Capas unificadas del mapa
      //    Fuente: v_capas_mapa_operacion
      //    Incluye POIs, áreas, rutas y edificios activos
      // -------------------------------------------------
      pool.query(
        `SELECT * FROM v_capas_mapa_operacion WHERE id_operacion = $1`,
        [id_operacion]
      ),

      // -------------------------------------------------
      // 3b) POIs dedicados
      //    Se envían aparte para clientes que no deben
      //    depender del shape de v_capas_mapa_operacion.
      // -------------------------------------------------
      pool.query(
        `SELECT id_poi, nombre, tipo_poi, latitud, longitud, color
           FROM v_poi_detalle
          WHERE id_operacion = $1
            AND activo = TRUE
          ORDER BY fecha_creacion DESC`,
        [id_operacion]
      ),

      // -------------------------------------------------
      // 4) Personal asignado
      //    Incluye:
      //      - identidad
      //      - rol_en_operacion
      //      - grupo directo
      //      - grupo padre
      //      - última posición conocida
      // -------------------------------------------------
      pool.query(
        `SELECT DISTINCT ON (p.id_personal)
            p.id_personal,
            p.apodo,
            p.nombre,
            p.apellido,
            p.rol,
            p.puesto,
            a.rol_en_operacion,
            go.id_grupo_operacion,
            go.nombre          AS grupo_nombre,
            go.apodo           AS grupo_apodo,
            go.descripcion     AS grupo_flotilla,
            gp_padre.nombre    AS grupo_padre_nombre,
            gp_padre.apodo     AS grupo_padre_apodo,
            t.latitud,
            t.longitud,
            t.ultima_actualizacion
         FROM asignacion_operacion_personal a
         JOIN personal p ON p.id_personal = a.id_personal

         -- Resuelve grupo del personal solo dentro de esta operación
         LEFT JOIN (
           SELECT gper2.id_personal, gper2.id_grupo_operacion
           FROM grupo_personal gper2
           JOIN grupo_operacion go2 ON go2.id_grupo_operacion = gper2.id_grupo_operacion
           WHERE go2.id_operacion = $1
         ) gper ON gper.id_personal = p.id_personal

         -- Grupo directo
         LEFT JOIN grupo_operacion go ON go.id_grupo_operacion = gper.id_grupo_operacion

         -- Grupo padre
         LEFT JOIN grupo_operacion gp_padre ON gp_padre.id_grupo_operacion = go.id_grupo_padre

         -- Última posición conocida
         LEFT JOIN v_ultima_posicion_personal t
           ON t.id_personal = a.id_personal AND t.id_operacion = a.id_operacion

         -- Solo personal no liberado
         WHERE a.id_operacion = $1 AND a.estado_asignacion NOT IN ('LIBERADO')

         -- Ordena por persona (requerido por DISTINCT ON) y por grupo
         ORDER BY p.id_personal,
                  CASE WHEN go.id_grupo_padre IS NOT NULL THEN 0 ELSE 1 END,
                  CASE WHEN go.id_grupo_operacion IS NULL THEN 1 ELSE 0 END,
                  go.id_grupo_operacion`,
        [id_operacion]
      ),

      // -------------------------------------------------
      // 5) Vehículos asignados
      //    Incluye:
      //      - identidad del vehículo
      //      - estado de asignación
      //      - persona asignada si aplica
      //      - grupo directo o inferido por pasajero/personal
      //      - tracking
      // -------------------------------------------------
      pool.query(
        `SELECT
            v.id_vehiculo,
            v.codigo_interno,
            v.tipo,
            v.alias,
            v.alias AS nombre,
            vo.estado_asignacion,

            -- Datos de persona asignada directamente al vehículo
            p.apodo AS asignado_a_apodo,
            p.nombre AS asignado_a_nombre,
            p.apellido AS asignado_a_apellido,

            -- Nombre/apodo del grupo resuelto ya sea directo o por pasajero
            STRING_AGG(DISTINCT COALESCE(go_direct.nombre, go_pasajero.nombre), ', ') AS grupo_nombre,
            STRING_AGG(DISTINCT COALESCE(go_direct.apodo, go_pasajero.apodo), ', ') AS grupo_apodo,

            -- Última posición conocida del vehículo
            tv.latitud,
            tv.longitud,
            tv.ultima_actualizacion
         FROM vehiculo_operacion vo
         JOIN vehiculo v ON v.id_vehiculo = vo.id_vehiculo

         -- Persona asignada directamente
         LEFT JOIN personal p ON p.id_personal = vo.id_personal

         -- Duplicado de vehiculo_operacion para resolver personal relacionado
         LEFT JOIN vehiculo_operacion vo2
           ON vo2.id_vehiculo = v.id_vehiculo AND vo2.id_operacion = vo.id_operacion

         -- Grupo inferido por el personal ligado al vehículo
         LEFT JOIN (
            SELECT gper2.id_personal, gper2.id_grupo_operacion
            FROM grupo_personal gper2
            JOIN grupo_operacion go2 ON go2.id_grupo_operacion = gper2.id_grupo_operacion
            WHERE go2.id_operacion = $1
         ) gp_pasajero ON gp_pasajero.id_personal = vo2.id_personal

         LEFT JOIN grupo_operacion go_pasajero ON go_pasajero.id_grupo_operacion = gp_pasajero.id_grupo_operacion

         -- Grupo asignado directamente al vehículo
         LEFT JOIN grupo_vehiculo gv ON gv.id_vehiculo = v.id_vehiculo AND gv.id_operacion = $1
         LEFT JOIN grupo_operacion go_direct ON go_direct.id_grupo_operacion = gv.id_grupo_operacion

         -- Última posición conocida
         LEFT JOIN v_ultima_posicion_vehiculo tv
           ON tv.id_vehiculo = vo.id_vehiculo AND tv.id_operacion = vo.id_operacion

         WHERE vo.id_operacion = $1

         GROUP BY v.id_vehiculo, v.codigo_interno, v.tipo, v.alias, vo.estado_asignacion,
                  p.id_personal, p.apodo, p.nombre, p.apellido,
                  tv.latitud, tv.longitud, tv.ultima_actualizacion`,
        [id_operacion]
      ),

      // -------------------------------------------------
      // 6) Equipos asignados
      //    Incluye:
      //      - datos base
      //      - cantidad reservada
      //      - imagen consolidada
      //      - destino real resuelto desde uso_equipo_operacion
      // -------------------------------------------------
      pool.query(
        `SELECT
            e.id_equipo,
            e.numero_serie,
            e.nombre,
            e.categoria,
            e.estado,
            oe.cantidad,
            oe.uso_en_operacion,
            oe.estado_asignacion,
            COALESCE(ec.imagen_eqcom, et.imagen_eqtac) AS imagen_eq,

            -- Tipo de destino real del equipo
            CASE
              WHEN ueo.id_vehiculo_contexto IS NOT NULL THEN 'VEHICULO'
              WHEN ueo.id_grupo_operacion   IS NOT NULL THEN 'GRUPO'
              WHEN ueo.id_personal          IS NOT NULL THEN 'PERSONAL'
              ELSE NULL
            END AS tipo_destino,

            -- Persona responsable (siempre obligatoria)
            COALESCE(p_ueo.apodo,
              NULLIF(TRIM(CONCAT_WS(' ', p_ueo.nombre, p_ueo.apellido)), '')) AS asignado_a_personal,

            -- Vehículo contexto si aplica
            v_ueo.codigo_interno AS asignado_a_vehiculo,
            v_ueo.alias          AS vehiculo_alias,

            -- Grupo si aplica
            go_ueo.nombre AS grupo_asignado
          FROM operacion_equipo oe
          JOIN equipo e ON e.id_equipo = oe.id_equipo
          LEFT JOIN equipo_comunicacion ec ON ec.id_equipo = e.id_equipo
          LEFT JOIN equipo_tactico et ON et.id_equipo = e.id_equipo

          -- Uso real del equipo dentro de la operación
          LEFT JOIN uso_equipo_operacion ueo
            ON ueo.id_operacion = oe.id_operacion
           AND ueo.id_equipo    = oe.id_equipo
           AND ueo.fecha_devolucion IS NULL

          -- Resolución del destino según tipo_destino
          LEFT JOIN personal        p_ueo  ON p_ueo.id_personal          = ueo.id_personal
          LEFT JOIN vehiculo        v_ueo  ON v_ueo.id_vehiculo           = ueo.id_vehiculo_contexto
          LEFT JOIN grupo_operacion go_ueo ON go_ueo.id_grupo_operacion   = ueo.id_grupo_operacion

          -- Solo equipo no liberado
          WHERE oe.id_operacion = $1 AND oe.estado_asignacion != 'LIBERADO'`,
        [id_operacion]
      ),

      // -------------------------------------------------
      // 7) Rutas de navegación activas
      //    Incluye:
      //      - geometría
      //      - origen/destino
      //      - distancia/duración
      //      - quién la creó y su rol
      //
      // Filtro por rol:
      //   CELL → solo rutas generales (sin vehículo) o del vehículo
      //          al que están asignados en la operación.
      //   Otros → todas las rutas activas.
      // -------------------------------------------------
      (() => {
        const esCell   = (req.user?.rol || "").toUpperCase() === "CELL";
        const idPersonal = esCell ? (Number(req.user.sub) || null) : null;

        if (esCell && idPersonal) {
          return pool.query(
            `SELECT
                rn.id_ruta, rn.id_operacion, rn.geojson, rn.origen_lat, rn.origen_lon,
                rn.destino_lat, rn.destino_lon, rn.distancia_m, rn.duracion_s,
                rn.created_by_tipo, rn.id_usuario, rn.id_personal, rn.fecha_creacion,
                COALESCE(u.rol::text, p.rol::text) AS rol_creador
             FROM ruta_navegacion rn
             LEFT JOIN usuario  u ON rn.created_by_tipo = 'USUARIO'   AND rn.id_usuario  = u.id_usuario
             LEFT JOIN personal p ON rn.created_by_tipo = 'PERSONAL'  AND rn.id_personal = p.id_personal
             WHERE rn.id_operacion = $1
               AND rn.activo = true
               AND (
                 rn.id_vehiculo IS NULL
                 OR rn.id_vehiculo IN (
                   SELECT vo.id_vehiculo
                   FROM vehiculo_operacion vo
                   WHERE vo.id_operacion = $1
                     AND vo.id_personal  = $2
                 )
               )`,
            [id_operacion, idPersonal]
          );
        }

        return pool.query(
          `SELECT
              rn.id_ruta, rn.id_operacion, rn.geojson, rn.origen_lat, rn.origen_lon,
              rn.destino_lat, rn.destino_lon, rn.distancia_m, rn.duracion_s,
              rn.created_by_tipo, rn.id_usuario, rn.id_personal, rn.fecha_creacion,
              COALESCE(u.rol::text, p.rol::text) AS rol_creador
           FROM ruta_navegacion rn
           LEFT JOIN usuario  u ON rn.created_by_tipo = 'USUARIO'   AND rn.id_usuario  = u.id_usuario
           LEFT JOIN personal p ON rn.created_by_tipo = 'PERSONAL'  AND rn.id_personal = p.id_personal
           WHERE rn.id_operacion = $1 AND rn.activo = true`,
          [id_operacion]
        );
      })()
    ]);

    // Si la operación no existe, corta con 404
    if (!operacionRes.rows[0]) {
      return res.status(404).json({ ok: false, mensaje: "Operación no existe" });
    }

    // Devuelve todo el paquete de datos del mapa
    return res.json({
      ok: true,
      operacion: operacionRes.rows[0],
      zona_operacion: zonaRes.rows[0] || null,
      capas: capasRes.rows,
      pois: poisRes.rows,
      personal: personalRes.rows,
      vehiculos: vehiculosRes.rows,
      equipos: equiposRes.rows,
      rutas_navegacion: rutasNavegacionRes.rows
    });
  } catch (err) {
    return sendDbError(res, err, "Error obteniendo mapa");
  }
});

// Exporta el router para montarlo en la app principal
export default router;
