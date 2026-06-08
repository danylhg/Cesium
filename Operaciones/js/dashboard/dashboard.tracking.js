// js/dashboard/dashboard.tracking.js

import { dashboardState } from "./dashboard.state.js";
import { processTrackingUpdate } from "./dashboard.tracking.clustering.js";
import {
  ASIGNACION_ACTUAL_KEY,
  getCurrentOperation,
  getJsonStorage
} from "./dashboard.storage.js";
import {
  activatePersonalLocation,
  activateTrackingLocation,
  refreshPersonnelInfoPopup,
  updateFollowedPersonalLocation,
  updateFollowedTrackingLocation
} from "./dashboard.ui.js";

const API_BASE = () => localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
const token = () => localStorage.getItem("token");
const opId = () => localStorage.getItem("active_operation_id");

// ── Iconos / colores ─────────────────────────────────────────
const COLOR_PERSONAL = Cesium.Color.fromCssColorString("#00BFFF");
const COLOR_VEHICULO = Cesium.Color.fromCssColorString("#FFD700");
const COLOR_EQUIPO = Cesium.Color.fromCssColorString("#B4FF39");
const COLOR_DISPOSITIVO = Cesium.Color.fromCssColorString("#FF8A3D");

const SCALE_BY_DIST = new Cesium.NearFarScalar(1e3, 1.5, 2e6, 0.1);
const SYMBOL_SCALE_BY_DIST = new Cesium.NearFarScalar(1e3, 1.0, 2e6, 0.28);
const TRACKING_SYMBOL_SIZE = 42;
const TRACKING_SYMBOL_RENDER_SIZE = 160;
const TRACKING_ACTIVE_STALE_MS = 30000;
const HEADING_LINE_LENGTH_METERS = 90;
const HEADING_LINE_WIDTH = 4;
const trackingSymbolImageCache = new Map();

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function textIncludes(text, ...needles) {
  return needles.some(needle => text.includes(needle));
}

function buildMilSidc(identity = "F", dimension = "G", icon = "U-----") {
  const safeIcon = String(icon || "U-----").padEnd(6, "-").slice(0, 6);
  return `S${identity}${dimension}P${safeIcon}-----`;
}

function getFallbackMilSidc(tacticalType = "personal") {
  if (tacticalType === "vehiculo") return buildMilSidc("F", "G", "EV----");
  if (tacticalType === "equipo") return buildMilSidc("F", "G", "E-----");
  if (tacticalType === "dispositivo") return buildMilSidc("F", "G", "UCS---");
  return buildMilSidc("F", "G", "UCI---");
}

function resolveTrackingMilSymbol(tacticalType, item = {}) {
  const providedSidc = item.sidc || item.codigo_sidc || item.mil_sidc;
  if (providedSidc) return String(providedSidc);

  const text = normalizeText([
    tacticalType,
    item.rol_en_operacion,
    item.rol,
    item.tipo,
    item.tipo_equipo,
    item.tipo_tactico,
    item.categoria,
    item.nombre,
    item.marca,
    item.modelo,
    item.sistema_operativo,
    item.codigo_interno,
    item.alias
  ].filter(Boolean).join(" "));

  if (tacticalType === "vehiculo") {
    if (textIncludes(text, "AMBULANC", "MEDIC")) return buildMilSidc("F", "G", "UCM---");
    if (textIncludes(text, "BLIND", "TANQUE", "ARMORED")) return buildMilSidc("F", "G", "UCD---");
    if (textIncludes(text, "PATRULL", "POLIC", "SEGUR")) return buildMilSidc("F", "G", "UCF---");
    return buildMilSidc("F", "G", "EV----");
  }

  if (tacticalType === "equipo") {
    if (textIncludes(text, "DRON", "DRONE", "UAV", "MATRICE")) return buildMilSidc("F", "A", "MFQ---");
    if (textIncludes(text, "RADIO", "COMUNIC", "SENAL", "SIGNAL")) return buildMilSidc("F", "G", "UCS---");
    if (textIncludes(text, "ARMA", "RIFLE", "PISTOLA", "FUSIL")) return buildMilSidc("F", "G", "EW----");
    if (textIncludes(text, "CAMARA", "SENSOR", "TACTICO")) return buildMilSidc("F", "G", "EX----");
    return buildMilSidc("F", "G", "E-----");
  }

  if (tacticalType === "dispositivo") {
    if (textIncludes(text, "TELEFONO", "CELULAR", "TABLET", "RADIO", "COMUNIC")) {
      return buildMilSidc("F", "G", "UCS---");
    }
    if (textIncludes(text, "CAMARA", "SENSOR")) return buildMilSidc("F", "G", "EX----");
    return buildMilSidc("F", "G", "E-----");
  }

  if (tacticalType === "personal") {
    if (textIncludes(text, "CUT", "CET")) return buildMilSidc("F", "G", "UCI---");
    if (textIncludes(text, "CELL", "CELULA")) return buildMilSidc("F", "G", "UCI---");
    if (textIncludes(text, "PATRULL", "POLIC", "SEGUR")) return buildMilSidc("F", "G", "UCF---");
    return getFallbackMilSidc("personal");
  }

  return getFallbackMilSidc(tacticalType);
}

function renderMilSymbol(sidc) {
  if (!sidc || typeof ms === "undefined" || typeof ms.Symbol !== "function") return null;
  if (trackingSymbolImageCache.has(sidc)) return trackingSymbolImageCache.get(sidc);

  try {
    const symbol = new ms.Symbol(sidc, {
      size: TRACKING_SYMBOL_RENDER_SIZE,
      colorMode: "Light"
    });

    if (typeof symbol.isValid === "function" && symbol.isValid() === false) {
      trackingSymbolImageCache.set(sidc, null);
      return null;
    }

    if (typeof symbol.asSVG === "function" && />\s*\?\s*</.test(symbol.asSVG())) {
      trackingSymbolImageCache.set(sidc, null);
      return null;
    }

    const image = symbol.asCanvas();
    trackingSymbolImageCache.set(sidc, image);
    return image;
  } catch (err) {
    console.warn("[TRACKING] No se pudo generar simbolo MIL:", sidc, err);
    trackingSymbolImageCache.set(sidc, null);
    return null;
  }
}

function makeTrackingBillboard(image) {
  return new Cesium.BillboardGraphics({
    image,
    width: TRACKING_SYMBOL_SIZE,
    height: TRACKING_SYMBOL_SIZE,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    scaleByDistance: SYMBOL_SCALE_BY_DIST
  });
}

function getTrackingMarker(meta) {
  const tacticalType = meta.tacticalType || "personal";
  const sidc = resolveTrackingMilSymbol(tacticalType, meta.liveData || {});
  const fallbackSidc = getFallbackMilSidc(tacticalType);
  let image = renderMilSymbol(sidc);
  let renderedSidc = sidc;

  if (!image && sidc !== fallbackSidc) {
    image = renderMilSymbol(fallbackSidc);
    if (image) renderedSidc = fallbackSidc;
  }

  return {
    sidc: renderedSidc,
    billboard: image ? makeTrackingBillboard(image) : undefined,
    point: undefined,
    labelOffset: new Cesium.Cartesian2(0, 17)
  };
}

function makePersonalLabel(item) {
  const fullName = [item.nombre, item.apellido].filter(Boolean).join(" ").trim();
  return fullName || item.apodo || item.nombre || item.apellido || `P-${item.id_personal}`;
}

function makeVehiculoLabel(item) {
  const codigo = item.codigo_interno || "";
  const alias = item.alias || "";
  if (codigo && alias) return `${codigo} - ${alias}`;
  return codigo || alias || `V-${item.id_vehiculo}`;
}

function makeEquipoLabel(item) {
  const serie = item.numero_serie || "";
  const nombre = item.nombre || item.tipo_equipo || "";
  if (serie && nombre) return `${serie} - ${nombre}`;
  return nombre || serie || `E-${item.id_equipo}`;
}

function makeDispositivoLabel(item) {
  const modelo = [item.marca, item.modelo].filter(Boolean).join(" ").trim();
  const tipo = item.tipo || "Dispositivo";
  const serie = item.numero_serie || item.imei || item.numero_telefono || "";
  if (modelo && serie) return `${tipo} ${modelo} - ${serie}`;
  return modelo || serie || `${tipo}-${item.id_dispositivo}`;
}

function normalizeCoords(lat, lng) {
  if (lat === undefined || lat === null || String(lat).trim() === "") return null;
  if (lng === undefined || lng === null || String(lng).trim() === "") return null;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  if (Math.abs(nLat) > 90 || Math.abs(nLng) > 180) return null;
  if (nLat === 0 && nLng === 0) return null;
  return { lat: nLat, lng: nLng };
}

function parseTrackingTimestamp(value) {
  if (value == null || String(value).trim() === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function trackingTimestamp(item = {}) {
  return firstTrackingValue(
    item.timestamp,
    item.updated_at,
    item.fecha_actualizacion,
    item.ultima_actualizacion,
    item.last_update,
    item.lastUpdated
  );
}

function isFreshTrackingItem(item = {}) {
  const timestamp = parseTrackingTimestamp(trackingTimestamp(item));
  if (!timestamp) return false;
  return Date.now() - timestamp <= TRACKING_ACTIVE_STALE_MS;
}

function getCoords(item) {
  const lat = item?.latitud ?? item?.lat;
  const lng = item?.longitud ?? item?.lng ?? item?.lon;
  if (lat == null || lng == null) return null;
  return normalizeCoords(lat, lng);
}

function assignedPersonalId(item) {
  const value = item?.id_personal ?? item?.personal_id ?? item?.id_personal_asignado;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function firstTrackingValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function normalizeHeadingDegrees(value) {
  const raw = firstTrackingValue(value);
  if (raw == null) return null;
  const number = Number(String(raw).replace("°", "").trim());
  if (!Number.isFinite(number)) return null;
  return ((number % 360) + 360) % 360;
}

function getHeadingDegrees(item = {}) {
  return normalizeHeadingDegrees(firstTrackingValue(
    item.rumbo_grados,
    item.rumboGrados,
    item.headingDegrees,
    item.heading,
    item.heading_deg,
    item.bearing,
    item.curso,
    item.rumbo
  ));
}

function makeHeadingLinePositions(position, headingDegrees) {
  const headingRadians = Cesium.Math.toRadians(headingDegrees);
  const eastMeters = Math.sin(headingRadians) * HEADING_LINE_LENGTH_METERS;
  const northMeters = Math.cos(headingRadians) * HEADING_LINE_LENGTH_METERS;
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  const endPosition = Cesium.Matrix4.multiplyByPoint(
    enu,
    new Cesium.Cartesian3(eastMeters, northMeters, 0),
    new Cesium.Cartesian3()
  );
  return [position, endPosition];
}

function removeTrackingHeadingEntity(key) {
  const ent = dashboardState.trackingHeadingEntities.get(key);
  if (!ent) return;
  const viewer = dashboardState.viewer;
  if (viewer) viewer.entities.remove(ent);
  dashboardState.trackingHeadingEntities.delete(key);
}

function upsertTrackingHeadingEntity(key, position, color, meta = {}) {
  const headingDegrees = getHeadingDegrees(meta.liveData || {});
  if (headingDegrees == null) {
    removeTrackingHeadingEntity(key);
    return;
  }

  const positions = makeHeadingLinePositions(position, headingDegrees);
  const material = color.withAlpha(0.95);
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  if (dashboardState.trackingHeadingEntities.has(key)) {
    const ent = dashboardState.trackingHeadingEntities.get(key);
    ent.name = `Rumbo ${headingDegrees.toFixed(0)}°`;
    ent.polyline.positions = positions;
    ent.polyline.material = material;
    if (ent.properties) {
      ent.properties.headingDegrees = headingDegrees;
    }
    return;
  }

  const ent = viewer.entities.add({
    name: `Rumbo ${headingDegrees.toFixed(0)}°`,
    polyline: {
      positions,
      width: HEADING_LINE_WIDTH,
      material,
      clampToGround: true,
      zIndex: 5
    },
    properties: {
      trackingKey: key,
      tacticalType: "tracking-heading",
      headingDegrees,
      draggable: false
    }
  });

  dashboardState.trackingHeadingEntities.set(key, ent);
}

function isWearableDevice(item = {}) {
  const tipo = normalizeText(item.tipo || item.tipo_dispositivo || "");
  return textIncludes(tipo, "SMARTWATCH", "WEARABLE", "WATCH", "RELOJ");
}

function activateAssignedWearableLocationsFromPersonal(item = {}, coords = null) {
  const idPersonal = assignedPersonalId(item);
  if (!idPersonal || !coords) return;

  getAssignedDevices()
    .filter((device) => isWearableDevice(device) && assignedPersonalId(device) === idPersonal)
    .forEach((device) => {
      const idDispositivo = getDeviceId(device);
      if (idDispositivo == null || String(idDispositivo).trim() === "") return;
      activateTrackingLocation("D", idDispositivo, coords.lat, coords.lng);
      updateFollowedTrackingLocation(`D:${idDispositivo}`, coords.lat, coords.lng);
    });
}

function normalizeDeviceIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function deviceIdentityValues(item = {}) {
  return [
    item.numero_serie,
    item.numeroSerie,
    item.serial_dispositivo,
    item.serial,
    item.imei,
    item.identificador_app,
    item.identificadorApp
  ]
    .map(normalizeDeviceIdentity)
    .filter(Boolean);
}

function getDeviceId(item = {}) {
  return firstTrackingValue(
    item.id_dispositivo,
    item.id,
    item.dispositivo_id,
    item.idDispositivo,
    item.device_id
  );
}

function getAssignedDevices() {
  const op = getCurrentOperation() || {};
  const asignacion = getJsonStorage(ASIGNACION_ACTUAL_KEY, {}) || {};
  return [
    ...(Array.isArray(asignacion.dispositivos) ? asignacion.dispositivos : []),
    ...(Array.isArray(op.dispositivos) ? op.dispositivos : [])
  ];
}

function findConfirmedDevice(item = {}) {
  const incomingIdentity = deviceIdentityValues(item);
  if (!incomingIdentity.length) return null;

  const incomingId = String(getDeviceId(item) ?? "").trim();
  const assigned = getAssignedDevices();
  if (!assigned.length) return item;
  const sameId = incomingId
    ? assigned.filter((candidate) => String(getDeviceId(candidate) ?? "").trim() === incomingId)
    : [];
  const candidates = sameId.length ? sameId : assigned;

  return candidates.find((candidate) => {
    const candidateIdentity = deviceIdentityValues(candidate);
    return candidateIdentity.length &&
      incomingIdentity.some((value) => candidateIdentity.includes(value));
  }) || null;
}

function upsertPersonalTracking(item) {
  const coords = getCoords(item);
  if (!coords || item?.id_personal == null) return;

  upsertTrackingEntity(`P:${item.id_personal}`, coords.lat, coords.lng, makePersonalLabel(item), COLOR_PERSONAL, {
    tacticalType: "personal",
    trackingRole: item.rol_en_operacion || item.rol || "",
    liveData: item
  });
  activatePersonalLocation(item.id_personal, coords.lat, coords.lng);
  activateAssignedWearableLocationsFromPersonal(item, coords);
  updateFollowedPersonalLocation(item.id_personal, coords.lat, coords.lng);
  refreshPersonnelInfoPopup(item.id_personal, item);
}

function upsertVehiculoTracking(item) {
  const coords = getCoords(item);
  if (!coords || item?.id_vehiculo == null) return;

  upsertTrackingEntity(`V:${item.id_vehiculo}`, coords.lat, coords.lng, makeVehiculoLabel(item), COLOR_VEHICULO, {
    tacticalType: "vehiculo",
    trackingRole: item.tipo || "",
    liveData: item
  });
  activateTrackingLocation("V", item.id_vehiculo, coords.lat, coords.lng);
  updateFollowedTrackingLocation(`V:${item.id_vehiculo}`, coords.lat, coords.lng);
}

function upsertEquipoTracking(item, options = {}) {
  const coords = getCoords(item);
  if (!coords || item?.id_equipo == null) return;
  if (options.requireFreshTimestamp && !isFreshTrackingItem(item)) {
    removeTrackingEntity(`E:${item.id_equipo}`);
    return;
  }

  upsertTrackingEntity(`E:${item.id_equipo}`, coords.lat, coords.lng, makeEquipoLabel(item), COLOR_EQUIPO, {
    tacticalType: "equipo",
    trackingRole: item.categoria || item.tipo_equipo || "",
    liveData: item
  });
  activateTrackingLocation("E", item.id_equipo, coords.lat, coords.lng);
  updateFollowedTrackingLocation(`E:${item.id_equipo}`, coords.lat, coords.lng);
}

function upsertDispositivoTracking(item) {
  const coords = getCoords(item);
  if (!coords || item?.id_dispositivo == null) return;
  const confirmedDevice = findConfirmedDevice(item);
  if (!confirmedDevice) {
    removeTrackingEntity(`D:${item.id_dispositivo}`);
    return;
  }

  const liveData = { ...confirmedDevice, ...item };

  if (assignedPersonalId(item) != null) {
    activateTrackingLocation("D", item.id_dispositivo, coords.lat, coords.lng);
    updateFollowedTrackingLocation(`D:${item.id_dispositivo}`, coords.lat, coords.lng);
    removeTrackingEntity(`D:${item.id_dispositivo}`);
    return;
  }

  upsertTrackingEntity(`D:${item.id_dispositivo}`, coords.lat, coords.lng, makeDispositivoLabel(liveData), COLOR_DISPOSITIVO, {
    tacticalType: "dispositivo",
    trackingRole: item.tipo || "",
    liveData
  });
  activateTrackingLocation("D", item.id_dispositivo, coords.lat, coords.lng);
  updateFollowedTrackingLocation(`D:${item.id_dispositivo}`, coords.lat, coords.lng);
}

// ── Crear o mover una entidad de tracking ────────────────────
function upsertTrackingEntity(key, lat, lng, label, color, meta = {}) {
  const coords = normalizeCoords(lat, lng);
  if (!coords) return;

  processTrackingUpdate(key, coords.lat, coords.lng, meta.liveData ? { liveData: meta.liveData } : {});

  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const position = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat);
  const marker = getTrackingMarker(meta);
  upsertTrackingHeadingEntity(key, position, color, meta);

  if (dashboardState.trackingEntities.has(key)) {
    // Mover y refrescar estilo/etiqueta si ya existe
    const ent = dashboardState.trackingEntities.get(key);
    ent.position = position;
    ent.name = label;
    if (ent.label) {
      ent.label.text = label;
      ent.label.backgroundColor = color.withAlpha(0.7);
      ent.label.pixelOffset = marker.labelOffset;
    }
    ent.billboard = marker.billboard;
    ent.point = marker.point;
    if (ent.properties) {
      ent.properties.trackingRole = meta.trackingRole || ent.properties.trackingRole;
      ent.properties.tacticalType = meta.tacticalType || ent.properties.tacticalType;
      ent.properties.trackingSidc = marker.sidc || ent.properties.trackingSidc;
    }
    return;
  }

  // Crear nueva entidad
  const ent = viewer.entities.add({
    name: label,
    position,
    billboard: marker.billboard,
    point: marker.point,
    label: {
      text: label,
      font: "11px sans-serif",
      pixelOffset: marker.labelOffset,
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      showBackground: true,
      backgroundColor: color.withAlpha(0.6),
      backgroundPadding: new Cesium.Cartesian2(4, 2),
      scaleByDistance: SCALE_BY_DIST
    },
    properties: {
      trackingKey: key,
      tacticalType: meta.tacticalType || (key.startsWith("V:") ? "vehiculo" : "personal"),
      trackingRole: meta.trackingRole || "",
      trackingSidc: marker.sidc || "",
      draggable: false
    }
  });

  dashboardState.trackingEntities.set(key, ent);
}

function removeTrackingEntity(key) {
  removeTrackingHeadingEntity(key);
  const ent = dashboardState.trackingEntities.get(key);
  if (!ent) return;
  const viewer = dashboardState.viewer;
  if (viewer) viewer.entities.remove(ent);
  dashboardState.trackingEntities.delete(key);
}

// ── Carga desde datos de mapa ya obtenidos (sin fetch extra) ─
export function loadTrackingFromMapaData(mapaData) {
  (mapaData.personal || []).forEach(p => {
    upsertPersonalTracking(p);
  });
  (mapaData.vehiculos || []).forEach(v => {
    upsertVehiculoTracking(v);
  });
  (mapaData.equipos || []).forEach(e => {
    upsertEquipoTracking(e, { requireFreshTimestamp: true });
  });
  (mapaData.dispositivos || []).forEach(d => {
    upsertDispositivoTracking(d);
  });
}

// ── Carga inicial desde /ops/:id/mapa (fallback) ─────────────
export async function loadTrackingFromBackend() {
  const id = opId();
  if (!id || !token()) return;

  try {
    const res = await fetch(`${API_BASE()}/ops/${id}/mapa`, {
      headers: { "Authorization": `Bearer ${token()}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;

    // Personal con posición conocida
    (data.personal || []).forEach(upsertPersonalTracking);

    // Vehículos con posición conocida
    (data.vehiculos || []).forEach(upsertVehiculoTracking);

    (data.equipos || []).forEach(e => {
      upsertEquipoTracking(e, { requireFreshTimestamp: true });
    });

    (data.dispositivos || []).forEach(d => {
      upsertDispositivoTracking(d);
    });

  } catch (err) {
    console.error("[TRACKING] Error cargando posiciones iniciales:", err);
  }
}

async function fetchTrackingList(path) {
  const id = opId();
  if (!id || !token()) return [];

  try {
    const res = await fetch(`${API_BASE()}/ops/${id}${path}`, {
      headers: { "Authorization": `Bearer ${token()}` },
      cache: "no-store"
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    console.warn("[TRACKING] No se pudo refrescar tracking:", err.message);
    return [];
  }
}

export async function refreshTrackingPositions() {
  const [personal, vehiculos, equipos, dispositivos] = await Promise.all([
    fetchTrackingList("/tracking/personal"),
    fetchTrackingList("/tracking/vehiculos"),
    fetchTrackingList("/tracking/equipos"),
    fetchTrackingList("/tracking/dispositivos")
  ]);

  if (personal.length || vehiculos.length || equipos.length || dispositivos.length) {
    console.log(
      `[TRACKING] refresh personal=${personal.length} vehiculos=${vehiculos.length} ` +
      `equipos=${equipos.length} dispositivos=${dispositivos.length}`
    );
  }

  personal.forEach(upsertPersonalTracking);
  vehiculos.forEach(upsertVehiculoTracking);
  equipos.forEach(e => upsertEquipoTracking(e, { requireFreshTimestamp: true }));
  dispositivos.forEach(upsertDispositivoTracking);
}

export function startTrackingPolling(intervalMs = 5000) {
  refreshTrackingPositions();
  return window.setInterval(refreshTrackingPositions, intervalMs);
}

// ── Socket en tiempo real ────────────────────────────────────
export function initTrackingSocket(socket) {
  socket.on("tracking_personal", (data) => {
    upsertPersonalTracking(data);
  });

  socket.on("signos_vitales_personal", (data) => {
    if (!data?.id_personal) return;
    refreshPersonnelInfoPopup(data.id_personal, data);
  });

  socket.on("tracking_vehiculo", (data) => {
    upsertVehiculoTracking(data);
  });

  socket.on("tracking_equipo", (data) => {
    upsertEquipoTracking(data);
  });

  socket.on("tracking_dispositivo", (data) => {
    upsertDispositivoTracking(data);
  });
}
