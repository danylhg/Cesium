import "dotenv/config";
import pkg from "pg";
import bcrypt from "bcryptjs";

const { Client } = pkg;

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || "1234";

const users = [
  { rol: "CUT", nombre: "ADMIN", apellido: "ADMIN", puesto: "Comandante Unidad Táctica", username: "ADMIN" },
  { rol: "CUT", nombre: "Carlos", apellido: "Ramírez", puesto: "Comandante Unidad Táctica", username: "cramirez" },
  { rol: "CUT", nombre: "Ana", apellido: "Torres", puesto: "Comandante Unidad Táctica", username: "atorres" },

  { rol: "CET", nombre: "Luis", apellido: "Hernández", puesto: "Comandante Equipo de Trabajo", username: "lhernandez" },
  { rol: "CET", nombre: "María", apellido: "López", puesto: "Comandante Equipo de Trabajo", username: "mlopez" },
  { rol: "CET", nombre: "Ricardo", apellido: "Vega", puesto: "Comandante Equipo de Trabajo", username: "rvega" },

  { rol: "CELL", nombre: "José", apellido: "Martínez", puesto: "Célula", username: "jmartinez" },
  { rol: "CELL", nombre: "Pedro", apellido: "Sánchez", puesto: "Célula", username: "psanchez" },
  { rol: "CELL", nombre: "Miguel", apellido: "Cruz", puesto: "Célula", username: "mcruz" },
  { rol: "CELL", nombre: "Laura", apellido: "Gómez", puesto: "Célula", username: "lgomez" },
  { rol: "CELL", nombre: "Juan", apellido: "Flores", puesto: "Célula", username: "jflores" },
  { rol: "CELL", nombre: "Sofía", apellido: "Morales", puesto: "Célula", username: "smorales" },
  { rol: "CELL", nombre: "Daniel", apellido: "Ríos", puesto: "Célula", username: "drios" },
  { rol: "CELL", nombre: "Fernanda", apellido: "Silva", puesto: "Célula", username: "fsilva" },
  { rol: "CELL", nombre: "Andrés", apellido: "Navarro", puesto: "Célula", username: "anavarro" },
  { rol: "CELL", nombre: "Paola", apellido: "Mendoza", puesto: "Célula", username: "pmendoza" },
  { rol: "CELL", nombre: "Hugo", apellido: "Castillo", puesto: "Célula", username: "hcastillo" },
  { rol: "CELL", nombre: "Elena", apellido: "Ruiz", puesto: "Célula", username: "eruiz" },
  { rol: "CELL", nombre: "Iván", apellido: "Pérez", puesto: "Célula", username: "iperez" },
  { rol: "CELL", nombre: "Diana", apellido: "Ortega", puesto: "Célula", username: "dortega" },
  { rol: "CELL", nombre: "Óscar", apellido: "Reyes", puesto: "Célula", username: "oreyes" },
];

async function main() {
  // Conexión basada en tu .env
  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    for (const u of users) {
      const hash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

      await client.query(
        `
        INSERT INTO usuario (rol, nombre, apellido, puesto, username, password_hash)
        VALUES ($1,$2,$3,$4,$5,$6)
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

    await client.query("COMMIT");
    console.log("Seed usuarios OK");
    console.log(`Password para todos: ${DEFAULT_PASSWORD}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Seed falló:", e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
