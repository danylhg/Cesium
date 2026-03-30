import { pool } from "./db.js";
async function check() {
  try {
    const r = await pool.query("ALTER TABLE grupo_operacion DROP CONSTRAINT IF EXISTS uq_grupo_operacion_operacion_grupo");
    console.log("OK", r);
  } catch (e) {
    console.error(e.message);
  } finally {
    await pool.end();
  }
}
check();
