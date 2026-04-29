// js/dashboard/dashboard.tracking.js

import { dashboardState } from "./dashboard.state.js";
import { processTrackingUpdate } from "./dashboard.tracking.clustering.js";
import { activatePersonalLocation } from "./dashboard.ui.js";

const API_BASE = () => localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
const token = () => localStorage.getItem("token");
const opId = () => localStorage.getItem("active_operation_id");

// ── Iconos / colores ─────────────────────────────────────────
const COLOR_PERSONAL = Cesium.Color.fromCssColorString("#00BFFF");
const COLOR_VEHICULO = Cesium.Color.fromCssColorString("#FFD700");

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

function getCoords(item) {
  const lat = item?.latitud ?? item?.lat;
  const lng = item?.longitud ?? item?.lng ?? item?.lon;
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function upsertPersonalTracking(item) {
  const coords = getCoords(item);
  if (!coords || item?.id_personal == null) return;

  upsertTrackingEntity(`P:${item.id_personal}`, coords.lat, coords.lng, makePersonalLabel(item), COLOR_PERSONAL, {
    tacticalType: "personal",
    trackingRole: item.rol_en_operacion || item.rol || ""
  });
  activatePersonalLocation(item.id_personal, coords.lat, coords.lng);
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
  processTrackingUpdate(key, lat, lng);

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

  socket.on("tracking_vehiculo", (data) => {
    upsertVehiculoTracking(data);
  });
}
