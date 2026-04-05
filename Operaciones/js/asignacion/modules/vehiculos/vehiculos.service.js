import { state } from "../../core/state.js";
import { saveAsignacionActual } from "../asignacion/asignacion.service.js";

// BACKEND: asignarVehiculo() se vuelve async con POST /ops/:id/vehiculos
// Recibe id_vehiculo, tipo_destino ('personal' o 'grupo'), id_personal o id_grupo_operacion
export function asignarVehiculo(idVehiculo, tipoDestino, idPersonal = null, idGrupoOperacion = null) {
  // Validar capacidad
  const vehObj = state.vehiclesList.find(v => v.id === idVehiculo);
  if (!vehObj) throw new Error("Vehículo no encontrado");

  const used = state.asignacionVehiculos.filter(a => a.id_vehiculo === idVehiculo).length;
  const cap = Number(vehObj.capacity || 0);
  if (cap > 0 && used >= cap) throw new Error("Capacidad insuficiente");

  // Verificar si ya está asignado
  const existing = state.asignacionVehiculos.find(a =>
    a.tipo_destino === tipoDestino &&
    ((tipoDestino === 'personal' && a.id_personal === idPersonal) ||
     (tipoDestino === 'grupo' && a.id_grupo_operacion === idGrupoOperacion))
  );
  if (existing) throw new Error("Ya tiene vehículo asignado");

  // Agregar asignación
  state.asignacionVehiculos.push({
    id_vehiculo: idVehiculo,
    tipo_destino: tipoDestino,
    id_personal: idPersonal,
    id_grupo_operacion: idGrupoOperacion
  });

  saveAsignacionActual();
}

// BACKEND: removerAsignacionVehiculo() se vuelve async con DELETE /ops/:id/vehiculos/:asignacionId
export function removerAsignacionVehiculo(idVehiculo, tipoDestino, idPersonal = null, idGrupoOperacion = null) {
  const index = state.asignacionVehiculos.findIndex(a =>
    a.id_vehiculo === idVehiculo &&
    a.tipo_destino === tipoDestino &&
    ((tipoDestino === 'personal' && a.id_personal === idPersonal) ||
     (tipoDestino === 'grupo' && a.id_grupo_operacion === idGrupoOperacion))
  );

  if (index > -1) {
    state.asignacionVehiculos.splice(index, 1);
    saveAsignacionActual();
  }
}

// Obtener asignaciones por CET o célula (para compatibilidad temporal)
export function getAsignacionVehiculoPorKey(key) {
  // key puede ser "CET" o "CET-celula"
  const parts = key.split('-');
  const cet = parts[0];
  const celula = parts[1] || null;

  return state.asignacionVehiculos.find(a => {
    if (celula) {
      // Buscar por personal en célula
      const personal = state.asignacionCelulas[cet]?.find(p => p.nombre === celula);
      return a.tipo_destino === 'personal' && a.id_personal === personal?.id;
    } else {
      // Buscar por grupo del CET
      const grupo = state.gruposByCet[cet]?.active;
      return a.tipo_destino === 'grupo' && a.id_grupo_operacion === grupo?.id;
    }
  });
}

// Obtener nombre del vehículo asignado (para compatibilidad)
export function getNombreVehiculoAsignado(key) {
  const asignacion = getAsignacionVehiculoPorKey(key);
  if (!asignacion) return null;
  const veh = state.vehiclesList.find(v => v.id === asignacion.id_vehiculo);
  return veh?.name || null;
}