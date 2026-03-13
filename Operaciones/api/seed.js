import "dotenv/config";
import pkg from "pg";
import bcrypt from "bcryptjs";

const { Client } = pkg;

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || "1234";

const users = [
  // Usuario administrador (tabla usuario)
  { rol: "ADMIN", nombre: "Admin", apellido: "Principal", puesto: "Sistema", username: "admin" },

  // ===== Personal (tabla personal) =====
  // CUT
  { rol: "CUT", nombre: "Carlos", apellido: "Ramírez", puesto: "Coronel", username: "cramirez", apodo: "Ramírez" },
  { rol: "CUT", nombre: "Ana", apellido: "Torres", puesto: "Teniente Coronel", username: "atorres", apodo: "Torres" },

  // CET
  { rol: "CET", nombre: "Luis", apellido: "Hernández", puesto: "Mayor", username: "lhernandez", apodo: "Hernández" },
  { rol: "CET", nombre: "María", apellido: "López", puesto: "Capitán", username: "mlopez", apodo: "López" },
  { rol: "CET", nombre: "Ricardo", apellido: "Vega", puesto: "Teniente", username: "rvega", apodo: "Vega" },

  // CELL
  { rol: "CELL", nombre: "José", apellido: "Martínez", puesto: "Sargento Primero", username: "jmartinez", apodo: "Martínez" },
  { rol: "CELL", nombre: "Pedro", apellido: "Sánchez", puesto: "Sargento Segundo", username: "psanchez", apodo: "Sánchez" },
  { rol: "CELL", nombre: "Miguel", apellido: "Cruz", puesto: "Cabo", username: "mcruz", apodo: "Cruz" },
  { rol: "CELL", nombre: "Laura", apellido: "Gómez", puesto: "Soldado / Marinero", username: "lgomez", apodo: "Gómez" },
  { rol: "CELL", nombre: "Juan", apellido: "Flores", puesto: "Soldado / Marinero", username: "jflores", apodo: "Flores" },
  { rol: "CELL", nombre: "Sofía", apellido: "Morales", puesto: "Cabo", username: "smorales", apodo: "Morales" },
  { rol: "CELL", nombre: "Daniel", apellido: "Ríos", puesto: "Soldado / Marinero", username: "drios", apodo: "Ríos" },
  { rol: "CELL", nombre: "Fernanda", apellido: "Silva", puesto: "Soldado / Marinero", username: "fsilva", apodo: "Silva" },
  { rol: "CELL", nombre: "Andrés", apellido: "Navarro", puesto: "Cabo", username: "anavarro", apodo: "Navarro" },
  { rol: "CELL", nombre: "Paola", apellido: "Mendoza", puesto: "Soldado / Marinero", username: "pmendoza", apodo: "Mendoza" },
  { rol: "CELL", nombre: "Hugo", apellido: "Castillo", puesto: "Sargento Segundo", username: "hcastillo", apodo: "Castillo" },
  { rol: "CELL", nombre: "Elena", apellido: "Ruiz", puesto: "Soldado / Marinero", username: "eruiz", apodo: "Ruiz" },
  { rol: "CELL", nombre: "Iván", apellido: "Pérez", puesto: "Cabo", username: "iperez", apodo: "Pérez" },
  { rol: "CELL", nombre: "Diana", apellido: "Ortega", puesto: "Soldado / Marinero", username: "dortega", apodo: "Ortega" },
  { rol: "CELL", nombre: "Óscar", apellido: "Reyes", puesto: "Cabo", username: "oreyes", apodo: "Reyes" },
  { rol: "CELL", nombre: "Daniela", apellido: "Pérez", puesto: "Soldado / Marinero", username: "dperez", apodo: "Pérez" },
  { rol: "CELL", nombre: "Diana", apellido: "Ortiz", puesto: "Soldado / Marinero", username: "dortiz", apodo: "Ortiz" },
  { rol: "CELL", nombre: "Odalis", apellido: "Lopez", puesto: "Soldado / Marinero", username: "olopez", apodo: "López" },
];

// =========================================================
// HELPERS
// =========================================================
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno ${name} en tu .env`);
  return v;
}

function cleanApodo(s) {
  return (s ?? "").toString().trim().replace(/\s+/g, " ").slice(0, 40);
}

async function generateUniqueApodo(client, wanted) {
  let base = cleanApodo(wanted);
  if (!base) base = "SinApodo";

  for (let n = 0; n < 200; n++) {
    const apodo = (n === 0 ? base : `${base} ${n + 1}`).slice(0, 40);

    const { rows } = await client.query(
      `SELECT 1 FROM personal WHERE apodo = $1 LIMIT 1`,
      [apodo]
    );
    if (rows.length === 0) return apodo;
  }

  return `${base}-${Date.now()}`.slice(0, 40);
}

async function getAdminId(client) {
  const { rows, rowCount } = await client.query(
    `SELECT id_usuario FROM usuario WHERE username = 'admin' LIMIT 1`
  );
  if (rowCount === 0) throw new Error(`No existe el usuario admin`);
  return rows[0].id_usuario;
}

async function getPersonalByUsername(client, username) {
  const { rows, rowCount } = await client.query(
    `SELECT id_personal, username, rol, apodo, nombre, apellido
     FROM personal
     WHERE username = $1
     LIMIT 1`,
    [username]
  );
  if (rowCount === 0) return null;
  return rows[0];
}

async function ensureChatParticipantUsuario(client, idChat, idUsuario) {
  const { rows } = await client.query(
    `
    INSERT INTO participante_chat (id_chat, tipo, id_usuario, id_personal)
    VALUES ($1, 'USUARIO', $2, NULL)
    ON CONFLICT (id_chat, id_usuario) DO UPDATE
      SET id_usuario = EXCLUDED.id_usuario
    RETURNING id_participante
    `,
    [idChat, idUsuario]
  );

  if (rows[0]?.id_participante) return rows[0].id_participante;

  const fallback = await client.query(
    `SELECT id_participante
     FROM participante_chat
     WHERE id_chat = $1 AND id_usuario = $2
     LIMIT 1`,
    [idChat, idUsuario]
  );
  return fallback.rows[0]?.id_participante ?? null;
}

async function ensureChatParticipantPersonal(client, idChat, idPersonal) {
  const { rows } = await client.query(
    `
    INSERT INTO participante_chat (id_chat, tipo, id_usuario, id_personal)
    VALUES ($1, 'PERSONAL', NULL, $2)
    ON CONFLICT (id_chat, id_personal) DO UPDATE
      SET id_personal = EXCLUDED.id_personal
    RETURNING id_participante
    `,
    [idChat, idPersonal]
  );

  if (rows[0]?.id_participante) return rows[0].id_participante;

  const fallback = await client.query(
    `SELECT id_participante
     FROM participante_chat
     WHERE id_chat = $1 AND id_personal = $2
     LIMIT 1`,
    [idChat, idPersonal]
  );
  return fallback.rows[0]?.id_participante ?? null;
}

async function getAvailableVehiculos(client, limit = 2) {
  const { rows } = await client.query(
    `
    SELECT id_vehiculo, codigo_interno, tipo, marca, modelo, capacidad, estado
    FROM vehiculo
    WHERE estado = 'DISPONIBLE'
    ORDER BY fecha_creacion ASC, id_vehiculo ASC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

async function getAvailableEquipos(client, limit = 4) {
  const { rows } = await client.query(
    `
    SELECT id_equipo, numero_serie, nombre, categoria, estado
    FROM equipo
    WHERE estado = 'DISPONIBLE'
    ORDER BY
      CASE categoria
        WHEN 'COMUNICACION' THEN 1
        WHEN 'TACTICO' THEN 2
        ELSE 3
      END,
      fecha_creacion ASC,
      id_equipo ASC
    LIMIT $1
    `,
    [limit]
  );
  return rows;
}

async function getGrupoId(client, idOperacion, nombre) {
  const { rows, rowCount } = await client.query(
    `
    SELECT id_grupo_operacion
    FROM grupo_operacion
    WHERE id_operacion = $1 AND nombre = $2
    LIMIT 1
    `,
    [idOperacion, nombre]
  );
  if (rowCount === 0) return null;
  return rows[0].id_grupo_operacion;
}

async function main() {
  const client = new Client({
    host: requireEnv("PGHOST"),
    port: Number(process.env.PGPORT || 5432),
    user: requireEnv("PGUSER"),
    password: requireEnv("PGPASSWORD"),
    database: requireEnv("PGDATABASE"),
  });

  await client.connect();

  const adminUsers = users.filter((u) => u.rol === "ADMIN");
  const personalUsers = users.filter((u) => ["CUT", "CET", "CELL"].includes(u.rol));

  const OP_CODIGO = "OP-PRUEBA-001";
  const personalOpUsernames = [
    "mlopez",
    "mcruz",
    "jmartinez",
    "psanchez",
    "lgomez",
    "jflores",
    "smorales",
  ];

  try {
    await client.query("BEGIN");

    // =========================================================
    // 1) ADMIN -> tabla usuario
    // =========================================================
    for (const u of adminUsers) {
      const hash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

      await client.query(
        `
        INSERT INTO usuario (rol, nombre, apellido, puesto, username, password_hash, activo)
        VALUES ($1,$2,$3,$4,$5,$6, TRUE)
        ON CONFLICT (username) DO UPDATE
          SET rol = EXCLUDED.rol,
              nombre = EXCLUDED.nombre,
              apellido = EXCLUDED.apellido,
              puesto = EXCLUDED.puesto,
              password_hash = EXCLUDED.password_hash,
              activo = TRUE
        `,
        [u.rol, u.nombre, u.apellido, u.puesto, u.username, hash]
      );
    }

    const creadoPor = await getAdminId(client);

    // =========================================================
    // 2) Personal -> tabla personal
    // =========================================================
    for (const p of personalUsers) {
      const hash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

      const wantedApodo =
        cleanApodo(p.apodo) ||
        cleanApodo(p.apellido) ||
        cleanApodo(p.nombre) ||
        cleanApodo(p.username);

      const apodoFinal = await generateUniqueApodo(client, wantedApodo);

      await client.query(
        `
        INSERT INTO personal (rol, apodo, nombre, apellido, puesto, username, password_hash, activo, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7, TRUE, $8)
        ON CONFLICT (username) DO UPDATE
          SET rol           = EXCLUDED.rol,
              apodo         = EXCLUDED.apodo,
              nombre        = EXCLUDED.nombre,
              apellido      = EXCLUDED.apellido,
              puesto        = EXCLUDED.puesto,
              password_hash = EXCLUDED.password_hash,
              activo        = TRUE,
              creado_por    = EXCLUDED.creado_por
        `,
        [p.rol, apodoFinal, p.nombre, p.apellido, p.puesto, p.username, hash, creadoPor]
      );
    }

    // =========================================================
    // 3) OPERACION DE PRUEBA
    // =========================================================
    await client.query(
      `
      INSERT INTO operacion
        (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por)
      VALUES
        ($1,$2,$3,'MEDIA','ACTIVA','2025-02-09 08:00:00-06','2025-06-09 23:59:59-06',$4)
      ON CONFLICT (codigo) DO UPDATE
        SET nombre       = EXCLUDED.nombre,
            descripcion  = EXCLUDED.descripcion,
            prioridad    = EXCLUDED.prioridad,
            estado       = EXCLUDED.estado,
            fecha_inicio = EXCLUDED.fecha_inicio,
            fecha_fin    = EXCLUDED.fecha_fin,
            creada_por   = EXCLUDED.creada_por
      `,
      [
        OP_CODIGO,
        "Operacion de Prueba SEDAM",
        "Operacion de validacion del sistema. CET: mlopez. Dos subgrupos de 3 celulas. Vehiculos y equipo tomados del inventario real disponible.",
        creadoPor,
      ]
    );

    const opRow = await client.query(
      `SELECT id_operacion FROM operacion WHERE codigo = $1 LIMIT 1`,
      [OP_CODIGO]
    );
    const idOp = opRow.rows[0].id_operacion;

    // =========================================================
    // 4) PERSONAL -> OPERACION
    // =========================================================
    const personalAsignado = [];

    for (const username of personalOpUsernames) {
      const persona = await getPersonalByUsername(client, username);
      if (!persona) {
        console.warn(`WARN: personal "${username}" no encontrado, se omite`);
        continue;
      }

      personalAsignado.push(persona);

      await client.query(
        `
        INSERT INTO asignacion_operacion_personal
          (id_operacion, id_personal, rol_en_operacion, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,'ASIGNADO',$4)
        ON CONFLICT (id_operacion, id_personal) DO UPDATE
          SET rol_en_operacion = EXCLUDED.rol_en_operacion,
              estado_asignacion = EXCLUDED.estado_asignacion,
              asignado_por = EXCLUDED.asignado_por,
              fecha_asignacion = NOW()
        `,
        [idOp, persona.id_personal, persona.rol, creadoPor]
      );
    }

    const cet = personalAsignado.find((p) => p.username === "mlopez");
    const cells = personalAsignado.filter((p) => p.rol === "CELL");

    if (!cet) {
      throw new Error(`No se encontró el CET "mlopez" para la operación de prueba.`);
    }

    // =========================================================
    // 5) MANDO: CET -> CELL
    // =========================================================
    for (const cell of cells) {
      await client.query(
        `
        INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (id_operacion, id_cell) DO NOTHING
        `,
        [idOp, cet.id_personal, cell.id_personal, creadoPor]
      );
    }

    // =========================================================
    // 6) GRUPO PADRE
    // =========================================================
    await client.query(
      `
      INSERT INTO grupo_operacion
        (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
      VALUES
        ($1,'Grupo MLOPEZ','MLOPEZ',NULL,'Grupo principal bajo mando CET mlopez',$2)
      ON CONFLICT (id_operacion, nombre) DO NOTHING
      `,
      [idOp, creadoPor]
    );

    const idPadre = await getGrupoId(client, idOp, "Grupo MLOPEZ");
    if (!idPadre) throw new Error(`No se pudo obtener el grupo padre de la operación.`);

    // =========================================================
    // 7) SUBGRUPOS
    // =========================================================
    for (const nombre of ["Aguila 1", "Aguila 2"]) {
      await client.query(
        `
        INSERT INTO grupo_operacion
          (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
        VALUES
          ($1,$2,NULL,$3,$4,$5)
        ON CONFLICT (id_operacion, nombre) DO NOTHING
        `,
        [idOp, nombre, idPadre, `Subgrupo ${nombre}`, creadoPor]
      );
    }

    const idAguila1 = await getGrupoId(client, idOp, "Aguila 1");
    const idAguila2 = await getGrupoId(client, idOp, "Aguila 2");

    if (!idAguila1 || !idAguila2) {
      throw new Error(`No se pudieron obtener los subgrupos de la operación.`);
    }

    // =========================================================
    // 8) CELULAS -> SUBGRUPOS (3 y 3)
    // =========================================================
    const subgrupo1Usernames = ["mcruz", "jmartinez", "psanchez"];
    const subgrupo2Usernames = ["lgomez", "jflores", "smorales"];

    for (const username of subgrupo1Usernames) {
      const persona = await getPersonalByUsername(client, username);
      if (!persona) continue;

      await client.query(
        `
        INSERT INTO grupo_personal
          (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
        VALUES ($1,$2,'CELL',$3)
        ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING
        `,
        [idAguila1, persona.id_personal, creadoPor]
      );
    }

    for (const username of subgrupo2Usernames) {
      const persona = await getPersonalByUsername(client, username);
      if (!persona) continue;

      await client.query(
        `
        INSERT INTO grupo_personal
          (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
        VALUES ($1,$2,'CELL',$3)
        ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING
        `,
        [idAguila2, persona.id_personal, creadoPor]
      );
    }

    // =========================================================
    // 9) CHAT OPERACION
    // =========================================================
    const chatRes = await client.query(
      `
      INSERT INTO chat_operacion (id_operacion, activo)
      VALUES ($1, TRUE)
      ON CONFLICT (id_operacion) DO UPDATE
        SET activo = TRUE,
            fecha_cierre = NULL
      RETURNING id_chat
      `,
      [idOp]
    );

    let idChat = chatRes.rows?.[0]?.id_chat;

    if (!idChat) {
      const chatLookup = await client.query(
        `SELECT id_chat FROM chat_operacion WHERE id_operacion = $1 LIMIT 1`,
        [idOp]
      );
      if (chatLookup.rowCount === 0) {
        throw new Error(`No se pudo crear ni recuperar el chat de la operación.`);
      }
      idChat = chatLookup.rows[0].id_chat;
    }

    // Admin como participante del chat
    const idParticipanteAdmin = await ensureChatParticipantUsuario(client, idChat, creadoPor);

    // Todo el personal asignado como participante del chat
    for (const persona of personalAsignado) {
      await ensureChatParticipantPersonal(client, idChat, persona.id_personal);
    }

    // Mensaje inicial de sistema (solo si aún no hay mensajes)
    const msgCount = await client.query(
      `SELECT COUNT(*)::int AS total FROM mensaje_chat WHERE id_chat = $1`,
      [idChat]
    );

    if ((msgCount.rows[0]?.total ?? 0) === 0 && idParticipanteAdmin) {
      await client.query(
        `
        INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
        VALUES ($1,$2,$3,'SISTEMA')
        `,
        [
          idChat,
          idParticipanteAdmin,
          "OPERACIÓN INICIADA 9 DE FEBRERO DEL 2025.",
        ]
      );
    }

    // =========================================================
    // 10) VEHICULOS REALES DISPONIBLES -> OPERACION
    // =========================================================
    const vehiculosDisponibles = await getAvailableVehiculos(client, 2);

    if (vehiculosDisponibles.length === 0) {
      console.warn("WARN: No hay vehículos DISPONIBLES para asignar a la operación.");
    }

    for (const [index, vehiculo] of vehiculosDisponibles.entries()) {
      const uso = index === 0 ? "Transporte terrestre" : "Interceptor acuatico";

      await client.query(
        `
        INSERT INTO vehiculo_operacion
          (id_operacion, id_vehiculo, uso_en_operacion, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,'ASIGNADO',$4)
        ON CONFLICT (id_operacion, id_vehiculo) DO UPDATE
          SET uso_en_operacion = EXCLUDED.uso_en_operacion,
              estado_asignacion = EXCLUDED.estado_asignacion,
              asignado_por = EXCLUDED.asignado_por,
              fecha_asignacion = NOW()
        `,
        [idOp, vehiculo.id_vehiculo, uso, creadoPor]
      );
    }

    if (vehiculosDisponibles[0]) {
      await client.query(
        `
        INSERT INTO grupo_vehiculo
          (id_grupo_operacion, id_operacion, id_vehiculo, uso_en_grupo, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,$4,'ASIGNADO',$5)
        ON CONFLICT (id_grupo_operacion, id_vehiculo) DO NOTHING
        `,
        [idAguila1, idOp, vehiculosDisponibles[0].id_vehiculo, "Transporte terrestre", creadoPor]
      );
    }

    if (vehiculosDisponibles[1]) {
      await client.query(
        `
        INSERT INTO grupo_vehiculo
          (id_grupo_operacion, id_operacion, id_vehiculo, uso_en_grupo, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,$4,'ASIGNADO',$5)
        ON CONFLICT (id_grupo_operacion, id_vehiculo) DO NOTHING
        `,
        [idAguila2, idOp, vehiculosDisponibles[1].id_vehiculo, "Interceptor acuatico", creadoPor]
      );
    }

    // =========================================================
    // 11) EQUIPO REAL DISPONIBLE -> OPERACION
    // =========================================================
    const equiposDisponibles = await getAvailableEquipos(client, 4);

    if (equiposDisponibles.length === 0) {
      console.warn("WARN: No hay equipos DISPONIBLES para reservar en la operación.");
    }

    for (const equipo of equiposDisponibles) {
      await client.query(
        `
        INSERT INTO operacion_equipo
          (id_operacion, id_equipo, cantidad, uso_en_operacion, estado_asignacion, asignado_por)
        VALUES ($1,$2,1,$3,'ASIGNADO',$4)
        ON CONFLICT (id_operacion, id_equipo) DO UPDATE
          SET cantidad = EXCLUDED.cantidad,
              uso_en_operacion = EXCLUDED.uso_en_operacion,
              estado_asignacion = EXCLUDED.estado_asignacion,
              asignado_por = EXCLUDED.asignado_por,
              fecha_asignacion = NOW()
        `,
        [idOp, equipo.id_equipo, `${equipo.nombre} en operación`, creadoPor]
      );
    }

    // Repartir hasta 2 equipos a subgrupos
    if (equiposDisponibles[0]) {
      await client.query(
        `
        INSERT INTO grupo_equipo
          (id_grupo_operacion, id_operacion, id_equipo, cantidad, uso_en_grupo, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,1,$4,'ASIGNADO',$5)
        ON CONFLICT (id_grupo_operacion, id_equipo) DO NOTHING
        `,
        [idAguila1, idOp, equiposDisponibles[0].id_equipo, `${equiposDisponibles[0].nombre} para Aguila 1`, creadoPor]
      );
    }

    if (equiposDisponibles[1]) {
      await client.query(
        `
        INSERT INTO grupo_equipo
          (id_grupo_operacion, id_operacion, id_equipo, cantidad, uso_en_grupo, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,1,$4,'ASIGNADO',$5)
        ON CONFLICT (id_grupo_operacion, id_equipo) DO NOTHING
        `,
        [idAguila2, idOp, equiposDisponibles[1].id_equipo, `${equiposDisponibles[1].nombre} para Aguila 2`, creadoPor]
      );
    }

    // Instalar un equipo de comunicación en el primer vehículo disponible
    const equipoCom = equiposDisponibles.find((e) => e.categoria === "COMUNICACION");
    const primerVehiculo = vehiculosDisponibles[0];

    if (equipoCom && primerVehiculo) {
      await client.query(
        `
        INSERT INTO vehiculo_equipo
          (id_vehiculo, id_equipo, cantidad, estado)
        VALUES ($1,$2,1,'INSTALADO')
        ON CONFLICT (id_vehiculo, id_equipo) DO UPDATE
          SET cantidad = EXCLUDED.cantidad,
              estado = EXCLUDED.estado
        `,
        [primerVehiculo.id_vehiculo, equipoCom.id_equipo]
      );
    }

    // =========================================================
    // 12) ZONA PRINCIPAL DE LA OPERACION — Anton Lizardo, Veracruz
    // =========================================================
    const zonaGeometria = {
      type: "Polygon",
      coordinates: [[
        [-95.9950, 19.0750],
        [-95.9350, 19.0750],
        [-95.9350, 19.0250],
        [-95.9950, 19.0250],
        [-95.9950, 19.0750],
      ]],
    };

    await client.query(
      `
      INSERT INTO zona_operacion
        (id_operacion, nombre, geometria, centroide_lat, centroide_lon, zoom_inicial, color, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id_operacion) DO UPDATE
        SET nombre         = EXCLUDED.nombre,
            geometria      = EXCLUDED.geometria,
            centroide_lat  = EXCLUDED.centroide_lat,
            centroide_lon  = EXCLUDED.centroide_lon,
            zoom_inicial   = EXCLUDED.zoom_inicial,
            color          = EXCLUDED.color,
            creado_por     = EXCLUDED.creado_por,
            fecha_creacion = NOW()
      `,
      [
        idOp,
        "Zona Anton Lizardo",
        JSON.stringify(zonaGeometria),
        19.0460,
        -95.9709,
        1000,
        "#3b82f6",
        creadoPor,
      ]
    );

    // =========================================================
    // OP-NORTE-002 — PLANIFICADA
    // mlopez se repite (ya está en OP-PRUEBA-001 ACTIVA)
    // El resto del personal es completamente distinto
    // Fechas: 2025-07-01 → 2025-09-30 (sin solapamiento + buffer 12h)
    // =========================================================
    const OP2_CODIGO = "OP-NORTE-002";

    // mlopez: REPETIDO de OP-PRUEBA-001
    // rvega: CET nuevo
    // drios, fsilva, anavarro, pmendoza, hcastillo, eruiz: CELLs nuevos
    const personalOp2Usernames = [
      "mlopez",    // CET — REPETIDO
      "rvega",     // CET nuevo
      "drios",     // CELL nuevo
      "fsilva",    // CELL nuevo
      "anavarro",  // CELL nuevo
      "pmendoza",  // CELL nuevo
      "hcastillo", // CELL nuevo
      "eruiz",     // CELL nuevo
    ];

    await client.query(
      `
      INSERT INTO operacion
        (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por)
      VALUES
        ($1,$2,$3,'ALTA','PLANIFICADA','2025-07-01 08:00:00-06','2025-09-30 23:59:59-06',$4)
      ON CONFLICT (codigo) DO UPDATE
        SET nombre       = EXCLUDED.nombre,
            descripcion  = EXCLUDED.descripcion,
            prioridad    = EXCLUDED.prioridad,
            estado       = EXCLUDED.estado,
            fecha_inicio = EXCLUDED.fecha_inicio,
            fecha_fin    = EXCLUDED.fecha_fin,
            creada_por   = EXCLUDED.creada_por
      `,
      [
        OP2_CODIGO,
        "Operacion Norte 002",
        "Segunda operacion de prueba. mlopez (CET repetido de OP-001) lidera Aguila 3. rvega (CET nuevo) lidera Aguila 4. Celulas completamente distintas a OP-001.",
        creadoPor,
      ]
    );

    const op2Row = await client.query(
      `SELECT id_operacion FROM operacion WHERE codigo = $1 LIMIT 1`,
      [OP2_CODIGO]
    );
    const idOp2 = op2Row.rows[0].id_operacion;

    // -- Personal -> Operacion 2
    const personalAsignado2 = [];

    for (const username of personalOp2Usernames) {
      const persona = await getPersonalByUsername(client, username);
      if (!persona) {
        console.warn(`WARN OP2: personal "${username}" no encontrado, se omite`);
        continue;
      }

      personalAsignado2.push(persona);

      await client.query(
        `
        INSERT INTO asignacion_operacion_personal
          (id_operacion, id_personal, rol_en_operacion, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,'ASIGNADO',$4)
        ON CONFLICT (id_operacion, id_personal) DO UPDATE
          SET rol_en_operacion  = EXCLUDED.rol_en_operacion,
              estado_asignacion = EXCLUDED.estado_asignacion,
              asignado_por      = EXCLUDED.asignado_por,
              fecha_asignacion  = NOW()
        `,
        [idOp2, persona.id_personal, persona.rol, creadoPor]
      );
    }

    const cet2a = personalAsignado2.find((p) => p.username === "mlopez");
    const cet2b = personalAsignado2.find((p) => p.username === "rvega");
    const cells2_1 = personalAsignado2.filter((p) => ["drios", "fsilva", "anavarro"].includes(p.username));
    const cells2_2 = personalAsignado2.filter((p) => ["pmendoza", "hcastillo", "eruiz"].includes(p.username));

    if (!cet2a) throw new Error(`No se encontró mlopez para OP-NORTE-002.`);
    if (!cet2b) throw new Error(`No se encontró rvega para OP-NORTE-002.`);

    // -- Mando: mlopez -> Aguila 3 CELLs | rvega -> Aguila 4 CELLs
    for (const cell of cells2_1) {
      await client.query(
        `INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id_operacion, id_cell) DO NOTHING`,
        [idOp2, cet2a.id_personal, cell.id_personal, creadoPor]
      );
    }

    for (const cell of cells2_2) {
      await client.query(
        `INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id_operacion, id_cell) DO NOTHING`,
        [idOp2, cet2b.id_personal, cell.id_personal, creadoPor]
      );
    }

    // -- Grupo padre
    await client.query(
      `
      INSERT INTO grupo_operacion
        (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
      VALUES
        ($1,'Grupo NORTE','NORTE',NULL,'Grupo principal — Operacion Norte 002',$2)
      ON CONFLICT (id_operacion, nombre) DO NOTHING
      `,
      [idOp2, creadoPor]
    );

    const idPadre2 = await getGrupoId(client, idOp2, "Grupo NORTE");
    if (!idPadre2) throw new Error(`No se pudo obtener el grupo padre de OP-NORTE-002.`);

    // -- Subgrupos
    for (const nombre of ["Aguila 3", "Aguila 4"]) {
      await client.query(
        `
        INSERT INTO grupo_operacion
          (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
        VALUES ($1,$2,NULL,$3,$4,$5)
        ON CONFLICT (id_operacion, nombre) DO NOTHING
        `,
        [idOp2, nombre, idPadre2, `Subgrupo ${nombre}`, creadoPor]
      );
    }

    const idAguila3 = await getGrupoId(client, idOp2, "Aguila 3");
    const idAguila4 = await getGrupoId(client, idOp2, "Aguila 4");

    if (!idAguila3 || !idAguila4) throw new Error(`No se pudieron obtener los subgrupos de OP-NORTE-002.`);

    // -- Personal -> subgrupos
    for (const username of ["drios", "fsilva", "anavarro"]) {
      const persona = personalAsignado2.find((p) => p.username === username);
      if (!persona) continue;
      await client.query(
        `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
         VALUES ($1,$2,'CELL',$3)
         ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
        [idAguila3, persona.id_personal, creadoPor]
      );
    }

    for (const username of ["pmendoza", "hcastillo", "eruiz"]) {
      const persona = personalAsignado2.find((p) => p.username === username);
      if (!persona) continue;
      await client.query(
        `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
         VALUES ($1,$2,'CELL',$3)
         ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
        [idAguila4, persona.id_personal, creadoPor]
      );
    }

    // -- Chat (inactivo, op está PLANIFICADA)
    const chat2Res = await client.query(
      `INSERT INTO chat_operacion (id_operacion, activo)
       VALUES ($1, FALSE)
       ON CONFLICT (id_operacion) DO UPDATE SET activo = FALSE
       RETURNING id_chat`,
      [idOp2]
    );

    let idChat2 = chat2Res.rows?.[0]?.id_chat;
    if (!idChat2) {
      const chat2Lookup = await client.query(
        `SELECT id_chat FROM chat_operacion WHERE id_operacion = $1 LIMIT 1`,
        [idOp2]
      );
      if (chat2Lookup.rowCount === 0) throw new Error(`No se pudo crear el chat de OP-NORTE-002.`);
      idChat2 = chat2Lookup.rows[0].id_chat;
    }

    const idParticipanteAdmin2 = await ensureChatParticipantUsuario(client, idChat2, creadoPor);

    for (const persona of personalAsignado2) {
      await ensureChatParticipantPersonal(client, idChat2, persona.id_personal);
    }

    const msgCount2 = await client.query(
      `SELECT COUNT(*)::int AS total FROM mensaje_chat WHERE id_chat = $1`,
      [idChat2]
    );

    if ((msgCount2.rows[0]?.total ?? 0) === 0 && idParticipanteAdmin2) {
      await client.query(
        `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
         VALUES ($1,$2,$3,'SISTEMA')`,
        [idChat2, idParticipanteAdmin2, "Chat de OP-NORTE-002 inicializado. Operacion en fase de planeacion."]
      );
    }

    // -- Zona — Puerto de Veracruz
    const zonaGeometria2 = {
      type: "Polygon",
      coordinates: [[
        [-96.1600, 19.2300],
        [-96.0900, 19.2300],
        [-96.0900, 19.1700],
        [-96.1600, 19.1700],
        [-96.1600, 19.2300],
      ]],
    };

    await client.query(
      `
      INSERT INTO zona_operacion
        (id_operacion, nombre, geometria, centroide_lat, centroide_lon, zoom_inicial, color, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id_operacion) DO UPDATE
        SET nombre        = EXCLUDED.nombre,
            geometria     = EXCLUDED.geometria,
            centroide_lat = EXCLUDED.centroide_lat,
            centroide_lon = EXCLUDED.centroide_lon,
            zoom_inicial  = EXCLUDED.zoom_inicial,
            color         = EXCLUDED.color,
            creado_por    = EXCLUDED.creado_por,
            fecha_creacion = NOW()
      `,
      [
        idOp2,
        "Zona Puerto Veracruz",
        JSON.stringify(zonaGeometria2),
        19.2000,
        -96.1250,
        1200,
        "#f97316",
        creadoPor,
      ]
    );

    // =========================================================
    // OP-HISTORICA-003 — CERRADA
    // Operación que ya se ejecutó y concluyó exitosamente.
    // Fechas pasadas. Personal distinto al de las ops anteriores.
    // CET: lhernandez | CELLs: iperez, dortega, oreyes, dperez, dortiz, olopez
    // =========================================================
    const OP3_CODIGO = "OP-HISTORICA-003";

    const personalOp3Usernames = [
      "lhernandez", // CET
      "iperez",     // CELL
      "dortega",    // CELL
      "oreyes",     // CELL
      "dperez",     // CELL
      "dortiz",     // CELL
      "olopez",     // CELL
    ];

    // Insertar como PLANIFICADA para que los triggers permitan las asignaciones.
    // Al final del bloque se actualiza a CERRADA.
    await client.query(
      `
      INSERT INTO operacion
        (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por)
      VALUES
        ($1,$2,$3,'ALTA','PLANIFICADA','2024-09-01 06:00:00-06','2024-11-30 22:00:00-06',$4)
      ON CONFLICT (codigo) DO UPDATE SET estado = 'PLANIFICADA', nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, prioridad = EXCLUDED.prioridad, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, creada_por = EXCLUDED.creada_por
      `,
      [
        OP3_CODIGO,
        "Operacion Historica 003",
        "Operacion concluida exitosamente. Periodo: sept-nov 2024. CET lhernandez al mando. Objetivos cumplidos al 100%.",
        creadoPor,
      ]
    );

    const op3Row = await client.query(
      `SELECT id_operacion FROM operacion WHERE codigo = $1 LIMIT 1`,
      [OP3_CODIGO]
    );
    const idOp3 = op3Row.rows[0].id_operacion;

    // Personal -> Operacion 3
    const personalAsignado3 = [];

    for (const username of personalOp3Usernames) {
      const persona = await getPersonalByUsername(client, username);
      if (!persona) {
        console.warn(`WARN OP3: personal "${username}" no encontrado, se omite`);
        continue;
      }

      personalAsignado3.push(persona);

      await client.query(
        `
        INSERT INTO asignacion_operacion_personal
          (id_operacion, id_personal, rol_en_operacion, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,'ASIGNADO',$4)
        ON CONFLICT (id_operacion, id_personal) DO UPDATE
          SET rol_en_operacion  = EXCLUDED.rol_en_operacion,
              estado_asignacion = EXCLUDED.estado_asignacion,
              asignado_por      = EXCLUDED.asignado_por
        `,
        [idOp3, persona.id_personal, persona.rol, creadoPor]
      );
    }

    const cet3 = personalAsignado3.find((p) => p.username === "lhernandez");
    const cells3 = personalAsignado3.filter((p) => p.rol === "CELL");

    if (!cet3) throw new Error(`No se encontró lhernandez para OP-HISTORICA-003.`);

    // Mando
    for (const cell of cells3) {
      await client.query(
        `INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id_operacion, id_cell) DO NOTHING`,
        [idOp3, cet3.id_personal, cell.id_personal, creadoPor]
      );
    }

    // Grupo padre
    await client.query(
      `
      INSERT INTO grupo_operacion
        (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
      VALUES
        ($1,'Grupo HISTORICA','HISTORICA',NULL,'Grupo principal — Operacion Historica 003',$2)
      ON CONFLICT (id_operacion, nombre) DO NOTHING
      `,
      [idOp3, creadoPor]
    );

    const idPadre3 = await getGrupoId(client, idOp3, "Grupo HISTORICA");
    if (!idPadre3) throw new Error(`No se pudo obtener el grupo padre de OP-HISTORICA-003.`);

    // Subgrupos
    for (const nombre of ["Condor 1", "Condor 2"]) {
      await client.query(
        `
        INSERT INTO grupo_operacion
          (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
        VALUES ($1,$2,NULL,$3,$4,$5)
        ON CONFLICT (id_operacion, nombre) DO NOTHING
        `,
        [idOp3, nombre, idPadre3, `Subgrupo ${nombre}`, creadoPor]
      );
    }

    const idCondor1 = await getGrupoId(client, idOp3, "Condor 1");
    const idCondor2 = await getGrupoId(client, idOp3, "Condor 2");

    if (!idCondor1 || !idCondor2) throw new Error(`No se pudieron obtener los subgrupos de OP-HISTORICA-003.`);

    // Personal -> subgrupos
    for (const username of ["iperez", "dortega", "oreyes"]) {
      const persona = personalAsignado3.find((p) => p.username === username);
      if (!persona) continue;
      await client.query(
        `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
         VALUES ($1,$2,'CELL',$3)
         ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
        [idCondor1, persona.id_personal, creadoPor]
      );
    }

    for (const username of ["dperez", "dortiz", "olopez"]) {
      const persona = personalAsignado3.find((p) => p.username === username);
      if (!persona) continue;
      await client.query(
        `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
         VALUES ($1,$2,'CELL',$3)
         ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
        [idCondor2, persona.id_personal, creadoPor]
      );
    }

    // Chat cerrado
    const chat3Res = await client.query(
      `INSERT INTO chat_operacion (id_operacion, activo)
       VALUES ($1, TRUE)
       ON CONFLICT (id_operacion) DO UPDATE
         SET activo = TRUE,
             fecha_cierre = NULL
       RETURNING id_chat`,
      [idOp3]
    );

    let idChat3 = chat3Res.rows?.[0]?.id_chat;
    if (!idChat3) {
      const chat3Lookup = await client.query(
        `SELECT id_chat FROM chat_operacion WHERE id_operacion = $1 LIMIT 1`,
        [idOp3]
      );
      if (chat3Lookup.rowCount === 0) throw new Error(`No se pudo crear el chat de OP-HISTORICA-003.`);
      idChat3 = chat3Lookup.rows[0].id_chat;
    }

    const idPartAdmin3 = await ensureChatParticipantUsuario(client, idChat3, creadoPor);

    for (const persona of personalAsignado3) {
      await ensureChatParticipantPersonal(client, idChat3, persona.id_personal);
    }

    // Mensajes representativos de la operación
    if (idPartAdmin3) {
      const msgCount3 = await client.query(
        `SELECT COUNT(*)::int AS total FROM mensaje_chat WHERE id_chat = $1`,
        [idChat3]
      );

      if ((msgCount3.rows[0]?.total ?? 0) === 0) {
        const mensajes3 = [
          { contenido: "OPERACION ACTIVADA automáticamente por trigger de BD.", tipo: "SISTEMA" },
          { contenido: "Todos los elementos en posición. Iniciando fase de reconocimiento.", tipo: "NORMAL" },
          { contenido: "Sector norte asegurado. Sin novedades.", tipo: "NORMAL" },
          { contenido: "Objetivos cumplidos. Retirando unidades.", tipo: "NORMAL" },
          { contenido: "OPERACION CERRADA automáticamente por trigger de BD.", tipo: "SISTEMA" },
        ];

        for (const msg of mensajes3) {
          await client.query(
            `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
             VALUES ($1,$2,$3,$4)`,
            [idChat3, idPartAdmin3, msg.contenido, msg.tipo]
          );
        }
      }
    }

    // Zona
    const zonaGeometria3 = {
      type: "Polygon",
      coordinates: [[
        [-96.3500, 19.5500],
        [-96.2700, 19.5500],
        [-96.2700, 19.4800],
        [-96.3500, 19.4800],
        [-96.3500, 19.5500],
      ]],
    };

    await client.query(
      `
      INSERT INTO zona_operacion
        (id_operacion, nombre, geometria, centroide_lat, centroide_lon, zoom_inicial, color, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id_operacion) DO UPDATE
        SET nombre        = EXCLUDED.nombre,
            geometria     = EXCLUDED.geometria,
            centroide_lat = EXCLUDED.centroide_lat,
            centroide_lon = EXCLUDED.centroide_lon,
            zoom_inicial  = EXCLUDED.zoom_inicial,
            color         = EXCLUDED.color,
            creado_por    = EXCLUDED.creado_por,
            fecha_creacion = NOW()
      `,
      [
        idOp3,
        "Zona Xalapa",
        JSON.stringify(zonaGeometria3),
        19.5150,
        -96.3100,
        1100,
        "#16a34a",
        creadoPor,
      ]
    );

    // Deshabilitar triggers de validación/sync para poder cerrar la operación
    // sin que el trigger de chat intente insertar mensajes en una op ya cerrada
    await client.query(`ALTER TABLE operacion DISABLE TRIGGER tr_operacion_sync_chat_estado`);
    await client.query(`ALTER TABLE operacion DISABLE TRIGGER tr_operacion_touch`);
    await client.query(`ALTER TABLE mensaje_chat DISABLE TRIGGER tr_mensaje_chat_operacion_modificable`);
    await client.query(`ALTER TABLE asignacion_operacion_personal DISABLE TRIGGER tr_aop_operacion_modificable`);
    await client.query(`ALTER TABLE chat_operacion DISABLE TRIGGER tr_chat_operacion_touch`);

    await client.query(
      `UPDATE operacion SET estado = 'CERRADA' WHERE id_operacion = $1`,
      [idOp3]
    );
    await client.query(
      `UPDATE asignacion_operacion_personal SET estado_asignacion = 'LIBERADO'
       WHERE id_operacion = $1`,
      [idOp3]
    );
    await client.query(
      `UPDATE chat_operacion
       SET activo = FALSE, fecha_cierre = NOW()
       WHERE id_operacion = $1`,
      [idOp3]
    );

    // Re-habilitar triggers
    await client.query(`ALTER TABLE operacion ENABLE TRIGGER tr_operacion_sync_chat_estado`);
    await client.query(`ALTER TABLE operacion ENABLE TRIGGER tr_operacion_touch`);
    await client.query(`ALTER TABLE mensaje_chat ENABLE TRIGGER tr_mensaje_chat_operacion_modificable`);
    await client.query(`ALTER TABLE asignacion_operacion_personal ENABLE TRIGGER tr_aop_operacion_modificable`);
    await client.query(`ALTER TABLE chat_operacion ENABLE TRIGGER tr_chat_operacion_touch`);

    // =========================================================
    // OP-CANCELADA-004 — CANCELADA
    // Operación que fue planificada pero no llegó a ejecutarse.
    // Fechas futuras que nunca se alcanzaron.
    // CET: atorres | CELLs: cramirez es CUT así que solo personal disponible
    // Usamos a cramirez como CUT (no necesita mando_operacion)
    // y CELLs: mcruz, jmartinez, psanchez (ya libres, op1 cerrada en pasado)
    // NOTA: estas personas ya tienen ops pasadas/futuras sin solaparse
    // =========================================================
    const OP4_CODIGO = "OP-CANCELADA-004";

    const personalOp4Usernames = [
      "atorres",   // CUT
      "lhernandez",// CET
      "mcruz",     // CELL — también estuvo en OP-001 que es ACTIVA,
                   // pero OP-004 tiene fechas distintas sin solapamiento
      "jmartinez", // CELL
      "psanchez",  // CELL
    ];

    // Insertar como PLANIFICADA para que los triggers permitan las asignaciones.
    // Al final del bloque se actualiza a CANCELADA.
    await client.query(
      `
      INSERT INTO operacion
        (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por)
      VALUES
        ($1,$2,$3,'MEDIA','PLANIFICADA','2024-06-01 08:00:00-06','2024-08-31 23:59:59-06',$4)
      ON CONFLICT (codigo) DO UPDATE SET estado = 'PLANIFICADA', nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, prioridad = EXCLUDED.prioridad, fecha_inicio = EXCLUDED.fecha_inicio, fecha_fin = EXCLUDED.fecha_fin, creada_por = EXCLUDED.creada_por
      `,
      [
        OP4_CODIGO,
        "Operacion Cancelada 004",
        "Operacion planificada que fue cancelada antes de iniciar. Periodo junio-agosto 2024. Recursos liberados sin uso.",
        creadoPor,
      ]
    );

    const op4Row = await client.query(
      `SELECT id_operacion FROM operacion WHERE codigo = $1 LIMIT 1`,
      [OP4_CODIGO]
    );
    const idOp4 = op4Row.rows[0].id_operacion;

    // Personal -> Operacion 4
    const personalAsignado4 = [];

    for (const username of personalOp4Usernames) {
      const persona = await getPersonalByUsername(client, username);
      if (!persona) {
        console.warn(`WARN OP4: personal "${username}" no encontrado, se omite`);
        continue;
      }

      personalAsignado4.push(persona);

      await client.query(
        `
        INSERT INTO asignacion_operacion_personal
          (id_operacion, id_personal, rol_en_operacion, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,'ASIGNADO',$4)
        ON CONFLICT (id_operacion, id_personal) DO UPDATE
          SET rol_en_operacion  = EXCLUDED.rol_en_operacion,
              estado_asignacion = EXCLUDED.estado_asignacion,
              asignado_por      = EXCLUDED.asignado_por
        `,
        [idOp4, persona.id_personal, persona.rol, creadoPor]
      );
    }

    const cet4 = personalAsignado4.find((p) => p.username === "lhernandez");
    const cells4 = personalAsignado4.filter((p) => p.rol === "CELL");

    if (!cet4) throw new Error(`No se encontró lhernandez para OP-CANCELADA-004.`);

    // Mando (aunque se canceló, ya estaba asignado al planificar)
    for (const cell of cells4) {
      await client.query(
        `INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id_operacion, id_cell) DO NOTHING`,
        [idOp4, cet4.id_personal, cell.id_personal, creadoPor]
      );
    }

    // Grupo padre (ya estaba estructurado antes de cancelar)
    await client.query(
      `
      INSERT INTO grupo_operacion
        (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
      VALUES
        ($1,'Grupo CANCELADA','CANCELADA',NULL,'Grupo principal — Operacion Cancelada 004',$2)
      ON CONFLICT (id_operacion, nombre) DO NOTHING
      `,
      [idOp4, creadoPor]
    );

    const idPadre4 = await getGrupoId(client, idOp4, "Grupo CANCELADA");
    if (!idPadre4) throw new Error(`No se pudo obtener el grupo padre de OP-CANCELADA-004.`);

    // Un solo subgrupo (no llegaron a armar el segundo)
    await client.query(
      `
      INSERT INTO grupo_operacion
        (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
      VALUES ($1,'Jaguar 1',NULL,$2,'Subgrupo parcialmente organizado antes de cancelación',$3)
      ON CONFLICT (id_operacion, nombre) DO NOTHING
      `,
      [idOp4, idPadre4, creadoPor]
    );

    const idJaguar1 = await getGrupoId(client, idOp4, "Jaguar 1");
    if (!idJaguar1) throw new Error(`No se pudo obtener Jaguar 1 de OP-CANCELADA-004.`);

    for (const username of ["mcruz", "jmartinez", "psanchez"]) {
      const persona = personalAsignado4.find((p) => p.username === username);
      if (!persona) continue;
      await client.query(
        `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
         VALUES ($1,$2,'CELL',$3)
         ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
        [idJaguar1, persona.id_personal, creadoPor]
      );
    }

    // Chat cerrado (nunca estuvo activo)
    const chat4Res = await client.query(
      `INSERT INTO chat_operacion (id_operacion, activo)
       VALUES ($1, FALSE)
       ON CONFLICT (id_operacion) DO UPDATE
         SET activo = FALSE
       RETURNING id_chat`,
      [idOp4]
    );

    let idChat4 = chat4Res.rows?.[0]?.id_chat;
    if (!idChat4) {
      const chat4Lookup = await client.query(
        `SELECT id_chat FROM chat_operacion WHERE id_operacion = $1 LIMIT 1`,
        [idOp4]
      );
      if (chat4Lookup.rowCount === 0) throw new Error(`No se pudo crear el chat de OP-CANCELADA-004.`);
      idChat4 = chat4Lookup.rows[0].id_chat;
    }

    const idPartAdmin4 = await ensureChatParticipantUsuario(client, idChat4, creadoPor);

    for (const persona of personalAsignado4) {
      await ensureChatParticipantPersonal(client, idChat4, persona.id_personal);
    }

    if (idPartAdmin4) {
      const msgCount4 = await client.query(
        `SELECT COUNT(*)::int AS total FROM mensaje_chat WHERE id_chat = $1`,
        [idChat4]
      );

      if ((msgCount4.rows[0]?.total ?? 0) === 0) {
        const mensajes4 = [
          { contenido: "Chat de OP-CANCELADA-004 inicializado. Operacion en fase de planeacion.", tipo: "SISTEMA" },
          { contenido: "Planeación inicial completada. Esperando autorización para activar.", tipo: "NORMAL" },
          { contenido: "OPERACION CANCELADA automáticamente por trigger de BD.", tipo: "SISTEMA" },
        ];

        for (const msg of mensajes4) {
          await client.query(
            `INSERT INTO mensaje_chat (id_chat, id_participante, contenido, tipo_mensaje)
             VALUES ($1,$2,$3,$4)`,
            [idChat4, idPartAdmin4, msg.contenido, msg.tipo]
          );
        }
      }
    }

    // Zona (ya estaba definida antes de cancelar)
    const zonaGeometria4 = {
      type: "Polygon",
      coordinates: [[
        [-96.7200, 17.0700],
        [-96.6500, 17.0700],
        [-96.6500, 17.0100],
        [-96.7200, 17.0100],
        [-96.7200, 17.0700],
      ]],
    };

    await client.query(
      `
      INSERT INTO zona_operacion
        (id_operacion, nombre, geometria, centroide_lat, centroide_lon, zoom_inicial, color, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id_operacion) DO UPDATE
        SET nombre        = EXCLUDED.nombre,
            geometria     = EXCLUDED.geometria,
            centroide_lat = EXCLUDED.centroide_lat,
            centroide_lon = EXCLUDED.centroide_lon,
            zoom_inicial  = EXCLUDED.zoom_inicial,
            color         = EXCLUDED.color,
            creado_por    = EXCLUDED.creado_por,
            fecha_creacion = NOW()
      `,
      [
        idOp4,
        "Zona Oaxaca",
        JSON.stringify(zonaGeometria4),
        17.0400,
        -96.6850,
        1000,
        "#dc2626",
        creadoPor,
      ]
    );

    // Deshabilitar triggers para cancelar sin que el sync de chat falle
    await client.query(`ALTER TABLE operacion DISABLE TRIGGER tr_operacion_sync_chat_estado`);
    await client.query(`ALTER TABLE operacion DISABLE TRIGGER tr_operacion_touch`);
    await client.query(`ALTER TABLE mensaje_chat DISABLE TRIGGER tr_mensaje_chat_operacion_modificable`);
    await client.query(`ALTER TABLE asignacion_operacion_personal DISABLE TRIGGER tr_aop_operacion_modificable`);
    await client.query(`ALTER TABLE chat_operacion DISABLE TRIGGER tr_chat_operacion_touch`);

    await client.query(
      `UPDATE operacion SET estado = 'CANCELADA' WHERE id_operacion = $1`,
      [idOp4]
    );
    await client.query(
      `UPDATE asignacion_operacion_personal SET estado_asignacion = 'LIBERADO'
       WHERE id_operacion = $1`,
      [idOp4]
    );

    // Re-habilitar triggers
    await client.query(`ALTER TABLE operacion ENABLE TRIGGER tr_operacion_sync_chat_estado`);
    await client.query(`ALTER TABLE operacion ENABLE TRIGGER tr_operacion_touch`);
    await client.query(`ALTER TABLE mensaje_chat ENABLE TRIGGER tr_mensaje_chat_operacion_modificable`);
    await client.query(`ALTER TABLE asignacion_operacion_personal ENABLE TRIGGER tr_aop_operacion_modificable`);
    await client.query(`ALTER TABLE chat_operacion ENABLE TRIGGER tr_chat_operacion_touch`);

    await client.query("COMMIT");

    console.log("Seed OK");
    console.log(`Operacion 1 creada/actualizada: ${OP_CODIGO}      — ACTIVA      (id=${idOp})`);
    console.log(`Operacion 2 creada/actualizada: ${OP2_CODIGO}   — PLANIFICADA  (id=${idOp2})`);
    console.log(`Operacion 3 creada/actualizada: ${OP3_CODIGO} — CERRADA      (id=${idOp3})`);
    console.log(`Operacion 4 creada/actualizada: ${OP4_CODIGO} — CANCELADA    (id=${idOp4})`);
    console.log(`Password para usuarios seed: ${DEFAULT_PASSWORD}`);
    console.log(`Personal OP1: ${personalAsignado.length}`);
    console.log(`Personal OP2: ${personalAsignado2.length} (mlopez repetido)`);
    console.log(`Personal OP3: ${personalAsignado3.length}`);
    console.log(`Personal OP4: ${personalAsignado4.length}`);
    console.log(`Vehiculos del inventario: ${vehiculosDisponibles.length}`);
    console.log(`Equipos del inventario:   ${equiposDisponibles.length}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Seed falló (detalle):", e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();