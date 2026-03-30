import { pool } from "./db.js";
import fs from "fs";

async function run() {
  let out = "";
  try {
    const ops = await pool.query("SELECT id_operacion, codigo FROM operacion ORDER BY id_operacion DESC LIMIT 2");
    const lastId = ops.rows[0].id_operacion;
    out += `## Op ID: ${lastId} (${ops.rows[0].codigo})\n\n`;

    // Lo que el servidor devuelve al frontend (misma query exacta)
    const personal = await pool.query(`
      SELECT
          p.id_personal,
          p.apodo,
          p.nombre,
          p.apellido,
          p.rol,
          p.puesto,
          a.rol_en_operacion,
          go.id_grupo_operacion,
          go.nombre AS grupo_nombre,
          go.descripcion AS grupo_flotilla
       FROM asignacion_operacion_personal a
       JOIN personal p ON p.id_personal = a.id_personal
       LEFT JOIN grupo_personal gper ON gper.id_personal = p.id_personal
       LEFT JOIN grupo_operacion go
         ON go.id_grupo_operacion = gper.id_grupo_operacion
        AND go.id_operacion = a.id_operacion
       LEFT JOIN grupo_operacion gp_padre
         ON gp_padre.id_grupo_operacion = go.id_grupo_padre
       WHERE a.id_operacion = $1
         AND a.estado_asignacion NOT IN ('LIBERADO')
       ORDER BY p.id_personal,
                CASE WHEN go.id_grupo_operacion IS NULL THEN 1 ELSE 0 END,
                go.id_grupo_operacion
    `, [lastId]);

    out += `### Filas de personal: ${personal.rows.length}\n`;
    personal.rows.forEach(r => {
      out += `  id=${r.id_personal} apodo=${r.apodo} rol_op=${r.rol_en_operacion||r.rol} grupo=${r.grupo_nombre||'null'} flotilla=${r.grupo_flotilla||'null'}\n`;
    });

    // grupo_personal raw
    const gp = await pool.query(`
      SELECT gp.id_personal, p.apodo, go.nombre as grupo
      FROM grupo_personal gp
      JOIN grupo_operacion go ON go.id_grupo_operacion = gp.id_grupo_operacion
      JOIN personal p ON p.id_personal = gp.id_personal
      WHERE go.id_operacion = $1
      ORDER BY go.nombre, gp.id_personal
    `, [lastId]);
    out += `\n### grupo_personal RAW (${gp.rows.length} filas)\n`;
    gp.rows.forEach(r => out += `  P${r.id_personal} ${r.apodo} → grupo ${r.grupo}\n`);

    // grupo_vehiculo
    const gv = await pool.query(`
      SELECT go.nombre as grupo, v.codigo_interno
      FROM grupo_vehiculo gv
      JOIN grupo_operacion go ON go.id_grupo_operacion = gv.id_grupo_operacion
      JOIN vehiculo v ON v.id_vehiculo = gv.id_vehiculo
      WHERE gv.id_operacion = $1
    `, [lastId]);
    out += `\n### grupo_vehiculo (${gv.rows.length} filas)\n`;
    gv.rows.forEach(r => out += `  ${r.codigo_interno} → ${r.grupo}\n`);

  } catch(e) {
    out += "\nERROR: " + e.stack;
  } finally {
    fs.writeFileSync("diag3.txt", out);
    await pool.end();
  }
}
run();
