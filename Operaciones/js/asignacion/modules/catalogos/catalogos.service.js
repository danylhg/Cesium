import { state } from "../../core/state.js";
import { formatPuesto, normalizeEquipoCategoria, generateUUID } from "../../core/utils.js";

// 1. Configuramos la base de la API igual que en tu control_personal.js
const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

/**
 * Función auxiliar para centralizar las peticiones fetch con Token
 */
async function apiFetch(path) {
  const token = localStorage.getItem("token");
  
  try {
    // IMPORTANTE: Verifica si tu server requiere el prefijo /api o no.
    // Si el router de express dice router.get("/catalog/..."), usa path directamente.
    const response = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (response.status === 404) {
      console.warn(`Ruta no encontrada: ${path}. Intenta quitar o poner el prefijo /api`);
    }

    if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);
    
    const data = await response.json();
    return data.ok ? (data.items || []) : [];
  } catch (error) {
    console.error(`Fallo en petición [${path}]:`, error.message);
    return [];
  }
}

// --- Mappers ---

function mapPersonal(data) {
  return data
    .map(x => {
      let nombreBase = `${x.nombre ?? ""} ${x.apellido ?? ""}`.trim();
      if (x.puesto) {
        const prefijo = formatPuesto(x.puesto.trim());
        if (prefijo) nombreBase = `${prefijo} ${nombreBase}`.trim();
      }
      return {
        id: x.id_personal ?? generateUUID(),
        nombre: nombreBase,
        rol: (x.rol ?? "").trim()
      };
    })
    .filter(x => x.nombre !== "");
}

function mapVehiculos(data) {
  return data.map(x => ({
    id: x.id_vehiculo ?? generateUUID(),
    name: [x.tipo, x.alias].filter(Boolean).join(" ").trim() || x.codigo_interno || "Vehículo",
    image: x.imagen_veh ?? "",
    serialNumber: x.codigo_interno ?? "",
    type: x.tipo ?? "",
    alias: x.alias ?? "",
    status: x.estado ?? "DISPONIBLE",
    capacity: Number(x.capacidad ?? 0)
  })).filter(x => x.name !== "");
}

function mapEquipos(data) {
  return data.map(x => ({
    id: x.id_equipo ?? generateUUID(),
    nombre: x.nombre ?? "Equipo",
    tipo: normalizeEquipoCategoria(x.categoria),
    image: x.imagen_eq ?? "",
    numeroSerie: x.numero_serie ?? "",
    estado: x.estado ?? "DISPONIBLE",
    detalles: x.detalles ?? ""
  })).filter(x => x.nombre.trim() !== "");
}

// --- Función Principal ---

export async function hydrateCatalogsFromControl() {
  // Ajusta estas rutas según si tu servidor usa "/api" o no antes de "/catalog"
  const [rawCuts, rawCets, rawCells, rawVehiculos, rawEquipos] = await Promise.all([
    apiFetch('/catalog/personal?rol=CUT'),
    apiFetch('/catalog/personal?rol=CET'),
    apiFetch('/catalog/personal?rol=CELL'),
    apiFetch('/catalog/vehiculos'),
    apiFetch('/catalog/equipos')
  ]);

  // Personal
  const cuts = mapPersonal(rawCuts);
  const cets = mapPersonal(rawCets);
  const cells = mapPersonal(rawCells);

  state.cutList = cuts.map(x => x.nombre);
  state.cetList = cets.map(x => x.nombre);
  state.celulasList = cells.map(x => x.nombre);

  // Poblar mapa de búsqueda Nombre -> ID
  [...cuts, ...cets, ...cells].forEach(p => {
    state.personalMap[p.nombre] = p.id;
  });

  // Vehículos
  const vehiculos = mapVehiculos(rawVehiculos);
  if (vehiculos.length > 0) state.vehiclesList = vehiculos;

  // Equipos
  const equipos = mapEquipos(rawEquipos);
  if (equipos.length > 0) {
    state.tacticalEquipmentList = equipos.filter(x => x.tipo === "tactico");
    state.communicationEquipmentList = equipos.filter(x => x.tipo === "comunicacion");
  }
}