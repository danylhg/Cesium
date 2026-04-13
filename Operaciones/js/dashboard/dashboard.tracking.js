// js/dashboard/dashboard.tracking.js

import { dashboardState } from "./dashboard.state.js";

const API_BASE = () => localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
const token    = () => localStorage.getItem("token");
const opId     = () => localStorage.getItem("active_operation_id");

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
  const alias  = item.alias || "";
  if (codigo && alias) return `${codigo} - ${alias}`;
  return codigo || alias || `V-${item.id_vehiculo}`;
}

function getCoords(item) {
  const lat = item?.latitud ?? item?.lat;
  const lng = item?.longitud ?? item?.lng ?? item?.lon;
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

// ── Crear o mover una entidad de tracking ────────────────────
function upsertTrackingEntity(key, lat, lng, label, color) {
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
    }
  });

  dashboardState.trackingEntities.set(key, ent);
}

// ── Carga desde datos de mapa ya obtenidos (sin fetch extra) ─
export function loadTrackingFromMapaData(mapaData) {
  (mapaData.personal || []).forEach(p => {
    const coords = getCoords(p);
    if (!coords) return;
    upsertTrackingEntity(`P:${p.id_personal}`, coords.lat, coords.lng, makePersonalLabel(p), COLOR_PERSONAL);
  });
  (mapaData.vehiculos || []).forEach(v => {
    const coords = getCoords(v);
    if (!coords) return;
    upsertTrackingEntity(`V:${v.id_vehiculo}`, coords.lat, coords.lng, makeVehiculoLabel(v), COLOR_VEHICULO);
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
      const key   = `P:${p.id_personal}`;
      const label = makePersonalLabel(p);
      upsertTrackingEntity(key, coords.lat, coords.lng, label, COLOR_PERSONAL);
    });

    // Vehículos con posición conocida
    (data.vehiculos || []).forEach(v => {
      const coords = getCoords(v);
      if (!coords) return;
      const key   = `V:${v.id_vehiculo}`;
      const label = makeVehiculoLabel(v);
      upsertTrackingEntity(key, coords.lat, coords.lng, label, COLOR_VEHICULO);
    });

  } catch (err) {
    console.error("[TRACKING] Error cargando posiciones iniciales:", err);
  }
}

// ── Socket en tiempo real ────────────────────────────────────
export function initTrackingSocket(socket) {
  socket.on("tracking_personal", (data) => {
    const { id_personal, latitud, longitud } = data ?? {};
    if (!id_personal || latitud == null || longitud == null) return;

    const key   = `P:${id_personal}`;
    const label = makePersonalLabel(data);
    upsertTrackingEntity(key, latitud, longitud, label, COLOR_PERSONAL);
  });

  socket.on("tracking_vehiculo", (data) => {
    const { id_vehiculo, latitud, longitud } = data ?? {};
    if (!id_vehiculo || latitud == null || longitud == null) return;

    const key   = `V:${id_vehiculo}`;
    const label = dashboardState.trackingEntities.get(key)?.name || `V-${id_vehiculo}`;
    upsertTrackingEntity(key, latitud, longitud, label, COLOR_VEHICULO);
  });
}
