import { pool } from "./db.js";
async function check() {
  try {
    const res = await pool.query("SELECT conname FROM pg_constraint WHERE conrelid = 'grupo_operacion'::regclass");
    console.log("Constraints:", res.rows);
  } catch (e) {
    console.error(e.message);
  } finally {
    await pool.end();
  }
}
check();
