// =================== TOKEN CESIUM ION ===================
// Reemplaza este valor con tu token real de Cesium ion.
Cesium.Ion.defaultAccessToken = "TU_TOKEN_DE_CESIUM_ION";

// =================== SESION ===================
const session = localStorage.getItem("session");
if (session !== "ok") {
  window.location.href = "login.html";
}

const username = localStorage.getItem("username") || "admin";
document.getElementById("who").textContent = `(${username})`;

document.getElementById("logout").onclick = () => {
  localStorage.removeItem("session");
  localStorage.removeItem("username");
  window.location.href = "login.html";
};

// =================== STORAGE ===================
const OPS_KEY = "ops";
const HISTORY_KEY = "ops_history";
const OPERACION_ACTUAL_KEY = "operacion_actual";
const ASIGNACION_ACTUAL_KEY = "asignacion_actual";

let operations = JSON.parse(localStorage.getItem(OPS_KEY) || "[]");
let historyOps = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");

// =================== CESIUM + OSRM ===================
let viewer;

let pickMode = null;
let startPoint = null;
let endPoint = null;
let lastRoute = null;

let startEntity = null;
let endEntity = null;
let routeEntity = null;

const OSRM_BASE = "https://router.project-osrm.org";

// Providers
const providers = {
  osm: new Cesium.OpenStreetMapImageryProvider({
    url: "https://a.tile.openstreetmap.org/"
  }),
  toner: new Cesium.UrlTemplateImageryProvider({
    url: "https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png",
    credit: "Map tiles by Stamen Design"
  }),
  watercolor: new Cesium.UrlTemplateImageryProvider({
    url: "https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg",
    credit: "Map tiles by Stamen Design"
  })
};

// =================== MENU TACTICO ===================
let tacticalEntities = [];
let placingMode = false;
let toolMode = "none";

const toolSelect = document.getElementById("toolSelect");
const milPreset = document.getElementById("milPreset");
const symLabel = document.getElementById("symLabel");
const placeBtn = document.getElementById("placeBtn");
const cancelPlace = document.getElementById("cancelPlace");
const clearTactical = document.getElementById("clearTactical");
const tbHint = document.getElementById("tbHint");

// =================== PANELES ===================
const infoPanel = document.getElementById("infoPanel");
const routePanel = document.getElementById("routePanel");
const tacticalPanel = document.getElementById("tacticalPanel");

const toggleInfoPanel = document.getElementById("toggleInfoPanel");
const toggleRoutePanel = document.getElementById("toggleRoutePanel");
const toggleTacticalPanel = document.getElementById("toggleTacticalPanel");

function closeAllPanels() {
  infoPanel.classList.remove("open");
  routePanel.classList.remove("open");
  tacticalPanel.classList.remove("open");

  toggleInfoPanel.classList.remove("active");
  toggleRoutePanel.classList.remove("active");
  toggleTacticalPanel.classList.remove("active");
}

function togglePanel(panel, button) {
  const wasOpen = panel.classList.contains("open");
  closeAllPanels();

  if (!wasOpen) {
    panel.classList.add("open");
    button.classList.add("active");
  }
}

toggleInfoPanel.addEventListener("click", () => togglePanel(infoPanel, toggleInfoPanel));
toggleRoutePanel.addEventListener("click", () => togglePanel(routePanel, toggleRoutePanel));
toggleTacticalPanel.addEventListener("click", () => togglePanel(tacticalPanel, toggleTacticalPanel));

// =================== UTIL ===================
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function getJsonStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function setRouteInfo(text) {
  document.getElementById("routeInfo").textContent = text;
}

function formatCoord(point) {
  if (!point || typeof point.lat !== "number" || typeof point.lng !== "number") {
    return "No definido";
  }
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

// =================== PANEL INFORMACION ===================
function renderInfoPanel() {
  const container = document.getElementById("infoPanelContent");
  if (!container) return;

  const operacion = getJsonStorage(OPERACION_ACTUAL_KEY, {});
  const asignacion = getJsonStorage(ASIGNACION_ACTUAL_KEY, {});

  const personal = Array.isArray(asignacion.personal) ? asignacion.personal : [];
  const vehiculos = Array.isArray(asignacion.vehiculos) ? asignacion.vehiculos : [];
  const equipos = Array.isArray(asignacion.equipos) ? asignacion.equipos : [];

  const titulo = operacion.title || operacion.titulo || "Sin título";
  const descripcion = operacion.description || operacion.descripcion || "Sin descripción";

  const origen = operacion.start || operacion.origen || null;
  const destino = operacion.end || operacion.destino || null;

  const distancia = operacion.route?.distance
    ? `${(operacion.route.distance / 1000).toFixed(2)} km`
    : (operacion.ruta?.distancia ? `${operacion.ruta.distancia} km` : "No calculada");

  const duracion = operacion.route?.duration
    ? `${(operacion.route.duration / 60).toFixed(1)} min`
    : (operacion.ruta?.duracion ? `${operacion.ruta.duracion} min` : "No calculada");

  const fecha = operacion.created_at
    ? new Date(operacion.created_at).toLocaleString()
    : "No disponible";

  container.innerHTML = `
    <div class="infoBlock">
      <h3>Operación</h3>
      <p><strong>Título:</strong> ${escapeHtml(titulo)}</p>
      <p><strong>Descripción:</strong> ${escapeHtml(descripcion)}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(fecha)}</p>
    </div>

    <div class="infoBlock">
      <h3>Ruta</h3>
      <p><strong>Origen:</strong> ${escapeHtml(formatCoord(origen))}</p>
      <p><strong>Destino:</strong> ${escapeHtml(formatCoord(destino))}</p>
      <p><strong>Distancia:</strong> ${escapeHtml(distancia)}</p>
      <p><strong>Duración:</strong> ${escapeHtml(duracion)}</p>
    </div>

    <div class="infoBlock">
      <h3>Personal asignado</h3>
      ${
        personal.length
          ? personal.map(p => `
            <div class="miniCard">
              <p><strong>Nombre:</strong> ${escapeHtml(p.nombre || p.name || "")}</p>
              <p><strong>Cargo:</strong> ${escapeHtml(p.cargo || p.rol || "")}</p>
              <p><strong>Grupo:</strong> ${escapeHtml(p.grupo || p.team || "")}</p>
            </div>
          `).join("")
          : `<p>Sin personal asignado.</p>`
      }
    </div>

    <div class="infoBlock">
      <h3>Vehículos asignados</h3>
      ${
        vehiculos.length
          ? vehiculos.map(v => `
            <div class="miniCard">
              <p><strong>Unidad:</strong> ${escapeHtml(v.unidad || v.nombre || "")}</p>
              <p><strong>Tipo:</strong> ${escapeHtml(v.tipo || "")}</p>
              <p><strong>Placas:</strong> ${escapeHtml(v.placas || "")}</p>
              <p><strong>CET / Flotilla:</strong> ${escapeHtml(v.cet || v.flotilla || "")}</p>
            </div>
          `).join("")
          : `<p>Sin vehículos asignados.</p>`
      }
    </div>

    <div class="infoBlock">
      <h3>Equipos asignados</h3>
      ${
        equipos.length
          ? equipos.map(e => `
            <div class="miniCard">
              <p><strong>Nombre:</strong> ${escapeHtml(e.nombre || "")}</p>
              <p><strong>Código:</strong> ${escapeHtml(e.codigo || e.codigoInterno || "")}</p>
              <p><strong>Cantidad:</strong> ${escapeHtml(String(e.cantidad || 1))}</p>
              <p><strong>Vehículo:</strong> ${escapeHtml(e.vehiculo || e.asignadoA || "")}</p>
            </div>
          `).join("")
          : `<p>Sin equipos asignados.</p>`
      }
    </div>
  `;
}

// =================== TACTICAL UI ===================
function setTacticalUI() {
  const isMil = toolMode === "mil";
  const isBldg = toolMode === "bldg";

  milPreset.disabled = !isMil;
  symLabel.disabled = !(isMil || isBldg);
  placeBtn.disabled = (toolMode === "none") || (isMil && !milPreset.value);

  if (toolMode === "none") tbHint.textContent = "Selecciona una herramienta para comenzar.";
  if (toolMode === "mil") tbHint.textContent = "Elige un símbolo y presiona 'Colocar'. Luego haz click en el mapa.";
  if (toolMode === "bldg") tbHint.textContent = "Escribe etiqueta y presiona 'Colocar'. Luego haz click en el mapa.";
}

toolSelect.addEventListener("change", (e) => {
  toolMode = e.target.value;
  placingMode = false;
  setTacticalUI();
});

milPreset.addEventListener("change", setTacticalUI);

placeBtn.addEventListener("click", () => {
  if (toolMode === "mil" && !milPreset.value) return;
  placingMode = true;
  tbHint.textContent = "Modo colocar activo. Haz click en el mapa para colocar.";
});

cancelPlace.addEventListener("click", () => {
  placingMode = false;
  tbHint.textContent = "Cancelado. Selecciona 'Colocar' cuando quieras poner otro.";
});

clearTactical.addEventListener("click", () => {
  if (!viewer) return;
  tacticalEntities.forEach(ent => viewer.entities.remove(ent));
  tacticalEntities = [];
  tbHint.textContent = "Símbolos limpiados.";
});

function handleTacticalPlacement(lat, lng) {
  if (!placingMode || toolMode === "none") return false;

  if (toolMode === "mil") {
    const sidc = milPreset.value;
    const label = (symLabel.value || "").trim();

    const sym = new ms.Symbol(sidc, { size: 40 });
    const svg = sym.asSVG();
    const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      billboard: {
        image: dataUrl,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scale: 1
      },
      label: label ? {
        text: label,
        font: "14px sans-serif",
        pixelOffset: new Cesium.Cartesian2(0, -50),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      } : undefined
    });

    tacticalEntities.push(ent);
    placingMode = false;
    tbHint.textContent = "Símbolo colocado.";
    setTacticalUI();
    return true;
  }

  if (toolMode === "bldg") {
    const label = (symLabel.value || "Edificio").trim();

    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      point: {
        pixelSize: 10,
        color: Cesium.Color.ORANGE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      },
      label: {
        text: label,
        font: "14px sans-serif",
        pixelOffset: new Cesium.Cartesian2(0, -20),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    });

    tacticalEntities.push(ent);
    placingMode = false;
    tbHint.textContent = "Marcador colocado.";
    setTacticalUI();
    return true;
  }

  return false;
}

// =================== INIT MAPA ===================
function initCesium() {
  viewer = new Cesium.Viewer("map", {
    timeline: false,
    animation: false,
    geocoder: true,
    baseLayerPicker: false,
    sceneModePicker: false,
    navigationHelpButton: true,
    homeButton: true,
    fullscreenButton: false
  });

  setBaseLayer("osm");

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-99.1332, 19.4326, 2500000)
  });

  document.getElementById("layerSelect").addEventListener("change", (e) => {
    setBaseLayer(e.target.value);
  });

  document.getElementById("modeSelect").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "3d") viewer.scene.mode = Cesium.SceneMode.SCENE3D;
    if (v === "2d") viewer.scene.mode = Cesium.SceneMode.SCENE2D;
    if (v === "columbus") viewer.scene.mode = Cesium.SceneMode.COLUMBUS_VIEW;
  });

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement) => {
    const cartesian = viewer.camera.pickEllipsoid(
      movement.position,
      viewer.scene.globe.ellipsoid
    );
    if (!cartesian) return;

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lng = Cesium.Math.toDegrees(cartographic.longitude);

    if (handleTacticalPlacement(lat, lng)) return;

    if (pickMode === "start") {
      startPoint = { lat, lng };
      lastRoute = null;

      document.getElementById("opLat").value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      if (routeEntity) {
        viewer.entities.remove(routeEntity);
        routeEntity = null;
      }

      if (startEntity) viewer.entities.remove(startEntity);
      startEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        point: {
          pixelSize: 12,
          color: Cesium.Color.LIME
        },
        label: {
          text: "ORIGEN",
          font: "14px sans-serif",
          fillColor: Cesium.Color.WHITE,
          pixelOffset: new Cesium.Cartesian2(0, -24)
        }
      });

      pickMode = null;
      setRouteInfo("Origen seleccionado. Ahora elige destino.");
      return;
    }

    if (pickMode === "end") {
      endPoint = { lat, lng };
      lastRoute = null;

      document.getElementById("opLng").value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      if (routeEntity) {
        viewer.entities.remove(routeEntity);
        routeEntity = null;
      }

      if (endEntity) viewer.entities.remove(endEntity);
      endEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        point: {
          pixelSize: 12,
          color: Cesium.Color.YELLOW
        },
        label: {
          text: "DESTINO",
          font: "14px sans-serif",
          fillColor: Cesium.Color.WHITE,
          pixelOffset: new Cesium.Cartesian2(0, -24)
        }
      });

      pickMode = null;
      setRouteInfo("Destino seleccionado. Ya puedes calcular ruta.");
      return;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function setBaseLayer(key) {
  const provider = providers[key];
  if (!provider || !viewer) return;

  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(provider);
}

// =================== BOTONES DE RUTA ===================
document.getElementById("setStart").onclick = () => {
  pickMode = "start";
  setRouteInfo("Modo origen activo: haz click en el mapa.");
  routePanel.classList.add("open");
  toggleRoutePanel.classList.add("active");
};

document.getElementById("setEnd").onclick = () => {
  pickMode = "end";
  setRouteInfo("Modo destino activo: haz click en el mapa.");
  routePanel.classList.add("open");
  toggleRoutePanel.classList.add("active");
};

document.getElementById("clearRoute").onclick = () => {
  lastRoute = null;
  startPoint = null;
  endPoint = null;
  pickMode = null;

  if (routeEntity) viewer.entities.remove(routeEntity);
  if (startEntity) viewer.entities.remove(startEntity);
  if (endEntity) viewer.entities.remove(endEntity);

  routeEntity = null;
  startEntity = null;
  endEntity = null;

  document.getElementById("opLat").value = "";
  document.getElementById("opLng").value = "";

  setRouteInfo("Ruta y puntos limpiados.");
};

document.getElementById("calcRoute").onclick = async () => {
  if (!startPoint || !endPoint) {
    setRouteInfo("Selecciona origen y destino primero.");
    return;
  }

  setRouteInfo("Calculando ruta con OSRM...");

  try {
    const route = await getOsrmRoute(startPoint, endPoint);
    lastRoute = route;

    drawRouteOnCesium(route.geometry);
    zoomToRoute(route.geometry);

    const km = route.distance / 1000;
    const min = route.duration / 60;

    setRouteInfo(`Ruta lista. Distancia: ${km.toFixed(2)} km · Tiempo: ${min.toFixed(1)} min`);
  } catch (err) {
    setRouteInfo(`Error OSRM: ${err.message}`);
  }
};

// =================== GUARDAR OPERACION ===================
document.getElementById("saveOp").onclick = () => {
  const msg = document.getElementById("opsMsg");
  msg.textContent = "";

  const title = document.getElementById("opTitle").value.trim();
  const description = document.getElementById("opDesc").value.trim();

  if (!startPoint || !endPoint) {
    msg.textContent = "Primero selecciona origen y destino.";
    return;
  }

  if (!lastRoute) {
    msg.textContent = "Primero calcula la ruta.";
    return;
  }

  if (!title) {
    msg.textContent = "Pon un título para guardar la operación.";
    return;
  }

  const op = {
    id: crypto.randomUUID(),
    title,
    description,
    start: startPoint,
    end: endPoint,
    route: lastRoute,
    created_at: new Date().toISOString()
  };

  operations.unshift(op);
  localStorage.setItem(OPS_KEY, JSON.stringify(operations));

  historyOps.unshift(op);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyOps));

  localStorage.setItem(OPERACION_ACTUAL_KEY, JSON.stringify(op));

  document.getElementById("opTitle").value = "";
  document.getElementById("opDesc").value = "";

  renderInfoPanel();
  msg.textContent = "Operación guardada correctamente.";
};

document.getElementById("clearOps").onclick = () => {
  localStorage.removeItem(OPERACION_ACTUAL_KEY);

  document.getElementById("opTitle").value = "";
  document.getElementById("opDesc").value = "";
  document.getElementById("opLat").value = "";
  document.getElementById("opLng").value = "";
  document.getElementById("opsMsg").textContent = "Operación actual eliminada.";

  lastRoute = null;
  startPoint = null;
  endPoint = null;

  if (routeEntity) viewer.entities.remove(routeEntity);
  if (startEntity) viewer.entities.remove(startEntity);
  if (endEntity) viewer.entities.remove(endEntity);

  routeEntity = null;
  startEntity = null;
  endEntity = null;

  renderInfoPanel();
};

document.getElementById("goHistory").onclick = () => {
  window.location.href = "historial.html";
};

// =================== OSRM ===================
async function getOsrmRoute(start, end) {
  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${start.lng},${start.lat};${end.lng},${end.lat}` +
    `?overview=full&geometries=geojson`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo obtener ruta");

  const data = await r.json();
  if (!data.routes || !data.routes.length) {
    throw new Error("No hay ruta disponible");
  }

  return data.routes[0];
}

// =================== DIBUJO RUTA ===================
function drawRouteOnCesium(geojsonLineString) {
  const coords = geojsonLineString.coordinates;
  const positions = coords.map(([lon, lat]) =>
    Cesium.Cartesian3.fromDegrees(lon, lat)
  );

  if (routeEntity) viewer.entities.remove(routeEntity);

  routeEntity = viewer.entities.add({
    polyline: {
      positions,
      width: 5,
      material: Cesium.Color.CYAN.withAlpha(0.9),
      clampToGround: true
    }
  });
}

function zoomToRoute(geojsonLineString) {
  const coords = geojsonLineString.coordinates;
  let west = 180, east = -180, south = 90, north = -90;

  for (const [lon, lat] of coords) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  const rect = Cesium.Rectangle.fromDegrees(west, south, east, north);
  viewer.camera.flyTo({ destination: rect });
}

// =================== CARGA DE OPERACION ACTUAL ===================
function loadCurrentOperationOnMap() {
  const op = getJsonStorage(OPERACION_ACTUAL_KEY, null);
  if (!op || !viewer) return;

  if (op.start && op.end) {
    startPoint = op.start;
    endPoint = op.end;
    lastRoute = op.route || null;

    document.getElementById("opTitle").value = op.title || "";
    document.getElementById("opDesc").value = op.description || "";
    document.getElementById("opLat").value = `${op.start.lat.toFixed(5)}, ${op.start.lng.toFixed(5)}`;
    document.getElementById("opLng").value = `${op.end.lat.toFixed(5)}, ${op.end.lng.toFixed(5)}`;

    if (startEntity) viewer.entities.remove(startEntity);
    if (endEntity) viewer.entities.remove(endEntity);

    startEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(op.start.lng, op.start.lat),
      point: {
        pixelSize: 12,
        color: Cesium.Color.LIME
      },
      label: {
        text: "ORIGEN",
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(0, -24)
      }
    });

    endEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(op.end.lng, op.end.lat),
      point: {
        pixelSize: 12,
        color: Cesium.Color.YELLOW
      },
      label: {
        text: "DESTINO",
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(0, -24)
      }
    });

    if (op.route?.geometry) {
      drawRouteOnCesium(op.route.geometry);
      zoomToRoute(op.route.geometry);
      setRouteInfo(`Mostrando operación actual: ${op.title}`);
    } else {
      setRouteInfo("Operación cargada. Falta ruta calculada.");
    }
  }
}

// =================== INIT GENERAL ===================
window.addEventListener("load", () => {
  initCesium();
  setTacticalUI();
  renderInfoPanel();
  loadCurrentOperationOnMap();

  infoPanel.classList.add("open");
  toggleInfoPanel.classList.add("active");
});

// =================== CERRAR PANELES AL DAR CLICK FUERA ===================
document.addEventListener("click", (e) => {
  const clickedInsidePanel = e.target.closest(".glassPanel");
  const clickedToolButton = e.target.closest(".toolFab");

  if (!clickedInsidePanel && !clickedToolButton) {
    closeAllPanels();
  }
});

