import "dotenv/config";
import pkg from "pg";
import bcrypt from "bcryptjs";

const { Client } = pkg;

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || "1234";

const users = [
  { rol: "ADMIN",  nombre: "Admin",  apellido: "Principal", puesto: "Sistema",  username: "admin" },

  { rol: "CUT",  nombre: "Carlos", apellido: "Ramírez",   puesto: "Comandante Unidad Táctica",  username: "cramirez" },
  { rol: "CUT",  nombre: "Ana",    apellido: "Torres",    puesto: "Comandante Unidad Táctica",  username: "atorres" },

  { rol: "CET",  nombre: "Luis",   apellido: "Hernández", puesto: "Comandante Equipo de Trabajo", username: "lhernandez" },
  { rol: "CET",  nombre: "María",  apellido: "López",     puesto: "Comandante Equipo de Trabajo", username: "mlopez" },
  { rol: "CET",  nombre: "Ricardo",apellido: "Vega",      puesto: "Comandante Equipo de Trabajo", username: "rvega" },

  { rol: "CELL", nombre: "José",   apellido: "Martínez",  puesto: "Célula", username: "jmartinez" },
  { rol: "CELL", nombre: "Pedro",  apellido: "Sánchez",   puesto: "Célula", username: "psanchez" },
  { rol: "CELL", nombre: "Miguel", apellido: "Cruz",      puesto: "Célula", username: "mcruz" },
  { rol: "CELL", nombre: "Laura",  apellido: "Gómez",     puesto: "Célula", username: "lgomez" },
  { rol: "CELL", nombre: "Juan",   apellido: "Flores",    puesto: "Célula", username: "jflores" },
  { rol: "CELL", nombre: "Sofía",  apellido: "Morales",   puesto: "Célula", username: "smorales" },
  { rol: "CELL", nombre: "Daniel", apellido: "Ríos",      puesto: "Célula", username: "drios" },
  { rol: "CELL", nombre: "Fernanda",apellido:"Silva",     puesto: "Célula", username: "fsilva" },
  { rol: "CELL", nombre: "Andrés", apellido: "Navarro",   puesto: "Célula", username: "anavarro" },
  { rol: "CELL", nombre: "Paola",  apellido: "Mendoza",   puesto: "Célula", username: "pmendoza" },
  { rol: "CELL", nombre: "Hugo",   apellido: "Castillo",  puesto: "Célula", username: "hcastillo" },
  { rol: "CELL", nombre: "Elena",  apellido: "Ruiz",      puesto: "Célula", username: "eruiz" },
  { rol: "CELL", nombre: "Iván",   apellido: "Pérez",     puesto: "Célula", username: "iperez" },
  { rol: "CELL", nombre: "Diana",  apellido: "Ortega",    puesto: "Célula", username: "dortega" },
  { rol: "CELL", nombre: "Óscar",  apellido: "Reyes",     puesto: "Célula", username: "oreyes" },
  { rol: "CELL", nombre: "Daniela",   apellido: "Pérez",  puesto: "Célula", username: "dperez" },
  { rol: "CELL", nombre: "Diana",  apellido: "Ortiz",    puesto: "Célula", username: "dortiz" },
  { rol: "CELL", nombre: "Odalis",  apellido: "lopez",     puesto: "Célula", username: "olopez" },
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno ${name} en tu .env`);
  return v;
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

  const cutUsers = users.filter((u) => u.rol === "ADMIN");
  const personalUsers = users.filter((u) => u.rol === "CUT" || u.rol === "CET" || u.rol === "CELL");

  try {
    await client.query("BEGIN");

    // 1) Inserta/actualiza CUT en tabla usuario
    for (const u of cutUsers) {
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

    // 2) Agarra el id del usuario admin (creador) para personal.creado_por
    const adminRow = await client.query(
      `SELECT id_usuario FROM usuario WHERE username = $1 LIMIT 1`,
      ["admin"]
    );
    if (adminRow.rowCount === 0) {
      throw new Error(`No existe el administrador "admin". Asegúrate de que esté en el array users.`);
    }
    const creadoPor = adminRow.rows[0].id_usuario;

    // 3) Inserta/actualiza CET/CELL en tabla personal
    for (const p of personalUsers) {
      const hash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

      await client.query(
        `
        INSERT INTO personal (rol, nombre, apellido, puesto, username, password_hash, activo, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6, TRUE, $7)
        ON CONFLICT (username) DO UPDATE
          SET rol = EXCLUDED.rol,
              nombre = EXCLUDED.nombre,
              apellido = EXCLUDED.apellido,
              puesto = EXCLUDED.puesto,
              password_hash = EXCLUDED.password_hash,
              activo = TRUE,
              creado_por = EXCLUDED.creado_por
        `,
        [p.rol, p.nombre, p.apellido, p.puesto, p.username, hash, creadoPor]
      );
    }

    await client.query("COMMIT");
    console.log("Seed OK (usuario ADMIN + personal CUT/CET/CELL)");
    console.log(`Password para todos: ${DEFAULT_PASSWORD}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Seed falló (detalle):", e); // <-- importante para ver TODO
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
