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
  { rol: "CUT",  nombre: "Carlos",  apellido: "Ramírez", puesto: "Coronel",           username: "cramirez",  apodo: "Ramírez" },
  { rol: "CUT",  nombre: "Ana",     apellido: "Torres",  puesto: "Teniente Coronel",  username: "atorres",   apodo: "Torres" },

  // CET
  { rol: "CET",  nombre: "Luis",    apellido: "Hernández", puesto: "Mayor",    username: "lhernandez", apodo: "Hernández" },
  { rol: "CET",  nombre: "María",   apellido: "López",     puesto: "Capitán",  username: "mlopez",     apodo: "López" },
  { rol: "CET",  nombre: "Ricardo", apellido: "Vega",      puesto: "Teniente", username: "rvega",      apodo: "Vega" },

  // CELL
  { rol: "CELL", nombre: "José",     apellido: "Martínez", puesto: "Sargento Primero",   username: "jmartinez", apodo: "Martínez" },
  { rol: "CELL", nombre: "Pedro",    apellido: "Sánchez",  puesto: "Sargento Segundo",   username: "psanchez",  apodo: "Sánchez" },
  { rol: "CELL", nombre: "Miguel",   apellido: "Cruz",     puesto: "Cabo",               username: "mcruz",     apodo: "Cruz" },
  { rol: "CELL", nombre: "Laura",    apellido: "Gómez",    puesto: "Soldado / Marinero", username: "lgomez",    apodo: "Gómez" },
  { rol: "CELL", nombre: "Juan",     apellido: "Flores",   puesto: "Soldado / Marinero", username: "jflores",   apodo: "Flores" },
  { rol: "CELL", nombre: "Sofía",    apellido: "Morales",  puesto: "Cabo",               username: "smorales",  apodo: "Morales" },
  { rol: "CELL", nombre: "Daniel",   apellido: "Ríos",     puesto: "Soldado / Marinero", username: "drios",     apodo: "Ríos" },
  { rol: "CELL", nombre: "Fernanda", apellido: "Silva",    puesto: "Soldado / Marinero", username: "fsilva",    apodo: "Silva" },
  { rol: "CELL", nombre: "Andrés",   apellido: "Navarro",  puesto: "Cabo",               username: "anavarro",  apodo: "Navarro" },
  { rol: "CELL", nombre: "Paola",    apellido: "Mendoza",  puesto: "Soldado / Marinero", username: "pmendoza",  apodo: "Mendoza" },
  { rol: "CELL", nombre: "Hugo",     apellido: "Castillo", puesto: "Sargento Segundo",   username: "hcastillo", apodo: "Castillo" },
  { rol: "CELL", nombre: "Elena",    apellido: "Ruiz",     puesto: "Soldado / Marinero", username: "eruiz",     apodo: "Ruiz" },
  { rol: "CELL", nombre: "Iván",     apellido: "Pérez",    puesto: "Cabo",               username: "iperez",    apodo: "Pérez" },
  { rol: "CELL", nombre: "Diana",    apellido: "Ortega",   puesto: "Soldado / Marinero", username: "dortega",   apodo: "Ortega" },
  { rol: "CELL", nombre: "Óscar",    apellido: "Reyes",    puesto: "Cabo",               username: "oreyes",    apodo: "Reyes" },
  { rol: "CELL", nombre: "Daniela",  apellido: "Pérez",    puesto: "Soldado / Marinero", username: "dperez",    apodo: "Pérez" },
  { rol: "CELL", nombre: "Diana",    apellido: "Ortiz",    puesto: "Soldado / Marinero", username: "dortiz",    apodo: "Ortiz" },
  { rol: "CELL", nombre: "Odalis",   apellido: "Lopez",    puesto: "Soldado / Marinero", username: "olopez",    apodo: "López" },
];

// ===== Helpers =====
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

    // =========================================================
    // 2) creado_por
    // =========================================================
    const adminRow = await client.query(
      `SELECT id_usuario FROM usuario WHERE username = $1 LIMIT 1`,
      ["admin"]
    );
    if (adminRow.rowCount === 0) throw new Error(`No existe el administrador "admin".`);
    const creadoPor = adminRow.rows[0].id_usuario;

    // =========================================================
    // 3) Personal -> tabla personal
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
    // 4) INVENTARIO BASE (VEHICULOS / EQUIPO)
    // =========================================================

    // -------------------------
    // VEHICULOS
    // -------------------------
    const vehiculosBase = [
      {
        codigo_interno: "VH-001",
        imagen_veh: "./uploads/vehiculo/Alacran.jpeg",
        tipo: "TACTICO",
        marca: "Alacran",
        modelo: "4x4",
        estado: "DISPONIBLE",
        capacidad: 6,
      },
      {
        codigo_interno: "VH-003",
        imagen_veh: "./uploads/vehiculo/Ford F-150.jpeg",
        tipo: "PICKUP",
        marca: "Ford",
        modelo: "F-150",
        estado: "DISPONIBLE",
        capacidad: 5,
      },
      {
        codigo_interno: "VH-004",
        imagen_veh: "./uploads/vehiculo/Panther.jpeg",
        tipo: "BLINDADO",
        marca: "Panther",
        modelo: "Blindado",
        estado: "DISPONIBLE",
        capacidad: 8,
      },
      {
        codigo_interno: "VH-005",
        imagen_veh: "./uploads/vehiculo/Scualo.jpeg",
        tipo: "INTERCEPTOR",
        marca: "Scualo",
        modelo: "Interceptor",
        estado: "DISPONIBLE",
        capacidad: 4,
      },
    ];

    for (const v of vehiculosBase) {
      await client.query(
        `
        INSERT INTO vehiculo
          (imagen_veh, codigo_interno, tipo, marca, modelo, estado, capacidad)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (codigo_interno) DO UPDATE
          SET imagen_veh = EXCLUDED.imagen_veh,
              tipo       = EXCLUDED.tipo,
              marca      = EXCLUDED.marca,
              modelo     = EXCLUDED.modelo,
              estado     = EXCLUDED.estado,
              capacidad  = EXCLUDED.capacidad
        `,
        [
          v.imagen_veh,
          v.codigo_interno,
          v.tipo,
          v.marca,
          v.modelo,
          v.estado,
          v.capacidad,
        ]
      );
    }

    // -------------------------
    // EQUIPO BASE
    // -------------------------
    const equiposBase = [
      {
        numero_serie: "HFC-001",
        nombre: "Harris Falcon",
        categoria: "COMUNICACION",
        estado: "DISPONIBLE",
        subtipo: "COMUNICACION",
        imagen_eq: "./uploads/equipo/comunicacion/Harris Falcon.jpeg",
        marca: "Harris",
        modelo: "Falcon III",
        notas: "Radio táctico multibanda",
      },
      {
        numero_serie: "DRN-001",
        nombre: "Dron VANT 01",
        categoria: "TACTICO",
        estado: "DISPONIBLE",
        subtipo: "TACTICO",
        imagen_eq: "./uploads/equipo/tactico/Dron vant 01.jpeg",
        tipo_tactico: "DRON",
        calibre: null,
        nivel: "VANT",
        notas: "Dron de vigilancia táctica no tripulado",
      },
    ];

    for (const e of equiposBase) {
      const eqInsert = await client.query(
        `
        INSERT INTO equipo
          (numero_serie, nombre, categoria, estado)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (numero_serie) DO UPDATE
          SET nombre    = EXCLUDED.nombre,
              categoria = EXCLUDED.categoria,
              estado    = EXCLUDED.estado
        RETURNING id_equipo
        `,
        [e.numero_serie, e.nombre, e.categoria, e.estado]
      );

      let idEquipo = eqInsert.rows?.[0]?.id_equipo;

      if (!idEquipo) {
        const eqRow = await client.query(
          `SELECT id_equipo FROM equipo WHERE numero_serie = $1`,
          [e.numero_serie]
        );
        if (eqRow.rowCount === 0) continue;
        idEquipo = eqRow.rows[0].id_equipo;
      }

      if (e.subtipo === "COMUNICACION") {
        await client.query(
          `
          INSERT INTO equipo_comunicacion
            (id_equipo, imagen_eqcom, marca, modelo, notas)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (id_equipo) DO UPDATE
            SET imagen_eqcom = EXCLUDED.imagen_eqcom,
                marca        = EXCLUDED.marca,
                modelo       = EXCLUDED.modelo,
                notas        = EXCLUDED.notas
          `,
          [idEquipo, e.imagen_eq, e.marca ?? null, e.modelo ?? null, e.notas ?? null]
        );

        await client.query(
          `DELETE FROM equipo_tactico WHERE id_equipo = $1`,
          [idEquipo]
        );
      } else {
        await client.query(
          `
          INSERT INTO equipo_tactico
            (id_equipo, imagen_eqtac, tipo_tactico, calibre, nivel, notas)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (id_equipo) DO UPDATE
            SET imagen_eqtac = EXCLUDED.imagen_eqtac,
                tipo_tactico = EXCLUDED.tipo_tactico,
                calibre      = EXCLUDED.calibre,
                nivel        = EXCLUDED.nivel,
                notas        = EXCLUDED.notas
          `,
          [
            idEquipo,
            e.imagen_eq,
            e.tipo_tactico ?? null,
            e.calibre ?? null,
            e.nivel ?? null,
            e.notas ?? null,
          ]
        );

        await client.query(
          `DELETE FROM equipo_comunicacion WHERE id_equipo = $1`,
          [idEquipo]
        );
      }
    }

    // =========================================================
    // 5) OPERACION DE PRUEBA
    // =========================================================
    const OP_CODIGO = "OP-PRUEBA-001";

    await client.query(
      `
      INSERT INTO operacion (codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin, creada_por)
      VALUES ($1,$2,$3,'MEDIA','ACTIVA','2025-02-09 08:00:00-06','2025-06-09 23:59:59-06',$4)
      ON CONFLICT (codigo) DO NOTHING
      `,
      [
        OP_CODIGO,
        "Operacion de Prueba SEDAM",
        "Operacion de validacion del sistema. CET: mlopez. Dos subgrupos de 3 celulas.",
        creadoPor,
      ]
    );

    const opRow = await client.query(
      `SELECT id_operacion FROM operacion WHERE codigo = $1`,
      [OP_CODIGO]
    );
    const idOp = opRow.rows[0].id_operacion;

    // =========================================================
    // 6) PERSONAL -> OPERACION
    // CET: mlopez | CELL: mcruz, jmartinez, psanchez, lgomez, jflores, smorales
    // =========================================================
    const personalOp = ["mlopez", "mcruz", "jmartinez", "psanchez", "lgomez", "jflores", "smorales"];

    for (const username of personalOp) {
      const pRow = await client.query(
        `SELECT id_personal, rol FROM personal WHERE username = $1`,
        [username]
      );
      if (pRow.rowCount === 0) {
        console.warn(`  WARN: personal "${username}" no encontrado, se omite`);
        continue;
      }
      const { id_personal, rol } = pRow.rows[0];

      await client.query(
        `
        INSERT INTO asignacion_operacion_personal
          (id_operacion, id_personal, rol_en_operacion, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,'ASIGNADO',$4)
        ON CONFLICT (id_operacion, id_personal) DO NOTHING
        `,
        [idOp, id_personal, rol, creadoPor]
      );
    }

    // =========================================================
    // 7) MANDO: mlopez (CET) -> 6 CELL
    // =========================================================
    const cetRow = await client.query(
      `SELECT id_personal FROM personal WHERE username = 'mlopez'`
    );
    const idCet = cetRow.rows[0].id_personal;

    const cellUsernames = ["mcruz", "jmartinez", "psanchez", "lgomez", "jflores", "smorales"];
    for (const username of cellUsernames) {
      const cRow = await client.query(
        `SELECT id_personal FROM personal WHERE username = $1`,
        [username]
      );
      if (cRow.rowCount === 0) continue;
      const idCell = cRow.rows[0].id_personal;

      await client.query(
        `
        INSERT INTO mando_operacion (id_operacion, id_cet, id_cell, asignado_por)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (id_operacion, id_cell) DO NOTHING
        `,
        [idOp, idCet, idCell, creadoPor]
      );
    }

    // =========================================================
    // 8) GRUPO PADRE
    // =========================================================
    await client.query(
      `
      INSERT INTO grupo_operacion (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
      VALUES ($1,'Grupo MLOPEZ','MLOPEZ',NULL,'Grupo principal bajo mando CET mlopez',$2)
      ON CONFLICT (id_operacion, nombre) DO NOTHING
      `,
      [idOp, creadoPor]
    );

    const padreRow = await client.query(
      `SELECT id_grupo_operacion FROM grupo_operacion WHERE id_operacion=$1 AND nombre='Grupo MLOPEZ'`,
      [idOp]
    );
    const idPadre = padreRow.rows[0].id_grupo_operacion;

    // =========================================================
    // 9) SUBGRUPOS
    // =========================================================
    for (const nombre of ["Aguila 1", "Aguila 2"]) {
      await client.query(
        `
        INSERT INTO grupo_operacion (id_operacion, nombre, apodo, id_grupo_padre, descripcion, creado_por)
        VALUES ($1,$2,NULL,$3,$4,$5)
        ON CONFLICT (id_operacion, nombre) DO NOTHING
        `,
        [idOp, nombre, idPadre, `Subgrupo ${nombre}`, creadoPor]
      );
    }

    const aguila1Row = await client.query(
      `SELECT id_grupo_operacion FROM grupo_operacion WHERE id_operacion=$1 AND nombre='Aguila 1'`,
      [idOp]
    );
    const aguila2Row = await client.query(
      `SELECT id_grupo_operacion FROM grupo_operacion WHERE id_operacion=$1 AND nombre='Aguila 2'`,
      [idOp]
    );
    const idAguila1 = aguila1Row.rows[0].id_grupo_operacion;
    const idAguila2 = aguila2Row.rows[0].id_grupo_operacion;

    // =========================================================
    // 10) CELULAS -> SUBGRUPOS (3 y 3)
    // =========================================================
    const subgrupos = [
      { idGrupo: idAguila1, usernames: ["mcruz", "jmartinez", "psanchez"] },
      { idGrupo: idAguila2, usernames: ["lgomez", "jflores", "smorales"] },
    ];

    for (const { idGrupo, usernames } of subgrupos) {
      for (const username of usernames) {
        const pRow = await client.query(
          `SELECT id_personal FROM personal WHERE username = $1`,
          [username]
        );
        if (pRow.rowCount === 0) continue;
        const idPersonal = pRow.rows[0].id_personal;

        await client.query(
          `
          INSERT INTO grupo_personal (id_grupo_operacion, id_personal, rol_en_grupo, asignado_por)
          VALUES ($1,$2,'CELL',$3)
          ON CONFLICT (id_grupo_operacion, id_personal) DO NOTHING
          `,
          [idGrupo, idPersonal, creadoPor]
        );
      }
    }

    // =========================================================
    // 11) VEHICULOS -> OPERACION (reserva previa obligatoria)
    // =========================================================
    const vehiculos = [
      { codigo: "VH-003", uso: "Transporte terrestre" },
      { codigo: "VH-005", uso: "Interceptor acuatico" },
    ];

    for (const { codigo, uso } of vehiculos) {
      const vRow = await client.query(
        `SELECT id_vehiculo FROM vehiculo WHERE codigo_interno = $1`,
        [codigo]
      );
      if (vRow.rowCount === 0) {
        console.warn(`  WARN: vehiculo "${codigo}" no encontrado`);
        continue;
      }
      const idVehiculo = vRow.rows[0].id_vehiculo;

      await client.query(
        `
        INSERT INTO vehiculo_operacion (id_operacion, id_vehiculo, uso_en_operacion, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,'ASIGNADO',$4)
        ON CONFLICT (id_operacion, id_vehiculo) DO NOTHING
        `,
        [idOp, idVehiculo, uso, creadoPor]
      );
    }

    // =========================================================
    // 12) VEHICULOS -> SUBGRUPOS
    // Ford F-150 (VH-003) -> Aguila 1 | Scualo (VH-005) -> Aguila 2
    // =========================================================
    const vehSubgrupos = [
      { codigo: "VH-003", idGrupo: idAguila1, uso: "Transporte terrestre" },
      { codigo: "VH-005", idGrupo: idAguila2, uso: "Interceptor acuatico" },
    ];

    for (const { codigo, idGrupo, uso } of vehSubgrupos) {
      const vRow = await client.query(
        `SELECT id_vehiculo FROM vehiculo WHERE codigo_interno = $1`,
        [codigo]
      );
      if (vRow.rowCount === 0) continue;
      const idVehiculo = vRow.rows[0].id_vehiculo;

      await client.query(
        `
        INSERT INTO grupo_vehiculo (id_grupo_operacion, id_operacion, id_vehiculo, uso_en_grupo, estado_asignacion, asignado_por)
        VALUES ($1,$2,$3,$4,'ASIGNADO',$5)
        ON CONFLICT (id_grupo_operacion, id_vehiculo) DO NOTHING
        `,
        [idGrupo, idOp, idVehiculo, uso, creadoPor]
      );
    }

    // =========================================================
    // 13) EQUIPO -> OPERACION (reserva previa obligatoria)
    // =========================================================
    const eqRow = await client.query(
      `SELECT id_equipo FROM equipo WHERE numero_serie = 'HFC-001'`
    );
    if (eqRow.rowCount > 0) {
      const idEquipo = eqRow.rows[0].id_equipo;

      await client.query(
        `
        INSERT INTO operacion_equipo (id_operacion, id_equipo, cantidad, uso_en_operacion, estado_asignacion, asignado_por)
        VALUES ($1,$2,1,'Radio tactico multibanda','ASIGNADO',$3)
        ON CONFLICT (id_operacion, id_equipo) DO NOTHING
        `,
        [idOp, idEquipo, creadoPor]
      );

      // =========================================================
      // 14) EQUIPO -> VEHICULO (Harris Falcon en Ford F-150)
      // =========================================================
      const vehFordRow = await client.query(
        `SELECT id_vehiculo FROM vehiculo WHERE codigo_interno = 'VH-003'`
      );
      if (vehFordRow.rowCount > 0) {
        const idVehFord = vehFordRow.rows[0].id_vehiculo;

        await client.query(
          `
          INSERT INTO vehiculo_equipo (id_vehiculo, id_equipo, cantidad, estado)
          VALUES ($1,$2,1,'INSTALADO')
          ON CONFLICT (id_vehiculo, id_equipo) DO NOTHING
          `,
          [idVehFord, idEquipo]
        );
      }
    }

    // =========================================================
    // 15) ZONA PRINCIPAL DE LA OPERACION — Anton Lizardo, Veracruz
    // =========================================================
    const zonaGeometria = {
      type: "Polygon",
      coordinates: [[
        [-95.9950, 19.0750],   // NO
        [-95.9350, 19.0750],   // NE
        [-95.9350, 19.0250],   // SE
        [-95.9950, 19.0250],   // SO
        [-95.9950, 19.0750],   // cierre
      ]]
    };

    await client.query(
      `
      INSERT INTO zona_operacion
        (id_operacion, nombre, geometria, centroide_lat, centroide_lon, zoom_inicial, color, creado_por)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id_operacion) DO UPDATE SET
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
        19.0460,   // centroide_lat
        -95.9709,  // centroide_lon
        1000,
        "#3b82f6",
        creadoPor,
      ]
    );

    console.log("  → Zona de operacion insertada: Antón Lizardo, Ver.");

    await client.query("COMMIT");
    console.log("Seed OK (usuario ADMIN + personal CUT/CET/CELL + inventario + operación)");
    console.log(`Password para todos: ${DEFAULT_PASSWORD}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Seed falló (detalle):", e);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();