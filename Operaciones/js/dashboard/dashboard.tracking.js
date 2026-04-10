// js/dashboard/dashboard.tracking.js

import { dashboardState } from "./dashboard.state.js";

const API_BASE = () => localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
const token    = () => localStorage.getItem("token");
const opId     = () => localStorage.getItem("active_operation_id");

// ── Iconos / colores ─────────────────────────────────────────
const COLOR_PERSONAL = Cesium.Color.fromCssColorString("#00BFFF");
const COLOR_VEHICULO = Cesium.Color.fromCssColorString("#FFD700");

function makePersonalLabel(item) {
  return item.apodo || item.nombre || `P-${item.id_personal}`;
}

function makeVehiculoLabel(item) {
  return item.alias || item.codigo_interno || `V-${item.id_vehiculo}`;
}

// ── Crear o mover una entidad de tracking ────────────────────
function upsertTrackingEntity(key, lat, lng, label, color) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const position = Cesium.Cartesian3.fromDegrees(Number(lng), Number(lat));

  if (dashboardState.trackingEntities.has(key)) {
    // Solo mover
    const ent = dashboardState.trackingEntities.get(key);
    ent.position = position;
    return;
  }

  // Crear nueva entidad
  const ent = viewer.entities.add({
    name: label,
    position,
    point: {
      pixelSize: 12,
      color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    },
    label: {
      text: label,
      font: "13px sans-serif",
      pixelOffset: new Cesium.Cartesian2(0, -22),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      showBackground: true,
      backgroundColor: color.withAlpha(0.7),
      backgroundPadding: new Cesium.Cartesian2(6, 3)
    }
  });

  dashboardState.trackingEntities.set(key, ent);
}

// ── Carga desde datos de mapa ya obtenidos (sin fetch extra) ─
export function loadTrackingFromMapaData(mapaData) {
  (mapaData.personal || []).forEach(p => {
    if (p.latitud == null || p.longitud == null) return;
    upsertTrackingEntity(`P:${p.id_personal}`, p.latitud, p.longitud, makePersonalLabel(p), COLOR_PERSONAL);
  });
  (mapaData.vehiculos || []).forEach(v => {
    if (v.latitud == null || v.longitud == null) return;
    upsertTrackingEntity(`V:${v.id_vehiculo}`, v.latitud, v.longitud, makeVehiculoLabel(v), COLOR_VEHICULO);
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
      if (p.latitud == null || p.longitud == null) return;
      const key   = `P:${p.id_personal}`;
      const label = makePersonalLabel(p);
      upsertTrackingEntity(key, p.latitud, p.longitud, label, COLOR_PERSONAL);
    });

    // Vehículos con posición conocida
    (data.vehiculos || []).forEach(v => {
      if (v.latitud == null || v.longitud == null) return;
      const key   = `V:${v.id_vehiculo}`;
      const label = makeVehiculoLabel(v);
      upsertTrackingEntity(key, v.latitud, v.longitud, label, COLOR_VEHICULO);
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
    // Intenta obtener el label del viewer si ya existe, o usa el id
    const label = dashboardState.trackingEntities.get(key)?.name || `P-${id_personal}`;
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
