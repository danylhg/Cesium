// js/dashboard/dashboard.routes.js

import { dashboardState } from "./dashboard.state.js";
import { dom } from "./dashboard.dom.js";
import { setRouteInfo } from "./dashboard.ui.js";

const OSRM_BASE    = "https://router.project-osrm.org";
const API_BASE     = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

const ROUTE_COLORS = [
  Cesium.Color.MAGENTA,    Cesium.Color.ORANGE,   Cesium.Color.LIMEGREEN,
  Cesium.Color.PINK,       Cesium.Color.DEEPSKYBLUE, Cesium.Color.HOTPINK,
  Cesium.Color.GOLD,       Cesium.Color.VIOLET,   Cesium.Color.SPRINGGREEN
];

// IDs de rutas que yo acabo de enviar (evita redibujar lo que ya dibujé localmente)
const _mySentRouteIds = new Set();

// ── Helpers ──────────────────────────────────────────────────

function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("token");
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) }
  });
}

function getStableColor(id) {
  if (!id || id === "global") return Cesium.Color.CYAN;
  let hash = 0;
  for (let i = 0; i < String(id).length; i++) {
    hash = String(id).charCodeAt(i) + ((hash << 5) - hash);
  }
  return ROUTE_COLORS[Math.abs(hash) % ROUTE_COLORS.length];
}

function selectedVehicleId() {
  const el = document.getElementById("routeVehicleSelect");
  return el?.value || "global";
}

// ── Cesium drawing ───────────────────────────────────────────

function drawPolyline(coords, color, width = 5, alpha = 0.95) {
  const viewer = dashboardState.viewer;
  if (!viewer) return null;
  const positions = coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
  return viewer.entities.add({
    polyline: { positions, width, material: color.withAlpha(alpha), clampToGround: true }
  });
}

function drawPoint(lat, lon, color, label, pixelSize = 12) {
  const viewer = dashboardState.viewer;
  if (!viewer) return null;
  return viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: { pixelSize, color },
    label: {
      text: label,
      font: "14px sans-serif",
      fillColor: Cesium.Color.WHITE,
      pixelOffset: new Cesium.Cartesian2(0, -24)
    }
  });
}

function removeEntity(ent) {
  if (ent && dashboardState.viewer) dashboardState.viewer.entities.remove(ent);
}

function zoomToCoords(coords) {
  const viewer = dashboardState.viewer;
  if (!viewer || !coords?.length) return;
  let west = 180, east = -180, south = 90, north = -90;
  for (const [lon, lat] of coords) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(west, south, east, north) });
}

// ── Rutas propias (selected route) ──────────────────────────

function drawSelectedRoute(geojson, selectedId) {
  removeEntity(dashboardState.routeEntity);
  dashboardState.routeEntity = drawPolyline(geojson.coordinates, getStableColor(selectedId));
}

function clearSelectedRouteEntities() {
  removeEntity(dashboardState.startEntity);
  removeEntity(dashboardState.endEntity);
  removeEntity(dashboardState.routeEntity);
  dashboardState.startEntity = null;
  dashboardState.endEntity   = null;
  dashboardState.routeEntity = null;
  dashboardState.startPoint  = null;
  dashboardState.endPoint    = null;
  dashboardState.lastRoute   = null;
  dashboardState.lastRouteId = null;
}

// ── Rutas remotas (otros clientes / Android) ─────────────────

function drawRemoteRoute(ruta) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;
  if (dashboardState.remoteRouteEntities.has(ruta.id_ruta)) return; // ya dibujada

  const color    = Cesium.Color.fromCssColorString(ruta.color || "#1E90FF");
  const geojson  = typeof ruta.geojson === "string" ? JSON.parse(ruta.geojson) : ruta.geojson;
  const entities = [];

  const originEnt = drawPoint(ruta.origen_lat, ruta.origen_lon, Cesium.Color.LIME,
    `O: ${ruta.creador_nombre || "Externo"}`, 8);
  if (originEnt) entities.push(originEnt);

  const destEnt = drawPoint(ruta.destino_lat, ruta.destino_lon, Cesium.Color.YELLOW,
    `D: ${ruta.creador_nombre || "Externo"}`, 8);
  if (destEnt) entities.push(destEnt);

  if (geojson?.coordinates?.length) {
    const lineEnt = drawPolyline(geojson.coordinates, color, 3, 0.75);
    if (lineEnt) entities.push(lineEnt);
  }

  dashboardState.remoteRouteEntities.set(ruta.id_ruta, entities);
}

function removeRemoteRoute(id_ruta) {
  const entities = dashboardState.remoteRouteEntities.get(id_ruta);
  if (!entities) return;
  entities.forEach(removeEntity);
  dashboardState.remoteRouteEntities.delete(id_ruta);
}

function clearAllRemoteRoutes() {
  dashboardState.remoteRouteEntities.forEach(ents => ents.forEach(removeEntity));
  dashboardState.remoteRouteEntities.clear();
}

// ── Tracking (posiciones Android en tiempo real) ─────────────

function updateTrackingMarker(key, lat, lon, labelText, color) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const existing = dashboardState.trackingEntities.get(key);
  if (existing) viewer.entities.remove(existing);

  const ent = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point:    { pixelSize: 10, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
    label: {
      text: labelText,
      font: "bold 12px sans-serif",
      fillColor: Cesium.Color.WHITE,
      pixelOffset: new Cesium.Cartesian2(0, -22),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 50000)
    }
  });

  dashboardState.trackingEntities.set(key, ent);
}

// ── OSRM ────────────────────────────────────────────────────

async function getOsrmRoute(start, end) {
  const url = `${OSRM_BASE}/route/v1/driving/` +
    `${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("OSRM no disponible");
  const data = await r.json();
  if (!data.routes?.length) throw new Error("Sin ruta disponible");
  return data.routes[0];
}

// ── Guardar ruta en DB ────────────────────────────────────────

async function saveRouteToDB(start, end, route) {
  const opId = localStorage.getItem("active_operation_id");
  if (!opId) return null;

  try {
    const res = await apiFetch(`/ops/${opId}/rutas/navegacion`, {
      method: "POST",
      body: JSON.stringify({
        geojson:     route.geometry,
        origen_lat:  start.lat,  origen_lon:  start.lng,
        destino_lat: end.lat,    destino_lon: end.lng,
        distancia_m: route.distance,
        duracion_s:  route.duration
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok) return null;
    // Marcar como "mía" para no redibujar cuando llegue el socket event
    const id_ruta = data.ruta.id_ruta;
    _mySentRouteIds.add(id_ruta);
    setTimeout(() => _mySentRouteIds.delete(id_ruta), 5000);
    return id_ruta;
  } catch (err) {
    console.error("[RUTAS] Error guardando ruta:", err);
    return null;
  }
}

// ── Eliminar ruta en DB ───────────────────────────────────────

async function deleteRoutFromDB(id_ruta) {
  const opId = localStorage.getItem("active_operation_id");
  if (!opId || !id_ruta) return;
  try {
    await apiFetch(`/ops/${opId}/rutas/navegacion/${id_ruta}`, { method: "DELETE" });
  } catch (err) {
    console.error("[RUTAS] Error eliminando ruta:", err);
  }
}

// ── Cargar rutas existentes al iniciar ────────────────────────

async function loadExistingRoutes() {
  const opId = localStorage.getItem("active_operation_id");
  if (!opId) return;
  try {
    const res  = await apiFetch(`/ops/${opId}/rutas/navegacion`);
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.items)) return;
    data.items.forEach(ruta => drawRemoteRoute(ruta));
  } catch (err) {
    console.error("[RUTAS] Error cargando rutas existentes:", err);
  }
}

// ── API pública ──────────────────────────────────────────────

export async function autoCalcRoute() {
  if (!dashboardState.startPoint || !dashboardState.endPoint) return;

  setRouteInfo("Calculando ruta con OSRM...");

  try {
    const route = await getOsrmRoute(dashboardState.startPoint, dashboardState.endPoint);
    dashboardState.lastRoute = route;

    const selectedId = selectedVehicleId();
    drawSelectedRoute(route.geometry, selectedId);
    zoomToCoords(route.geometry.coordinates);

    const km  = route.distance / 1000;
    const min = route.duration / 60;
    setRouteInfo(`Ruta lista. ${km.toFixed(2)} km · ${min.toFixed(1)} min`);

    // Guardar en DB (el socket event llegará al room; yo ya la dibujé)
    const id_ruta = await saveRouteToDB(dashboardState.startPoint, dashboardState.endPoint, route);
    if (id_ruta) dashboardState.lastRouteId = id_ruta;
  } catch (err) {
    setRouteInfo(`Error: ${err.message}`);
  }
}

export function clearRoute() {
  // Solo limpia el mapa — la ruta queda guardada en la base de datos
  clearSelectedRouteEntities();
  setRouteInfo("Ruta limpiada del mapa.");

  if (dom.opLat) dom.opLat.value = "";
  if (dom.opLng) dom.opLng.value = "";
}

export function populateRouteVehicleSelect(vehiculos = []) {
  const selectEl = document.getElementById("routeVehicleSelect");
  if (!selectEl) return;

  const prevValue = selectEl.value;
  selectEl.innerHTML = '<option value="global">Ruta General</option>';

  vehiculos.forEach(v => {
    // Acepta formato del backend (id_vehiculo, alias, tipo, codigo_interno)
    // o formato legacy (id, nombre, unidad, alias)
    const id    = v.id_vehiculo ?? v.id ?? v.unidad ?? v.nombre;
    const label = [v.tipo, v.alias].filter(Boolean).join(" ") || v.codigo_interno || v.nombre || "Vehículo";
    if (!id) return;
    const opt = document.createElement("option");
    opt.value       = String(id);
    opt.textContent = `Vehículo: ${label}`;
    selectEl.appendChild(opt);
  });

  if ([...selectEl.options].some(o => o.value === prevValue)) selectEl.value = prevValue;
}

// Mantener compatibilidad con dashboard.js que la llama con la operación completa
export function populateRouteVehicleSelectFromOp(operacion) {
  populateRouteVehicleSelect(operacion?.vehiculos || []);
}

export function loadRouteForSelectedVehicle() {
  // Con el nuevo sistema las rutas vienen de DB via socket.
  // Esta función limpia la selección actual y deja listo para nueva ruta.
  clearSelectedRouteEntities();
  setRouteInfo("Selecciona puntos de inicio y destino en el mapa.");
  if (dom.opLat) dom.opLat.value = "";
  if (dom.opLng) dom.opLng.value = "";
}

// ── Inicialización con Socket.io ──────────────────────────────

export function initRoutes(socket) {
  // Ruta nueva creada (por web u Android)
  socket.on("ruta_navegacion_creada", ({ ruta }) => {
    if (_mySentRouteIds.has(ruta.id_ruta)) return; // ya la dibujé localmente
    drawRemoteRoute(ruta);
    setRouteInfo(`Nueva ruta recibida de ${ruta.creador_nombre || "otro cliente"}.`);
  });

  // Ruta eliminada (por web u Android)
  socket.on("ruta_navegacion_eliminada", ({ id_ruta }) => {
    removeRemoteRoute(id_ruta);
    // Si era la ruta activa del selector, limpiar
    if (dashboardState.lastRouteId === id_ruta) {
      clearSelectedRouteEntities();
      setRouteInfo("La ruta activa fue eliminada.");
    }
  });

  // Tracking de personal (Android envía posición GPS)
  socket.on("tracking_personal", (data) => {
    if (!data?.id_personal || data.latitud == null || data.longitud == null) return;
    updateTrackingMarker(
      `P:${data.id_personal}`,
      Number(data.latitud), Number(data.longitud),
      data.nombre || `P-${data.id_personal}`,
      Cesium.Color.fromCssColorString("#00ffa6")
    );
  });

  // Tracking de vehículos (Android envía posición GPS)
  socket.on("tracking_vehiculo", (data) => {
    if (!data?.id_vehiculo || data.latitud == null || data.longitud == null) return;
    updateTrackingMarker(
      `V:${data.id_vehiculo}`,
      Number(data.latitud), Number(data.longitud),
      data.nombre || `V-${data.id_vehiculo}`,
      Cesium.Color.fromCssColorString("#3b82f6")
    );
  });

  // Cargar rutas ya existentes en la operación
  loadExistingRoutes();
}

// Compatibilidad con dashboard.map.js (sigue importando persistRouteDataToCurrentOperation)
export function persistRouteDataToCurrentOperation() {
  // No-op: persistencia ahora es via DB
}
