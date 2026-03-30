import { pool } from "./db.js";
import fs from "fs";

async function diagnose() {
  let report = "DIAGNOSTICO DE DATOS - OPERACION 5\n\n";
  const opId = 5;

  try {
    // 1. Grupos y sus integrantes
    const grupos = await pool.query(`
      SELECT go.id_grupo_operacion, go.nombre, p.id_personal, p.apodo, p.nombre as pnombre, a.rol_en_operacion, p.rol
      FROM grupo_operacion go
      JOIN grupo_personal gp ON gp.id_grupo_operacion = go.id_grupo_operacion
      JOIN personal p ON p.id_personal = gp.id_personal
      LEFT JOIN asignacion_operacion_personal a ON a.id_personal = p.id_personal AND a.id_operacion = go.id_operacion
      WHERE go.id_operacion = $1
      ORDER BY go.nombre, p.id_personal
    `, [opId]);
    report += "### GRUPOS Y SUS INTEGRANTES\n";
    grupos.rows.forEach(r => {
      report += `G: ${r.nombre} | P: ${r.id_personal} - ${r.apodo || r.pnombre} | Rol: ${r.rol_en_operacion || r.rol}\n`;
    });

    // 2. Personal general de la operacion
    const personal = await pool.query(`
       SELECT p.id_personal, p.apodo, p.nombre, a.rol_en_operacion, p.rol
       FROM asignacion_operacion_personal a
       JOIN personal p ON p.id_personal = a.id_personal
       WHERE a.id_operacion = $1
    `, [opId]);
    report += "\n### TODOS LOS ASIGNADOS A OP 5\n";
    personal.rows.forEach(r => {
      report += `P: ${r.id_personal} - ${r.apodo || r.nombre} | RolOp: ${r.rol_en_operacion} | RolBase: ${r.rol}\n`;
    });

    // 3. Vehiculos y grupos
    const vehGrupos = await pool.query(`
      SELECT v.codigo_interno, go.nombre as grupo
      FROM vehiculo_operacion vo
      JOIN vehiculo v ON v.id_vehiculo = vo.id_vehiculo
      LEFT JOIN grupo_vehiculo gv ON gv.id_vehiculo = v.id_vehiculo AND gv.id_operacion = vo.id_operacion
      LEFT JOIN grupo_operacion go ON go.id_grupo_operacion = gv.id_grupo_operacion
      WHERE vo.id_operacion = $1
    `, [opId]);
    report += "\n### VEHICULOS Y GRUPOS DIRECTOS\n";
    vehGrupos.rows.forEach(r => {
      report += `V: ${r.codigo_interno} | G: ${r.grupo || '—'}\n`;
    });

    // 4. Equipos y sus asignaciones (operacion_equipo)
    const equipos = await pool.query(`
      SELECT oe.id_operacion_equipo, e.nombre, e.numero_serie, oe.id_personal, p.apodo as p_apodo, oe.id_vehiculo, v.codigo_interno as v_codigo
      FROM operacion_equipo oe
      JOIN equipo e ON e.id_equipo = oe.id_equipo
      LEFT JOIN personal p ON p.id_personal = oe.id_personal
      LEFT JOIN vehiculo v ON v.id_vehiculo = oe.id_vehiculo
      WHERE oe.id_operacion = $1
    `, [opId]);
    report += "\n### EQUIPOS ASIGNADOS\n";
    equipos.rows.forEach(r => {
      report += `ID: ${r.id_operacion_equipo} | E: ${r.nombre} (${r.numero_serie}) | P: ${r.p_apodo || '—'} | V: ${r.v_codigo || '—'}\n`;
    });

  } catch(e) {
    report += "\nERROR: " + e.stack;
  } finally {
    fs.writeFileSync("diagnostico.txt", report);
    await pool.end();
  }
}
diagnose();
