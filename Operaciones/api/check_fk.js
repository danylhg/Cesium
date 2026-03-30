import { pool } from "./db.js";
async function check() {
  try {
    const r = await pool.query("SELECT * FROM pg_constraint WHERE confrelid = 'grupo_operacion'::regclass");
    console.log("FKs que apuntan a grupo_operacion:", r.rows);
  } catch (e) {
    console.error(e.message);
  } finally {
    await pool.end();
  }
}
check();
