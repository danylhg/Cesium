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
    SELECT id_vehiculo, codigo_interno, tipo, alias, capacidad, estado
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

async function getVehiculoByCodigo(client, codigoInterno) {
  const { rows, rowCount } = await client.query(
    `
    SELECT id_vehiculo, codigo_interno, tipo, alias, capacidad, estado
    FROM vehiculo
    WHERE codigo_interno = $1
    LIMIT 1
    `,
    [codigoInterno]
  );
  if (rowCount === 0) {
    throw new Error(`No existe el vehículo fijo ${codigoInterno}`);
  }
  return rows[0];
}

async function getEquipoBySerie(client, numeroSerie) {
  const { rows, rowCount } = await client.query(
    `
    SELECT id_equipo, numero_serie, nombre, categoria, estado
    FROM equipo
    WHERE numero_serie = $1
    LIMIT 1
    `,
    [numeroSerie]
  );
  if (rowCount === 0) {
    throw new Error(`No existe el equipo fijo ${numeroSerie}`);
  }
  return rows[0];
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

async function getPersonalIdStrict(client, username) {
  const persona = await getPersonalByUsername(client, username);
  if (!persona) {
    throw new Error(`No se encontró personal con username=${username}`);
  }
  return persona.id_personal;
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
    "cramirez",
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
    const cutOp1 = await getPersonalIdStrict(client, "cramirez");

    await client.query(
      `
      INSERT INTO operacion
        (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por, id_cut)
      VALUES
        ($1,$2,$3,'MEDIA','ACTIVA','2025-02-09 08:00:00-06','2025-06-09 23:59:59-06',$4,$5)
      ON CONFLICT (codigo) DO UPDATE
        SET nombre       = EXCLUDED.nombre,
            descripcion  = EXCLUDED.descripcion,
            prioridad    = EXCLUDED.prioridad,
            estado       = EXCLUDED.estado,
            fecha_inicio = EXCLUDED.fecha_inicio,
            fecha_fin    = EXCLUDED.fecha_fin,
            creada_por   = EXCLUDED.creada_por,
            id_cut       = EXCLUDED.id_cut
      `,
      [
        OP_CODIGO,
        "Operacion de Prueba SEDAM",
        "Operacion de validacion del sistema. CUT: cramirez. CET: mlopez. Dos subgrupos de 3 celulas. Vehiculos y equipos fijos del inventario: VH-001, VH-003, HFC-001 y DRN-001.",
        creadoPor,
        cutOp1,
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

    const idParticipanteAdmin = await ensureChatParticipantUsuario(client, idChat, creadoPor);

    for (const persona of personalAsignado) {
      await ensureChatParticipantPersonal(client, idChat, persona.id_personal);
    }

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
    // 10) RECURSOS FIJOS OP-PRUEBA-001
    // - 2 vehículos fijos
    // - 1 equipo de comunicación fijo instalado en 1 vehículo
    // - 1 equipo táctico fijo asignado a 1 personal
    // =========================================================
    const vehiculoAguila1 = await getVehiculoByCodigo(client, "VH-001");
    const vehiculoAguila2 = await getVehiculoByCodigo(client, "VH-003");

    const equipoComunicacion = await getEquipoBySerie(client, "HFC-001");
    const equipoTactico = await getEquipoBySerie(client, "DRN-001");

    const operadorTactico = await getPersonalByUsername(client, "mcruz");
    if (!operadorTactico) {
      throw new Error(`No se encontró el personal "mcruz" para asignarle el equipo táctico.`);
    }

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
      [idOp, vehiculoAguila1.id_vehiculo, "Vehículo fijo para Aguila 1", creadoPor]
    );

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
      [idOp, vehiculoAguila2.id_vehiculo, "Vehículo fijo para Aguila 2", creadoPor]
    );

    await client.query(
      `
      INSERT INTO grupo_vehiculo
        (id_grupo_operacion, id_operacion, id_vehiculo, uso_en_grupo, estado_asignacion, asignado_por)
      VALUES ($1,$2,$3,$4,'ASIGNADO',$5)
      ON CONFLICT (id_grupo_operacion, id_vehiculo) DO NOTHING
      `,
      [idAguila1, idOp, vehiculoAguila1.id_vehiculo, "Vehículo de traslado para Aguila 1", creadoPor]
    );

    await client.query(
      `
      INSERT INTO grupo_vehiculo
        (id_grupo_operacion, id_operacion, id_vehiculo, uso_en_grupo, estado_asignacion, asignado_por)
      VALUES ($1,$2,$3,$4,'ASIGNADO',$5)
      ON CONFLICT (id_grupo_operacion, id_vehiculo) DO NOTHING
      `,
      [idAguila2, idOp, vehiculoAguila2.id_vehiculo, "Vehículo de traslado para Aguila 2", creadoPor]
    );

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
      [idOp, equipoComunicacion.id_equipo, "Equipo de comunicación principal de la operación", creadoPor]
    );

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
      [idOp, equipoTactico.id_equipo, "Equipo táctico principal de la operación", creadoPor]
    );

    await client.query(
      `
      INSERT INTO vehiculo_equipo
        (id_vehiculo, id_equipo, cantidad, estado)
      VALUES ($1,$2,1,'INSTALADO')
      ON CONFLICT (id_vehiculo, id_equipo) DO UPDATE
        SET cantidad = EXCLUDED.cantidad,
            estado = EXCLUDED.estado,
            fecha_retiro = NULL
      `,
      [vehiculoAguila1.id_vehiculo, equipoComunicacion.id_equipo]
    );

    await client.query(
      `
      INSERT INTO grupo_equipo
        (id_grupo_operacion, id_operacion, id_equipo, cantidad, uso_en_grupo, estado_asignacion, asignado_por)
      VALUES ($1,$2,$3,1,$4,'ASIGNADO',$5)
      ON CONFLICT (id_grupo_operacion, id_equipo) DO UPDATE
        SET cantidad = EXCLUDED.cantidad,
            uso_en_grupo = EXCLUDED.uso_en_grupo,
            estado_asignacion = EXCLUDED.estado_asignacion,
            asignado_por = EXCLUDED.asignado_por,
            fecha_asignacion = NOW(),
            fecha_fin_asignacion = NULL
      `,
      [idAguila1, idOp, equipoComunicacion.id_equipo, "Radio instalada en vehículo de Aguila 1", creadoPor]
    );

    await client.query(
      `
      INSERT INTO personal_equipo
        (id_personal, id_equipo, cantidad, estado, asignado_por)
      VALUES ($1,$2,1,'ASIGNADO',$3)
      ON CONFLICT (id_personal, id_equipo) DO UPDATE
        SET cantidad = EXCLUDED.cantidad,
            estado = EXCLUDED.estado,
            asignado_por = EXCLUDED.asignado_por,
            fecha_asignacion = NOW(),
            fecha_devolucion = NULL
      `,
      [operadorTactico.id_personal, equipoTactico.id_equipo, creadoPor]
    );

    await client.query(
      `
      INSERT INTO uso_equipo_operacion
        (id_operacion, id_equipo, id_personal, cantidad, asignado_por, notas)
      VALUES ($1,$2,$3,1,$4,$5)
      ON CONFLICT (id_operacion, id_equipo, id_personal) DO UPDATE
        SET cantidad = EXCLUDED.cantidad,
            asignado_por = EXCLUDED.asignado_por,
            notas = EXCLUDED.notas,
            fecha_asignacion = NOW(),
            fecha_devolucion = NULL
      `,
      [idOp, equipoTactico.id_equipo, operadorTactico.id_personal, creadoPor, "Equipo táctico asignado al operador principal de Aguila 1"]
    );

    await client.query(
      `
      INSERT INTO grupo_equipo
        (id_grupo_operacion, id_operacion, id_equipo, cantidad, uso_en_grupo, estado_asignacion, asignado_por)
      VALUES ($1,$2,$3,1,$4,'ASIGNADO',$5)
      ON CONFLICT (id_grupo_operacion, id_equipo) DO UPDATE
        SET cantidad = EXCLUDED.cantidad,
            uso_en_grupo = EXCLUDED.uso_en_grupo,
            estado_asignacion = EXCLUDED.estado_asignacion,
            asignado_por = EXCLUDED.asignado_por,
            fecha_asignacion = NOW(),
            fecha_fin_asignacion = NULL
      `,
      [idAguila1, idOp, equipoTactico.id_equipo, "Dron táctico bajo resguardo de mcruz", creadoPor]
    );

    const vehiculosFijos = [vehiculoAguila1, vehiculoAguila2];
    const equiposFijos = [equipoComunicacion, equipoTactico];

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

    const personalOp2Usernames = [
      "atorres",
      "mlopez",
      "rvega",
      "drios",
      "fsilva",
      "anavarro",
      "pmendoza",
      "hcastillo",
      "eruiz",
    ];

    const cutOp2 = await getPersonalIdStrict(client, "atorres");

    await client.query(
      `
      INSERT INTO operacion
        (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por, id_cut)
      VALUES
        ($1,$2,$3,'ALTA','PLANIFICADA','2025-07-01 08:00:00-06','2025-09-30 23:59:59-06',$4,$5)
      ON CONFLICT (codigo) DO UPDATE
        SET nombre       = EXCLUDED.nombre,
            descripcion  = EXCLUDED.descripcion,
            prioridad    = EXCLUDED.prioridad,
            estado       = EXCLUDED.estado,
            fecha_inicio = EXCLUDED.fecha_inicio,
            fecha_fin    = EXCLUDED.fecha_fin,
            creada_por   = EXCLUDED.creada_por,
            id_cut       = EXCLUDED.id_cut
      `,
      [
        OP2_CODIGO,
        "Operacion Norte 002",
        "Segunda operacion de prueba. CUT: atorres. mlopez (CET repetido de OP-001) lidera Aguila 1. rvega (CET nuevo) lidera Aguila 2. Celulas completamente distintas a OP-001.",
        creadoPor,
        cutOp2,
      ]
    );

    const op2Row = await client.query(
      `SELECT id_operacion FROM operacion WHERE codigo = $1 LIMIT 1`,
      [OP2_CODIGO]
    );
    const idOp2 = op2Row.rows[0].id_operacion;

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

    for (const nombre of ["Aguila 1", "Aguila 2"]) {
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

    const idAguila1_OP2 = await getGrupoId(client, idOp2, "Aguila 1");
    const idAguila2_OP2 = await getGrupoId(client, idOp2, "Aguila 2");

    if (!idAguila1_OP2 || !idAguila2_OP2) {
      throw new Error(`No se pudieron obtener los subgrupos de OP-NORTE-002.`);
    }

    for (const username of ["drios", "fsilva", "anavarro"]) {
      const persona = personalAsignado2.find((p) => p.username === username);
      if (!persona) continue;
      await client.query(
        `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
         VALUES ($1,$2,'CELL',$3)
         ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
        [idAguila1_OP2, persona.id_personal, creadoPor]
      );
    }
    // CET Lopez leads Aguila 1
    await client.query(
      `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
       VALUES ($1,$2,'CET',$3)
       ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
      [idAguila1_OP2, cet2a.id_personal, creadoPor]
    );

    for (const username of ["pmendoza", "hcastillo", "eruiz"]) {
      const persona = personalAsignado2.find((p) => p.username === username);
      if (!persona) continue;
      await client.query(
        `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
         VALUES ($1,$2,'CELL',$3)
         ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
        [idAguila2_OP2, persona.id_personal, creadoPor]
      );
    }
    // CET Vega leads Aguila 2
    await client.query(
      `INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
       VALUES ($1,$2,'CET',$3)
       ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING`,
      [idAguila2_OP2, cet2b.id_personal, creadoPor]
    );

    // =========================================================
    // 10.2) RECURSOS OP-NORTE-002
    // =========================================================
    const vhNorte1 = await getVehiculoByCodigo(client, "VH-004");
    const vhNorte2 = await getVehiculoByCodigo(client, "VH-005");
    const eqComNorte = await getEquipoBySerie(client, "HFC-001");
    const eqTacNorte = await getEquipoBySerie(client, "DRN-001");

    // Vehiculos a Operacion
    for (const v of [vhNorte1, vhNorte2]) {
      await client.query(
        `INSERT INTO vehiculo_operacion (id_operacion, id_vehiculo, uso_en_operacion, estado_asignacion, asignado_por)
         VALUES ($1,$2,$3,'ASIGNADO',$4)
         ON CONFLICT (id_operacion, id_vehiculo) DO UPDATE SET estado_asignacion = 'ASIGNADO'`,
        [idOp2, v.id_vehiculo, "Vehiculo para Operacion Norte", creadoPor]
      );
    }

    // Equipos a Operacion
    for (const e of [eqComNorte, eqTacNorte]) {
      await client.query(
        `INSERT INTO operacion_equipo (id_operacion, id_equipo, cantidad, uso_en_operacion, estado_asignacion, asignado_por)
         VALUES ($1,$2,1,$3,'ASIGNADO',$4)
         ON CONFLICT (id_operacion, id_equipo) DO UPDATE SET estado_asignacion = 'ASIGNADO'`,
        [idOp2, e.id_equipo, "Equipo para Operacion Norte", creadoPor]
      );
    }

    // Vehiculos a Subgrupos
    await client.query(
      `INSERT INTO grupo_vehiculo (id_grupo_operacion, id_operacion, id_vehiculo, uso_en_grupo, estado_asignacion, asignado_por)
       VALUES ($1,$2,$3,'Transporte Panther Aguila 1','ASIGNADO',$4)
       ON CONFLICT (id_grupo_operacion, id_vehiculo) DO NOTHING`,
      [idAguila1_OP2, idOp2, vhNorte1.id_vehiculo, creadoPor]
    );
    await client.query(
      `INSERT INTO grupo_vehiculo (id_grupo_operacion, id_operacion, id_vehiculo, uso_en_grupo, estado_asignacion, asignado_por)
       VALUES ($1,$2,$3,'Interceptor Scualo Aguila 2','ASIGNADO',$4)
       ON CONFLICT (id_grupo_operacion, id_vehiculo) DO NOTHING`,
      [idAguila2_OP2, idOp2, vhNorte2.id_vehiculo, creadoPor]
    );

    // Equipos a Subgrupos
    await client.query(
      `INSERT INTO grupo_equipo (id_grupo_operacion, id_operacion, id_equipo, cantidad, uso_en_grupo, estado_asignacion, asignado_por)
       VALUES ($1,$2,$3,1,'Radio Aguila 1','ASIGNADO',$4)
       ON CONFLICT (id_grupo_operacion, id_equipo) DO NOTHING`,
      [idAguila1_OP2, idOp2, eqComNorte.id_equipo, creadoPor]
    );
    await client.query(
      `INSERT INTO grupo_equipo (id_grupo_operacion, id_operacion, id_equipo, cantidad, uso_en_grupo, estado_asignacion, asignado_por)
       VALUES ($1,$2,$3,1,'Dron Aguila 2','ASIGNADO',$4)
       ON CONFLICT (id_grupo_operacion, id_equipo) DO NOTHING`,
      [idAguila2_OP2, idOp2, eqTacNorte.id_equipo, creadoPor]
    );

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

    const zonaGeometria2 = {
      type: "Polygon",
      coordinates: [[
        [-96.9600, 19.5600],
        [-96.8900, 19.5600],
        [-96.8900, 19.5100],
        [-96.9600, 19.5100],
        [-96.9600, 19.5600],
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
        19.5390,
        -96.9270,
        1500,
        "#f97316",
        creadoPor,
      ]
    );

    // =========================================================
    // OP-HISTORICA-003 — CERRADA
    // =========================================================
    const OP3_CODIGO = "OP-HISTORICA-003";

    const personalOp3Usernames = [
      "cramirez",
      "lhernandez",
      "iperez",
      "dortega",
      "oreyes",
      "dperez",
      "dortiz",
      "olopez",
    ];

    const cutOp3 = await getPersonalIdStrict(client, "cramirez");

    await client.query(
      `
      INSERT INTO operacion
        (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por, id_cut)
      VALUES
        ($1,$2,$3,'ALTA','PLANIFICADA','2024-09-01 06:00:00-06','2024-11-30 22:00:00-06',$4,$5)
      ON CONFLICT (codigo) DO UPDATE
        SET estado       = 'PLANIFICADA',
            nombre       = EXCLUDED.nombre,
            descripcion  = EXCLUDED.descripcion,
            prioridad    = EXCLUDED.prioridad,
            fecha_inicio = EXCLUDED.fecha_inicio,
            fecha_fin    = EXCLUDED.fecha_fin,
            creada_por   = EXCLUDED.creada_por,
            id_cut       = EXCLUDED.id_cut
      `,
      [
        OP3_CODIGO,
        "Operacion Historica 003",
        "Operacion concluida exitosamente. Periodo: sept-nov 2024. CUT: cramirez. CET lhernandez al mando. Objetivos cumplidos al 100%.",
        creadoPor,
        cutOp3,
      ]
    );

    const op3Row = await client.query(
      `SELECT id_operacion FROM operacion WHERE codigo = $1 LIMIT 1`,
      [OP3_CODIGO]
    );
    const idOp3 = op3Row.rows[0].id_operacion;

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

    for (const cell of cells3) {
      await client.query(
        `INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id_operacion, id_cell) DO NOTHING`,
        [idOp3, cet3.id_personal, cell.id_personal, creadoPor]
      );
    }

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

    await client.query(`ALTER TABLE operacion ENABLE TRIGGER tr_operacion_sync_chat_estado`);
    await client.query(`ALTER TABLE operacion ENABLE TRIGGER tr_operacion_touch`);
    await client.query(`ALTER TABLE mensaje_chat ENABLE TRIGGER tr_mensaje_chat_operacion_modificable`);
    await client.query(`ALTER TABLE asignacion_operacion_personal ENABLE TRIGGER tr_aop_operacion_modificable`);
    await client.query(`ALTER TABLE chat_operacion ENABLE TRIGGER tr_chat_operacion_touch`);

    // =========================================================
    // OP-CANCELADA-004 — CANCELADA
    // =========================================================
    const OP4_CODIGO = "OP-CANCELADA-004";

    const personalOp4Usernames = [
      "atorres",
      "lhernandez",
      "mcruz",
      "jmartinez",
      "psanchez",
    ];

    const cutOp4 = await getPersonalIdStrict(client, "atorres");

    await client.query(
      `
      INSERT INTO operacion
        (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por, id_cut)
      VALUES
        ($1,$2,$3,'MEDIA','PLANIFICADA','2024-06-01 08:00:00-06','2024-08-31 23:59:59-06',$4,$5)
      ON CONFLICT (codigo) DO UPDATE
        SET estado       = 'PLANIFICADA',
            nombre       = EXCLUDED.nombre,
            descripcion  = EXCLUDED.descripcion,
            prioridad    = EXCLUDED.prioridad,
            fecha_inicio = EXCLUDED.fecha_inicio,
            fecha_fin    = EXCLUDED.fecha_fin,
            creada_por   = EXCLUDED.creada_por,
            id_cut       = EXCLUDED.id_cut
      `,
      [
        OP4_CODIGO,
        "Operacion Cancelada 004",
        "Operacion planificada que fue cancelada antes de iniciar. Periodo junio-agosto 2024. CUT: atorres. Recursos liberados sin uso.",
        creadoPor,
        cutOp4,
      ]
    );

    const op4Row = await client.query(
      `SELECT id_operacion FROM operacion WHERE codigo = $1 LIMIT 1`,
      [OP4_CODIGO]
    );
    const idOp4 = op4Row.rows[0].id_operacion;

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

    for (const cell of cells4) {
      await client.query(
        `INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id_operacion, id_cell) DO NOTHING`,
        [idOp4, cet4.id_personal, cell.id_personal, creadoPor]
      );
    }

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

    // Liberar tambien recursos si tuviera
    await client.query(`UPDATE vehiculo_operacion SET estado_asignacion = 'LIBERADO' WHERE id_operacion = $1`, [idOp4]);
    await client.query(`UPDATE operacion_equipo SET estado_asignacion = 'LIBERADO' WHERE id_operacion = $1`, [idOp4]);

    await client.query(`ALTER TABLE operacion ENABLE TRIGGER tr_operacion_sync_chat_estado`);
    await client.query(`ALTER TABLE operacion ENABLE TRIGGER tr_operacion_touch`);
    await client.query(`ALTER TABLE mensaje_chat ENABLE TRIGGER tr_mensaje_chat_operacion_modificable`);
    await client.query(`ALTER TABLE asignacion_operacion_personal ENABLE TRIGGER tr_aop_operacion_modificable`);
    await client.query(`ALTER TABLE chat_operacion ENABLE TRIGGER tr_chat_operacion_touch`);

    await client.query("COMMIT");

    console.log("Seed OK");
    console.log(`Operacion 1 creada/actualizada: ${OP_CODIGO}      — ACTIVA      (id=${idOp})  CUT=cramirez`);
    console.log(`Operacion 2 creada/actualizada: ${OP2_CODIGO}   — PLANIFICADA  (id=${idOp2}) CUT=atorres`);
    console.log(`Operacion 3 creada/actualizada: ${OP3_CODIGO} — CERRADA      (id=${idOp3}) CUT=cramirez`);
    console.log(`Operacion 4 creada/actualizada: ${OP4_CODIGO} — CANCELADA    (id=${idOp4}) CUT=atorres`);
    console.log(`Password para usuarios seed: ${DEFAULT_PASSWORD}`);
    console.log(`Personal OP1: ${personalAsignado.length}`);
    console.log(`Personal OP2: ${personalAsignado2.length} (mlopez repetido)`);
    console.log(`Personal OP3: ${personalAsignado3.length}`);
    console.log(`Personal OP4: ${personalAsignado4.length}`);
    console.log(`Vehiculos fijos OP1: ${vehiculosFijos.length}`);
    console.log(`Equipos fijos OP1:   ${equiposFijos.length}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Seed falló (detalle):", e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();