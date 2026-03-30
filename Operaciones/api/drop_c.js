import { pool } from "./db.js";
async function x(){
  try {
    const r=await pool.query("ALTER TABLE grupo_operacion DROP CONSTRAINT IF EXISTS uq_grupo_operacion_operacion_grupo CASCADE");
    console.log('Cascade dropped');
  } catch(e) { console.error(e.message); }
  await pool.end();
}
x();
