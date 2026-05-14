import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "1234",
  database: "ops_db",
});

console.log("DB CONFIG TEST:", {
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "1234",
  database: "ops_db",
});

pool
  .query("SELECT current_user, current_database()")
  .then((r) => console.log("DB OK:", r.rows[0]))
  .catch((e) => console.error("DB TEST ERROR:", e));

//export const pool = new Pool({
//host: process.env.PGHOST || "postgres",
//port: Number(process.env.PGPORT || 5432),
//user: process.env.PGUSER || "operaciones",
//password: process.env.PGPASSWORD || "operaciones123",
//database: process.env.PGDATABASE || "operaciones_db",
// });