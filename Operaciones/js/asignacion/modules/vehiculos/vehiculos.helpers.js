import { state } from "../../core/state.js";
import { getGrupoDeCelula } from "../personal/personal.helpers.js";

export function getResumenVehiculoDetallado(idVehiculo) {
  const asignaciones = state.asignacionVehiculos.filter(a => a.id_vehiculo === idVehiculo);

  const cets = new Set();
  const grupos = new Set();
  let totalPersonas = 0;

  asignaciones.forEach(asig => {
    if (asig.tipo_destino === 'personal') {
      // Buscar el CET y célula del personal
      for (const cet of state.cetSeleccionados) {
        const celulas = state.asignacionCelulas[cet] || [];
        const persona = celulas.find(p => p.id === asig.id_personal);
        if (persona) {
          cets.add(cet);
          totalPersonas += 1;
          const grupo = getGrupoDeCelula(cet, persona.nombre);
          if (grupo) grupos.add(grupo);
          break;
        }
      }
    } else if (asig.tipo_destino === 'grupo') {
      // Buscar el CET del grupo
      for (const cet of Object.keys(state.gruposByCet)) {
        const ginfo = state.gruposByCet[cet];
        if (ginfo.names.some(g => g.id === asig.id_grupo_operacion)) {
          cets.add(cet);
          break;
        }
      }
    }
  });

  const flotillas = Array.from(cets)
    .map(cet => state.flotillaByCet[cet])
    .filter(Boolean);

  return {
    flotilla: flotillas.length ? flotillas.join(", ") : "—",
    grupo: grupos.size ? Array.from(grupos).join(", ") : "—",
    personas: totalPersonas,
    cets: Array.from(cets)
  };
}

export function getVehiclesUsedInAssignments() {
  const usados = new Set(
    state.asignacionVehiculos.map(a => a.id_vehiculo)
  );

  return state.vehiclesList.filter(v => usados.has(v.id));
}
