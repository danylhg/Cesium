import { pool } from "./db.js";
import fs from "fs";

async function verify() {
  let output = "# Verificación Detallada de Base de Datos\n\n";
  try {
    const code = 'OP-1774895755067';
    const opQuery = await pool.query("SELECT id_operacion, codigo, nombre, descripcion, prioridad, estado, fecha_inicio, fecha_fin FROM operacion WHERE codigo = $1", [code]);
    
    if (opQuery.rows.length === 0) {
       output += "No se encontró la operación.\n";
       return;
    }

    const op = opQuery.rows[0];
    const id = op.id_operacion;

    output += `## Operación: ${op.nombre} [${op.codigo}]\n`;
    output += `**Estado:** ${op.estado} | **Prioridad:** ${op.prioridad}\n`;
    output += `**Descripción:** ${op.descripcion}\n`;

    // --- PERSONAL ---
    const personal = await pool.query(`
          SELECT 
            p.apodo, p.nombre, p.apellido, p.rol, p.puesto,
            a.rol_en_operacion,
            go.nombre AS grupo_nombre,
            go.descripcion AS grupo_flotilla
          FROM asignacion_operacion_personal a
          JOIN personal p ON p.id_personal = a.id_personal
          LEFT JOIN grupo_personal gper ON gper.id_personal = p.id_personal
          LEFT JOIN grupo_operacion go ON go.id_grupo_operacion = gper.id_grupo_operacion AND go.id_operacion = a.id_operacion
          WHERE a.id_operacion = $1 AND a.estado_asignacion NOT IN ('LIBERADO')
          ORDER BY go.id_grupo_operacion NULLS LAST, p.id_personal
    `, [id]);
    
    output += "\n### Personal Detectado\n";
    personal.rows.forEach(p => {
        output += `- **${p.apodo || p.nombre}** (${p.rol_en_operacion || p.rol}) -> Grupo: ${p.grupo_nombre || 'Sin Grupo'} | Flotilla: ${p.grupo_flotilla || '—'}\n`;
    });

    // --- VEHÍCULOS ---
    const vehiculos = await pool.query(`
          SELECT 
            v.codigo_interno, v.tipo,
            STRING_AGG(DISTINCT go.nombre, ', ') as grupos
          FROM vehiculo_operacion vo
          JOIN vehiculo v ON v.id_vehiculo = vo.id_vehiculo
          LEFT JOIN grupo_vehiculo gv ON gv.id_vehiculo = v.id_vehiculo AND gv.id_operacion = $1
          LEFT JOIN grupo_operacion go ON go.id_grupo_operacion = gv.id_grupo_operacion
          WHERE vo.id_operacion = $1
          GROUP BY v.id_vehiculo, v.codigo_interno, v.tipo
    `, [id]);
    output += "\n### Vehículos Detectados\n";
    vehiculos.rows.forEach(v => {
        output += `- **${v.codigo_interno}** (${v.tipo}) -> Grupos: ${v.grupos || '—'}\n`;
    });

    // --- EQUIPOS --- (Usando la lógica de COALESCE robusta de server.js)
    const equipos = await pool.query(`
          SELECT
            e.nombre, e.numero_serie, e.categoria,
            COALESCE(p.apodo, CONCAT_WS(' ', p.nombre, p.apellido), p_legacy.apodo, CONCAT_WS(' ', p_legacy.nombre, p_legacy.apellido)) AS asignado_a_personal,
            COALESCE(v.codigo_interno, v_legacy.codigo_interno) AS asignado_a_vehiculo
          FROM operacion_equipo oe
          JOIN equipo e ON e.id_equipo = oe.id_equipo
          LEFT JOIN personal p ON p.id_personal = oe.id_personal
          LEFT JOIN vehiculo v ON v.id_vehiculo = oe.id_vehiculo
          LEFT JOIN uso_equipo_operacion ueo ON ueo.id_operacion = oe.id_operacion AND ueo.id_equipo = oe.id_equipo
          LEFT JOIN personal p_legacy ON p_legacy.id_personal = ueo.id_personal
          LEFT JOIN vehiculo_equipo ve ON ve.id_equipo = e.id_equipo
          LEFT JOIN vehiculo v_legacy ON v_legacy.id_vehiculo = ve.id_vehiculo
          WHERE oe.id_operacion = $1
    `, [id]);
    output += "\n### Equipos Detectados\n";
    equipos.rows.forEach(e => {
        output += `- **${e.nombre}** (S/N: ${e.numero_serie}) -> Asignado a: ${e.asignado_a_personal || e.asignado_a_vehiculo || 'Sin asignar'}\n`;
    });

  } catch (err) {
    output += `\n# ERROR\n${err.stack}\n`;
  } finally {
    fs.writeFileSync("db_verification.md", output);
    await pool.end();
  }
}

verify();
