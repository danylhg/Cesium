import { pool } from "./db.js";
import fs from "fs";

async function run() {
  let out = "";
  try {
    const ops = await pool.query("SELECT id_operacion, codigo FROM operacion ORDER BY id_operacion DESC LIMIT 1");
    const lastId = ops.rows[0].id_operacion;
    out += `Op ID: ${lastId} (${ops.rows[0].codigo})\n\n`;

    // grupo_operacion (los grupos reales)
    const gops = await pool.query(`
      SELECT id_grupo_operacion, nombre, descripcion FROM grupo_operacion WHERE id_operacion = $1 ORDER BY id_grupo_operacion
    `, [lastId]);
    out += `=== GRUPOS DEFINIDOS (${gops.rows.length}) ===\n`;
    gops.rows.forEach(r => out += `  [${r.id_grupo_operacion}] "${r.nombre}" flotilla="${r.descripcion}"\n`);

    // grupo_personal (quién está en cada grupo)
    const gp = await pool.query(`
      SELECT go.id_grupo_operacion, go.nombre as grupo, p.id_personal, p.apodo, p.rol
      FROM grupo_personal gper
      JOIN grupo_operacion go ON go.id_grupo_operacion = gper.id_grupo_operacion
      JOIN personal p ON p.id_personal = gper.id_personal
      WHERE go.id_operacion = $1
      ORDER BY go.id_grupo_operacion, p.id_personal
    `, [lastId]);
    out += `\n=== GRUPO_PERSONAL RAW (${gp.rows.length}) ===\n`;
    gp.rows.forEach(r => out += `  grupo[${r.id_grupo_operacion}]="${r.grupo}" <- P${r.id_personal} ${r.apodo} (${r.rol})\n`);

    // Lo que devuelve la query del servidor (nueva versión)
    const personal = await pool.query(`
      SELECT
          p.id_personal,
          p.apodo,
          p.rol,
          a.rol_en_operacion,
          go.id_grupo_operacion,
          go.nombre AS grupo_nombre,
          go.descripcion AS grupo_flotilla
       FROM asignacion_operacion_personal a
       JOIN personal p ON p.id_personal = a.id_personal
       LEFT JOIN (
         SELECT gper2.id_personal, gper2.id_grupo_operacion
         FROM grupo_personal gper2
         JOIN grupo_operacion go2 ON go2.id_grupo_operacion = gper2.id_grupo_operacion
         WHERE go2.id_operacion = $1
       ) gper ON gper.id_personal = p.id_personal
       LEFT JOIN grupo_operacion go ON go.id_grupo_operacion = gper.id_grupo_operacion
       WHERE a.id_operacion = $1
         AND a.estado_asignacion NOT IN ('LIBERADO')
       ORDER BY p.id_personal, go.id_grupo_operacion
    `, [lastId]);
    out += `\n=== QUERY SERVIDOR (${personal.rows.length} filas) ===\n`;
    personal.rows.forEach(r => {
      out += `  P${r.id_personal} ${r.apodo} [${r.rol_en_operacion||r.rol}] -> grupo_id=${r.id_grupo_operacion||'null'} nombre="${r.grupo_nombre||'null'}"\n`;
    });

  } catch(e) {
    out += "\nERROR: " + e.stack;
  } finally {
    fs.writeFileSync("diag4.txt", out);
    await pool.end();
  }
}
run();
