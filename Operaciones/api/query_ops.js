import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '1234',
  database: 'ops_db'
});

async function main() {
  try {
    const resOps = await pool.query('SELECT * FROM operacion;');
    console.log('OPERACIONES:');
    resOps.rows.forEach(r => {
      // Print essential info
      console.log(`ID: ${r.id_operacion}, Nombre: ${r.nombre}, Estado: ${r.estado}`);
    });

    const resZones = await pool.query('SELECT * FROM zona_operacion;');
    console.log('ZONAS DE OPERACION:');
    console.log(JSON.stringify(resZones.rows, null, 2));
  } catch (err) {
    console.error('ERROR QUERYING DB:', err);
  } finally {
    await pool.end();
  }
}

main();
