// js/dashboard/dashboard.tracking.js

import { dashboardState } from "./dashboard.state.js";
import { processTrackingUpdate } from "./dashboard.tracking.clustering.js";
import {
  activatePersonalLocation,
  refreshPersonnelInfoPopup,
  updateFollowedPersonalLocation
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
    if (textIncludes(text, "PATRULL", "POLIC", "SEGUR")) return buildMilSidc("F", "G", "UCP---");
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
    if (textIncludes(text, "CUT", "CET")) return buildMilSidc("F", "G", "U-----");
    return buildMilSidc("F", "G", "UCP---");
  }

  return buildMilSidc("F", "G", "U-----");
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

function makeTrackingPoint(color) {
  return new Cesium.PointGraphics({
    pixelSize: 10,
    color: color.withAlpha(0.18),
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 3,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    scaleByDistance: new Cesium.NearFarScalar(1e3, 1.0, 2e6, 0.8)
  });
}

function getTrackingMarker(meta, color) {
  const sidc = resolveTrackingMilSymbol(meta.tacticalType || "personal", meta.liveData || {});
  const image = renderMilSymbol(sidc);
  return {
    sidc,
    billboard: image ? makeTrackingBillboard(image) : undefined,
    point: image ? undefined : makeTrackingPoint(color),
    labelOffset: image ? new Cesium.Cartesian2(0, 17) : new Cesium.Cartesian2(0, -18)
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
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  if (Math.abs(nLat) > 90 || Math.abs(nLng) > 180) return null;
  return { lat: nLat, lng: nLng };
}

function getCoords(item) {
  const lat = item?.latitud ?? item?.lat;
  const lng = item?.longitud ?? item?.lng ?? item?.lon;
  if (lat == null || lng == null) return null;
  return normalizeCoords(lat, lng);
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
}

function upsertEquipoTracking(item) {
  const coords = getCoords(item);
  if (!coords || item?.id_equipo == null) return;

  upsertTrackingEntity(`E:${item.id_equipo}`, coords.lat, coords.lng, makeEquipoLabel(item), COLOR_EQUIPO, {
    tacticalType: "equipo",
    trackingRole: item.categoria || item.tipo_equipo || "",
    liveData: item
  });
}

function upsertDispositivoTracking(item) {
  const coords = getCoords(item);
  if (!coords || item?.id_dispositivo == null) return;

  upsertTrackingEntity(`D:${item.id_dispositivo}`, coords.lat, coords.lng, makeDispositivoLabel(item), COLOR_DISPOSITIVO, {
    tacticalType: "dispositivo",
    trackingRole: item.tipo || "",
    liveData: item
  });
}

// ── Crear o mover una entidad de tracking ────────────────────
function upsertTrackingEntity(key, lat, lng, label, color, meta = {}) {
  processTrackingUpdate(key, lat, lng, meta.liveData ? { liveData: meta.liveData } : {});

  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const position = Cesium.Cartesian3.fromDegrees(Number(lng), Number(lat));
  const marker = getTrackingMarker(meta, color);

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

// ── Carga desde datos de mapa ya obtenidos (sin fetch extra) ─
export function loadTrackingFromMapaData(mapaData) {
  (mapaData.personal || []).forEach(p => {
    upsertPersonalTracking(p);
  });
  (mapaData.vehiculos || []).forEach(v => {
    upsertVehiculoTracking(v);
  });
  (mapaData.equipos || []).forEach(e => {
    upsertEquipoTracking(e);
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
    (data.personal || []).forEach(p => {
      const coords = getCoords(p);
      if (!coords) return;
      const key = `P:${p.id_personal}`;
      const label = makePersonalLabel(p);
      upsertTrackingEntity(key, coords.lat, coords.lng, label, COLOR_PERSONAL, {
        tacticalType: "personal",
        trackingRole: p.rol_en_operacion || p.rol || ""
      });
    });

    // Vehículos con posición conocida
    (data.vehiculos || []).forEach(v => {
      const coords = getCoords(v);
      if (!coords) return;
      const key = `V:${v.id_vehiculo}`;
      const label = makeVehiculoLabel(v);
      upsertTrackingEntity(key, coords.lat, coords.lng, label, COLOR_VEHICULO, {
        tacticalType: "vehiculo"
      });
    });

    (data.equipos || []).forEach(e => {
      upsertEquipoTracking(e);
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
  equipos.forEach(upsertEquipoTracking);
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
