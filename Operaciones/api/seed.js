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
          "Chat operacional inicializado automáticamente por el seed.",
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

    await client.query("COMMIT");

    console.log("Seed OK");
    console.log(`Operacion creada/actualizada: ${OP_CODIGO} (id_operacion=${idOp})`);
    console.log(`Password para usuarios seed: ${DEFAULT_PASSWORD}`);
    console.log(`Personal asignado: ${personalAsignado.length}`);
    console.log(`Vehiculos tomados del inventario real: ${vehiculosDisponibles.length}`);
    console.log(`Equipos tomados del inventario real: ${equiposDisponibles.length}`);
    console.log(`Chat creado/actualizado: id_chat=${idChat}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Seed falló (detalle):", e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();