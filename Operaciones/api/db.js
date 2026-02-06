import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || "postgres",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "operaciones",
  password: process.env.PGPASSWORD || "operaciones123",
  database: process.env.PGDATABASE || "operaciones_db",
});
