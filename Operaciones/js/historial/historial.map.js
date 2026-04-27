import { dom } from "./historial.dom.js";
import { replayState } from "./historial.state.js";

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
const SCALE_BY_DIST = new Cesium.NearFarScalar(1e3, 1.0, 2e6, 0.04);

// Entidades con control de tiempo: { entity, showAt, hideAt (ms epoch) }
const mapRegistry = [];

// ── Init ──────────────────────────────────────────────────

export function initHistoryMap() {
  if (!dom.map || !window.Cesium || replayState.viewer) return;

  Cesium.Ion.defaultAccessToken = localStorage.getItem("CESIUM_TOKEN") || "";

  replayState.viewer = new Cesium.Viewer(dom.map, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    sceneModePicker: false,
    geocoder: false,
    infoBox: false,
    selectionIndicator: false,
    fullscreenButton: false,
    imageryProvider: false,
  });

  const viewer = replayState.viewer;
  viewer.imageryLayers.removeAll();
  addHybridLayer(viewer);
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 500;
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 5000000;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-99.1332, 19.4326, 1800000),
  });
}

// ── Build all entities from replay data ──────────────────

export function buildMapEntities(replay) {
  const viewer = replayState.viewer;
  if (!viewer || !window.Cesium) return;

  mapRegistry.length = 0;
  viewer.entities.removeAll();

  const snapshots = replay?.snapshots || {};
  const events = replay?.timeline?.eventos || [];

  // Timestamps de eliminación por "tipo:id"
  const DELETION_EVENTS = new Set([
    "poi_eliminado", "area_eliminada", "estructura_eliminada",
    "ruta_tactica_eliminada", "ruta_navegacion_eliminada", "dibujo_eliminado"
  ]);
  const deletionMs = new Map();
  for (const ev of events) {
    if (!DELETION_EVENTS.has(ev.tipo_evento)) continue;
    const ms = Date.parse(ev.occurred_at);
    if (isFinite(ms)) deletionMs.set(`${ev.entidad_tipo}:${ev.entidad_id}`, ms);
  }

  // Zona de operación (siempre visible, sin time-gate)
  if (replay?.zona_operacion) {
    buildZonaEntity(replay.zona_operacion, viewer);
  }

  // POIs
  for (const poi of (snapshots.pois || [])) {
    const showAt = Date.parse(poi.fecha_creacion) || 0;
    const hideAt = deletionMs.get(`poi:${poi.id_poi}`) ?? Infinity;
    const entity = buildPoiEntity(poi, viewer);
    if (entity) mapRegistry.push({ entity, showAt, hideAt });
  }

  // Áreas
  for (const area of (snapshots.areas || [])) {
    const showAt = Date.parse(area.fecha_creacion) || 0;
    const hideAt = deletionMs.get(`area:${area.id_area}`) ?? Infinity;
    const entity = buildAreaEntity(area, viewer);
    if (entity) mapRegistry.push({ entity, showAt, hideAt });
  }

  // Estructuras / edificios
  for (const est of (snapshots.estructuras || [])) {
    const showAt = Date.parse(est.fecha_creacion) || 0;
    const hideAt = deletionMs.get(`estructura:${est.id_marca}`) ?? Infinity;
    const entity = buildStructureEntity(est, viewer);
    if (entity) mapRegistry.push({ entity, showAt, hideAt });
  }

  // Rutas tácticas
  for (const ruta of (snapshots.rutas_tacticas || [])) {
    const showAt = Date.parse(ruta.fecha_creacion) || 0;
    const hideAt = deletionMs.get(`ruta_operacion:${ruta.id_ruta}`) ?? Infinity;
    const entity = buildRouteEntity(ruta, viewer);
    if (entity) mapRegistry.push({ entity, showAt, hideAt });
  }

  // Rutas de navegación
  for (const ruta of (snapshots.rutas_navegacion || [])) {
    const showAt = Date.parse(ruta.fecha_creacion) || 0;
    const hideAt = (ruta.activo === false && ruta.fecha_eliminacion)
      ? (Date.parse(ruta.fecha_eliminacion) ?? Infinity)
      : Infinity;
    const entity = buildNavRouteEntity(ruta, viewer);
    if (entity) mapRegistry.push({ entity, showAt, hideAt });
  }

  // Dibujos libres
  for (const dibujo of (snapshots.dibujos || [])) {
    const showAt = Date.parse(dibujo.fecha_creacion) || 0;
    const hideAt = deletionMs.get(`dibujo:${dibujo.id_dibujo}`) ?? Infinity;
    const entity = buildDrawingEntity(dibujo, viewer);
    if (entity) mapRegistry.push({ entity, showAt, hideAt });
  }

  // Tracking personal
  buildTrackingEntities(viewer, events, "tracking_personal", "id_personal", "#00FFA6");

  // Tracking vehículos
  buildTrackingEntities(viewer, events, "tracking_vehiculo", "id_vehiculo", "#FFD700");

  // Mostrar estado inicial
  updateMapToTime(replayState.startMs);
}

// ── Zona de operación (igual que dashboard) ──────────────

function buildZonaEntity(zona, viewer) {
  const ring = zona?.geometria?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return;

  const points = ring
    .map(([lng, lat]) => ({ lng: Number(lng), lat: Number(lat) }))
    .filter(p => isFinite(p.lat) && isFinite(p.lng));

  if (points.length < 3) return;

  const first = points[0];
  const last = points[points.length - 1];
  if (first.lat === last.lat && first.lng === last.lng) points.pop();
  if (points.length < 3) return;

  const closedPoints = [...points, points[0]];
  const color = Cesium.Color.fromCssColorString(zona.color || "#3b82f6");

  viewer.entities.add({
    id: `zona_${zona.id_zona}`,
    name: zona.nombre || "Zona de operación",
    polyline: {
      positions: toCartesianArray(closedPoints),
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({ color, dashLength: 16 }),
      clampToGround: true,
    },
  });

  // Rosa de los vientos (igual que dashboard)
  renderWindRose(zona, viewer, closedPoints);
}

function renderWindRose(zona, viewer, points) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const boxCenterLat = (minLat + maxLat) / 2;
  const boxCenterLng = (minLng + maxLng) / 2;
  const lineColor = Cesium.Color.fromCssColorString("rgba(0,0,0,0.75)");

  viewer.entities.add({
    name: "Radar Estereográfico",
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray([minLng, boxCenterLat, maxLng, boxCenterLat]),
      width: 3, material: lineColor, clampToGround: true,
    },
  });
  viewer.entities.add({
    name: "Radar Estereográfico",
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray([boxCenterLng, minLat, boxCenterLng, maxLat]),
      width: 3, material: lineColor, clampToGround: true,
    },
  });

  const cardinals = [
    { text: "N", lat: maxLat, lng: boxCenterLng, offset: new Cesium.Cartesian2(0, -15) },
    { text: "S", lat: minLat, lng: boxCenterLng, offset: new Cesium.Cartesian2(0, 15) },
    { text: "E", lat: boxCenterLat, lng: maxLng, offset: new Cesium.Cartesian2(15, 0) },
    { text: "W", lat: boxCenterLat, lng: minLng, offset: new Cesium.Cartesian2(-15, 0) },
  ];
  for (const lbl of cardinals) {
    viewer.entities.add({
      name: "Radar Estereográfico",
      position: Cesium.Cartesian3.fromDegrees(lbl.lng, lbl.lat),
      label: {
        text: lbl.text,
        font: "bold 24px monospace",
        fillColor: Cesium.Color.fromCssColorString("rgba(0,0,0,0.90)"),
        pixelOffset: lbl.offset,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
  }
}

// ── POI (igual que dashboard.buildPoiEntity) ─────────────

function buildPoiEntity(poi, viewer) {
  const lat = Number(poi.latitud ?? poi.lat);
  const lng = Number(poi.longitud ?? poi.lon ?? poi.lng);
  if (!isFinite(lat) || !isFinite(lng)) return null;

  const tipo_poi_raw = String(poi.tipo_poi || "").toUpperCase();
  if (tipo_poi_raw === "RADAR") {
    // RADAR: solo punto colored
    return viewer.entities.add({
      show: false,
      name: poi.nombre || "Radar",
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      point: {
        pixelSize: 12,
        color: safeCesiumColor(poi.color, "#00BFFF").withAlpha(0.8),
        outlineColor: Cesium.Color.WHITE, outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: labelOpts(poi.nombre || "Radar", new Cesium.Cartesian2(0, -18)),
    });
  }

  const sidc = poi.sidc || (poi.icono_src?.startsWith("S") ? poi.icono_src : null);
  let iconSrc = resolveImage(poi.icono_src || poi.iconSrc);
  if (sidc) iconSrc = renderMilSymbol(sidc) || iconSrc;

  const isMil = tipo_poi_raw === "MIL" || !!sidc;
  const cesiumColor = safeCesiumColor(poi.color, "#FFD700");
  const label = poi.nombre ? (isMil ? poi.nombre.replace(/\s\d{17}$/, "") : poi.nombre) : "PDI";

  return viewer.entities.add({
    show: false,
    name: label,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    billboard: iconSrc ? {
      image: iconSrc,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      width: isMil ? 42 : undefined,
      height: isMil ? 42 : undefined,
      scale: isMil ? 1 : Number(poi.scale || 1.0),
    } : undefined,
    point: !iconSrc ? {
      pixelSize: 10,
      color: cesiumColor,
      outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    } : undefined,
    label: {
      text: label,
      font: "14px sans-serif",
      pixelOffset: iconSrc ? new Cesium.Cartesian2(0, 15) : new Cesium.Cartesian2(0, -20),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      showBackground: !iconSrc,
      backgroundColor: !iconSrc ? cesiumColor.withAlpha(0.7) : undefined,
      backgroundPadding: !iconSrc ? new Cesium.Cartesian2(6, 4) : undefined,
    },
  });
}

// ── Área (igual que dashboard.buildAreaEntity) ────────────

function buildAreaEntity(area, viewer) {
  const geometry = area?.geometria;
  const meta = geometry?.meta || {};
  if (geometry?.type !== "Polygon") return null;

  const opacity = Number(meta.opacity ?? 0.35);
  const lineWidth = Number(meta.outline_width ?? 3);
  const colorHex = area.color || "#FF4500";
  const outline = safeCesiumColor(colorHex, "#FF4500");

  if (meta.shape === "circle") {
    const center = Array.isArray(meta.center) ? meta.center : null;
    const radius = Number(meta.radius_m);
    if (!center || center.length < 2 || !isFinite(radius) || radius <= 0) return null;
    const [lng, lat] = center;
    if (!isFinite(lat) || !isFinite(lng)) return null;

    return viewer.entities.add({
      show: false,
      name: area.nombre || "Círculo de cobertura",
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      ellipse: {
        semiMajorAxis: radius,
        semiMinorAxis: radius,
        material: outline.withAlpha(opacity),
        outline: true, outlineColor: outline, outlineWidth: lineWidth,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: area.nombre ? labelOpts(area.nombre, new Cesium.Cartesian2(0, 0), true) : undefined,
    });
  }

  if (meta.shape !== "polygon") return null;

  const coordinates = Array.isArray(geometry?.coordinates?.[0]) ? geometry.coordinates[0] : null;
  if (!coordinates || coordinates.length < 4) return null;

  const ringPoints = coordinates
    .map(coord => ({ lng: Number(coord?.[0]), lat: Number(coord?.[1]) }))
    .filter(p => isFinite(p.lat) && isFinite(p.lng))
    .slice(0, -1);

  if (ringPoints.length < 3) return null;

  const center = polygonCentroid(ringPoints);

  return viewer.entities.add({
    show: false,
    name: area.nombre || "Zona",
    position: center ? Cesium.Cartesian3.fromDegrees(center.lng, center.lat) : undefined,
    polygon: {
      hierarchy: toCartesianArray(ringPoints),
      material: outline.withAlpha(opacity),
      outline: true, outlineColor: outline, outlineWidth: lineWidth,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      perPositionHeight: false,
    },
    label: (area.nombre && center) ? labelOpts(area.nombre, new Cesium.Cartesian2(0, 0), true) : undefined,
  });
}

// ── Estructura / Edificio (igual que dashboard) ───────────

function buildStructureEntity(estructura, viewer) {
  const lat = Number(estructura.latitud ?? estructura.lat);
  const lng = Number(estructura.longitud ?? estructura.lon ?? estructura.lng);
  if (!isFinite(lat) || !isFinite(lng)) return null;

  const type = String(estructura.tipo_estructura || "").toUpperCase();
  const isLabel = type === "ETIQUETA";
  const name = String(estructura.nombre || (isLabel ? "Etiqueta" : "Edificio"));

  return viewer.entities.add({
    show: false,
    name,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    billboard: !isLabel ? {
      image: "img/estructuras/casa.png",
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scale: 0.08,
      scaleByDistance: SCALE_BY_DIST,
    } : undefined,
    label: {
      text: name,
      font: "12px sans-serif",
      pixelOffset: isLabel ? new Cesium.Cartesian2(0, -18) : new Cesium.Cartesian2(0, 8),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: SCALE_BY_DIST,
      showBackground: isLabel,
      backgroundColor: isLabel ? Cesium.Color.BLACK.withAlpha(0.7) : undefined,
      backgroundPadding: isLabel ? new Cesium.Cartesian2(6, 4) : undefined,
    },
  });
}

// ── Ruta táctica (igual que dashboard.buildRouteEntity) ───

function buildRouteEntity(ruta, viewer) {
  let geometry = ruta?.geometria;
  if (typeof geometry === "string") {
    try { geometry = JSON.parse(geometry); } catch { return null; }
  }
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;

  const points = geometry.coordinates
    .map(coord => ({ lng: Number(coord?.[0]), lat: Number(coord?.[1]) }))
    .filter(p => isFinite(p.lat) && isFinite(p.lng));
  if (points.length < 2) return null;

  const color = safeCesiumColor(ruta.color, "#1E90FF");

  return viewer.entities.add({
    show: false,
    name: ruta.nombre || "Línea táctica",
    polyline: {
      positions: toCartesianArray(points),
      width: Number(ruta.grosor || ruta.width || 3),
      material: color,
      clampToGround: true,
    },
  });
}

// ── Ruta de navegación ────────────────────────────────────

function buildNavRouteEntity(ruta, viewer) {
  const geojson = ruta.geojson;
  if (!geojson) return null;
  const coords = geojson.coordinates ?? geojson.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const positions = coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));

  return viewer.entities.add({
    show: false,
    name: "Ruta de navegación",
    polyline: {
      positions,
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString("#00C3FF").withAlpha(0.85),
        dashLength: 16,
      }),
      clampToGround: true,
    },
  });
}

// ── Dibujo libre ──────────────────────────────────────────

function buildDrawingEntity(dibujo, viewer) {
  const puntos = dibujo.puntos;
  if (!Array.isArray(puntos) || puntos.length < 2) return null;

  const positions = puntos
    .map(p => {
      const lat = Number(p.lat ?? p.latitud);
      const lon = Number(p.lng ?? p.lon ?? p.longitud);
      return isFinite(lat) && isFinite(lon) ? Cesium.Cartesian3.fromDegrees(lon, lat) : null;
    })
    .filter(Boolean);

  if (positions.length < 2) return null;

  return viewer.entities.add({
    show: false,
    polyline: {
      positions,
      width: dibujo.grosor || 3,
      material: new Cesium.ColorMaterialProperty(safeCesiumColor(dibujo.color, "#FFFFFF").withAlpha(0.9)),
      clampToGround: true,
    },
  });
}

// ── Tracking (personal y vehículos) ──────────────────────

function buildTrackingEntities(viewer, events, tipoEvento, idKey, colorHex) {
  const byId = new Map();

  for (const ev of events) {
    if (ev.tipo_evento !== tipoEvento) continue;
    const p = ev.payload || {};
    const lat = Number(p.latitud);
    const lon = Number(p.longitud);
    const ms = Date.parse(ev.occurred_at);
    if (!isFinite(lat) || !isFinite(lon) || !isFinite(ms)) continue;

    const key = String(p[idKey]);
    if (!byId.has(key)) {
      const nombre = p.apodo || p.alias || p.codigo_interno || p.nombre || "";
      byId.set(key, { points: [], nombre });
    }
    byId.get(key).points.push({ ms, lat, lon });
  }

  const cesiumColor = Cesium.Color.fromCssColorString(colorHex);

  for (const data of byId.values()) {
    const { points, nombre } = data;
    if (!points.length) continue;

    const showAt = points[0].ms;

    const pathEntity = viewer.entities.add({
      show: false,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const pts = points
            .filter(pt => pt.ms <= replayState.currentTimeMs)
            .map(pt => Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat));
          return pts.length >= 2 ? pts : (pts.length === 1 ? [pts[0], pts[0]] : null);
        }, false),
        width: tipoEvento === "tracking_vehiculo" ? 2.5 : 2,
        material: new Cesium.ColorMaterialProperty(cesiumColor.withAlpha(0.65)),
        clampToGround: true,
      },
    });

    const dotEntity = viewer.entities.add({
      show: false,
      position: new Cesium.CallbackProperty(() => {
        const visible = points.filter(pt => pt.ms <= replayState.currentTimeMs);
        if (!visible.length) return Cesium.Cartesian3.fromDegrees(0, 0, 0);
        const last = visible[visible.length - 1];
        return Cesium.Cartesian3.fromDegrees(last.lon, last.lat);
      }, false),
      point: {
        pixelSize: tipoEvento === "tracking_vehiculo" ? 12 : 10,
        color: cesiumColor.withAlpha(0.95),
        outlineColor: Cesium.Color.BLACK, outlineWidth: 1.5,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: nombre ? {
        text: nombre,
        font: "11px sans-serif",
        pixelOffset: new Cesium.Cartesian2(0, -18),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } : undefined,
    });

    mapRegistry.push({ entity: pathEntity, showAt, hideAt: Infinity });
    mapRegistry.push({ entity: dotEntity, showAt, hideAt: Infinity });
  }
}

// ── Update visibility ─────────────────────────────────────

export function updateMapToTime(currentMs) {
  for (const { entity, showAt, hideAt } of mapRegistry) {
    entity.show = currentMs >= showAt && currentMs < hideAt;
  }
}

// ── Focus camera ──────────────────────────────────────────

export function focusOnReplay(replay) {
  const viewer = replayState.viewer;
  if (!viewer || !window.Cesium) return;

  // Primero intentar centroide de la zona
  const zona = replay?.zona_operacion;
  if (zona?.centroide_lat && zona?.centroide_lon) {
    const lat = Number(zona.centroide_lat);
    const lng = Number(zona.centroide_lon);
    if (isFinite(lat) && isFinite(lng)) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, Number(zona.zoom_inicial || 12000)),
        duration: 0.8,
      });
      return;
    }
  }

  // Fallback: primer coordenada disponible
  const point = findFirstCoordinate(replay);
  if (point) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 12000),
      duration: 0.8,
    });
  }
}

// ── Helpers ───────────────────────────────────────────────

function addHybridLayer(viewer) {
  const satellite = viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
    })
  );
  satellite.brightness = 0.78;
  satellite.contrast = 1.35;
  satellite.saturation = 1.15;
  satellite.gamma = 0.9;

  const labels = viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      maximumLevel: 19,
      credit: "© OpenStreetMap contributors",
    })
  );
  labels.alpha = 0.28;
}

function toCartesianArray(points) {
  return points.map(p => Cesium.Cartesian3.fromDegrees(p.lng ?? p.lon, p.lat));
}

function labelOpts(text, offset, isCenter = false) {
  return {
    text: String(text),
    font: "14px sans-serif",
    pixelOffset: offset || new Cesium.Cartesian2(0, -20),
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 3,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  };
}

function safeCesiumColor(cssColor, fallback) {
  try { return Cesium.Color.fromCssColorString(cssColor || fallback); } catch {
    return Cesium.Color.fromCssColorString(fallback);
  }
}

function resolveImage(src) {
  if (!src) return null;
  if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) return src;
  return `${API_BASE.replace(/\/$/, "")}/${src.replace(/^\.?\//, "")}`;
}

function renderMilSymbol(sidc, size = 200) {
  if (!sidc || typeof ms === "undefined" || typeof ms.Symbol !== "function") return null;
  try {
    return new ms.Symbol(sidc, { size, colorMode: "Light" }).asCanvas();
  } catch {
    return null;
  }
}

function polygonCentroid(points) {
  if (!points.length) return null;
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

function findFirstCoordinate(replay) {
  for (const item of (replay?.snapshots?.pois || [])) {
    const lat = Number(item.latitud);
    const lon = Number(item.longitud);
    if (isFinite(lat) && isFinite(lon)) return { lat, lon };
  }
  for (const item of (replay?.snapshots?.estructuras || [])) {
    const lat = Number(item.latitud);
    const lon = Number(item.longitud);
    if (isFinite(lat) && isFinite(lon)) return { lat, lon };
  }
  for (const ev of (replay?.timeline?.eventos || [])) {
    if (ev.tipo_evento !== "tracking_personal" && ev.tipo_evento !== "tracking_vehiculo") continue;
    const p = ev.payload || {};
    const lat = Number(p.latitud);
    const lon = Number(p.longitud);
    if (isFinite(lat) && isFinite(lon)) return { lat, lon };
  }
  return null;
}
