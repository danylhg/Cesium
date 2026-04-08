import { state } from "../../core/state.js";
import { readObjectStorage, writeStorage } from "../../core/storage.js";
import {
  STORAGE_ASIGNACION_ACTUAL,
  STORAGE_OPERACION_ACTUAL
} from "../../core/constants.js";

import { collectOperacionActual } from "../operacion/operacion.service.js";
import { getGrupoDeCelula } from "../personal/personal.helpers.js";
import {
  getResumenVehiculoDetallado,
  getVehiclesUsedInAssignments
} from "../vehiculos/vehiculos.helpers.js";

export function buildAsignacionActual() {
  const personal = [];
  const vehiculos = [];
  const equipos = [];

  // Construir personal con asignaciones de vehículos
  if (state.cutSeleccionado) {
    const vehAsig = state.asignacionVehiculos.find(a => a.tipo_destino === 'personal' && a.id_personal === state.cutSeleccionado?.id);
    const vehNombre = vehAsig ? state.vehiclesList.find(v => v.id === vehAsig.id_vehiculo)?.name : "";
    personal.push({
      nombre: state.cutSeleccionado,
      cargo: "CUT",
      grupo: "",
      cet: "",
      flotilla: "",
      vehiculo: vehNombre
    });
  }

  state.cetSeleccionados.forEach((cet) => {
    // CET
    const grupoCet = state.gruposByCet[cet]?.active;
    const vehAsigCet = state.asignacionVehiculos.find(a => a.tipo_destino === 'grupo' && a.id_grupo_operacion === grupoCet?.id);
    const vehNombreCet = vehAsigCet ? state.vehiclesList.find(v => v.id === vehAsigCet.id_vehiculo)?.name : "";
    personal.push({
      nombre: cet,
      cargo: "CET",
      grupo: "",
      cet,
      flotilla: state.flotillaByCet[cet] || "",
      vehiculo: vehNombreCet
    });

    // Células
    const cells = state.asignacionCelulas[cet] || [];
    cells.forEach((celulaNombre) => {
      const id_p = state.personalMap[celulaNombre];
      const vehAsig = id_p ? state.asignacionVehiculos.find(a => a.tipo_destino === 'personal' && a.id_personal === id_p) : null;
      const vehNombre = vehAsig ? state.vehiclesList.find(v => v.id === vehAsig.id_vehiculo)?.name : "";
      
      personal.push({
        nombre: celulaNombre,
        cargo: "Célula",
        grupo: getGrupoDeCelula(cet, celulaNombre),
        cet,
        flotilla: state.flotillaByCet[cet] || "",
        vehiculo: vehNombre
      });
    });
  });

  getVehiclesUsedInAssignments().forEach((v) => {
    const resumen = getResumenVehiculoDetallado(v.id);

    vehiculos.push({
      nombre: v.name,
      unidad: v.name,
      tipo: v.type || "",
      alias: v.alias || "",
      codigoInterno: v.serialNumber || "",
      placas: "",
      estado: v.status || "",
      cet: resumen.cets.join(", "),
      flotilla: resumen.flotilla,
      grupo: resumen.grupo,
      personas: resumen.personas
    });
  });

  const allEquipos = [
    ...state.tacticalEquipmentList.map(eq => ({ ...eq, categoria: "tactico" })),
    ...state.communicationEquipmentList.map(eq => ({ ...eq, categoria: "comunicacion" }))
  ];

  state.asignacionEquipos.forEach(asig => {
    const eq = allEquipos.find(e => e.id === asig.id_equipo);
    if (eq) {
      let destino = "";
      if (asig.tipo_destino === 'personal') {
        // Buscar nombre de persona
        for (const cet of state.cetSeleccionados) {
          const celulas = state.asignacionCelulas[cet] || [];
          const persona = celulas.find(p => p.id === asig.id_personal);
          if (persona) {
            destino = `${cet} - ${persona.nombre}`;
            break;
          }
        }
      } else if (asig.tipo_destino === 'vehiculo') {
        const veh = state.vehiclesList.find(v => v.id === asig.id_vehiculo);
        destino = veh?.name || "Vehículo";
      }

      equipos.push({
        nombre: eq.nombre,
        categoria: eq.categoria === "tactico" ? "Táctico" : "Comunicación",
        codigo: eq.numeroSerie || "",
        codigoInterno: eq.numeroSerie || "",
        cantidad: 1,
        vehiculo: destino,
        asignadoA: destino
      });
    }
  });

  return {
    operacion: collectOperacionActual(),
    cut: state.cutSeleccionado || "",
    cets: [...state.cetSeleccionados],
    flotillaByCet: { ...state.flotillaByCet },
    personal,
    vehiculos,
    equipos,
    asignacionCelulas: state.asignacionCelulas,
    asignacionVehiculos: state.asignacionVehiculos,
    asignacionEquipos: state.asignacionEquipos,
    updated_at: new Date().toISOString()
  };
}

export async function saveAsignacionActual() {
  const { syncOperacionCompleta } = await import("../operacion/operacion.service.js");
  
  const payload = buildAsignacionActual();
  writeStorage(STORAGE_ASIGNACION_ACTUAL, payload);

  const op = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
  if (op.id) {
    writeStorage(`asignacion_op_${op.id}`, payload);
    
    // BACKEND: Sincronizar con el servidor
    try {
      await syncOperacionCompleta(op.id);
    } catch (err) {
      console.error("Fallo al sincronizar asignación:", err);
    }
  }

  return payload;
}

export async function saveOperacionYAsignacion() {
  const op = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
  if (op.id) {
    writeStorage(`operacion_${op.id}`, op);
    // Aquí también podríamos llamar a syncOperacionCompleta(op.id) si fuera necesario
  }
  return await saveAsignacionActual();
}
