// =================== SESION ===================
const session = localStorage.getItem("session");
if (session !== "ok") window.location.href = "login.html";

const username = localStorage.getItem("username") || "admin";
document.getElementById("who").textContent = `(${username})`;

document.getElementById("logout").onclick = () => {
  localStorage.removeItem("session");
  localStorage.removeItem("username");
  window.location.href = "login.html";
};

// =================== STORAGE ===================
const OPS_KEY = "ops";                 // lista visible en dashboard
const HISTORY_KEY = "ops_history";     // historial "para siempre"

let operations = JSON.parse(localStorage.getItem(OPS_KEY) || "[]");
let historyOps = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");

// =================== CESIUM + OSRM ===================
let viewer;

let pickMode = null;      // "start" | "end" | null
let startPoint = null;    // { lat, lng }
let endPoint = null;      // { lat, lng }
let lastRoute = null;     // OSRM route

let startEntity = null;
let endEntity = null;
let routeEntity = null;

const OSRM_BASE = "https://router.project-osrm.org";

// Providers gratis (sin token)
const providers = {
  osm: new Cesium.OpenStreetMapImageryProvider({ url: "https://a.tile.openstreetmap.org/" }),
  toner: new Cesium.UrlTemplateImageryProvider({
    url: "https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png",
    credit: "Map tiles by Stamen Design"
  }),
  watercolor: new Cesium.UrlTemplateImageryProvider({
    url: "https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg",
    credit: "Map tiles by Stamen Design"
  })
};

// =================== MENU TACTICO (MILSTD + MARCADORES) ===================
let tacticalEntities = [];
let placingMode = false;
let toolMode = "none"; // "mil" | "bldg" | "none"

const toolSelect = document.getElementById("toolSelect");
const milPreset = document.getElementById("milPreset");
const symLabel = document.getElementById("symLabel");
const placeBtn = document.getElementById("placeBtn");
const cancelPlace = document.getElementById("cancelPlace");
const clearTactical = document.getElementById("clearTactical");
const tbHint = document.getElementById("tbHint");

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

milPreset.addEventListener("change", () => setTacticalUI());

placeBtn.addEventListener("click", () => {
  if (toolMode === "mil" && !milPreset.value) return;
  placingMode = true;
  tbHint.textContent = "Modo colocar activo  Haz click en el mapa para colocar.";
});

cancelPlace.addEventListener("click", () => {
  placingMode = false;
  tbHint.textContent = "Cancelado. Selecciona 'Colocar' cuando quieras poner otro.";
});

clearTactical.addEventListener("click", () => {
  tacticalEntities.forEach(ent => viewer.entities.remove(ent));
  tacticalEntities = [];
  tbHint.textContent = "Símbolos limpiados.";
});

function handleTacticalPlacement(lat, lng) {
  if (!placingMode || toolMode === "none") return false;

  // ===== MILSTD 2525C =====
  if (toolMode === "mil") {
    const sidc = milPreset.value;
    const label = (symLabel.value || "").trim();

    // Genera el símbolo como SVG (milsymbol)
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
    tbHint.textContent = "Símbolo colocado ";
    setTacticalUI();
    return true;
  }

  // ===== EDIFICIO / MARCADOR =====
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
    tbHint.textContent = "Marcador colocado ";
    setTacticalUI();
    return true;
  }

  return false;
}

// =================== INIT CESIUM ===================
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

  // Layer selector
  document.getElementById("layerSelect").addEventListener("change", (e) => {
    setBaseLayer(e.target.value);
  });

  // Mode selector
  document.getElementById("modeSelect").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "3d") viewer.scene.mode = Cesium.SceneMode.SCENE3D;
    if (v === "2d") viewer.scene.mode = Cesium.SceneMode.SCENE2D;
    if (v === "columbus") viewer.scene.mode = Cesium.SceneMode.COLUMBUS_VIEW;
  });

  // Click handler (UNO SOLO)
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

    //  1) Primero: colocar símbolos si está activo
    if (handleTacticalPlacement(lat, lng)) return;

    //  2) Luego: ORIGEN/DESTINO
    if (pickMode === "start") {
      startPoint = { lat, lng };
      lastRoute = null;

      document.getElementById("opLat").value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      if (startEntity) viewer.entities.remove(startEntity);
      startEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        point: { pixelSize: 12, color: Cesium.Color.LIME },
        label: {
          text: "ORIGEN",
          font: "14px sans-serif",
          fillColor: Cesium.Color.WHITE,
          pixelOffset: new Cesium.Cartesian2(0, -24),
        }
      });

      pickMode = null;
      setRouteInfo("Origen seleccionado. Ahora elige DESTINO.");
      return;
    }

    if (pickMode === "end") {
      endPoint = { lat, lng };
      lastRoute = null;

      document.getElementById("opLng").value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      if (endEntity) viewer.entities.remove(endEntity);
      endEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        point: { pixelSize: 12, color: Cesium.Color.YELLOW },
        label: {
          text: "DESTINO",
          font: "14px sans-serif",
          fillColor: Cesium.Color.WHITE,
          pixelOffset: new Cesium.Cartesian2(0, -24),
        }
      });

      pickMode = null;
      setRouteInfo("Destino seleccionado. Ya puedes calcular ruta.");
      return;
    }

  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  renderOps();
  setTacticalUI();
}

window.addEventListener("load", initCesium);

function setBaseLayer(key) {
  const provider = providers[key];
  if (!provider) return;
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(provider);
}

// =================== BOTÓN HISTORIAL ===================
document.getElementById("goHistory").onclick = () => {
  window.location.href = "historial.html";
};

// =================== BOTONES ORIGEN/DESTINO/RUTA ===================
document.getElementById("setStart").onclick = () => {
  pickMode = "start";
  setRouteInfo("Modo ORIGEN activo: haz click en el mapa.");
};

document.getElementById("setEnd").onclick = () => {
  pickMode = "end";
  setRouteInfo("Modo DESTINO activo: haz click en el mapa.");
};

document.getElementById("clearRoute").onclick = () => {
  lastRoute = null;

  if (routeEntity) viewer.entities.remove(routeEntity);
  routeEntity = null;

  document.getElementById("opLat").value = "";
  document.getElementById("opLng").value = "";

  setRouteInfo("Ruta limpia.");
};

document.getElementById("calcRoute").onclick = async () => {
  if (!startPoint || !endPoint) {
    setRouteInfo("Selecciona ORIGEN y DESTINO primero.");
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
    setRouteInfo(`Ruta lista  Distancia: ${km.toFixed(2)} km · Tiempo: ${min.toFixed(1)} min`);
  } catch (err) {
    setRouteInfo(`Error OSRM: ${err.message}`);
  }
};

// =================== GUARDAR OPERACIÓN (DASHBOARD + HISTORIAL) ===================
document.getElementById("saveOp").onclick = () => {
  const msg = document.getElementById("opsMsg");
  msg.textContent = "";

  const title = document.getElementById("opTitle").value.trim();
  const description = document.getElementById("opDesc").value.trim();

  if (!startPoint || !endPoint) {
    msg.textContent = "Primero selecciona ORIGEN y DESTINO.";
    return;
  }
  if (!lastRoute) {
    msg.textContent = "Primero calcula la ruta (OSRM).";
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

  // dashboard
  operations.unshift(op);
  localStorage.setItem(OPS_KEY, JSON.stringify(operations));

  // historial para siempre
  historyOps.unshift(op);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyOps));

  document.getElementById("opTitle").value = "";
  document.getElementById("opDesc").value = "";

  renderOps();
};

document.getElementById("clearOps").onclick = () => {
  // solo limpia el dashboard (no el historial)
  operations = [];
  localStorage.setItem(OPS_KEY, "[]");
  renderOps();
};

// =================== OSRM ===================
async function getOsrmRoute(start, end) {
  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${start.lng},${start.lat};${end.lng},${end.lat}` +
    `?overview=full&geometries=geojson`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo obtener ruta (OSRM)");

  const data = await r.json();
  if (!data.routes || !data.routes.length) throw new Error("No hay ruta disponible");

  return data.routes[0];
}

// =================== RUTA EN CESIUM ===================
function drawRouteOnCesium(geojsonLineString) {
  const coords = geojsonLineString.coordinates;
  const positions = coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));

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

function setRouteInfo(text) {
  document.getElementById("routeInfo").textContent = text;
}

// =================== LISTA OPS (DASHBOARD) ===================
function renderOps() {
  const list = document.getElementById("opsList");
  list.innerHTML = "";

  operations.forEach(op => {
    const km = (op.route?.distance ?? 0) / 1000;
    const min = (op.route?.duration ?? 0) / 60;

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <strong>${escapeHtml(op.title)}</strong><br/>
      <span>${escapeHtml(op.description || "")}</span>
      <div class="meta">
        Origen: (${op.start.lat.toFixed(5)}, ${op.start.lng.toFixed(5)})<br/>
        Destino: (${op.end.lat.toFixed(5)}, ${op.end.lng.toFixed(5)})<br/>
        Ruta: ${km.toFixed(2)} km · ${min.toFixed(1)} min<br/>
        ${new Date(op.created_at).toLocaleString()}
      </div>
      <div class="btns">
        <button data-view="${op.id}">Ver ruta</button>
        <button data-del="${op.id}">Eliminar</button>
      </div>
    `;

    div.querySelector(`[data-view="${op.id}"]`).onclick = () => {
      if (op.route?.geometry) {
        drawRouteOnCesium(op.route.geometry);
        zoomToRoute(op.route.geometry);
        setRouteInfo(`Mostrando: ${op.title}`);
      }
    };

    // elimina SOLO del dashboard (NO del historial)
    div.querySelector(`[data-del="${op.id}"]`).onclick = () => {
      operations = operations.filter(x => x.id !== op.id);
      localStorage.setItem(OPS_KEY, JSON.stringify(operations));
      renderOps();
    };

    list.appendChild(div);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

