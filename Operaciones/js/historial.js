const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
const BUILD_ID = "20260520-history-full-rewrite";
const DEFAULT_CAMERA = { lng: -99.1332, lat: 19.4326, height: 2500000 };
const MIN_CAMERA_HEIGHT = 120;
const MAX_CAMERA_HEIGHT = 5000000;
const SCALE_BY_DIST = new Cesium.NearFarScalar(1e3, 1.0, 2e6, 0.04);
const TICK_MS = 250;

const dom = {};
const state = {
  viewer: null,
  replay: null,
  events: [],
  mapEntries: [],
  recordings: [],
  startMs: 0,
  endMs: 0,
  currentMs: 0,
  timerId: null,
  isPlaying: false,
  speed: 1,
};

readDom();
bindShell();
main();

async function main() {
  const operationId = getOperationId();
  if (!operationId) {
    renderError("No se encontro el id de operacion. Abre historial.html?id=3 o selecciona una operacion cerrada.");
    return;
  }

  try {
    await loadCesiumToken();
  } catch (error) {
    console.warn("No se pudo cargar token Cesium para historial", error);
  }

  try {
    const replay = await apiFetch(`/ops/${encodeURIComponent(operationId)}/replay`);
    state.replay = replay;
    state.events = normalizeTimelineEvents(replay?.timeline?.eventos || []);

    initHistoryMap(replay?.zona_operacion);
    await attachRecordings(operationId, replay);
    setReplayData(replay);
    renderTopbar(replay);
    renderOperationInfo(replay);
    renderChatMessages(state.events);
    bindPlaybackControls();
    attachRecordingDownloads();
    buildMapEntities(replay);
    setCurrentTime(state.startMs);
  } catch (error) {
    console.error("Error cargando historial", error);
    renderError(error.message || "No se pudo cargar el historial de la operacion.");
  }
}

function readDom() {
  dom.backBtn = byId("btnBack", "backBtn");
  dom.title = byId("opName", "historyTitle");
  dom.status = byId("opMeta", "historyStatusBadge");
  dom.map = byId("map", "historyMap");
  dom.stage = document.querySelector(".playbackStage");
  dom.infoContent = byId("opInfoDetails", "historyInfoContent");
  dom.chatMessages = byId("chatMessages", "historyChatMessages");
  dom.playPause = byId("btnPlayPause", "historyPlayPause");
  dom.rewind = byId("btnRewind", "historyRewind");
  dom.forward = byId("btnForward", "historyForward");
  dom.reset = byId("btnReset");
  dom.speed = byId("playbackSpeed", "historySpeed");
  dom.range = byId("timelineSlider", "historyTimeRange");
  dom.currentTime = byId("currentTimeLabel", "historyCurrentTime");
  dom.totalTime = byId("totalTimeLabel", "historyTotalTime");
  dom.currentDate = byId("currentDateDisplay");
}

function byId(...ids) {
  return ids.map(id => document.getElementById(id)).find(Boolean) || null;
}

function bindShell() {
  dom.backBtn?.addEventListener("click", () => {
    window.location.href = "menu_inicial.html";
  });

  document.querySelectorAll(".tabBtn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tabBtn").forEach(btn => btn.classList.remove("active"));
      document.querySelectorAll(".tabContent").forEach(content => content.classList.add("hidden"));
      button.classList.add("active");
      document.getElementById(`${button.dataset.tab}Tab`)?.classList.remove("hidden");
    });
  });
}

function bindPlaybackControls() {
  dom.playPause?.addEventListener("click", togglePlayback);
  dom.rewind?.addEventListener("click", () => seekRelative(-10000));
  dom.forward?.addEventListener("click", () => seekRelative(10000));
  dom.reset?.addEventListener("click", () => {
    pausePlayback();
    setCurrentTime(state.startMs);
  });
  dom.speed?.addEventListener("change", () => {
    state.speed = Number(dom.speed.value) || 1;
  });
  dom.range?.addEventListener("input", () => {
    pausePlayback();
    const offsetSeconds = Number(dom.range.value) || 0;
    setCurrentTime(state.startMs + offsetSeconds * 1000);
  });
}

function getOperationId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("op") || localStorage.getItem("active_operation_id");
}

async function loadCesiumToken() {
  const payload = await apiFetch("/config/cesium-token");
  const token = payload?.token || "";
  Cesium.Ion.defaultAccessToken = token;
  if (token) localStorage.setItem("CESIUM_TOKEN", token);
}

async function attachRecordings(operationId, replay) {
  try {
    const payload = await apiFetch(`/ops/${encodeURIComponent(operationId)}/streams/recordings`);
    state.recordings = payload.items || [];
    replay.recordings = state.recordings;
  } catch (error) {
    state.recordings = [];
    replay.recordings = [];
    replay.recordingsError = error.message || "No se pudieron cargar";
  }
}

async function apiFetch(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.mensaje || payload?.error || `Error HTTP ${response.status}`);
  }
  return payload;
}

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function initHistoryMap(zone) {
  if (!dom.map || !window.Cesium) return;

  dom.map.replaceChildren();
  state.viewer = new Cesium.Viewer(dom.map.id || dom.map, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    sceneModePicker: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false,
    imageryProvider: false,
  });

  const viewer = state.viewer;
  viewer.clock.shouldAnimate = false;
  viewer.trackedEntity = undefined;
  viewer.scene.tweens?.removeAll?.();
  disableCesiumCameraInputs(viewer);
  addHybridLayer(viewer);
  installManualCamera(viewer);
  window.__historyViewer = viewer;
  console.info("[historial] reescritura completa cargada", BUILD_ID);

  const target = getZoneCameraTarget(zone) || DEFAULT_CAMERA;
  setCamera(target.lng, target.lat, target.height);
  resizeHistoryMap();
  window.addEventListener("resize", resizeHistoryMap);
}

function disableCesiumCameraInputs(viewer) {
  const controller = viewer?.scene?.screenSpaceCameraController;
  if (!controller) return;
  controller.enableInputs = false;
  controller.enableRotate = false;
  controller.enableTranslate = false;
  controller.enableZoom = false;
  controller.enableTilt = false;
  controller.enableLook = false;
  controller.enableCollisionDetection = false;
  controller.inertiaSpin = 1;
  controller.inertiaTranslate = 1;
  controller.inertiaZoom = 1;
  controller._aggregator?.reset?.();
}

function installManualCamera(viewer) {
  const canvas = viewer.scene.canvas;
  const pointers = new Map();
  let lastDrag = null;
  let lastPinchDistance = null;
  let wheelUnlockAt = performance.now() + 1200;

  canvas.style.cursor = "grab";
  canvas.addEventListener("contextmenu", event => event.preventDefault());

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastDrag = { x: event.clientX, y: event.clientY };
    lastPinchDistance = pointerDistance(pointers);
    canvas.style.cursor = "grabbing";
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      const distance = pointerDistance(pointers);
      if (distance && lastPinchDistance) {
        zoomCamera(lastPinchDistance / distance);
      }
      lastPinchDistance = distance;
      return;
    }

    if (!lastDrag) return;
    panCamera(event.clientX - lastDrag.x, event.clientY - lastDrag.y);
    lastDrag = { x: event.clientX, y: event.clientY };
  });

  const releasePointer = (event) => {
    pointers.delete(event.pointerId);
    lastDrag = null;
    lastPinchDistance = pointerDistance(pointers);
    if (!pointers.size) canvas.style.cursor = "grab";
  };

  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("pointerleave", releasePointer);

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (performance.now() < wheelUnlockAt) return;
    zoomCamera(Math.exp(event.deltaY * 0.0012));
  }, { passive: false, capture: true });

  canvas.addEventListener("dblclick", (event) => {
    event.preventDefault();
    zoomCamera(0.55);
  });
}

function pointerDistance(pointers) {
  const values = [...pointers.values()];
  if (values.length < 2) return null;
  const [a, b] = values;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function panCamera(dx, dy) {
  const viewer = state.viewer;
  const carto = viewer?.camera?.positionCartographic;
  if (!carto) return;

  const canvas = viewer.scene.canvas;
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lng = Cesium.Math.toDegrees(carto.longitude);
  const height = clamp(carto.height, MIN_CAMERA_HEIGHT, MAX_CAMERA_HEIGHT);
  const metersPerPixel = Math.max(1, height / Math.max(canvas.clientHeight || 1, 1)) * 1.8;
  const cosLat = Math.max(0.2, Math.cos(Cesium.Math.toRadians(lat)));
  const nextLng = lng - ((dx * metersPerPixel) / (111320 * cosLat));
  const nextLat = clamp(lat + ((dy * metersPerPixel) / 111320), -85, 85);

  setCamera(nextLng, nextLat, height);
}

function zoomCamera(factor) {
  const carto = state.viewer?.camera?.positionCartographic;
  if (!carto) return;
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lng = Cesium.Math.toDegrees(carto.longitude);
  const height = clamp(carto.height * factor, MIN_CAMERA_HEIGHT, MAX_CAMERA_HEIGHT);
  setCamera(lng, lat, height);
}

function setCamera(lng, lat, height) {
  const viewer = state.viewer;
  if (!viewer) return;
  viewer.camera.cancelFlight?.();
  viewer.scene.tweens?.removeAll?.();
  viewer.trackedEntity = undefined;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(lng, lat, clamp(height, MIN_CAMERA_HEIGHT, MAX_CAMERA_HEIGHT)),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
  });
  viewer.scene.requestRender?.();
}

function resizeHistoryMap() {
  const viewer = state.viewer;
  if (!viewer) return;
  window.setTimeout(() => {
    viewer.resize();
    viewer.scene.requestRender?.();
  }, 80);
}

function addHybridLayer(viewer) {
  viewer.imageryLayers.removeAll();
  const satellite = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 19,
    credit: "Esri World Imagery",
  }));
  satellite.brightness = 0.78;
  satellite.contrast = 1.35;
  satellite.saturation = 1.15;
  satellite.gamma = 0.9;

  const reference = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 19,
    credit: "Esri Reference",
  }));
  reference.alpha = 0.78;
}

function buildMapEntities(replay) {
  const viewer = state.viewer;
  if (!viewer) return;

  state.mapEntries = [];
  viewer.entities.removeAll();

  const snapshots = replay?.snapshots || {};
  const events = state.events;
  const deletionMs = deletedEntityTimes(events);

  if (replay?.zona_operacion) buildZoneEntity(replay.zona_operacion, viewer);

  for (const poi of snapshots.pois || []) {
    registerTimedEntity(buildPoiEntity(poi, viewer), Date.parse(poi.fecha_creacion) || 0, deletionMs.get(`poi:${poi.id_poi}`));
  }
  for (const area of snapshots.areas || []) {
    registerTimedEntity(buildAreaEntity(area, viewer), Date.parse(area.fecha_creacion) || 0, deletionMs.get(`area:${area.id_area}`));
  }
  for (const item of snapshots.estructuras || []) {
    registerTimedEntity(buildStructureEntity(item, viewer), Date.parse(item.fecha_creacion) || 0, deletionMs.get(`estructura:${item.id_marca}`));
  }
  for (const route of snapshots.rutas_tacticas || []) {
    registerTimedEntity(buildRouteEntity(route, viewer), Date.parse(route.fecha_creacion) || 0, deletionMs.get(`ruta_operacion:${route.id_ruta}`));
  }
  for (const route of snapshots.rutas_navegacion || []) {
    const hideAt = route.activo === false && route.fecha_eliminacion ? Date.parse(route.fecha_eliminacion) : Infinity;
    registerTimedEntity(buildNavRouteEntity(route, viewer), Date.parse(route.fecha_creacion) || 0, hideAt);
  }
  for (const drawing of snapshots.dibujos || []) {
    registerTimedEntity(buildDrawingEntity(drawing, viewer), Date.parse(drawing.fecha_creacion) || 0, deletionMs.get(`dibujo:${drawing.id_dibujo}`));
  }

  buildTrackingEntities(viewer, events, "tracking_personal", "id_personal", "#00FFA6");
  buildTrackingEntities(viewer, events, "tracking_vehiculo", "id_vehiculo", "#FFD700");
}

function registerTimedEntity(entity, showAt, hideAt = Infinity, update = null) {
  if (!entity) return;
  entity.show = false;
  state.mapEntries.push({ entity, showAt, hideAt: Number.isFinite(hideAt) ? hideAt : Infinity, update });
}

function deletedEntityTimes(events) {
  const deletionEvents = new Set([
    "poi_eliminado", "area_eliminada", "estructura_eliminada",
    "ruta_tactica_eliminada", "ruta_navegacion_eliminada", "dibujo_eliminado",
  ]);
  const result = new Map();
  for (const event of events) {
    if (!deletionEvents.has(event.tipo_evento)) continue;
    const ms = Date.parse(event.occurred_at);
    if (Number.isFinite(ms)) result.set(`${event.entidad_tipo}:${event.entidad_id}`, ms);
  }
  return result;
}

function buildZoneEntity(zone, viewer) {
  const ring = getPolygonRing(parseGeoJsonObject(zone.geometria ?? zone.geometry));
  if (!Array.isArray(ring) || ring.length < 4) return;

  const points = ring
    .map(([lng, lat]) => ({ lng: Number(lng), lat: Number(lat) }))
    .filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat));
  if (points.length < 3) return;

  const first = points[0];
  const last = points[points.length - 1];
  if (first.lng === last.lng && first.lat === last.lat) points.pop();
  if (points.length < 3) return;

  const closed = [...points, points[0]];
  const color = safeCesiumColor(zone.color, "#3b82f6");

  viewer.entities.add({
    id: `zona_${zone.id_zona || "operacion"}`,
    name: zone.nombre || "Zona de operacion",
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(toCartesianArray(points)),
      material: color.withAlpha(0.08),
      outline: false,
    },
    polyline: {
      positions: toCartesianArray(closed),
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({ color, dashLength: 16 }),
      clampToGround: true,
    },
  });

  renderCompassLabels(viewer, points);
}

function renderCompassLabels(viewer, points) {
  const bounds = points.reduce((acc, point) => ({
    minLat: Math.min(acc.minLat, point.lat),
    maxLat: Math.max(acc.maxLat, point.lat),
    minLng: Math.min(acc.minLng, point.lng),
    maxLng: Math.max(acc.maxLng, point.lng),
  }), { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity });

  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const labels = [
    { text: "N", lat: bounds.maxLat, lng: centerLng, offset: new Cesium.Cartesian2(0, -15) },
    { text: "S", lat: bounds.minLat, lng: centerLng, offset: new Cesium.Cartesian2(0, 15) },
    { text: "E", lat: centerLat, lng: bounds.maxLng, offset: new Cesium.Cartesian2(15, 0) },
    { text: "W", lat: centerLat, lng: bounds.minLng, offset: new Cesium.Cartesian2(-15, 0) },
  ];

  for (const label of labels) {
    viewer.entities.add({
      name: "Radar Estereografico",
      position: Cesium.Cartesian3.fromDegrees(label.lng, label.lat),
      label: {
        text: label.text,
        font: "bold 24px monospace",
        fillColor: Cesium.Color.fromCssColorString("rgba(0,0,0,0.90)"),
        pixelOffset: label.offset,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
  }
}

function buildPoiEntity(poi, viewer) {
  const lat = Number(poi.latitud ?? poi.lat);
  const lng = Number(poi.longitud ?? poi.lon ?? poi.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const tipo = String(poi.tipo_poi || "").toUpperCase();
  const sidc = poi.sidc || (poi.icono_src?.startsWith("S") ? poi.icono_src : null);
  let iconSrc = resolveImage(poi.icono_src || poi.iconSrc);
  if (sidc) iconSrc = renderMilSymbol(sidc) || iconSrc;

  const isMil = tipo === "MIL" || Boolean(sidc);
  const color = safeCesiumColor(poi.color, "#FFD700");
  const name = poi.nombre ? (isMil ? poi.nombre.replace(/\s\d{17}$/, "") : poi.nombre) : "PDI";

  return viewer.entities.add({
    name,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    billboard: iconSrc ? {
      image: iconSrc,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      width: isMil ? 42 : undefined,
      height: isMil ? 42 : undefined,
      scale: isMil ? 1 : Number(poi.scale || 1.0),
      scaleByDistance: SCALE_BY_DIST,
    } : undefined,
    point: !iconSrc ? {
      pixelSize: tipo === "RADAR" ? 12 : 10,
      color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    } : undefined,
    label: labelOpts(name, iconSrc ? new Cesium.Cartesian2(0, 15) : new Cesium.Cartesian2(0, -20), !iconSrc, color),
  });
}

function buildAreaEntity(area, viewer) {
  const geometry = parseGeoJsonObject(area.geometria);
  const meta = geometry?.meta || {};
  if (geometry?.type !== "Polygon") return null;

  const color = safeCesiumColor(area.color, "#FF4500");
  const opacity = Number(meta.opacity ?? 0.35);
  const lineWidth = Number(meta.outline_width ?? 3);

  if (meta.shape === "circle") {
    const center = Array.isArray(meta.center) ? meta.center : null;
    const radius = Number(meta.radius_m);
    if (!center || center.length < 2 || !Number.isFinite(radius) || radius <= 0) return null;
    const [lng, lat] = center.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return viewer.entities.add({
      name: area.nombre || "Circulo de cobertura",
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      ellipse: {
        semiMajorAxis: radius,
        semiMinorAxis: radius,
        material: color.withAlpha(opacity),
        outline: true,
        outlineColor: color,
        outlineWidth: lineWidth,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: area.nombre ? labelOpts(area.nombre, new Cesium.Cartesian2(0, 0), true, color) : undefined,
    });
  }

  const ring = Array.isArray(geometry.coordinates?.[0]) ? geometry.coordinates[0] : null;
  if (!ring || ring.length < 4) return null;
  const points = ring
    .map(([lng, lat]) => ({ lng: Number(lng), lat: Number(lat) }))
    .filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat))
    .slice(0, -1);
  if (points.length < 3) return null;

  const center = polygonCentroid(points);
  return viewer.entities.add({
    name: area.nombre || "Zona",
    position: center ? Cesium.Cartesian3.fromDegrees(center.lng, center.lat) : undefined,
    polygon: {
      hierarchy: toCartesianArray(points),
      material: color.withAlpha(opacity),
      outline: true,
      outlineColor: color,
      outlineWidth: lineWidth,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
    label: area.nombre && center ? labelOpts(area.nombre, new Cesium.Cartesian2(0, 0), true, color) : undefined,
  });
}

function buildStructureEntity(item, viewer) {
  const lat = Number(item.latitud ?? item.lat);
  const lng = Number(item.longitud ?? item.lon ?? item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const type = String(item.tipo_estructura || "").toUpperCase();
  const isLabel = type === "ETIQUETA";
  const name = item.nombre || (isLabel ? "Etiqueta" : "Edificio");

  return viewer.entities.add({
    name,
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    billboard: !isLabel ? {
      image: "img/estructuras/casa.png",
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scale: 0.08,
      scaleByDistance: SCALE_BY_DIST,
    } : undefined,
    label: labelOpts(name, isLabel ? new Cesium.Cartesian2(0, -18) : new Cesium.Cartesian2(0, 8), isLabel),
  });
}

function buildRouteEntity(route, viewer) {
  const geometry = parseGeoJsonObject(route.geometria);
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates)) return null;
  const points = geometry.coordinates
    .map(([lng, lat]) => ({ lng: Number(lng), lat: Number(lat) }))
    .filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat));
  if (points.length < 2) return null;
  return viewer.entities.add({
    name: route.nombre || "Linea tactica",
    polyline: {
      positions: toCartesianArray(points),
      width: Number(route.grosor || route.width || 3),
      material: safeCesiumColor(route.color, "#1E90FF"),
      clampToGround: true,
    },
  });
}

function buildNavRouteEntity(route, viewer) {
  const coords = route.geojson?.coordinates ?? route.geojson?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return viewer.entities.add({
    name: "Ruta de navegacion",
    polyline: {
      positions: coords.map(([lng, lat]) => Cesium.Cartesian3.fromDegrees(Number(lng), Number(lat))),
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString("#00C3FF").withAlpha(0.85),
        dashLength: 16,
      }),
      clampToGround: true,
    },
  });
}

function buildDrawingEntity(drawing, viewer) {
  const points = (drawing.puntos || [])
    .map(point => ({
      lat: Number(point.lat ?? point.latitud),
      lng: Number(point.lng ?? point.lon ?? point.longitud),
    }))
    .filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat));
  if (points.length < 2) return null;
  return viewer.entities.add({
    name: "Dibujo",
    polyline: {
      positions: toCartesianArray(points),
      width: Number(drawing.grosor || 3),
      material: safeCesiumColor(drawing.color, "#FFFFFF").withAlpha(0.9),
      clampToGround: true,
    },
  });
}

function buildTrackingEntities(viewer, events, eventType, idKey, colorHex) {
  const byId = new Map();
  for (const event of events) {
    if (event.tipo_evento !== eventType) continue;
    const payload = event.payload || {};
    const lat = Number(payload.latitud);
    const lng = Number(payload.longitud);
    const ms = Date.parse(event.occurred_at);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(ms)) continue;
    const key = String(payload[idKey] || "sin-id");
    const entry = byId.get(key) || { points: [], name: payload.apodo || payload.alias || payload.codigo_interno || payload.nombre || "" };
    entry.points.push({ ms, lat, lng });
    byId.set(key, entry);
  }

  const color = Cesium.Color.fromCssColorString(colorHex);
  for (const data of byId.values()) {
    data.points.sort((a, b) => a.ms - b.ms);
    if (!data.points.length) continue;
    const start = data.points[0];
    const initial = Cesium.Cartesian3.fromDegrees(start.lng, start.lat);

    const path = viewer.entities.add({
      name: `${data.name || "Tracking"} ruta`,
      polyline: {
        positions: [initial, initial],
        width: eventType === "tracking_vehiculo" ? 2.5 : 2,
        material: new Cesium.ColorMaterialProperty(color.withAlpha(0.65)),
        clampToGround: true,
      },
    });
    const dot = viewer.entities.add({
      name: data.name || "Tracking",
      position: initial,
      point: {
        pixelSize: eventType === "tracking_vehiculo" ? 12 : 10,
        color: color.withAlpha(0.95),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: data.name ? labelOpts(data.name, new Cesium.Cartesian2(0, -18)) : undefined,
    });

    const update = (currentMs) => {
      const visible = data.points.filter(point => point.ms <= currentMs);
      if (!visible.length) return false;
      const positions = visible.map(point => Cesium.Cartesian3.fromDegrees(point.lng, point.lat));
      path.polyline.positions = positions.length >= 2 ? positions : [positions[0], positions[0]];
      const last = visible[visible.length - 1];
      dot.position = Cesium.Cartesian3.fromDegrees(last.lng, last.lat);
      return true;
    };

    registerTimedEntity(path, start.ms, Infinity, update);
    registerTimedEntity(dot, start.ms, Infinity);
  }
}

function updateMapToTime(currentMs) {
  for (const entry of state.mapEntries) {
    const visible = currentMs >= entry.showAt && currentMs < entry.hideAt;
    entry.entity.show = visible;
    if (visible && typeof entry.update === "function") {
      entry.entity.show = entry.update(currentMs);
    }
  }
  state.viewer?.scene.requestRender?.();
}

function setReplayData(replay) {
  const eventTimes = state.events.map(event => Date.parse(event.occurred_at)).filter(Number.isFinite);
  const snapshotTimes = collectSnapshotTimes(replay);
  const operation = replay?.operacion || {};
  const timeline = replay?.timeline || {};

  state.startMs = firstFinite([
    Date.parse(timeline.inicio),
    Date.parse(operation.fecha_inicio),
    Date.parse(operation.fecha_creacion),
    minFinite(eventTimes),
    minFinite(snapshotTimes),
    Date.now(),
  ]);
  state.endMs = firstFinite([
    Date.parse(timeline.fin),
    Date.parse(operation.fecha_fin),
    Date.parse(operation.fecha_actualizacion),
    maxFinite(eventTimes),
    maxFinite(snapshotTimes),
    state.startMs + 1000,
  ]);

  if (state.endMs <= state.startMs) state.endMs = state.startMs + 1000;
  state.currentMs = state.startMs;

  replay.timeline = {
    ...(replay.timeline || {}),
    inicio: new Date(state.startMs).toISOString(),
    fin: new Date(state.endMs).toISOString(),
    eventos: state.events,
  };

  if (dom.range) {
    dom.range.min = "0";
    dom.range.max = String(Math.max(1, Math.ceil((state.endMs - state.startMs) / 1000)));
    dom.range.value = "0";
    dom.range.style.backgroundSize = "0% 100%";
  }
}

function normalizeTimelineEvents(events) {
  return events
    .map((event) => {
      const ms = eventTimestamp(event);
      if (!Number.isFinite(ms)) return null;
      return { ...event, occurred_at: new Date(ms).toISOString() };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}

function eventTimestamp(event) {
  const payload = event?.payload || {};
  return firstFinite([
    Date.parse(event?.occurred_at),
    Date.parse(payload.occurred_at),
    Date.parse(payload.fecha_envio),
    Date.parse(payload.fecha_registro),
    Date.parse(payload.fecha_creacion),
    Date.parse(payload.timestamp),
  ]);
}

function collectSnapshotTimes(replay) {
  const snapshots = replay?.snapshots || {};
  return [
    snapshots.pois, snapshots.areas, snapshots.estructuras,
    snapshots.rutas_tacticas, snapshots.rutas_navegacion, snapshots.dibujos,
  ]
    .flatMap(items => Array.isArray(items) ? items : [])
    .flatMap(item => [item.fecha_creacion, item.fecha_actualizacion, item.fecha_eliminacion, item.timestamp])
    .map(value => Date.parse(value))
    .filter(Number.isFinite);
}

function togglePlayback() {
  state.isPlaying ? pausePlayback() : startPlayback();
}

function startPlayback() {
  if (state.isPlaying) return;
  if (state.currentMs >= state.endMs) setCurrentTime(state.startMs);
  state.isPlaying = true;
  renderPlaybackState();
  state.timerId = window.setInterval(() => {
    const next = state.currentMs + (TICK_MS * state.speed);
    setCurrentTime(next);
    if (next >= state.endMs) pausePlayback();
  }, TICK_MS);
}

function pausePlayback() {
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = null;
  state.isPlaying = false;
  renderPlaybackState();
}

function seekRelative(deltaMs) {
  pausePlayback();
  setCurrentTime(state.currentMs + deltaMs);
}

function setCurrentTime(value) {
  state.currentMs = clamp(Number(value) || state.startMs, state.startMs, state.endMs);
  const elapsedMs = state.currentMs - state.startMs;
  const durationMs = Math.max(1, state.endMs - state.startMs);
  if (dom.range) {
    dom.range.value = String(Math.round(elapsedMs / 1000));
    dom.range.style.backgroundSize = `${Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100))}% 100%`;
  }
  renderTimelineTime();
  updateMapToTime(state.currentMs);
  updateChatToTime(state.currentMs);
}

function renderTopbar(replay) {
  const operation = replay?.operacion || {};
  if (dom.title) dom.title.textContent = operation.nombre || operation.codigo || `Operacion ${operation.id_operacion || ""}`;
  if (dom.status) dom.status.textContent = "Historial y Replay";
}

function renderOperationInfo(replay) {
  if (!dom.infoContent) return;
  const operation = replay?.operacion || {};
  const timeline = replay?.timeline || {};
  const snapshots = replay?.snapshots || {};
  const assignment = replay?.asignacion || {};
  const personal = assignment.personal || replay?.personal || [];
  const vehicles = assignment.vehiculos || replay?.vehiculos || [];
  const equipment = assignment.equipos || replay?.equipos || [];

  dom.infoContent.innerHTML = `
    <section class="infoSection">
      <h4>General</h4>
      <p><strong>Codigo:</strong> ${escapeHtml(operation.codigo || "-")}</p>
      <p><strong>Nombre:</strong> ${escapeHtml(operation.nombre || "Operacion")}</p>
      <p><strong>Descripcion:</strong> ${escapeHtml(operation.descripcion || "Sin descripcion disponible.")}</p>
      <p><strong>Prioridad:</strong> ${escapeHtml(operation.prioridad || "-")}</p>
      <p><strong>Estado:</strong> <span style="color:var(--accent)">${escapeHtml(operation.estado || "Historial")}</span></p>
      <p><strong>Inicio:</strong> ${escapeHtml(formatDateTime(timeline.inicio || operation.fecha_inicio))}</p>
      <p><strong>Cierre:</strong> ${escapeHtml(formatDateTime(timeline.fin || operation.fecha_fin))}</p>
      <p><strong>Eventos:</strong> ${escapeHtml(state.events.length)}</p>
    </section>
    <section class="infoSection"><h4>Personal asignado</h4>${renderMemberList(personal, formatPerson)}</section>
    <section class="infoSection"><h4>Vehiculos</h4>${renderMemberList(vehicles, formatVehicle)}</section>
    <section class="infoSection"><h4>Equipos</h4>${renderMemberList(equipment, formatEquipment)}</section>
    <section class="infoSection">
      <h4>Capas guardadas</h4>
      <p><strong>POIs:</strong> ${countOf(snapshots.pois)}</p>
      <p><strong>Areas:</strong> ${countOf(snapshots.areas)}</p>
      <p><strong>Estructuras:</strong> ${countOf(snapshots.estructuras)}</p>
      <p><strong>Rutas tacticas:</strong> ${countOf(snapshots.rutas_tacticas)}</p>
      <p><strong>Rutas navegacion:</strong> ${countOf(snapshots.rutas_navegacion)}</p>
      <p><strong>Dibujos:</strong> ${countOf(snapshots.dibujos)}</p>
    </section>
    <section class="infoSection"><h4>Grabaciones</h4>${renderRecordingList(replay.recordings || [], replay.recordingsError)}</section>
  `;
}

function renderMemberList(items, formatter) {
  if (!Array.isArray(items) || !items.length) return '<div class="historyEmpty">Sin registros.</div>';
  return `<div class="memberList">${items.map(item => `<span class="memberTag">${escapeHtml(formatter(item))}</span>`).join("")}</div>`;
}

function formatPerson(person) {
  return [formatRole(person.rol_en_operacion || person.rol), person.puesto, person.nombre, person.apellido, person.apodo].filter(Boolean).join(" ");
}

function formatVehicle(vehicle) {
  return [vehicle.tipo, vehicle.codigo_interno, vehicle.alias].filter(Boolean).join(" - ") || `Vehiculo #${vehicle.id_vehiculo || ""}`;
}

function formatEquipment(equipment) {
  return [equipment.nombre || equipment.tipo_equipo, equipment.numero_serie, equipment.categoria].filter(Boolean).join(" | ");
}

function renderRecordingList(recordings, error) {
  if (error) return `<div class="historyEmpty">No se pudieron cargar las grabaciones: ${escapeHtml(error)}</div>`;
  if (!recordings.length) return '<div class="historyEmpty">Sin grabaciones guardadas.</div>';
  return `
    <div class="memberList">
      ${recordings.map(recording => `
        <button class="btnSecondary historyRecordingDownload" type="button" data-recording-id="${escapeHtml(recording.id_recording)}">
          Stream #${escapeHtml(recording.id_stream)} - ${escapeHtml(recording.stream_label || recording.stream_kind || "Grabacion")} - Descargar
        </button>
      `).join("")}
    </div>
  `;
}

function renderChatMessages(events) {
  if (!dom.chatMessages) return;
  const chatEvents = events
    .filter(event => event.tipo_evento === "chat_mensaje")
    .filter(event => !String(event.payload?.contenido || "").includes("automaticamente por trigger"))
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));

  if (!chatEvents.length) {
    dom.chatMessages.innerHTML = '<div class="historyEmpty">Sin mensajes en el historial.</div>';
    return;
  }

  dom.chatMessages.innerHTML = chatEvents.map((event) => {
    const payload = event.payload || {};
    return `
      <div class="msg" data-ms="${Date.parse(event.occurred_at)}" style="display:none">
        <div class="msgHeader">
          <span class="msgAuthor">${escapeHtml(payload.autor_nombre || payload.nombre_usuario || payload.apodo_personal || "Tripulacion")}</span>
          <span class="msgTime">${escapeHtml(formatDateTime(event.occurred_at))}</span>
        </div>
        <div class="msgText">${escapeHtml(payload.contenido || "")}</div>
      </div>
    `;
  }).join("");
}

function updateChatToTime(currentMs) {
  if (!dom.chatMessages) return;
  let lastVisible = null;
  for (const message of dom.chatMessages.querySelectorAll("[data-ms]")) {
    const visible = Number(message.dataset.ms) <= currentMs;
    message.style.display = visible ? "" : "none";
    if (visible) lastVisible = message;
  }
  if (lastVisible) lastVisible.scrollIntoView({ block: "nearest" });
}

function renderTimelineTime() {
  if (dom.currentTime) dom.currentTime.textContent = formatClockDuration(state.currentMs - state.startMs);
  if (dom.totalTime) dom.totalTime.textContent = formatClockDuration(state.endMs - state.startMs);
  if (dom.currentDate) dom.currentDate.textContent = formatDateTime(state.currentMs);
}

function renderPlaybackState() {
  if (dom.playPause) dom.playPause.textContent = state.isPlaying ? "\u23f8" : "\u25b6";
}

function renderError(message) {
  if (dom.infoContent) dom.infoContent.innerHTML = `<div class="historyEmpty">${escapeHtml(message)}</div>`;
  if (dom.status) dom.status.textContent = "Error";
}

function attachRecordingDownloads() {
  const byId = new Map(state.recordings.map(recording => [String(recording.id_recording), recording]));
  document.querySelectorAll(".historyRecordingDownload[data-recording-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const recording = byId.get(button.dataset.recordingId);
      if (!recording) return;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Descargando";
      try {
        const response = await fetch(`${API_BASE}${recording.download_url}`, { headers: authHeaders() });
        if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = recording.original_filename || `recording_${recording.id_recording}.webm`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Error descargando grabacion", error);
        button.textContent = "Error";
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = original;
        }, 800);
      }
    });
  });
}

function getZoneCameraTarget(zone) {
  if (!zone) return null;
  const lat = finiteNumber(zone.centroide_lat, zone.center_lat, zone.latitud, zone.lat);
  const lng = finiteNumber(zone.centroide_lon, zone.centroide_lng, zone.center_lon, zone.center_lng, zone.longitud, zone.lng, zone.lon);
  const height = finiteNumber(zone.zoom_inicial, zone.zoom);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng, height: Number.isFinite(height) ? height : DEFAULT_CAMERA.height };
  }

  const ring = getPolygonRing(parseGeoJsonObject(zone.geometria ?? zone.geometry));
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const points = ring
    .map(([lngValue, latValue]) => ({ lng: Number(lngValue), lat: Number(latValue) }))
    .filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat));
  if (!points.length) return null;
  const bounds = points.reduce((acc, point) => ({
    minLat: Math.min(acc.minLat, point.lat),
    maxLat: Math.max(acc.maxLat, point.lat),
    minLng: Math.min(acc.minLng, point.lng),
    maxLng: Math.max(acc.maxLng, point.lng),
  }), { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity });
  const span = Math.max(bounds.maxLat - bounds.minLat, bounds.maxLng - bounds.minLng);
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
    height: Number.isFinite(height) ? height : clamp(span * 140000, 1000, DEFAULT_CAMERA.height),
  };
}

function parseGeoJsonObject(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try { return parseGeoJsonObject(JSON.parse(value)); } catch { return null; }
  }
  if (value.type === "Feature") return parseGeoJsonObject(value.geometry);
  return value && typeof value === "object" ? value : null;
}

function getPolygonRing(geometry) {
  if (geometry?.type === "Polygon") return geometry.coordinates?.[0];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates?.[0]?.[0];
  return null;
}

function toCartesianArray(points) {
  return points.map(point => Cesium.Cartesian3.fromDegrees(point.lng, point.lat));
}

function labelOpts(text, offset, showBackground = false, backgroundColor = Cesium.Color.BLACK) {
  return {
    text: String(text || ""),
    font: "14px sans-serif",
    pixelOffset: offset || new Cesium.Cartesian2(0, -20),
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 3,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    showBackground,
    backgroundColor: showBackground ? backgroundColor.withAlpha?.(0.7) || Cesium.Color.BLACK.withAlpha(0.7) : undefined,
    backgroundPadding: showBackground ? new Cesium.Cartesian2(6, 4) : undefined,
    scaleByDistance: SCALE_BY_DIST,
  };
}

function safeCesiumColor(value, fallback) {
  try { return Cesium.Color.fromCssColorString(value || fallback); } catch {
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
  try { return new ms.Symbol(sidc, { size, colorMode: "Light" }).asCanvas(); } catch {
    return null;
  }
}

function polygonCentroid(points) {
  if (!points.length) return null;
  const sum = points.reduce((acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

function firstFinite(values) {
  return values.find(Number.isFinite) ?? Date.now();
}

function minFinite(values) {
  return values.length ? Math.min(...values) : NaN;
}

function maxFinite(values) {
  return values.length ? Math.max(...values) : NaN;
}

function finiteNumber(...values) {
  for (const value of values) {
    if (value == null || String(value).trim() === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function countOf(value) {
  return Array.isArray(value) ? value.length : 0;
}

function formatRole(value) {
  const role = String(value || "").trim().toUpperCase();
  return role ? `(${role})` : "";
}

function formatClockDuration(value) {
  const totalSeconds = Math.floor(Math.max(0, Number(value) || 0) / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds / 60) % 60)).padStart(2, "0");
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatDateTime(value) {
  if (!value && value !== 0) return "--:--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleString("es-MX", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}
