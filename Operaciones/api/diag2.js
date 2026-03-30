import { pool } from "./db.js";
import fs from "fs";

async function run() {
  let out = "";
  try {
    // Última operación
    const ops = await pool.query("SELECT id_operacion, codigo, nombre, estado FROM operacion ORDER BY id_operacion DESC LIMIT 3");
    out += "## Últimas operaciones\n";
    ops.rows.forEach(r => out += `ID: ${r.id_operacion} | ${r.codigo} | ${r.nombre} | ${r.estado}\n`);

    const lastId = ops.rows[0]?.id_operacion;
    if (!lastId) { out += "Sin operaciones.\n"; return; }

    out += `\n## Usando op ID: ${lastId}\n`;

    // Personal
    const personal = await pool.query(`
      SELECT p.id_personal, p.apodo, a.rol_en_operacion, p.rol,
             go.nombre as grupo_nombre, go.descripcion as grupo_flotilla
      FROM asignacion_operacion_personal a
      JOIN personal p ON p.id_personal = a.id_personal
      LEFT JOIN grupo_personal gp ON gp.id_personal = p.id_personal
      LEFT JOIN grupo_operacion go ON go.id_grupo_operacion = gp.id_grupo_operacion AND go.id_operacion = a.id_operacion
      WHERE a.id_operacion = $1
    `, [lastId]);
    out += `\n### Personal (${personal.rows.length} filas)\n`;
    personal.rows.forEach(r => out += `  P${r.id_personal} ${r.apodo} | rol: ${r.rol_en_operacion||r.rol} | grupo: ${r.grupo_nombre||'—'} | flotilla: ${r.grupo_flotilla||'—'}\n`);

    // Vehículos
    const vehs = await pool.query(`
      SELECT v.codigo_interno, v.tipo,
             STRING_AGG(DISTINCT COALESCE(go.nombre,''), ', ') as grupos
      FROM vehiculo_operacion vo
      JOIN vehiculo v ON v.id_vehiculo = vo.id_vehiculo
      LEFT JOIN grupo_vehiculo gv ON gv.id_vehiculo = v.id_vehiculo AND gv.id_operacion = $1
      LEFT JOIN grupo_operacion go ON go.id_grupo_operacion = gv.id_grupo_operacion
      WHERE vo.id_operacion = $1
      GROUP BY v.id_vehiculo, v.codigo_interno, v.tipo
    `, [lastId]);
    out += `\n### Vehículos\n`;
    vehs.rows.forEach(r => out += `  ${r.codigo_interno} (${r.tipo}) | grupos: ${r.grupos||'—'}\n`);

    // Equipos
    const eqs = await pool.query(`
      SELECT e.nombre, e.numero_serie,
             COALESCE(p.apodo) as persona, v.codigo_interno as vehiculo
      FROM operacion_equipo oe
      JOIN equipo e ON e.id_equipo = oe.id_equipo
      LEFT JOIN personal p ON p.id_personal = oe.id_personal
      LEFT JOIN vehiculo v ON v.id_vehiculo = oe.id_vehiculo
      WHERE oe.id_operacion = $1
    `, [lastId]);
    out += `\n### Equipos (${eqs.rows.length} filas)\n`;
    eqs.rows.forEach(r => out += `  ${r.nombre} | persona: ${r.persona||'—'} | veh: ${r.vehiculo||'—'}\n`);

    // grupo_vehiculo
    const gv = await pool.query(`
      SELECT go.nombre, v.codigo_interno
      FROM grupo_vehiculo gv
      JOIN grupo_operacion go ON go.id_grupo_operacion = gv.id_grupo_operacion
      JOIN vehiculo v ON v.id_vehiculo = gv.id_vehiculo
      WHERE gv.id_operacion = $1
    `, [lastId]);
    out += `\n### grupo_vehiculo (${gv.rows.length} filas)\n`;
    gv.rows.forEach(r => out += `  ${r.codigo_interno} → ${r.nombre}\n`);

  } catch(e) {
    out += "\nERROR: " + e.stack;
  } finally {
    fs.writeFileSync("diag2.txt", out);
    await pool.end();
  }
}
run();
