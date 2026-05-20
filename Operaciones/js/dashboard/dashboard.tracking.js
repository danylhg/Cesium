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
const EMERGENCY_PULSE_COLORS = ["#ff2d55", "#ffcc00", "#00e5ff"]
  .map(color => Cesium.Color.fromCssColorString(color));
const emergencyPulseEntities = new Map();

const SCALE_BY_DIST = new Cesium.NearFarScalar(1e3, 1.5, 2e6, 0.1);

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

function parseEmergencyCoords(content = "") {
  const match = String(content).match(/UBICACI(?:ON|.N):\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return normalizeCoords(match[1], match[2]);
}

function coordsFromEntity(entity) {
  if (!entity?.position) return null;
  const viewer = dashboardState.viewer;
  const position = entity.position.getValue
    ? entity.position.getValue(viewer?.clock?.currentTime || Cesium.JulianDate.now())
    : entity.position;
  if (!position) return null;

  const cartographic = Cesium.Cartographic.fromCartesian(position);
  if (!cartographic) return null;
  return normalizeCoords(
    Cesium.Math.toDegrees(cartographic.latitude),
    Cesium.Math.toDegrees(cartographic.longitude)
  );
}

function resolveEmergencyPulseCoords(idPersonal, sourceData = {}) {
  const id = String(idPersonal || "").trim();
  const key = id ? `P:${id}` : "";
  const sourceCoords = getCoords(sourceData) || parseEmergencyCoords(sourceData?.contenido);
  if (sourceCoords) return sourceCoords;

  const history = key ? dashboardState.trackingHistory?.get(key) : null;
  const historyCoords = history ? normalizeCoords(history.lat, history.lng) : null;
  if (historyCoords) return historyCoords;

  const entity = key ? dashboardState.trackingEntities?.get(key) : null;
  return coordsFromEntity(entity);
}

function removeEmergencyPulse(key) {
  const group = emergencyPulseEntities.get(key);
  if (!group) return;
  if (group.timeoutId) window.clearTimeout(group.timeoutId);
  group.entities.forEach(entity => {
    if (entity) dashboardState.viewer?.entities.remove(entity);
  });
  emergencyPulseEntities.delete(key);
}

export function pulseEmergencyAtPersonal(idPersonal, sourceData = {}) {
  const viewer = dashboardState.viewer;
  const id = String(idPersonal || "").trim();
  if (!viewer || !id) return false;

  const coords = resolveEmergencyPulseCoords(id, sourceData);
  if (!coords) return false;

  const key = `P:${id}`;
  removeEmergencyPulse(key);

  const position = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat);
  const startedAt = Date.now();
  const durationMs = 4200;
  const delayStepMs = 430;
  const entities = [];

  EMERGENCY_PULSE_COLORS.forEach((color, index) => {
    const delayMs = index * delayStepMs;
    entities.push(viewer.entities.add({
      name: `Alerta urgente personal ${id}`,
      position,
      ellipse: {
        semiMajorAxis: new Cesium.CallbackProperty(() => {
          const progress = Math.max(0, Math.min(1, (Date.now() - startedAt - delayMs) / durationMs));
          return 28 + progress * 420;
        }, false),
        semiMinorAxis: new Cesium.CallbackProperty(() => {
          const progress = Math.max(0, Math.min(1, (Date.now() - startedAt - delayMs) / durationMs));
          return 28 + progress * 420;
        }, false),
        material: new Cesium.ColorMaterialProperty(
          new Cesium.CallbackProperty(() => {
            const progress = Math.max(0, Math.min(1, (Date.now() - startedAt - delayMs) / durationMs));
            const alpha = progress <= 0 ? 0 : Math.max(0, 0.58 * (1 - progress));
            return color.withAlpha(alpha);
          }, false)
        ),
        outline: true,
        outlineColor: color.withAlpha(0.95),
        outlineWidth: 4,
        height: 0,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    }));
  });

  entities.push(viewer.entities.add({
    name: `Destello alerta personal ${id}`,
    position,
    point: {
      pixelSize: new Cesium.CallbackProperty(() => {
        const progress = ((Date.now() - startedAt) % 900) / 900;
        return 16 + Math.sin(progress * Math.PI) * 14;
      }, false),
      color: new Cesium.CallbackProperty(() => {
        const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
        return Cesium.Color.WHITE.withAlpha(Math.max(0, 0.95 * (1 - progress)));
      }, false),
      outlineColor: Cesium.Color.RED.withAlpha(0.95),
      outlineWidth: 4,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  }));

  const timeoutId = window.setTimeout(() => removeEmergencyPulse(key), durationMs + (EMERGENCY_PULSE_COLORS.length * delayStepMs) + 350);
  emergencyPulseEntities.set(key, { entities, timeoutId });
  return true;
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
    tacticalType: "vehiculo"
  });
}

// ── Crear o mover una entidad de tracking ────────────────────
function upsertTrackingEntity(key, lat, lng, label, color, meta = {}) {
  processTrackingUpdate(key, lat, lng, meta.liveData ? { liveData: meta.liveData } : {});

  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const position = Cesium.Cartesian3.fromDegrees(Number(lng), Number(lat));

  if (dashboardState.trackingEntities.has(key)) {
    // Mover y refrescar estilo/etiqueta si ya existe
    const ent = dashboardState.trackingEntities.get(key);
    ent.position = position;
    ent.name = label;
    if (ent.label) {
      ent.label.text = label;
      ent.label.backgroundColor = color.withAlpha(0.7);
    }
    if (ent.point) {
      ent.point.color = color.withAlpha(0.18);
      ent.point.outlineColor = Cesium.Color.BLACK;
    }
    if (ent.properties) {
      ent.properties.trackingRole = meta.trackingRole || ent.properties.trackingRole;
      ent.properties.tacticalType = meta.tacticalType || ent.properties.tacticalType;
    }
    return;
  }

  // Crear nueva entidad
  const ent = viewer.entities.add({
    name: label,
    position,
    point: {
      pixelSize: 10,
      color: color.withAlpha(0.18),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(1e3, 1.0, 2e6, 0.8)
    },
    label: {
      text: label,
      font: "11px sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -18),
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
  const [personal, vehiculos] = await Promise.all([
    fetchTrackingList("/tracking/personal"),
    fetchTrackingList("/tracking/vehiculos")
  ]);

  if (personal.length || vehiculos.length) {
    console.log(`[TRACKING] refresh personal=${personal.length} vehiculos=${vehiculos.length}`);
  }

  personal.forEach(upsertPersonalTracking);
  vehiculos.forEach(upsertVehiculoTracking);
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
}
