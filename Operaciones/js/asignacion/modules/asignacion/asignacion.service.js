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
    cells.forEach((celula) => {
      const vehAsig = state.asignacionVehiculos.find(a => a.tipo_destino === 'personal' && a.id_personal === celula.id);
      const vehNombre = vehAsig ? state.vehiclesList.find(v => v.id === vehAsig.id_vehiculo)?.name : "";
      personal.push({
        nombre: celula.nombre,
        cargo: "Célula",
        grupo: getGrupoDeCelula(cet, celula.nombre),
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

export function saveAsignacionActual() {
  // BACKEND: Esta función se vuelve async. Ejecuta 4 llamadas en secuencia:
  // 1. POST /ops/:id/personal { items: [{ id_personal, rol_en_operacion }] } → CUT, CETs y células (rol_en_operacion: "CUT"|"CET"|"CELL")
  // 2. POST /ops/:id/grupos { grupos: [...], directos: { id_cet: [id_cell] } } → estructura flotilla → grupo/célula → integrantes + mando_operacion
  // 3. POST /ops/:id/vehiculos { items: [{ id_vehiculo, tipo_destino, id_personal }] } → vehículos asignados a personas (tipo_destino: "PERSONAL")
  // 4. POST /ops/:id/equipos { items: [{ id_equipo, cantidad, tipo_destino, id_personal|id_vehiculo }] } → equipos tácticos y de comunicación
  // Los nombres del state se resuelven a IDs con mapas idByNombre/idByVehiculo/idByEquipo poblados durante hydrateCatalogsFromControl.
  // Todo el writeStorage desaparece.
  const payload = buildAsignacionActual();
  writeStorage(STORAGE_ASIGNACION_ACTUAL, payload);

  const op = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
  if (op.id) {
    writeStorage(`asignacion_op_${op.id}`, payload);
  }

  return payload;
}

export function saveOperacionYAsignacion() {
  // BACKEND: Esta función se vuelve async y usa await en ambas llamadas.
  // Por ahora, guarda operación y asignación en secuencia.
  const op = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
  if (op.id) {
    writeStorage(`operacion_${op.id}`, op);
  }
  saveAsignacionActual();
}
