import { state } from "../../core/state.js";
import { saveAsignacionActual } from "../asignacion/asignacion.service.js";

// BACKEND: asignarEquipo() se vuelve async con POST /ops/:id/equipos
// Recibe id_equipo, tipo_destino ('personal' o 'vehiculo'), id_personal o id_vehiculo, categoria
export function asignarEquipo(idEquipo, tipoDestino, idPersonal = null, idVehiculo = null, categoria) {
  // Verificar si ya está asignado
  const existing = state.asignacionEquipos.find(a =>
    a.id_equipo === idEquipo &&
    a.tipo_destino === tipoDestino &&
    ((tipoDestino === 'personal' && a.id_personal === idPersonal) ||
     (tipoDestino === 'vehiculo' && a.id_vehiculo === idVehiculo))
  );
  if (existing) throw new Error("Equipo ya asignado");

  // Agregar asignación
  state.asignacionEquipos.push({
    id_equipo: idEquipo,
    tipo_destino: tipoDestino,
    id_personal: idPersonal,
    id_vehiculo: idVehiculo,
    categoria: categoria
  });

  saveAsignacionActual();
}

// BACKEND: removerAsignacionEquipo() se vuelve async con DELETE /ops/:id/equipos/:asignacionId
export function removerAsignacionEquipo(idEquipo, tipoDestino, idPersonal = null, idVehiculo = null) {
  const index = state.asignacionEquipos.findIndex(a =>
    a.id_equipo === idEquipo &&
    a.tipo_destino === tipoDestino &&
    ((tipoDestino === 'personal' && a.id_personal === idPersonal) ||
     (tipoDestino === 'vehiculo' && a.id_vehiculo === idVehiculo))
  );

  if (index > -1) {
    state.asignacionEquipos.splice(index, 1);
    saveAsignacionActual();
  }
}

// Obtener asignaciones por equipo (para compatibilidad)
export function getAsignacionEquipo(idEquipo) {
  return state.asignacionEquipos.find(a => a.id_equipo === idEquipo);
}

// Obtener equipos asignados por categoria
export function getEquiposAsignadosPorCategoria(categoria) {
  return state.asignacionEquipos.filter(a => a.categoria === categoria);
}

// Obtener destino formateado (para compatibilidad)
export function getDestinoFormateado(asignacion) {
  if (!asignacion) return "Disponible";
  if (asignacion.tipo_destino === 'personal') {
    // Buscar el nombre de la persona
    for (const cet of state.cetSeleccionados) {
      const celulas = state.asignacionCelulas[cet] || [];
      const persona = celulas.find(p => p.id === asignacion.id_personal);
      if (persona) {
        return `${cet} - ${persona.nombre}`;
      }
    }
  } else if (asignacion.tipo_destino === 'vehiculo') {
    const veh = state.vehiclesList.find(v => v.id === asignacion.id_vehiculo);
    return veh?.name || "Vehículo desconocido";
  }
  return "Asignado";
}