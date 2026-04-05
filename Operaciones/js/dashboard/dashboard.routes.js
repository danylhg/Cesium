// js/dashboard/dashboard.routes.js

import { dashboardState } from "./dashboard.state.js";
import { dom } from "./dashboard.dom.js";
import {
  getJsonStorage,
  getCurrentOperation,
  saveCurrentOperation,
  ASIGNACION_ACTUAL_KEY
} from "./dashboard.storage.js";
import { setRouteInfo } from "./dashboard.ui.js";

const OSRM_BASE = "https://router.project-osrm.org";

const ROUTE_COLORS = [
  Cesium.Color.MAGENTA, Cesium.Color.ORANGE, Cesium.Color.LIMEGREEN,
  Cesium.Color.PINK, Cesium.Color.DEEPSKYBLUE, Cesium.Color.HOTPINK,
  Cesium.Color.GOLD, Cesium.Color.VIOLET, Cesium.Color.SPRINGGREEN
];

let otherRouteEntities = [];

function getStableColor(id) {
  if (!id || id === "global") return Cesium.Color.CYAN;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ROUTE_COLORS[Math.abs(hash) % ROUTE_COLORS.length];
}

function drawRouteOnCesium(geojsonLineString, overrideColor) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const coords = geojsonLineString.coordinates;
  const positions = coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));

  if (dashboardState.routeEntity) viewer.entities.remove(dashboardState.routeEntity);

  const matColor = overrideColor || Cesium.Color.CYAN;

  dashboardState.routeEntity = viewer.entities.add({
    polyline: {
      positions,
      width: 5,
      material: matColor.withAlpha(0.95),
      clampToGround: true
    }
  });
}

function zoomToRoute(geojsonLineString) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const coords = geojsonLineString.coordinates;
  let west = 180, east = -180, south = 90, north = -90;

  for (const [lon, lat] of coords) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  const rect = Cesium.Rectangle.fromDegrees(west, south, east, north);
  viewer.camera.flyTo({ destination: rect });
}

function clearOtherRoutes() {
  const viewer = dashboardState.viewer;
  otherRouteEntities.forEach(ent => {
    if (viewer && viewer.entities) viewer.entities.remove(ent);
  });
  otherRouteEntities = [];
}

function drawInactiveRoute(start, end, route, labelText, color) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const sEnt = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(start.lng, start.lat),
    point: { pixelSize: 8, color: Cesium.Color.GRAY },
    label: {
      text: "O: " + labelText,
      font: "bold 11px sans-serif",
      fillColor: color,
      pixelOffset: new Cesium.Cartesian2(0, -16)
    }
  });
  otherRouteEntities.push(sEnt);

  const eEnt = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(end.lng, end.lat),
    point: { pixelSize: 8, color: Cesium.Color.GRAY },
    label: {
      text: "D: " + labelText,
      font: "bold 11px sans-serif",
      fillColor: color,
      pixelOffset: new Cesium.Cartesian2(0, -16)
    }
  });
  otherRouteEntities.push(eEnt);

  if (route && route.geometry) {
    const coords = route.geometry.coordinates;
    const positions = coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
    const rEnt = viewer.entities.add({
      polyline: {
        positions,
        width: 3,
        material: color.withAlpha(0.65),
        clampToGround: true
      }
    });
    otherRouteEntities.push(rEnt);
  }
}

// BACKEND: renderAllOtherRoutes() lee rutas del objeto op (localStorage).
// Con backend las rutas vienen de GET /ops/:id/mapa → campo rutas_navegacion[].
// Cada ruta tiene id_ruta, origen_lat, origen_lon, destino_lat, destino_lon, geojson.
function renderAllOtherRoutes(op, currentSelectedId, selectEl) {
  clearOtherRoutes();

  if (currentSelectedId !== "global" && op.start && op.end) {
    drawInactiveRoute(op.start, op.end, op.route, "General", Cesium.Color.WHITE);
  }

  if (op.rutasVehiculos) {
    Object.entries(op.rutasVehiculos).forEach(([vId, rData]) => {
      if (vId === currentSelectedId) return;

      let vLabel = vId;
      if (selectEl) {
        const option = Array.from(selectEl.options).find(o => o.value === vId);
        if (option) vLabel = option.text.replace("Vehículo: ", "");
      }

      if (rData.start && rData.end) {
        drawInactiveRoute(rData.start, rData.end, rData.route, vLabel, getStableColor(vId));
      }
    });
  }
}

async function getOsrmRoute(start, end) {
  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${start.lng},${start.lat};${end.lng},${end.lat}` +
    `?overview=full&geometries=geojson`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo obtener ruta");

  const data = await r.json();
  if (!data.routes || !data.routes.length) {
    throw new Error("No hay ruta disponible");
  }

  return data.routes[0];
}

// ============================================================
// BACKEND: persistRouteDataToCurrentOperation() guarda rutas
// en el objeto operacion en localStorage hoy.
// Con backend se reemplaza por:
//   POST /ops/:id/rutas (crear ruta para un vehículo)
//   body: { geojson, origen_lat, origen_lon,
//           destino_lat, destino_lon,
//           distancia_m, duracion_s }
// Las rutas guardadas se cargan con GET /ops/:id/mapa
// → campo rutas_navegacion[].
// ============================================================
export function persistRouteDataToCurrentOperation() {
  const operacion = getCurrentOperation();
  const selectEl = document.getElementById("routeVehicleSelect");
  const selectedId = selectEl && selectEl.value ? selectEl.value : "global";

  if (selectedId === "global") {
    operacion.start = dashboardState.startPoint || null;
    operacion.end = dashboardState.endPoint || null;
    operacion.route = dashboardState.lastRoute || null;
  } else {
    if (!operacion.rutasVehiculos) operacion.rutasVehiculos = {};
    operacion.rutasVehiculos[selectedId] = {
      start: dashboardState.startPoint || null,
      end: dashboardState.endPoint || null,
      route: dashboardState.lastRoute || null
    };
  }

  if (!operacion.created_at) {
    operacion.created_at = new Date().toISOString();
  }

  if (!operacion.title && !operacion.titulo) {
    operacion.title = operacion.name || operacion.nombre || "Operación táctica";
  }

  if (!operacion.description && !operacion.descripcion) {
    operacion.description = operacion.type === "emergency"
      ? "Operación de emergencia"
      : "Operación táctica";
  }

  saveCurrentOperation(operacion);
}

// ============================================================
// BACKEND: autoCalcRoute() calcula con OSRM externo y guarda
// en localStorage. Con backend, después de calcular con OSRM
// se guarda la ruta en el servidor:
//   POST /ops/:id/rutas  (ruta_navegacion — tabla del backend)
//   body: {
//     geojson: route.geometry,
//     origen_lat, origen_lon,
//     destino_lat, destino_lon,
//     distancia_m: route.distance,
//     duracion_s: route.duration
//   }
// La respuesta devuelve { id_ruta } para poder borrarla después.
// OSRM sigue siendo externo — el backend solo almacena el
// resultado calculado, no calcula rutas por sí mismo.
// ============================================================
export async function autoCalcRoute() {
  if (!dashboardState.startPoint || !dashboardState.endPoint) return;

  setRouteInfo("Calculando ruta con OSRM...");

  try {
    const route = await getOsrmRoute(dashboardState.startPoint, dashboardState.endPoint);
    dashboardState.lastRoute = route;

    const selectEl = document.getElementById("routeVehicleSelect");
    const selectedId = selectEl ? selectEl.value : "global";
    drawRouteOnCesium(route.geometry, getStableColor(selectedId));
    zoomToRoute(route.geometry);

    const km = route.distance / 1000;
    const min = route.duration / 60;

    persistRouteDataToCurrentOperation();
    setRouteInfo(`Ruta lista. Distancia: ${km.toFixed(2)} km · Tiempo: ${min.toFixed(1)} min`);
  } catch (err) {
    setRouteInfo(`Error OSRM: ${err.message}`);
  }
}

// ============================================================
// BACKEND: populateRouteVehicleSelect() lee vehículos de
// localStorage (asignacion_actual) hoy.
// Con backend: la lista de vehículos viene de GET /ops/:id/mapa
// → campo vehiculos[{ id_vehiculo, alias, codigo_interno }].
// Se usa id_vehiculo como value del <option> en lugar del
// nombre/alias que se usa actualmente.
// ============================================================
export function populateRouteVehicleSelect(operacion) {
  const selectEl = document.getElementById("routeVehicleSelect");
  if (!selectEl) return;

  const prevValue = selectEl.value;
  selectEl.innerHTML = '<option value="global">Ruta General (Todos los vehículos)</option>';

  // BACKEND: vehículos ya no vienen de ASIGNACION_ACTUAL_KEY en localStorage.
  // Con backend vienen de GET /ops/:id/mapa → data.vehiculos[]
  // y se pasan directamente a esta función como parámetro.
  const asignacion = getJsonStorage(ASIGNACION_ACTUAL_KEY, {}) || {};
  const vehiculos = Array.isArray(asignacion.vehiculos) && asignacion.vehiculos.length
    ? asignacion.vehiculos
    : (Array.isArray(operacion.vehiculos) ? operacion.vehiculos : []);

  vehiculos.forEach(v => {
    const id = v.id || v.unidad || v.nombre || v.alias;
    if (!id) return;
    const label = `Vehículo: ${v.unidad || v.nombre || v.alias || "Sin nombre"}`;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = label;
    selectEl.appendChild(opt);
  });

  if ([...selectEl.options].some(o => o.value === prevValue)) {
    selectEl.value = prevValue;
  }
}

// BACKEND: loadRouteForSelectedVehicle() lee rutas de getCurrentOperation() (localStorage).
// Con backend las rutas vienen de rutas_navegacion[] del mapa.
// El id_vehiculo del select se usa para filtrar la ruta correspondiente.
export function loadRouteForSelectedVehicle() {
  const viewer = dashboardState.viewer;
  const op = getCurrentOperation();
  if (!op || !viewer) return;

  const selectEl = document.getElementById("routeVehicleSelect");
  const selectedId = selectEl && selectEl.value ? selectEl.value : "global";

  let rData = {};
  if (selectedId === "global") {
    rData = { start: op.start, end: op.end, route: op.route };
  } else {
    rData = (op.rutasVehiculos && op.rutasVehiculos[selectedId]) || {};
  }

  if (dashboardState.startEntity) viewer.entities.remove(dashboardState.startEntity);
  if (dashboardState.endEntity) viewer.entities.remove(dashboardState.endEntity);
  if (dashboardState.routeEntity) viewer.entities.remove(dashboardState.routeEntity);

  renderAllOtherRoutes(op, selectedId, selectEl);

  dashboardState.startPoint = rData.start || null;
  dashboardState.endPoint = rData.end || null;
  dashboardState.lastRoute = rData.route || null;

  dashboardState.startEntity = null;
  dashboardState.endEntity = null;
  dashboardState.routeEntity = null;

  if (dom.opLat) dom.opLat.value = dashboardState.startPoint
    ? `${dashboardState.startPoint.lat.toFixed(5)}, ${dashboardState.startPoint.lng.toFixed(5)}`
    : "";

  if (dom.opLng) dom.opLng.value = dashboardState.endPoint
    ? `${dashboardState.endPoint.lat.toFixed(5)}, ${dashboardState.endPoint.lng.toFixed(5)}`
    : "";

  if (dashboardState.startPoint) {
    dashboardState.startEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(dashboardState.startPoint.lng, dashboardState.startPoint.lat),
      point: { pixelSize: 12, color: Cesium.Color.LIME },
      label: {
        text: "ORIGEN",
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(0, -24)
      }
    });
  }

  if (dashboardState.endPoint) {
    dashboardState.endEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(dashboardState.endPoint.lng, dashboardState.endPoint.lat),
      point: { pixelSize: 12, color: Cesium.Color.YELLOW },
      label: {
        text: "DESTINO",
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(0, -24)
      }
    });
  }

  if (dashboardState.lastRoute && dashboardState.lastRoute.geometry) {
    drawRouteOnCesium(dashboardState.lastRoute.geometry, getStableColor(selectedId));
    zoomToRoute(dashboardState.lastRoute.geometry);
    setRouteInfo(`Mostrando ruta de: ${selectEl ? selectEl.options[selectEl.selectedIndex]?.text : "Ruta General"}`);
  } else if (dashboardState.startPoint || dashboardState.endPoint) {
    setRouteInfo("Puntos cargados. Falta calcular ruta completa.");
  } else {
    setRouteInfo(`No hay ruta guardada para: ${selectEl ? selectEl.options[selectEl.selectedIndex]?.text : "Ruta General"}`);
  }
}
