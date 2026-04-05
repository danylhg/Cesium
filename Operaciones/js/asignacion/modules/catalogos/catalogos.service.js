import { state } from "../../core/state.js";
import { readJSONStorage } from "../../core/storage.js";
import {
  STORAGE_CONTROL_PERSONAL,
  STORAGE_CONTROL_VEHICULOS,
  STORAGE_CONTROL_EQUIPOS
} from "../../core/constants.js";
import { formatPuesto, normalizeEquipoCategoria } from "../../core/utils.js";

export function loadControlPersonal() {
  const data = readJSONStorage(STORAGE_CONTROL_PERSONAL, []);
  return data
    .map(x => {
      let nombreBase = `${x.nombre ?? ""} ${x.apellido ?? ""}`.trim();
      if (x.puesto) {
        const prefijo = formatPuesto(x.puesto.trim());
        if (prefijo) {
          nombreBase = `${prefijo} ${nombreBase}`.trim();
        }
      }
      return {
        id: x.id ?? crypto.randomUUID(),
        nombre: nombreBase,
        rol: (x.rol ?? "").trim()
      };
    })
    .filter(x => x.nombre !== "");
}

export function loadControlVehiculos() {
  const data = readJSONStorage(STORAGE_CONTROL_VEHICULOS, []);
  return data
    .map(x => ({
      id: x.id ?? crypto.randomUUID(),
      name: [x.tipo, x.alias].filter(Boolean).join(" ").trim() || x.codigo_interno || "Vehículo",
      image: x.imagen_veh ?? "",
      serialNumber: x.codigo_interno ?? "",
      type: x.tipo ?? "",
      alias: x.alias ?? "",
      status: x.estado ?? "DISPONIBLE",
      capacity: Number(x.capacidad ?? 0)
    }))
    .filter(x => x.name !== "");
}

export function loadControlEquipos() {
  const data = readJSONStorage(STORAGE_CONTROL_EQUIPOS, []);
  return data
    .map(x => ({
      id: x.id ?? crypto.randomUUID(),
      nombre: x.nombre ?? "Equipo",
      tipo: normalizeEquipoCategoria(x.categoria),
      image: x.imagen_eq ?? "",
      numeroSerie: x.numero_serie ?? "",
      estado: x.estado ?? "DISPONIBLE",
      detalles: x.detalles ?? ""
    }))
    .filter(x => x.nombre.trim() !== "");
}

export function hydrateCatalogsFromControl() {
  // BACKEND: Esta función se vuelve async. Las 5 llamadas se hacen en paralelo con Promise.all:
  // GET /catalog/personal?rol=CUT + GET /catalog/personal?rol=CET + GET /catalog/personal?rol=CELL
  // + GET /catalog/vehiculos + GET /catalog/equipos
  // Respuesta: { ok, items: [{ id_personal, nombre, apellido, puesto, rol, activo }] } etc.
  // Los roles del servidor son 'CUT', 'CET', 'CELL' (no textos largos como hoy).
  // Al mapear se llenan los mapas idByNombre, idByVehiculo, idByEquipo.
  const personal = loadControlPersonal();
  const vehiculos = loadControlVehiculos();
  const equipos = loadControlEquipos();

  if (personal.length > 0) {
    const cuts = personal
      .filter(x => x.rol === "Comandante de Unidad de Trabajo")
      .map(x => x.nombre);

    const cets = personal
      .filter(x => x.rol === "Comandante de Equipo de trabajo")
      .map(x => x.nombre);

    const celulas = personal
      .filter(x => x.rol === "Celulas")
      .map(x => x.nombre);

    if (cuts.length > 0) state.cutList = cuts;
    if (cets.length > 0) state.cetList = cets;
    if (celulas.length > 0) state.celulasList = celulas;
  }

  if (vehiculos.length > 0) {
    state.vehiclesList = vehiculos;
  }

  if (equipos.length > 0) {
    state.tacticalEquipmentList = equipos.filter(x => x.tipo === "tactico");
    state.communicationEquipmentList = equipos.filter(x => x.tipo === "comunicacion");
  }
}