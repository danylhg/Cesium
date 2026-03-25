import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: "localhost",
  port: 5433,
  user: "postgres",
  password: "pollito",
  database: "ops_db",
});

console.log("DB CONFIG TEST:", {
  host: "localhost",
  port: 5433,
  user: "postgres",
  password: "pollito",
  database: "ops_db",
});

pool
  .query("SELECT current_user, current_database()")
  .then((r) => console.log("DB OK:", r.rows[0]))
  .catch((e) => console.error("DB TEST ERROR:", e));