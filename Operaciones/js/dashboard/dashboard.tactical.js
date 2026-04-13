// js/dashboard/dashboard.tactical.js

import { dashboardState } from "./dashboard.state.js";
import { dom } from "./dashboard.dom.js";
import { setRouteInfo, updateSelectionInfo } from "./dashboard.ui.js";
import { getCurrentOperation } from "./dashboard.storage.js";
import { clearPlanningArea, finishPlanningAreaByPoints } from "./dashboard.area.js";
import { cartesianToLatLng, saveTacticalData } from "./dashboard.persistence.js";
const SCALE_BY_DIST = new Cesium.NearFarScalar(1e3, 1.0, 2e6, 0.04);

// Escala los íconos/etiquetas proporcionalmente a la distancia de la cámara:
// cerca (1 km) → escala normal; lejos (2 000 km) → escala mínima visible.
const COLOR_HEX_MAP = {
  red:    '#FF4500',
  blue:   '#00BFFF',
  black:  '#222222',
  yellow: '#FFD700',
  green:  '#00FF88',
  orange: '#FF8C00',
  white:  '#FFFFFF'
};

export function getCesiumColor(name, alpha = 1) {
  const map = {
    red: Cesium.Color.RED,
    blue: Cesium.Color.CYAN,
    black: Cesium.Color.BLACK,
    yellow: Cesium.Color.YELLOW,
    green: Cesium.Color.LIME,
    orange: Cesium.Color.ORANGE,
    white: Cesium.Color.WHITE
  };

  const base = map[name] || Cesium.Color.WHITE;
  return base.withAlpha(alpha);
}

// IDs de POIs que acabo de enviar yo (evita redibujar lo que ya dibujé localmente)
const _mySentPoiIds = new Set();

function getAreaCreatorPayload() {
  const userData = JSON.parse(localStorage.getItem("userData") || "{}");
  const tabla = userData.tabla || "usuario";
  const idKey = tabla === "personal" ? "id_personal" : "id_usuario";
  const idVal = tabla === "personal" ? userData.id_personal : userData.id_usuario;

  return {
    tipo_creador: tabla === "personal" ? "PERSONAL" : "USUARIO",
    [idKey]: idVal
  };
}

function circleToPolygonCoordinates(lat, lng, radiusMeters, segments = 48) {
  const earthRadius = 6378137;
  const latRad = Cesium.Math.toRadians(lat);
  const lonRad = Cesium.Math.toRadians(lng);
  const angularDistance = radiusMeters / earthRadius;
  const coords = [];

  for (let i = 0; i <= segments; i += 1) {
    const bearing = (2 * Math.PI * i) / segments;
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinAd = Math.sin(angularDistance);
    const cosAd = Math.cos(angularDistance);

    const pointLat = Math.asin(
      sinLat * cosAd + cosLat * sinAd * Math.cos(bearing)
    );
    const pointLon = lonRad + Math.atan2(
      Math.sin(bearing) * sinAd * cosLat,
      cosAd - sinLat * Math.sin(pointLat)
    );

    coords.push([
      Cesium.Math.toDegrees(pointLon),
      Cesium.Math.toDegrees(pointLat)
    ]);
  }

  return [coords];
}

function pointsToPolygonCoordinates(points) {
  if (!Array.isArray(points) || points.length < 3) return null;

  const ring = points.map(point => [point.lng, point.lat]);
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];

  if (firstLng !== lastLng || firstLat !== lastLat) {
    ring.push([firstLng, firstLat]);
  }

  return [ring];
}

function getPolygonLabelPosition(points) {
  if (!Array.isArray(points) || points.length === 0) return null;

  const totals = points.reduce(
    (acc, point) => ({
      lat: acc.lat + Number(point.lat || 0),
      lng: acc.lng + Number(point.lng || 0)
    }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: totals.lat / points.length,
    lng: totals.lng / points.length
  };
}

function getOperationZonePoints(zona) {
  const ring = zona?.geometria?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;

  const points = ring
    .map(([lng, lat]) => ({ lng: Number(lng), lat: Number(lat) }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  if (points.length < 4) return null;

  const first = points[0];
  const last = points[points.length - 1];
  if (first.lat === last.lat && first.lng === last.lng) {
    points.pop();
  }

  return points.length >= 3 ? points : null;
}

function clearOperationZoneEntities() {
  const viewer = dashboardState.viewer;
  if (viewer && dashboardState.operationZoneBorder) {
    viewer.entities.remove(dashboardState.operationZoneBorder);
  }

  if (dashboardState.selectedEntity === dashboardState.operationZoneBorder) {
    dashboardState.selectedEntity = null;
    updateSelectionInfo(null);
  }

  dashboardState.operationZoneBorder = null;
  dashboardState.currentOperationZone = null;
}

function focusViewerOnOperationZone(zona) {
  const viewer = dashboardState.viewer;
  if (!viewer || !zona) return;

  const lat = Number(zona.centroide_lat);
  const lng = Number(zona.centroide_lon);
  const zoom = Number(zona.zoom_inicial || 1000) || 1000;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lng, lat, zoom)
  });
}

function buildOperationZoneEntity(zona) {
  const viewer = dashboardState.viewer;
  if (!viewer || !zona?.id_zona) return null;

  const points = getOperationZonePoints(zona);
  if (!points) return null;

  clearOperationZoneEntities();

  const closedPoints = [...points, points[0]];
  const color = Cesium.Color.fromCssColorString(zona.color || "#3b82f6");
  const entity = viewer.entities.add({
    id: `zona_${zona.id_zona}`,
    name: zona.nombre || "Zona de operación",
    polyline: {
      positions: toCartesianArray(closedPoints),
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({
        color,
        dashLength: 16
      }),
      clampToGround: true
    },
    properties: {
      tacticalType: "operation-zone",
      id_zona: zona.id_zona,
      draggable: false
    }
  });

  dashboardState.operationZoneBorder = entity;
  dashboardState.currentOperationZone = zona;
  return entity;
}

function buildMilUniqueName(baseName) {
  const normalizedBase = String(baseName || "Simbolo MIL").trim() || "Simbolo MIL";
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
    String(now.getMilliseconds()).padStart(3, "0")
  ].join("");
  return `${normalizedBase} ${stamp}`;
}

function getPoiDisplayLabel(poi) {
  const rawLabel = String(poi.nombre || poi.name || "PDI");
  const tipoPoi = String(poi.tipo_poi || poi.tipoPoi || "").toUpperCase();
  if (tipoPoi === "MIL") {
    return rawLabel.replace(/\s\d{17}$/, "");
  }
  return rawLabel;
}

function resolvePoiImage(iconSrc) {
  if (!iconSrc) return null;
  if (/^(https?:)?\/\//i.test(iconSrc) || iconSrc.startsWith("data:")) return iconSrc;
  const apiBase = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  return `${apiBase.replace(/\/$/, "")}/${iconSrc.replace(/^\.?\//, "")}`;
}

function buildPoiEntity(poi, tacticalType = "poi") {
  const viewer = dashboardState.viewer;
  if (!viewer) return null;

  const lat = Number(poi.latitud ?? poi.lat);
  const lng = Number(poi.longitud ?? poi.lon ?? poi.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const iconSrc = resolvePoiImage(poi.icono_src || poi.iconSrc || poi.image);
  const isMil = (poi.tipo_poi || poi.tipoPoi || "").toUpperCase() === "MIL" && !!iconSrc;
  const hexColor = poi.color || "#FFD700";
  const cesiumColor = Cesium.Color.fromCssColorString(hexColor);
  const label = getPoiDisplayLabel(poi);
  const entityId = poi.id_poi ? `poi_${poi.id_poi}` : undefined;

  if (entityId && viewer.entities.getById(entityId)) {
    return null;
  }

  return viewer.entities.add({
    id: entityId,
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    billboard: iconSrc ? {
      image: iconSrc,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scale: Number(poi.scale || (isMil ? 0.08 : 0.08))
    } : undefined,
    point: !iconSrc ? {
      pixelSize: 10,
      color: cesiumColor,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    } : undefined,
    label: {
      text: label,
      font: "14px sans-serif",
      pixelOffset: iconSrc ? new Cesium.Cartesian2(0, 15) : new Cesium.Cartesian2(0, -20),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      showBackground: !iconSrc,
      backgroundColor: !iconSrc ? cesiumColor.withAlpha(0.7) : undefined,
      backgroundPadding: !iconSrc ? new Cesium.Cartesian2(6, 4) : undefined
    },
    properties: {
      tacticalType: isMil ? "mil-dropped" : tacticalType,
      draggable: true,
      id_poi: poi.id_poi ?? null
    }
  });
}

async function savePoiToBackend(lat, lng, nombre, tipoPoi, colorName, iconoSrc = null) {
  try {
    const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
    const token    = localStorage.getItem("token");
    const opId     = localStorage.getItem("active_operation_id");
    if (!token || !opId) return;

    const userData = JSON.parse(localStorage.getItem("userData") || "{}");
    const tabla    = userData.tabla || "usuario";
    const idKey    = tabla === "personal" ? "id_personal" : "id_usuario";
    const idVal    = tabla === "personal" ? userData.id_personal : userData.id_usuario;

    const body = {
      nombre,
      tipo_poi:      tipoPoi,
      latitud:       lat,
      longitud:      lng,
      color:         COLOR_HEX_MAP[colorName] || '#FFD700',
      icono_src:     iconoSrc,
      tipo_creador:  tabla === "personal" ? "PERSONAL" : "USUARIO",
      [idKey]:       idVal
    };

    const res  = await fetch(`${API_BASE}/ops/${opId}/pois`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data?.ok) {
      const mensaje = data?.mensaje || "No se pudo guardar el punto de interés.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return null;
    }
    if (data?.ok && data?.poi?.id_poi) {
      // Marcar como "mío" para no redibujar cuando llegue el socket event
      _mySentPoiIds.add(data.poi.id_poi);
      setTimeout(() => _mySentPoiIds.delete(data.poi.id_poi), 5000);
      return data.poi;
    }
    return null;
  } catch (err) {
    console.error("Error guardando POI en backend:", err);
    if (dom.tbHint) {
      dom.tbHint.textContent = "Error de conexión al guardar el punto de interés.";
    }
    alert("Error de conexión al guardar el punto de interés.");
    return null;
  }
}

async function saveStructureToBackend(lat, lng, nombre, tipoEstructura) {
  try {
    const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
    const token = localStorage.getItem("token");
    const opId = localStorage.getItem("active_operation_id");
    if (!token || !opId) return null;

    const body = {
      nombre,
      tipo_estructura: tipoEstructura,
      latitud: lat,
      longitud: lng,
      ...getAreaCreatorPayload()
    };

    const res = await fetch(`${API_BASE}/ops/${opId}/edificios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok || !data?.ok) {
      const mensaje = data?.mensaje || "No se pudo guardar la estructura.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return null;
    }

    return data.edificio || null;
  } catch (err) {
    console.error("Error guardando estructura en backend:", err);
    if (dom.tbHint) dom.tbHint.textContent = "Error de conexion al guardar la estructura.";
    alert("Error de conexion al guardar la estructura.");
    return null;
  }
}

function buildAreaEntity(area) {
  const viewer = dashboardState.viewer;
  if (!viewer) return null;

  const geometry = area?.geometria;
  const meta = geometry?.meta || {};
  if (geometry?.type !== "Polygon") return null;

  const opacity = Number(meta.opacity ?? 0.35);
  const lineWidth = Number(meta.outline_width ?? 3);

  const colorHex = area.color || "#FF4500";
  const outline = Cesium.Color.fromCssColorString(colorHex);
  const entityId = area.id_area ? `area_${area.id_area}` : undefined;

  if (entityId && viewer.entities.getById(entityId)) return null;

  if (meta?.shape === "circle") {
    const center = Array.isArray(meta.center) ? meta.center : null;
    const radius = Number(meta.radius_m);

    if (!center || center.length < 2 || !Number.isFinite(radius) || radius <= 0) {
      return null;
    }

    const [lng, lat] = center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return viewer.entities.add({
      id: entityId,
      name: area.nombre || "CÃ­rculo de cobertura",
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      ellipse: {
        semiMajorAxis: radius,
        semiMinorAxis: radius,
        material: outline.withAlpha(opacity),
        outline: true,
        outlineColor: outline,
        outlineWidth: lineWidth,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      },
      label: area.nombre ? {
        text: area.nombre,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      } : undefined,
      properties: {
        tacticalType: "circle",
        draggable: true,
        id_area: area.id_area ?? null
      }
    });
  }

  if (meta?.shape !== "polygon") return null;

  const coordinates = Array.isArray(geometry?.coordinates?.[0]) ? geometry.coordinates[0] : null;
  if (!coordinates || coordinates.length < 4) return null;

  const ringPoints = coordinates
    .map(coord => ({
      lng: Number(coord?.[0]),
      lat: Number(coord?.[1])
    }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .slice(0, -1);

  if (ringPoints.length < 3) return null;

  const labelPosition = getPolygonLabelPosition(ringPoints);

  return viewer.entities.add({
    id: entityId,
    name: area.nombre || "PolÃ­gono / Zona",
    position: labelPosition
      ? Cesium.Cartesian3.fromDegrees(labelPosition.lng, labelPosition.lat)
      : undefined,
    polygon: {
      hierarchy: toCartesianArray(ringPoints),
      material: outline.withAlpha(opacity),
      outline: true,
      outlineColor: outline,
      outlineWidth: lineWidth,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      perPositionHeight: false
    },
    label: area.nombre && labelPosition ? {
      text: area.nombre,
      font: "14px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    } : undefined,
    properties: {
      tacticalType: "polygon",
      draggable: false,
      id_area: area.id_area ?? null
    }
  });

  return viewer.entities.add({
    id: entityId,
    name: area.nombre || "Círculo de cobertura",
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    ellipse: {
      semiMajorAxis: radius,
      semiMinorAxis: radius,
      material: fill,
      outline: true,
      outlineColor: outline,
      outlineWidth: lineWidth,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    },
    label: area.nombre ? {
      text: area.nombre,
      font: "14px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    } : undefined,
    properties: {
      tacticalType: "circle",
      draggable: true,
      id_area: area.id_area ?? null
    }
  });
}

function buildStructureEntity(estructura) {
  const viewer = dashboardState.viewer;
  if (!viewer) return null;

  const lat = Number(estructura.latitud ?? estructura.lat);
  const lng = Number(estructura.longitud ?? estructura.lon ?? estructura.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const type = String(estructura.tipo_estructura || "").toUpperCase();
  const isLabel = type === "ETIQUETA";
  const entityId = estructura.id_marca ? `estructura_${estructura.id_marca}` : undefined;

  if (entityId && viewer.entities.getById(entityId)) {
    return null;
  }

  const name = String(estructura.nombre || (isLabel ? "Etiqueta" : "Edificio"));

  return viewer.entities.add({
    id: entityId,
    name,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    billboard: !isLabel ? {
      image: resolvePoiImage("img/estructuras/casa.png"),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scale: 0.05,
      scaleByDistance: SCALE_BY_DIST
    } : undefined,
    label: {
      text: name,
      font: "12px sans-serif",
      pixelOffset: isLabel ? new Cesium.Cartesian2(0, -18) : new Cesium.Cartesian2(0, 8),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: SCALE_BY_DIST,
      showBackground: isLabel,
      backgroundColor: isLabel ? Cesium.Color.BLACK.withAlpha(0.7) : undefined,
      backgroundPadding: isLabel ? new Cesium.Cartesian2(6, 4) : undefined
    },
    properties: {
      tacticalType: isLabel ? "label" : "building",
      draggable: true,
      id_marca: estructura.id_marca ?? null,
      tipo_estructura: type || null
    }
  });
}

async function saveCircleAreaToBackend(lat, lng, radius, nombre, colorName) {
  try {
    const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
    const token = localStorage.getItem("token");
    const opId = localStorage.getItem("active_operation_id");
    if (!token || !opId) return null;

    const body = {
      nombre: nombre || "Círculo de cobertura",
      descripcion: "Circulo de cobertura",
      color: COLOR_HEX_MAP[colorName] || "#FF4500",
      geometria: {
        type: "Polygon",
        coordinates: circleToPolygonCoordinates(lat, lng, radius),
        meta: {
          shape: "circle",
          center: [lng, lat],
          radius_m: radius,
          opacity: getOpacity(),
          outline_width: getLineWidth()
        }
      },
      ...getAreaCreatorPayload()
    };

    const res = await fetch(`${API_BASE}/ops/${opId}/areas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok || !data?.ok) {
      const mensaje = data?.mensaje || "No se pudo guardar el círculo de cobertura.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return null;
    }

    return data.area || null;
  } catch (err) {
    console.error("Error guardando área en backend:", err);
    if (dom.tbHint) {
      dom.tbHint.textContent = "Error de conexión al guardar el círculo de cobertura.";
    }
    alert("Error de conexión al guardar el círculo de cobertura.");
    return null;
  }
}

async function savePolygonAreaToBackend(points, nombre, colorName) {
  const coordinates = pointsToPolygonCoordinates(points);
  if (!coordinates) return null;

  try {
    const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
    const token = localStorage.getItem("token");
    const opId = localStorage.getItem("active_operation_id");
    if (!token || !opId) return null;

    const body = {
      nombre: nombre || "PolÃ­gono / Zona",
      descripcion: "Poligono o zona",
      color: COLOR_HEX_MAP[colorName] || "#FFD700",
      geometria: {
        type: "Polygon",
        coordinates,
        meta: {
          shape: "polygon",
          opacity: getOpacity(),
          outline_width: getLineWidth()
        }
      },
      ...getAreaCreatorPayload()
    };

    const res = await fetch(`${API_BASE}/ops/${opId}/areas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok || !data?.ok) {
      const mensaje = data?.mensaje || "No se pudo guardar el polÃ­gono.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return null;
    }

    return data.area || null;
  } catch (err) {
    console.error("Error guardando Ã¡rea poligonal en backend:", err);
    if (dom.tbHint) {
      dom.tbHint.textContent = "Error de conexiÃ³n al guardar el polÃ­gono.";
    }
    alert("Error de conexiÃ³n al guardar el polÃ­gono.");
    return null;
  }
}

async function saveOperationZoneToBackend(points, nombre, colorName) {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token = localStorage.getItem("token");
  const opId = localStorage.getItem("active_operation_id");
  if (!token || !opId) return null;

  const coordinates = pointsToPolygonCoordinates(points);
  if (!coordinates) {
    if (dom.tbHint) dom.tbHint.textContent = "La zona requiere al menos 3 puntos.";
    return null;
  }

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/zona`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        nombre: nombre || "Zona de operación",
        geometria: {
          type: "Polygon",
          coordinates
        },
        color: COLOR_HEX_MAP[colorName] || COLOR_HEX_MAP.blue
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const mensaje = data?.mensaje || "No se pudo guardar la zona de operación.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return null;
    }

    return data.zona || null;
  } catch (err) {
    console.error("[ZONA] Error guardando zona de operación:", err);
    if (dom.tbHint) dom.tbHint.textContent = "Error de conexión al guardar la zona de operación.";
    alert("Error de conexión al guardar la zona de operación.");
    return null;
  }
}

async function deleteOperationZoneFromBackend() {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token = localStorage.getItem("token");
  const opId = localStorage.getItem("active_operation_id");
  if (!token || !opId) return false;

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/zona`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const mensaje = data?.mensaje || "No se pudo eliminar la zona de operación.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[ZONA] Error eliminando zona de operación:", err);
    if (dom.tbHint) dom.tbHint.textContent = "Error de conexión al eliminar la zona de operación.";
    alert("Error de conexión al eliminar la zona de operación.");
    return false;
  }
}

export function getLineWidth() {
  return Number(dom.widthRange?.value || 3);
}

export function getOpacity() {
  return Number(dom.opacityRange?.value || 0.35);
}

export function getRadius() {
  return Number(dom.radiusInput?.value || 5000);
}

export function getCurrentLabel() {
  return (dom.symLabel?.value || "").trim();
}

export function getCurrentColorName() {
  return dom.colorSelect?.value || "red";
}

export function toCartesianArray(points) {
  return points.map(p => Cesium.Cartesian3.fromDegrees(p.lng, p.lat));
}

export function addTacticalEntity(entity) {
  dashboardState.tacticalEntities.push(entity);
  saveTacticalData();
  return entity;
}

export function resetDrawingState() {
  dashboardState.placingMode = false;
  dashboardState.drawingPoints = [];

  const viewer = dashboardState.viewer;
  if (viewer) {
    dashboardState.drawingVertexEntities.forEach(ent => viewer.entities.remove(ent));

    if (dashboardState.tacticalPreviewLine) {
      viewer.entities.remove(dashboardState.tacticalPreviewLine);
    }

    if (dashboardState.tacticalPreviewFill) {
      viewer.entities.remove(dashboardState.tacticalPreviewFill);
    }
  }

  dashboardState.drawingVertexEntities = [];
  dashboardState.tacticalPreviewLine = null;
  dashboardState.tacticalPreviewFill = null;
}

export function updateTacticalPreview(currentLat, currentLng) {
  const viewer = dashboardState.viewer;
  if (!viewer || dashboardState.drawingPoints.length === 0 || !dashboardState.placingMode) return;

  const validModes = ["polygon", "polyline", "perimeter"];
  if (!validModes.includes(dashboardState.toolMode)) return;

  const previewPoints = [
    ...dashboardState.drawingPoints,
    { lat: currentLat, lng: currentLng }
  ];

  if (dashboardState.toolMode === "polygon" || dashboardState.toolMode === "perimeter") {
    previewPoints.push(dashboardState.drawingPoints[0]);
  }

  if (dashboardState.tacticalPreviewLine) {
    viewer.entities.remove(dashboardState.tacticalPreviewLine);
  }

  if (dashboardState.tacticalPreviewFill) {
    viewer.entities.remove(dashboardState.tacticalPreviewFill);
  }

  const dashColor =
    dashboardState.toolMode === "perimeter"
      ? Cesium.Color.RED
      : Cesium.Color.YELLOW;

  dashboardState.tacticalPreviewLine = viewer.entities.add({
    polyline: {
      positions: toCartesianArray(previewPoints),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: dashColor,
        dashLength: 12
      }),
      clampToGround: true
    }
  });

  if (dashboardState.toolMode === "polygon" && dashboardState.drawingPoints.length >= 2) {
    const polyPoints = [
      ...dashboardState.drawingPoints,
      { lat: currentLat, lng: currentLng }
    ];

    dashboardState.tacticalPreviewFill = viewer.entities.add({
      polygon: {
        hierarchy: toCartesianArray(polyPoints),
        material: Cesium.Color.WHITE.withAlpha(0.15),
        perPositionHeight: false
      }
    });
  } else {
    dashboardState.tacticalPreviewFill = null;
  }
}

function syncTacticalToolAvailability(currentOperation = getCurrentOperation()) {
  const phase = String(currentOperation?.phase || currentOperation?.estado || "").toLowerCase();
  const isActiveOperation = phase === "activa";
  const panelTitle = document.getElementById("tacticalPanelTitle") || document.querySelector("#tacticalPanel .panelTitle");
  const toolGroupTitle = document.getElementById("tacticalToolGroupTitle") || document.querySelector("#tacticalPanel .groupTitle");
  const perimeterOption = dom.toolSelect?.querySelector('option[value="perimeter"]');
  const operationZoneGroup = perimeterOption?.parentElement?.tagName === "OPTGROUP" ? perimeterOption.parentElement : null;

  if (panelTitle) panelTitle.textContent = "Objetos tácticos";
  if (toolGroupTitle) toolGroupTitle.textContent = "Selección de tipo de objeto";

  if (perimeterOption) {
    perimeterOption.hidden = isActiveOperation;
    perimeterOption.disabled = isActiveOperation;
  }

  if (operationZoneGroup) {
    operationZoneGroup.disabled = isActiveOperation;
    operationZoneGroup.style.display = isActiveOperation ? "none" : "";
  }

  if (isActiveOperation && dashboardState.toolMode === "perimeter") {
    dashboardState.toolMode = "none";
    dashboardState.placingMode = false;
    dashboardState.drawingPoints = [];
    if (dom.toolSelect) dom.toolSelect.value = "none";
    resetDrawingState();
  }

  return { isActiveOperation };
}

export function setTacticalUI() {
  const currentOperation = getCurrentOperation();
  const { isActiveOperation } = syncTacticalToolAvailability(currentOperation);
  const isMil = dashboardState.toolMode === "mil";
  const isPoi = dashboardState.toolMode === "poi";
  const usesPlaceOnly = ["poi", "mil", "circle", "label", "building"].includes(dashboardState.toolMode);
  const isPlanningOperation = !isActiveOperation && String(currentOperation?.phase || currentOperation?.estado || "").toLowerCase() === "planificada";
  const needsLabel = ["mil", "poi", "label", "circle", "polygon", "polyline", "perimeter", "building"].includes(dashboardState.toolMode);
  const needsRadius = dashboardState.toolMode === "circle";
  const isMultiPoint = ["polygon", "polyline", "perimeter"].includes(dashboardState.toolMode);
  const showCancelButton = !isMil && !["poi", "circle", "label", "building"].includes(dashboardState.toolMode);
  const showFinishButton = isMultiPoint || dashboardState.areaDrawing;
  const showLabelInput = needsLabel && !isMil;
  const showColorInput = !isMil;
  const showOpacityInput = !isMil && !isPoi;
  const showWidthInput = !isMil && !isPoi;

  const milTitle = document.getElementById("milSymbolTitle");
  if (milTitle) milTitle.style.display = isMil ? "block" : "none";

  if (dom.iconPallet) dom.iconPallet.style.display = isMil ? "flex" : "none";
  if (dom.iconSettings) dom.iconSettings.style.display = "none";

  if (dom.symLabelContainer) dom.symLabelContainer.style.display = showLabelInput ? "block" : "none";
  if (dom.colorContainer) dom.colorContainer.style.display = showColorInput ? "block" : "none";
  if (dom.opacityContainer) dom.opacityContainer.style.display = showOpacityInput ? "block" : "none";
  if (dom.widthContainer) dom.widthContainer.style.display = showWidthInput ? "block" : "none";
  if (dom.tacticalActionButtons) dom.tacticalActionButtons.style.display = isMil ? "none" : "grid";
  if (dom.cancelPlace) dom.cancelPlace.style.display = showCancelButton ? "" : "none";
  if (dom.finishShape) dom.finishShape.style.display = showFinishButton ? "" : "none";
  if (dom.clearTactical) dom.clearTactical.style.display = isPlanningOperation ? "" : "none";

  if (dom.symLabel) dom.symLabel.disabled = !showLabelInput;
  if (dom.radiusInput) dom.radiusInput.disabled = !needsRadius;
  if (dom.radiusContainer) {
    dom.radiusContainer.style.display = needsRadius ? "block" : "none";
  }

  if (dom.placeBtn) {
    dom.placeBtn.disabled = dashboardState.toolMode === "none" || isMil;
    dom.placeBtn.style.display = isMil ? "none" : "";
    dom.placeBtn.textContent = usesPlaceOnly
      ? "Colocar"
      : "Colocar / iniciar";
  }
  if (dom.finishShape) dom.finishShape.disabled = !isMultiPoint && !dashboardState.areaDrawing;

  if (!dom.tbHint) return;

  if (dashboardState.toolMode === "none" && !dashboardState.areaDrawing) {
    dom.tbHint.textContent = "Selecciona una herramienta para comenzar.";
  }
  if (dashboardState.toolMode === "mil") {
    dom.tbHint.textContent = "Herramienta MIL: Arrastra el símbolo que desees desde el panel superior hacia el mapa.";
  }
  if (dashboardState.toolMode === "poi") {
    dom.tbHint.textContent = "Presiona 'Colocar' y haz clic para poner un punto de interes.";
  }
  if (dashboardState.toolMode === "building") {
    dom.tbHint.textContent = "Presiona 'Colocar' y haz clic para poner un edificio.";
  }
  if (dashboardState.toolMode === "label") {
    dom.tbHint.textContent = "Presiona 'Colocar' y haz clic para poner una etiqueta. Se puede mover.";
  }
  if (dashboardState.toolMode === "circle") {
    dom.tbHint.textContent = "Presiona 'Colocar' y haz clic en el centro del circulo. Se puede mover.";
  }
  if (dashboardState.toolMode === "polygon") {
    dom.tbHint.textContent = "Presiona 'Colocar / iniciar', da varios clics y luego 'Terminar figura'.";
  }
  if (dashboardState.toolMode === "polyline") {
    dom.tbHint.textContent = "Presiona 'Colocar / iniciar', da varios clics y luego 'Terminar figura'.";
  }
  if (dashboardState.toolMode === "perimeter") {
    dom.tbHint.textContent = "Presiona 'Colocar / iniciar', marca el perímetro y luego 'Terminar figura'.";
  }
}

export async function createPoi(lat, lng, iconPath = null) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const label = getCurrentLabel() || (dashboardState.toolMode === "building" ? "Edificio" : "Punto de interés");
  const color = getCesiumColor(getCurrentColorName(), 1);

  if (dashboardState.toolMode === "poi") {
    const savedPoi = await savePoiToBackend(lat, lng, label, "PDI", getCurrentColorName());
    if (!savedPoi) return;

    const ent = buildPoiEntity(savedPoi, "poi");
    if (ent) {
      addTacticalEntity(ent);
      if (dom.tbHint) dom.tbHint.textContent = `${label} colocado.`;
    }
    return;
  }

  if (dashboardState.toolMode === "building") {
    const savedStructure = await saveStructureToBackend(lat, lng, label, "EDIFICIO");
    if (!savedStructure) return;

    const ent = buildStructureEntity(savedStructure);
    if (ent) {
      addTacticalEntity(ent);
      if (dom.tbHint) dom.tbHint.textContent = `${label} colocado.`;
    }
    return;
  }

  const ent = viewer.entities.add({
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    billboard: iconPath ? {
      image: iconPath,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scale: 0.08,
      scaleByDistance: SCALE_BY_DIST
    } : undefined,
    point: !iconPath ? {
      pixelSize: 10,
      color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: SCALE_BY_DIST
    } : undefined,
    label: {
      text: label,
      font: "14px sans-serif",
      pixelOffset: iconPath ? new Cesium.Cartesian2(0, 15) : new Cesium.Cartesian2(0, -20),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: SCALE_BY_DIST
    },
    properties: {
      tacticalType: dashboardState.toolMode,
      draggable: true
    }
  });

  addTacticalEntity(ent);
  if (dom.tbHint) dom.tbHint.textContent = `${label} colocado.`;
}

export async function createMilSymbol(lat, lng, nombre, iconPath, scale = 0.08) {
  const uniqueName = buildMilUniqueName(nombre);
  const savedPoi = await savePoiToBackend(lat, lng, uniqueName, "MIL", "red", iconPath);
  if (!savedPoi) return;

  const ent = buildPoiEntity({ ...savedPoi, scale }, "poi");
  if (ent) {
    addTacticalEntity(ent);
    if (dom.tbHint) dom.tbHint.textContent = `${nombre} colocado.`;
  }
}

export async function createLabel(lat, lng) {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  const label = getCurrentLabel() || "Etiqueta";
  const savedStructure = await saveStructureToBackend(lat, lng, label, "ETIQUETA");
  if (!savedStructure) return;

  const ent = buildStructureEntity(savedStructure);
  if (ent) addTacticalEntity(ent);
  if (dom.tbHint) dom.tbHint.textContent = "Etiqueta colocada.";
}

export async function createCircle(lat, lng) {
  const label = getCurrentLabel();
  const colorName = getCurrentColorName();
  const radius = getRadius();
  const savedArea = await saveCircleAreaToBackend(lat, lng, radius, label, colorName);
  if (!savedArea) return;

  const entFromBackend = buildAreaEntity(savedArea);
  if (!entFromBackend) return;

  addTacticalEntity(entFromBackend);
  if (dom.tbHint) dom.tbHint.textContent = "Círculo de cobertura guardado.";
  return;

  const ent = viewer.entities.add({
    name: label || "Círculo táctico",
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    ellipse: {
      semiMajorAxis: radius,
      semiMinorAxis: radius,
      material: fill,
      outline: true,
      outlineColor: outline,
      outlineWidth: getLineWidth(),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    },
    label: label ? {
      text: label,
      font: "14px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    } : undefined,
    properties: {
      tacticalType: "circle",
      draggable: true
    }
  });

  addTacticalEntity(ent);
  if (dom.tbHint) dom.tbHint.textContent = "Círculo táctico colocado.";
}

export async function finishPolygon() {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  if (dashboardState.drawingPoints.length < 3) {
    if (dom.tbHint) dom.tbHint.textContent = "El polígono requiere al menos 3 puntos.";
    return;
  }

  const label = getCurrentLabel();
  const colorName = getCurrentColorName();
  const savedArea = await savePolygonAreaToBackend(dashboardState.drawingPoints, label, colorName);
  if (!savedArea) return;

  const entFromBackend = buildAreaEntity(savedArea);
  if (entFromBackend) addTacticalEntity(entFromBackend);

  resetDrawingState();
  if (dom.tbHint) dom.tbHint.textContent = "PolÃ­gono / zona guardado.";
  setTacticalUI();
  return;

  const ent = viewer.entities.add({
    name: label || "Polígono táctico",
    polygon: {
      hierarchy: positions,
      material: fill,
      outline: true,
      outlineColor: outline,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      perPositionHeight: false
    },
    properties: {
      tacticalType: "polygon",
      draggable: false
    }
  });

  addTacticalEntity(ent);

  if (label) {
    const center = dashboardState.drawingPoints[0];
    const labelEnt = viewer.entities.add({
      name: label,
      position: Cesium.Cartesian3.fromDegrees(center.lng, center.lat),
      label: {
        text: label,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: SCALE_BY_DIST
      },
      properties: {
        tacticalType: "label",
        draggable: true
      }
    });
    addTacticalEntity(labelEnt);
  }

  resetDrawingState();
  if (dom.tbHint) dom.tbHint.textContent = "Polígono táctico completado.";
  setTacticalUI();
}

export function finishPolyline() {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  if (dashboardState.drawingPoints.length < 2) {
    if (dom.tbHint) dom.tbHint.textContent = "La línea requiere al menos 2 puntos.";
    return;
  }

  const positions = toCartesianArray(dashboardState.drawingPoints);
  const color = getCesiumColor(getCurrentColorName(), 1);
  const label = getCurrentLabel();

  const ent = viewer.entities.add({
    name: label || "Línea táctica",
    polyline: {
      positions,
      width: getLineWidth(),
      material: color,
      clampToGround: true
    },
    properties: {
      tacticalType: "polyline",
      draggable: false
    }
  });

  addTacticalEntity(ent);

  if (label) {
    const last = dashboardState.drawingPoints[dashboardState.drawingPoints.length - 1];
    const labelEnt = viewer.entities.add({
      name: label,
      position: Cesium.Cartesian3.fromDegrees(last.lng, last.lat),
      label: {
        text: label,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: SCALE_BY_DIST
      },
      properties: {
        tacticalType: "label",
        draggable: true
      }
    });
    addTacticalEntity(labelEnt);
  }

  resetDrawingState();
  if (dom.tbHint) dom.tbHint.textContent = "Línea táctica completada.";
  setTacticalUI();
}

export function finishPerimeter() {
  const viewer = dashboardState.viewer;
  if (!viewer) return;

  if (dashboardState.drawingPoints.length < 3) {
    if (dom.tbHint) dom.tbHint.textContent = "El perímetro requiere al menos 3 puntos.";
    return;
  }

  const closed = [...dashboardState.drawingPoints, dashboardState.drawingPoints[0]];
  const positions = toCartesianArray(closed);
  const color = getCesiumColor(getCurrentColorName(), 1);
  const label = getCurrentLabel();

  const ent = viewer.entities.add({
    name: label || "Perímetro punteado",
    polyline: {
      positions,
      width: getLineWidth(),
      material: new Cesium.PolylineDashMaterialProperty({
        color,
        dashLength: 16
      }),
      clampToGround: true
    },
    properties: {
      tacticalType: "perimeter",
      draggable: false
    }
  });

  addTacticalEntity(ent);

  if (label) {
    const first = dashboardState.drawingPoints[0];
    const labelEnt = viewer.entities.add({
      name: label,
      position: Cesium.Cartesian3.fromDegrees(first.lng, first.lat),
      label: {
        text: label,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scaleByDistance: SCALE_BY_DIST
      },
      properties: {
        tacticalType: "label",
        draggable: true
      }
    });
    addTacticalEntity(labelEnt);
  }

  resetDrawingState();
  if (dom.tbHint) dom.tbHint.textContent = "Perímetro completado.";
  setTacticalUI();
}

async function finishOperationZonePerimeter() {
  if (dashboardState.drawingPoints.length < 3) {
    if (dom.tbHint) dom.tbHint.textContent = "La zona de operacion requiere al menos 3 puntos.";
    return;
  }

  const label = getCurrentLabel();
  const zona = await saveOperationZoneToBackend(
    dashboardState.drawingPoints,
    label || "Zona de operacion",
    getCurrentColorName()
  );
  if (!zona) return;

  buildOperationZoneEntity(zona);
  focusViewerOnOperationZone(zona);
  resetDrawingState();
  if (dom.tbHint) dom.tbHint.textContent = "Zona de operacion actualizada.";
  setTacticalUI();
}

export function handleTacticalPlacement(lat, lng) {
  const viewer = dashboardState.viewer;
  if (!viewer) return false;

  if (!dashboardState.placingMode || dashboardState.toolMode === "none") return false;
  if (dashboardState.toolMode === "mil") return false;

  if (dashboardState.toolMode === "poi") {
    createPoi(lat, lng);
    dashboardState.placingMode = false;
    setTacticalUI();
    return true;
  }

  if (dashboardState.toolMode === "building") {
    createPoi(lat, lng, "img/estructuras/casa.png");
    dashboardState.placingMode = false;
    setTacticalUI();
    return true;
  }

  if (dashboardState.toolMode === "label") {
    createLabel(lat, lng);
    dashboardState.placingMode = false;
    setTacticalUI();
    return true;
  }

  if (dashboardState.toolMode === "circle") {
    createCircle(lat, lng);
    dashboardState.placingMode = false;
    setTacticalUI();
    return true;
  }

  if (["polygon", "polyline", "perimeter"].includes(dashboardState.toolMode)) {
    dashboardState.drawingPoints.push({ lat, lng });

    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      point: {
        pixelSize: 8,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    });

    dashboardState.drawingVertexEntities.push(ent);

    if (dom.tbHint) {
      dom.tbHint.textContent = `Punto agregado (${dashboardState.drawingPoints.length}). Continúa marcando y luego usa "Terminar figura".`;
    }
    return true;
  }

  return false;
}

export function isDraggableEntity(entity) {
  if (!entity) return false;
  const draggable = entity.properties?.draggable?.getValue?.() ?? entity.properties?.draggable;
  return Boolean(draggable && entity.position);
}

function getEntityCurrentLatLng(entity) {
  const position = entity?.position?.getValue?.(Cesium.JulianDate.now()) ?? entity?.position;
  if (!position) return null;
  return cartesianToLatLng(position);
}

function applyPoiUpdateToEntity(entity, poi) {
  const lat = Number(poi.latitud ?? poi.lat);
  const lng = Number(poi.longitud ?? poi.lon ?? poi.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  entity.position = Cesium.Cartesian3.fromDegrees(lng, lat);
}

function applyStructureUpdateToEntity(entity, estructura) {
  const lat = Number(estructura.latitud ?? estructura.lat);
  const lng = Number(estructura.longitud ?? estructura.lon ?? estructura.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  entity.position = Cesium.Cartesian3.fromDegrees(lng, lat);
}

function applyAreaUpdateToEntity(entity, area) {
  const geometry = area?.geometria;
  const meta = geometry?.meta || {};
  if (meta?.shape !== "circle") return;

  const center = Array.isArray(meta.center) ? meta.center : null;
  const radius = Number(meta.radius_m);
  if (!center || center.length < 2 || !Number.isFinite(radius) || radius <= 0) return;

  const [lng, lat] = center;
  entity.position = Cesium.Cartesian3.fromDegrees(lng, lat);
}

export async function persistDraggedEntity(entity) {
  const tacticalType =
    entity?.properties?.tacticalType?.getValue?.() ||
    entity?.properties?.tacticalType ||
    "";

  const coords = getEntityCurrentLatLng(entity);
  if (!coords) return false;

  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token = localStorage.getItem("token");
  const opId = localStorage.getItem("active_operation_id");
  if (!token || !opId) return false;

  let path = null;
  let body = { latitud: coords.lat, longitud: coords.lng };

  const idPoi = entity.properties?.id_poi?.getValue?.() ?? entity.properties?.id_poi;
  const idArea = entity.properties?.id_area?.getValue?.() ?? entity.properties?.id_area;
  const idMarca = entity.properties?.id_marca?.getValue?.() ?? entity.properties?.id_marca;

  if (idPoi && ["poi", "mil-dropped"].includes(String(tacticalType))) {
    path = `/ops/${opId}/pois/${idPoi}`;
  } else if (idArea && String(tacticalType) === "circle") {
    path = `/ops/${opId}/areas/${idArea}`;
  } else if (idMarca && ["building", "label"].includes(String(tacticalType))) {
    path = `/ops/${opId}/edificios/${idMarca}`;
  } else {
    saveTacticalData();
    return true;
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const mensaje = data?.mensaje || "No se pudo actualizar el objeto táctico.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return false;
    }

    if (data?.poi) applyPoiUpdateToEntity(entity, data.poi);
    if (data?.area) applyAreaUpdateToEntity(entity, data.area);
    if (data?.edificio) applyStructureUpdateToEntity(entity, data.edificio);

    saveTacticalData();
    if (dom.tbHint) dom.tbHint.textContent = "Objeto táctico actualizado.";
    return true;
  } catch (err) {
    console.error("[TACTICAL] Error actualizando objeto arrastrado:", err);
    if (dom.tbHint) dom.tbHint.textContent = "Error de conexión al actualizar el objeto táctico.";
    alert("Error de conexión al actualizar el objeto táctico.");
    return false;
  }
}

async function deletePoiFromBackend(idPoi) {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token = localStorage.getItem("token");
  const opId = localStorage.getItem("active_operation_id");
  if (!token || !opId || !idPoi) return false;

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/pois/${idPoi}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const mensaje = data?.mensaje || "No se pudo eliminar el punto de interés.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[POI] Error eliminando punto de interés:", err);
    if (dom.tbHint) dom.tbHint.textContent = "Error de conexión al eliminar el punto de interés.";
    alert("Error de conexión al eliminar el punto de interés.");
    return false;
  }
}

async function deleteAreaFromBackend(idArea) {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token = localStorage.getItem("token");
  const opId = localStorage.getItem("active_operation_id");
  if (!token || !opId || !idArea) return false;

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/areas/${idArea}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const mensaje = data?.mensaje || "No se pudo eliminar el círculo de cobertura.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[AREA] Error eliminando círculo de cobertura:", err);
    if (dom.tbHint) dom.tbHint.textContent = "Error de conexión al eliminar el círculo de cobertura.";
    alert("Error de conexión al eliminar el círculo de cobertura.");
    return false;
  }
}

async function deleteStructureFromBackend(idMarca) {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token = localStorage.getItem("token");
  const opId = localStorage.getItem("active_operation_id");
  if (!token || !opId || !idMarca) return false;

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/edificios/${idMarca}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const mensaje = data?.mensaje || "No se pudo eliminar la estructura.";
      if (dom.tbHint) dom.tbHint.textContent = mensaje;
      alert(mensaje);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[ESTRUCTURA] Error eliminando estructura:", err);
    if (dom.tbHint) dom.tbHint.textContent = "Error de conexion al eliminar la estructura.";
    alert("Error de conexion al eliminar la estructura.");
    return false;
  }
}

async function deleteCurrentOperationZoneFromBackend() {
  const currentOperation = getCurrentOperation();
  const phase = String(currentOperation?.phase || currentOperation?.estado || "").toLowerCase();
  if (phase === "activa") {
    if (dom.tbHint) dom.tbHint.textContent = "La zona de operacion no se puede eliminar mientras la operacion este activa.";
    alert("La zona de operacion no se puede eliminar mientras la operacion este activa.");
    return false;
  }

  return deleteOperationZoneFromBackend();
}

export async function deleteSelectedEntity() {
  const viewer = dashboardState.viewer;
  if (!dashboardState.selectedEntity || !viewer) return;

  const selected = dashboardState.selectedEntity;
  const tacticalType =
    selected.properties?.tacticalType?.getValue?.() ||
    selected.properties?.tacticalType ||
    "";
  const idPoi = selected.properties?.id_poi?.getValue?.() ?? selected.properties?.id_poi;
  const idArea = selected.properties?.id_area?.getValue?.() ?? selected.properties?.id_area;
  const idMarca = selected.properties?.id_marca?.getValue?.() ?? selected.properties?.id_marca;
  const idZona = selected.properties?.id_zona?.getValue?.() ?? selected.properties?.id_zona;

  if (idPoi && ["poi", "mil-dropped"].includes(String(tacticalType))) {
    const deleted = await deletePoiFromBackend(idPoi);
    if (!deleted) return;
  }

  if (idArea && ["circle", "polygon"].includes(String(tacticalType))) {
    const deleted = await deleteAreaFromBackend(idArea);
    if (!deleted) return;
  }

  if (idMarca && ["building", "label"].includes(String(tacticalType))) {
    const deleted = await deleteStructureFromBackend(idMarca);
    if (!deleted) return;
  }

  if (idZona && String(tacticalType) === "operation-zone") {
    const deleted = await deleteCurrentOperationZoneFromBackend();
    if (!deleted) return;
    clearOperationZoneEntities();
  }

  if (
    selected === dashboardState.planningAreaFill ||
    selected === dashboardState.planningAreaBorder ||
    selected === dashboardState.planningAreaLabel
  ) {
    clearPlanningArea();
  } else if (selected === dashboardState.operationZoneBorder) {
    clearOperationZoneEntities();
  } else {
    viewer.entities.remove(selected);
    dashboardState.tacticalEntities = dashboardState.tacticalEntities.filter(
      ent => ent !== selected
    );
  }

  dashboardState.selectedEntity = null;
  updateSelectionInfo(dashboardState.selectedEntity);

  saveTacticalData();

  if (dom.entityPopup) {
    dom.entityPopup.style.display = "none";
  }
}

export async function loadPoisFromBackend() {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token    = localStorage.getItem("token");
  const opId     = localStorage.getItem("active_operation_id");
  const viewer   = dashboardState.viewer;
  if (!token || !opId || !viewer) return;

  try {
    const res  = await fetch(`${API_BASE}/ops/${opId}/pois`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const pois = data.items || [];

    pois.forEach(poi => {
      if (!poi?.id_poi) return;
      const ent = buildPoiEntity(poi, "poi");
      if (ent) addTacticalEntity(ent);
    });
  } catch (err) {
    console.error("[POI] Error cargando POIs desde backend:", err);
  }
}

export async function loadAreasFromBackend() {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token    = localStorage.getItem("token");
  const opId     = localStorage.getItem("active_operation_id");
  const viewer   = dashboardState.viewer;
  if (!token || !opId || !viewer) return;

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/areas`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const areas = data.items || [];

    areas.forEach(area => {
      if (!area?.id_area) return;
      const ent = buildAreaEntity(area);
      if (ent) addTacticalEntity(ent);
    });
  } catch (err) {
    console.error("[AREA] Error cargando areas desde backend:", err);
  }
}

export async function loadStructuresFromBackend() {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token = localStorage.getItem("token");
  const opId = localStorage.getItem("active_operation_id");
  const viewer = dashboardState.viewer;
  if (!token || !opId || !viewer) return;

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/edificios`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const items = data.items || [];

    items.forEach(estructura => {
      if (!estructura?.id_marca) return;
      const ent = buildStructureEntity(estructura);
      if (ent) addTacticalEntity(ent);
    });
  } catch (err) {
    console.error("[ESTRUCTURA] Error cargando estructuras desde backend:", err);
  }
}

export async function loadOperationZoneFromBackend() {
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const token = localStorage.getItem("token");
  const opId = localStorage.getItem("active_operation_id");
  const viewer = dashboardState.viewer;
  if (!token || !opId || !viewer) return null;

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/zona`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 404) {
      clearOperationZoneEntities();
      return null;
    }

    if (!res.ok) return null;
    const data = await res.json();
    const zona = data.zona || null;
    if (!zona) {
      clearOperationZoneEntities();
      return null;
    }

    buildOperationZoneEntity(zona);
    return zona;
  } catch (err) {
    console.error("[ZONA] Error cargando zona de operacion:", err);
    return null;
  }
}

export function initPoiSocket(socket) {
  socket.on("poi_creado", ({ poi }) => {
    if (!poi?.id_poi) return;
    // Saltar si soy yo quien lo creó (ya lo dibujé localmente)
    if (_mySentPoiIds.has(poi.id_poi)) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const ent = buildPoiEntity(poi, "poi");
    if (ent) addTacticalEntity(ent);
  });

  socket.on("poi_actualizado", ({ poi }) => {
    if (!poi?.id_poi) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const entity = viewer.entities.getById(`poi_${poi.id_poi}`);
    if (entity) {
      applyPoiUpdateToEntity(entity, poi);
      saveTacticalData();
      return;
    }

    const ent = buildPoiEntity(poi, "poi");
    if (ent) addTacticalEntity(ent);
  });

  socket.on("poi_eliminado", ({ id_poi }) => {
    if (!id_poi) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const entity = viewer.entities.getById(`poi_${id_poi}`);
    if (entity) viewer.entities.remove(entity);

    dashboardState.tacticalEntities = dashboardState.tacticalEntities.filter(ent => {
      const entIdPoi = ent.properties?.id_poi?.getValue?.() ?? ent.properties?.id_poi;
      return Number(entIdPoi) !== Number(id_poi);
    });
  });

  socket.on("area_creada", ({ area }) => {
    if (!area?.id_area) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const ent = buildAreaEntity(area);
    if (ent) addTacticalEntity(ent);
  });

  socket.on("area_actualizada", ({ area }) => {
    if (!area?.id_area) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const entity = viewer.entities.getById(`area_${area.id_area}`);
    if (entity) {
      applyAreaUpdateToEntity(entity, area);
      saveTacticalData();
      return;
    }

    const ent = buildAreaEntity(area);
    if (ent) addTacticalEntity(ent);
  });

  socket.on("area_eliminada", ({ id_area }) => {
    if (!id_area) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const entity = viewer.entities.getById(`area_${id_area}`);
    if (entity) viewer.entities.remove(entity);

    dashboardState.tacticalEntities = dashboardState.tacticalEntities.filter(ent => {
      const entIdArea = ent.properties?.id_area?.getValue?.() ?? ent.properties?.id_area;
      return Number(entIdArea) !== Number(id_area);
    });
  });

  socket.on("estructura_creada", ({ estructura }) => {
    if (!estructura?.id_marca) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const ent = buildStructureEntity(estructura);
    if (ent) addTacticalEntity(ent);
  });

  socket.on("estructura_actualizada", ({ estructura }) => {
    if (!estructura?.id_marca) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const entity = viewer.entities.getById(`estructura_${estructura.id_marca}`);
    if (entity) {
      applyStructureUpdateToEntity(entity, estructura);
      saveTacticalData();
      return;
    }

    const ent = buildStructureEntity(estructura);
    if (ent) addTacticalEntity(ent);
  });

  socket.on("estructura_eliminada", ({ id_marca }) => {
    if (!id_marca) return;

    const viewer = dashboardState.viewer;
    if (!viewer) return;

    const entity = viewer.entities.getById(`estructura_${id_marca}`);
    if (entity) viewer.entities.remove(entity);

    dashboardState.tacticalEntities = dashboardState.tacticalEntities.filter(ent => {
      const entIdMarca = ent.properties?.id_marca?.getValue?.() ?? ent.properties?.id_marca;
      return Number(entIdMarca) !== Number(id_marca);
    });
  });
}

export function bindTacticalEvents() {
  if (dom.toolSelect) {
    dom.toolSelect.addEventListener("change", (e) => {
      dashboardState.toolMode = e.target.value;
      resetDrawingState();
      setTacticalUI();
    });
  }

  if (dom.iconScale) {
    dom.iconScale.addEventListener("input", (e) => {
      const ent = dashboardState.selectedEntity;
      if (ent && ent.properties?.tacticalType?.getValue?.() === "mil-dropped") {
        ent.billboard.scale = Number(e.target.value);
      }
    });
  }

  if (dom.placeBtn) {
    dom.placeBtn.addEventListener("click", () => {
      if (dashboardState.toolMode === "mil") return;

      const canToggleCancelFromPlace = ["poi", "circle", "label", "building"].includes(dashboardState.toolMode);
      if (dashboardState.placingMode && canToggleCancelFromPlace) {
        resetDrawingState();
        if (dom.tbHint) dom.tbHint.textContent = "Accion cancelada.";
        setTacticalUI();
        return;
      }

      dashboardState.placingMode = true;
      dashboardState.drawingPoints = [];
      if (dom.tbHint) {
        dom.tbHint.textContent = "Modo activo. Usa el mapa para colocar elementos.";
      }
    });
  }

  if (dom.cancelPlace) {
    dom.cancelPlace.addEventListener("click", () => {
      resetDrawingState();
      if (dom.tbHint) dom.tbHint.textContent = "Accion cancelada.";
      setTacticalUI();
    });
  }

  if (dom.clearTactical) {
    dom.clearTactical.addEventListener("click", () => {
      const viewer = dashboardState.viewer;
      if (!viewer) return;

      dashboardState.tacticalEntities.forEach(ent => viewer.entities.remove(ent));
      dashboardState.tacticalEntities = [];
      dashboardState.selectedEntity = null;

      updateSelectionInfo(dashboardState.selectedEntity);
      resetDrawingState();

      saveTacticalData();

      if (dom.tbHint) dom.tbHint.textContent = "Elementos tácticos limpiados.";
    });
  }

  if (dom.deleteSelectedBtn) {
    dom.deleteSelectedBtn.addEventListener("click", deleteSelectedEntity);
  }

  if (dom.entityPopupDelete) {
    dom.entityPopupDelete.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSelectedEntity();
    });
  }

  if (dom.clearSelectionBtn) {
    dom.clearSelectionBtn.addEventListener("click", () => {
      dashboardState.selectedEntity = null;
      updateSelectionInfo(dashboardState.selectedEntity);
      if (dom.entityPopup) dom.entityPopup.style.display = "none";
    });
  }

  if (dom.finishShape) {
    dom.finishShape.addEventListener("click", () => {
      if (dashboardState.areaDrawing) {
        finishPlanningAreaByPoints();
        return;
      }

      if (dashboardState.toolMode === "polygon") {
        finishPolygon();
        return;
      }

      if (dashboardState.toolMode === "polyline") {
        finishPolyline();
        return;
      }

      if (dashboardState.toolMode === "perimeter") {
        void finishOperationZonePerimeter();
      }
    });
  }
}
