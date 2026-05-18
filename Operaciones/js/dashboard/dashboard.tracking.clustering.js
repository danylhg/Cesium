// js/dashboard/dashboard.tracking.clustering.js

import { dashboardState } from "./dashboard.state.js";

const CLUSTER_DISTANCE_METERS = 30; // Distancia para considerar "adentro" o "viajando en"

/**
 * Recibe una actualización de ubicación y actualiza su historial local.
 * Luego reevalua a qué vehículo pertenece el personal.
 */
export function processTrackingUpdate(key, lat, lng, extra = {}) {
  const now = Date.now();
  const historyMap = dashboardState.trackingHistory;

  // Actualizar historial básico de este punto
  historyMap.set(key, {
    ...(historyMap.get(key) || {}),
    ...extra,
    lat,
    lng,
    time: now
  });

  // Si actualizamos a un vehículo, o un personal, reevaluamos clusters:
  // Es más fácil reevaluar todo el personal activo contra todos los vehículos activos
  reevaluateClusters();
}

/**
 * Revisa todo el personal y lo asigna al vehículo más cercano si está a menos
 * de CLUSTER_DISTANCE_METERS.
 */
function reevaluateClusters() {
  const historyMap = dashboardState.trackingHistory;
  const clusters = dashboardState.trackingClusters;

  // Limpiar clusters actuales
  clusters.clear();

  const vehicles = [];
  const persons = [];

  for (const [k, v] of historyMap.entries()) {
    if (k.startsWith("V:")) vehicles.push({ id: k, ...v });
    if (k.startsWith("P:")) persons.push({ id: k, ...v });
  }

  // Pre-calcular Cartesian3 para vehículos para no recalcularlo en el loop interior
  vehicles.forEach(v => {
    v.cartesian = Cesium.Cartesian3.fromDegrees(v.lng, v.lat);
  });

  // Para cada persona, buscar el vehículo más cercano
  persons.forEach(p => {
    const pCartesian = Cesium.Cartesian3.fromDegrees(p.lng, p.lat);
    let minDistance = Infinity;
    let closestVehicleId = null;

    vehicles.forEach(v => {
      const distance = Cesium.Cartesian3.distance(pCartesian, v.cartesian);
      if (distance < minDistance) {
        minDistance = distance;
        closestVehicleId = v.id;
      }
    });

    if (closestVehicleId && minDistance <= CLUSTER_DISTANCE_METERS) {
      if (!clusters.has(closestVehicleId)) {
        clusters.set(closestVehicleId, new Set());
      }
      clusters.get(closestVehicleId).add(p.id);
    }
  });
}

/**
 * Obtener todos los ocupantes (IDs "P:xxx") dentro de un vehículo.
 */
export function getVehicleOccupants(vehicleKey) {
  const clusters = dashboardState.trackingClusters;
  if (clusters.has(vehicleKey)) {
    return Array.from(clusters.get(vehicleKey));
  }
  return [];
}
