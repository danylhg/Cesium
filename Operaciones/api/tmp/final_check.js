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
        AND table_name IN ('vehiculo_operacion', 'operacion_equipo')
    `);
    console.log("Structure of public tables in ops_db:");
    const tables = {};
    res.rows.forEach(r => {
        if (!tables[r.table_name]) tables[r.table_name] = [];
        tables[r.table_name].push(r.column_name);
    });
    
    Object.keys(tables).sort().forEach(t => {
        console.log(`- ${t}: ${tables[t].sort().join(", ")}`);
    });

  } catch (e) {
    console.error("DEBUG ERROR:", e);
  } finally {
    await pool.end();
  }
}

check();
