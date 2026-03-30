import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: "localhost",
  port: 5433,
  user: "postgres",
  password: "pollito",
  database: "ops_db",
});

async function check() {
  try {
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'vehiculo_operacion'
    `);
    console.log("Columns in vehiculo_operacion:");
    res.rows.forEach(r => console.log("- " + r.column_name));
  } catch (e) {
    console.error("Error checking schema:", e);
  } finally {
    await pool.end();
  }
}

check();
