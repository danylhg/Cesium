import { pool } from "./db.js";
async function run() {
  try {
    await pool.query("ALTER TABLE grupo_operacion DROP CONSTRAINT IF EXISTS grupo_operacion_id_operacion_nombre_key");
    console.log("Constraint eliminada con éxito");
  } catch(e) {
    console.error(e.message);
  } finally {
    await pool.end();
  }
}
run();
