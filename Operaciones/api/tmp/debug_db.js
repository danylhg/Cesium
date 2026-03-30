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
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'vehiculo_operacion'
    `);
    console.log("Structure of vehiculo_operacion in ops_db:");
    res.rows.forEach(r => console.log(`- ${r.table_name}: ${r.column_name}`));
    
    if (!res.rows.some(r => r.column_name === 'id_personal')) {
        console.log("id_personal NOT FOUND. Attempting ADD COLUMN...");
        await pool.query("ALTER TABLE vehiculo_operacion ADD COLUMN id_personal INTEGER;");
        console.log("ADD COLUMN command executed.");
    } else {
        console.log("id_personal FOUND in public.vehiculo_operacion.");
    }
  } catch (e) {
    console.error("DEBUG ERROR:", e);
  } finally {
    await pool.end();
  }
}

check();
