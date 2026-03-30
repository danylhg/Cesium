import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: "localhost",
  port: 5433,
  user: "postgres",
  password: "pollito",
  database: "ops_db",
});

async function migrate() {
  try {
    console.log("Migrating database...");
    await pool.query(`
      ALTER TABLE vehiculo_operacion 
      ADD COLUMN IF NOT EXISTS id_personal INTEGER REFERENCES personal(id_personal) ON DELETE SET NULL;
    `);
    console.log("Migration successful: id_personal column added to vehiculo_operacion.");
  } catch (e) {
    console.error("Error migrating schema:", e);
  } finally {
    await pool.end();
  }
}

migrate();
