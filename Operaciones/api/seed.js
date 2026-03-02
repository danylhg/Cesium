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
  { rol: "CELL", nombre: "José",     apellido: "Martínez", puesto: "Sargento Primero",  username: "jmartinez", apodo: "Martínez" },
  { rol: "CELL", nombre: "Pedro",    apellido: "Sánchez",  puesto: "Sargento Segundo",  username: "psanchez",  apodo: "Sánchez" },
  { rol: "CELL", nombre: "Miguel",   apellido: "Cruz",     puesto: "Cabo",              username: "mcruz",     apodo: "Cruz" },
  { rol: "CELL", nombre: "Laura",    apellido: "Gómez",    puesto: "Soldado / Marinero",username: "lgomez",    apodo: "Gómez" },
  { rol: "CELL", nombre: "Juan",     apellido: "Flores",   puesto: "Soldado / Marinero",username: "jflores",   apodo: "Flores" },
  { rol: "CELL", nombre: "Sofía",    apellido: "Morales",  puesto: "Cabo",              username: "smorales",  apodo: "Morales" },
  { rol: "CELL", nombre: "Daniel",   apellido: "Ríos",     puesto: "Soldado / Marinero",username: "drios",     apodo: "Ríos" },
  { rol: "CELL", nombre: "Fernanda", apellido: "Silva",    puesto: "Soldado / Marinero",username: "fsilva",    apodo: "Silva" },
  { rol: "CELL", nombre: "Andrés",   apellido: "Navarro",  puesto: "Cabo",              username: "anavarro",  apodo: "Navarro" },
  { rol: "CELL", nombre: "Paola",    apellido: "Mendoza",  puesto: "Soldado / Marinero",username: "pmendoza",  apodo: "Mendoza" },
  { rol: "CELL", nombre: "Hugo",     apellido: "Castillo", puesto: "Sargento Segundo",  username: "hcastillo", apodo: "Castillo" },
  { rol: "CELL", nombre: "Elena",    apellido: "Ruiz",     puesto: "Soldado / Marinero",username: "eruiz",     apodo: "Ruiz" },
  { rol: "CELL", nombre: "Iván",     apellido: "Pérez",    puesto: "Cabo",              username: "iperez",    apodo: "Pérez" },
  { rol: "CELL", nombre: "Diana",    apellido: "Ortega",   puesto: "Soldado / Marinero",username: "dortega",   apodo: "Ortega" },
  { rol: "CELL", nombre: "Óscar",    apellido: "Reyes",    puesto: "Cabo",              username: "oreyes",    apodo: "Reyes" },
  { rol: "CELL", nombre: "Daniela",  apellido: "Pérez",    puesto: "Soldado / Marinero",username: "dperez",    apodo: "Pérez" }, // <- duplicado a propósito (se resolverá)
  { rol: "CELL", nombre: "Diana",    apellido: "Ortiz",    puesto: "Soldado / Marinero",username: "dortiz",    apodo: "Ortiz" },
  { rol: "CELL", nombre: "Odalis",   apellido: "Lopez",    puesto: "Soldado / Marinero",username: "olopez",    apodo: "López" }, // <- puede chocar con "López" CET (se resolverá)
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
  // NOT NULL + UNIQUE (personal.apodo)
  let base = cleanApodo(wanted);
  if (!base) base = "SinApodo";

  // Si ya existe, intenta "base 2", "base 3", ...
  for (let n = 0; n < 200; n++) {
    const apodo = (n === 0 ? base : `${base} ${n + 1}`).slice(0, 40);

    const { rows } = await client.query(
      `SELECT 1 FROM personal WHERE apodo = $1 LIMIT 1`,
      [apodo]
    );
    if (rows.length === 0) return apodo;
  }

  // Último recurso
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

    // 1) ADMIN -> tabla usuario
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

    // 2) creado_por
    const adminRow = await client.query(
      `SELECT id_usuario FROM usuario WHERE username = $1 LIMIT 1`,
      ["admin"]
    );
    if (adminRow.rowCount === 0) throw new Error(`No existe el administrador "admin".`);
    const creadoPor = adminRow.rows[0].id_usuario;

    // 3) Personal -> tabla personal
    for (const p of personalUsers) {
      const hash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

      // ✅ apodo humano (apellido / nombre / username) y garantizado único
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
          SET rol = EXCLUDED.rol,
              apodo = EXCLUDED.apodo,
              nombre = EXCLUDED.nombre,
              apellido = EXCLUDED.apellido,
              puesto = EXCLUDED.puesto,
              password_hash = EXCLUDED.password_hash,
              activo = TRUE,
              creado_por = EXCLUDED.creado_por
        `,
        [p.rol, apodoFinal, p.nombre, p.apellido, p.puesto, p.username, hash, creadoPor]
      );
    }

    await client.query("COMMIT");
    console.log("Seed OK (usuario ADMIN + personal CUT/CET/CELL)");
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