// =================== TOKEN CESIUM ION ===================
// Reemplaza este valor con tu token real de Cesium ion.
// Si no usas Cesium ion, puedes dejarlo así, pero verás warnings 401 en consola.
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmMjQ3NDAzYi1mNDYyLTQzYTgtOTNiOC02MGE1YmJhOGYwYjQiLCJpZCI6NDAwOTM3LCJpYXQiOjE3NzQ1NDYwNjZ9.Phla8axJI8tGCSQwfvmvykzxW2tHXcuc0q1D5n01BmU";

// =================== HELPERS OPERACION ACTIVA ===================
function getActiveOperationId() {
  const id = localStorage.getItem("active_operation_id");

  if (!id) {
    throw new Error("No hay operación seleccionada.");
  }

  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("El id de operación activa no es válido.");
  }

  return num;
}

// =================== SESION ===================
const session = localStorage.getItem("session");
if (session !== "ok") {
  window.location.href = "login.html";
}

const API_BASE =
  localStorage.getItem("API_BASE") ||
  `http://${window.location.hostname}:3001`;

const token = localStorage.getItem("token") || "";
const username = localStorage.getItem("username") || "admin";

document.getElementById("who").textContent = `(${username})`;

document.getElementById("logout").onclick = () => {
  localStorage.removeItem("session");
  localStorage.removeItem("username");
  localStorage.removeItem("token");
  localStorage.removeItem("active_operation_id");
  window.location.href = "login.html";
};

// =================== STORAGE ===================
const OPS_KEY = "ops";
const HISTORY_KEY = "ops_history";
const OPERACION_ACTUAL_KEY = "operacion_actual";
const ASIGNACION_ACTUAL_KEY = "asignacion_actual";

let operations = JSON.parse(localStorage.getItem(OPS_KEY) || "[]");
let historyOps = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");

// =================== DATA BACKEND ===================
let dashboardData = null;

// =================== CESIUM + OSRM ===================
let viewer;

let pickMode = null;
let startPoint = null;
let endPoint = null;
let lastRoute = null;
let myRouteId = null; 

let startEntity = null;
let endEntity = null;
let routeEntity = null;

let personalEntities = [];
let vehiculoEntities = [];
let equipoEntities = [];
let zonaEntity = null;

let socket = null;
let rutasNavegacionEntities = new Map();

const OSRM_BASE = "http://192.168.202.103:5000";

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
  const el = document.getElementById("routeInfo");
  if (el) el.textContent = text;
}

function formatCoord(point) {
  if (!point || typeof point.lat !== "number" || typeof point.lng !== "number") {
    return "No definido";
  }
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

function toNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstString(...values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function firstNumber(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function formatDateText(value) {
  if (!value) return "No disponible";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function getLatLonFromItem(item) {
  const lat = firstNumber(
    item?.latitud,
    item?.lat,
    item?.latitude,
    item?.posicion?.latitud,
    item?.posicion?.lat
  );

  const lon = firstNumber(
    item?.longitud,
    item?.lon,
    item?.lng,
    item?.longitude,
    item?.posicion?.longitud,
    item?.posicion?.lon,
    item?.posicion?.lng
  );

  if (lat == null || lon == null) return null;
  return { lat, lon };
}

// =================== BACKEND ===================
async function fetchDashboardDataFromBackend() {
  const opId = getActiveOperationId();

  if (!token) {
    throw new Error("No hay token de sesión.");
  }

  async function getJson(url, allow404 = false) {
    let res;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
    } catch {
      throw new Error(`No se pudo conectar con ${url}`);
    }

    const data = await res.json().catch(() => ({}));

    if (allow404 && res.status === 404) {
      return null;
    }

    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("session");
      localStorage.removeItem("token");
      localStorage.removeItem("active_operation_id");
      throw new Error(data?.mensaje || "Tu sesión expiró. Inicia sesión nuevamente.");
    }

    if (!res.ok) {
      throw new Error(data?.mensaje || `Error ${res.status} en ${url}`);
    }

    return data;
  }

  const [
    operacionRes,
    zonaRes,
    personalRes,
    vehiculosRes,
    equiposRes
  ] = await Promise.all([
    getJson(`${API_BASE}/ops/${opId}`),
    getJson(`${API_BASE}/ops/${opId}/zona`, true),
    getJson(`${API_BASE}/ops/${opId}/personal`, true),
    getJson(`${API_BASE}/ops/${opId}/vehiculos-asignados`, true),
    getJson(`${API_BASE}/ops/${opId}/equipos-asignados`, true)
  ]);

  dashboardData = {
    ok: true,
    operacion: operacionRes || {},
    zona_operacion: zonaRes?.zona || null,
    personal: Array.isArray(personalRes?.items) ? personalRes.items : [],
    vehiculos: Array.isArray(vehiculosRes?.items) ? vehiculosRes.items : [],
    equipos: Array.isArray(equiposRes?.items) ? equiposRes.items : []
  };

  return dashboardData;
}

// =================== NORMALIZACION DATA ===================
function getOperacionData() {
  return dashboardData?.operacion || {};
}

function getZonaData() {
  return dashboardData?.zona_operacion || {};
}

function getPersonalData() {
  return Array.isArray(dashboardData?.personal) ? dashboardData.personal : [];
}

function getVehiculosData() {
  return Array.isArray(dashboardData?.vehiculos) ? dashboardData.vehiculos : [];
}

function getEquiposData() {
  return Array.isArray(dashboardData?.equipos) ? dashboardData.equipos : [];
}

// =================== PANEL INFORMACION ===================
function renderInfoPanel() {
  const container = document.getElementById("infoPanelContent");
  if (!container) return;

  const operacion = getOperacionData();
  const zona = getZonaData();
  const personal = getPersonalData();
  const vehiculos = getVehiculosData();
  const equipos = getEquiposData();

  const titulo = firstString(
    operacion.nombre,
    operacion.title,
    operacion.titulo,
    "Sin título"
  );

  const codigo = firstString(operacion.codigo, "Sin código");
  const descripcion = firstString(
    operacion.descripcion,
    operacion.description,
    "Sin descripción"
  );

  const prioridad = firstString(operacion.prioridad, "No definida");
  const estado = firstString(operacion.estado, operacion.status, "No definido");
  const fechaInicio = formatDateText(operacion.fecha_inicio || operacion.fechaInicio);
  const fechaFin = formatDateText(operacion.fecha_fin || operacion.fechaFin);

  const centroideLat = firstNumber(zona.centroide_lat, zona.lat, zona.latitude);
  const centroideLon = firstNumber(zona.centroide_lon, zona.lon, zona.lng, zona.longitude);
  const zoomInicial = firstNumber(zona.zoom_inicial, zona.zoom, 8000);

  container.innerHTML = `
    <div class="infoBlock">
      <h3>Operación</h3>
      <p><strong>Nombre:</strong> ${escapeHtml(titulo)}</p>
      <p><strong>Código:</strong> ${escapeHtml(codigo)}</p>
      <p><strong>Descripción:</strong> ${escapeHtml(descripcion)}</p>
      <p><strong>Prioridad:</strong> ${escapeHtml(prioridad)}</p>
      <p><strong>Estado:</strong> ${escapeHtml(estado)}</p>
      <p><strong>Fecha inicio:</strong> ${escapeHtml(fechaInicio)}</p>
      <p><strong>Fecha fin:</strong> ${escapeHtml(fechaFin)}</p>
    </div>

    <div class="infoBlock">
      <h3>Zona de operación</h3>
      <p><strong>Centroide lat:</strong> ${escapeHtml(
        centroideLat != null ? String(centroideLat) : "No definido"
      )}</p>
      <p><strong>Centroide lon:</strong> ${escapeHtml(
        centroideLon != null ? String(centroideLon) : "No definido"
      )}</p>
      <p><strong>Zoom inicial:</strong> ${escapeHtml(
        zoomInicial != null ? String(zoomInicial) : "No definido"
      )}</p>
    </div>

    <div class="infoBlock">
      <h3>Personal asignado</h3>
      ${
        personal.length
          ? personal.map(p => {
              const nombre = firstString(
                `${p.nombre || ""} ${p.apellido || ""}`.trim(),
                p.apodo,
                p.nombre_completo,
                p.name,
                "Sin nombre"
              );

              const cargo = firstString(
                p.rol,
                p.puesto,
                p.cargo,
                "Sin cargo"
              );

              const grupo = firstString(
                p.grupo_apodo,
                p.grupo_nombre,
                p.grupo_padre_apodo && p.grupo_apodo
                  ? `${p.grupo_padre_apodo} / ${p.grupo_apodo}`
                  : "",
                p.grupo_padre_nombre && p.grupo_nombre
                  ? `${p.grupo_padre_nombre} / ${p.grupo_nombre}`
                  : "",
                p.grupo_padre_apodo,
                p.grupo_padre_nombre,
                "Sin grupo"
              );

              return `
                <div class="miniCard">
                  <p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
                  <p><strong>Cargo:</strong> ${escapeHtml(cargo)}</p>
                  <p><strong>Grupo:</strong> ${escapeHtml(grupo)}</p>
                </div>
              `;
            }).join("")
          : `<p>Sin personal asignado.</p>`
      }
    </div>

    <div class="infoBlock">
      <h3>Vehículos asignados</h3>
      ${
        vehiculos.length
          ? vehiculos.map(v => {
              const unidad = firstString(
                v.codigo_interno,
                v.unidad,
                v.nombre,
                "Sin unidad"
              );

              const tipo = firstString(
                v.tipo,
                "Sin tipo"
              );

              const placas = firstString(
                v.placas,
                "Sin placas"
              );

              const asignado = firstString(
                v.grupo_apodo,
                v.grupo_nombre,
                v.grupo_padre_apodo && v.grupo_apodo
                  ? `${v.grupo_padre_apodo} / ${v.grupo_apodo}`
                  : "",
                v.grupo_padre_nombre && v.grupo_nombre
                  ? `${v.grupo_padre_nombre} / ${v.grupo_nombre}`
                  : "",
                v.grupo_padre_apodo,
                v.grupo_padre_nombre,
                v.uso_en_operacion,
                "Sin asignación"
              );

              return `
                <div class="miniCard">
                  <p><strong>Unidad:</strong> ${escapeHtml(unidad)}</p>
                  <p><strong>Tipo:</strong> ${escapeHtml(tipo)}</p>
                  <p><strong>Placas:</strong> ${escapeHtml(placas)}</p>
                  <p><strong>Asignación:</strong> ${escapeHtml(asignado)}</p>
                </div>
              `;
            }).join("")
          : `<p>Sin vehículos asignados.</p>`
      }
    </div>

    <div class="infoBlock">
      <h3>Equipos asignados</h3>
      ${
        equipos.length
          ? equipos.map(e => {
              const nombre = firstString(e.nombre, e.descripcion, "Sin nombre");
              const codigo = firstString(
                e.numero_serie,
                e.codigo,
                e.codigoInterno,
                "Sin código"
              );
              const categoria = firstString(e.categoria, "Sin categoría");
              const asignadoA = firstString(
                e.personal_apodo,
                e.personal_asignado,
                e.vehiculo_alias,
                e.vehiculo_asignado,
                e.uso_en_operacion,
                "Sin asignación"
              );

              return `
                <div class="miniCard">
                  <p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
                  <p><strong>Código:</strong> ${escapeHtml(codigo)}</p>
                  <p><strong>Categoría:</strong> ${escapeHtml(categoria)}</p>
                  <p><strong>Asignado a:</strong> ${escapeHtml(asignadoA)}</p>
                </div>
              `;
            }).join("")
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

    // Sincronizar ruta nueva a los demás clientes con Sockets y Guardarla en DB
    const idOp = getActiveOperationId();
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };
    
    // Si ya teníamos una ruta trazada, la borramos antes de subir la nueva
    if (myRouteId) {
       await fetch(`${API_BASE}/ops/${idOp}/rutas/navegacion/${myRouteId}`, {
           method: "DELETE",
           headers
       }).catch(e => console.error("Error borrando ruta anterior", e));
       myRouteId = null;
    }

    const bodyData = {
      geojson: route.geometry,
      origen_lat: startPoint.lat,
      origen_lon: startPoint.lng,
      destino_lat: endPoint.lat,
      destino_lon: endPoint.lng,
      distancia_m: route.distance,
      duracion_s: route.duration
    };

    const res = await fetch(`${API_BASE}/ops/${idOp}/rutas/navegacion`, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyData)
    });

    const data = await res.json();
    if (data.ok) {
        myRouteId = data.id_ruta;
        console.log("Ruta de navegación guardada/sincronizada ID:", myRouteId);
    } else {
        console.error("Error sincronizando ruta:", data.mensaje);
    }

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

document.getElementById("clearOps").onclick = async () => {
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
  
  if (myRouteId) {
    try {
      const idOp = getActiveOperationId();
      await fetch(`${API_BASE}/ops/${idOp}/rutas/navegacion/${myRouteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      myRouteId = null;
    } catch (e) {
      console.error("Error al borrar ruta del mapa global", e);
    }
  }

  renderInfoPanel();
};

// =================== HISTORIAL ===================
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

function drawRutaNavegacion(ruta) {
  if (!viewer || !ruta?.geojson || ruta.geojson.type !== "LineString") return;

  const rol = (ruta.rol_creador || "").toUpperCase();
  let materialColor = Cesium.Color.PURPLE;
  if (rol === "ADMIN" || rol === "CUT") materialColor = Cesium.Color.RED;
  else if (rol === "CET") materialColor = Cesium.Color.ORANGE;
  else if (rol === "CELL") materialColor = Cesium.Color.DODGERBLUE;

  const entityId = `ruta_nav_${ruta.id_ruta}`;
  if (rutasNavegacionEntities.has(entityId)) return;

  const coords = Array.isArray(ruta.geojson.coordinates)
    ? ruta.geojson.coordinates
    : [];

  if (coords.length < 2) return;

  const positions = coords.map(([lon, lat]) =>
    Cesium.Cartesian3.fromDegrees(lon, lat)
  );

  const labelText =
    ruta.id_personal != null
      ? `Ruta personal ${ruta.id_personal}`
      : ruta.id_usuario != null
        ? `Ruta usuario ${ruta.id_usuario}`
        : `Ruta ${ruta.id_ruta}`;

  const entity = viewer.entities.add({
    id: entityId,
    polyline: {
      positions,
      width: 5,
      material: materialColor.withAlpha(0.9),
      clampToGround: true
    },
    properties: {
      id_ruta: ruta.id_ruta,
      id_operacion: ruta.id_operacion,
      id_usuario: ruta.id_usuario,
      id_personal: ruta.id_personal,
      distancia_m: ruta.distancia_m,
      duracion_s: ruta.duracion_s,
      fecha_creacion: ruta.fecha_creacion
    },
    label: {
      text: labelText,
      font: "13px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -18),
      show: false
    }
  });

  rutasNavegacionEntities.set(entityId, entity);
}

// =================== ENTIDADES OPERACIONALES ===================
function clearOperationalEntities() {
  if (!viewer) return;

  personalEntities.forEach(ent => viewer.entities.remove(ent));
  vehiculoEntities.forEach(ent => viewer.entities.remove(ent));
  equipoEntities.forEach(ent => viewer.entities.remove(ent));

  personalEntities = [];
  vehiculoEntities = [];
  equipoEntities = [];

  if (zonaEntity) {
    viewer.entities.remove(zonaEntity);
    zonaEntity = null;
  }
}

function renderZonaOnMap() {
  if (!viewer || !dashboardData) return;

  const zona = getZonaData();
  const lat = firstNumber(zona.centroide_lat, zona.lat, zona.latitude);
  const lon = firstNumber(zona.centroide_lon, zona.lon, zona.lng, zona.longitude);
  const zoom = firstNumber(zona.zoom_inicial, zona.zoom, 25000) || 25000;

  if (lat == null || lon == null) return;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, zoom)
  });

  zonaEntity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: {
      pixelSize: 14,
      color: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2
    },
    label: {
      text: "ZONA DE OPERACIÓN",
      font: "14px sans-serif",
      fillColor: Cesium.Color.WHITE,
      pixelOffset: new Cesium.Cartesian2(0, -22)
    }
  });
}

function renderPersonalOnMap() {
  if (!viewer || !dashboardData) return;

  const personal = getPersonalData();

  personal.forEach((p) => {
    const pos = getLatLonFromItem(p);
    if (!pos) return;

    const nombre = firstString(
      p.apodo,
      `${p.nombre || ""} ${p.apellido || ""}`.trim(),
      p.nombre_completo,
      "Personal"
    );

    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat),
      point: {
        pixelSize: 10,
        color: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1
      },
      label: {
        text: nombre,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20)
      }
    });

    personalEntities.push(ent);
  });
}

function renderVehiculosOnMap() {
  if (!viewer || !dashboardData) return;

  const vehiculos = getVehiculosData();

  vehiculos.forEach((v) => {
    const pos = getLatLonFromItem(v);
    if (!pos) return;

    const nombre = firstString(
      v.codigo_interno,
      v.unidad,
      v.nombre,
      "Vehículo"
    );

    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat),
      point: {
        pixelSize: 12,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1
      },
      label: {
        text: nombre,
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20)
      }
    });

    vehiculoEntities.push(ent);
  });
}

function renderEquiposOnMap() {
  if (!viewer || !dashboardData) return;

  const equipos = getEquiposData();

  equipos.forEach((e) => {
    const pos = getLatLonFromItem(e);
    if (!pos) return;

    const nombre = firstString(
      e.numero_serie,
      e.codigo,
      e.nombre,
      "Equipo"
    );

    const ent = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat),
      point: {
        pixelSize: 9,
        color: Cesium.Color.LIME,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1
      },
      label: {
        text: nombre,
        font: "13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -18)
      }
    });

    equipoEntities.push(ent);
  });
}

function renderRutasNavegacionOnMap() {
  if (!viewer || !dashboardData || !dashboardData.rutas_navegacion) return;
  
  dashboardData.rutas_navegacion.forEach((ruta) => {
    drawRutaNavegacion(ruta);
  });
}

function renderOperationalDataOnMap() {
  clearOperationalEntities();
  renderZonaOnMap();
  renderPersonalOnMap();
  renderVehiculosOnMap();
  renderEquiposOnMap();
  renderRutasNavegacionOnMap();
}

function setupRealtimeSocket() {
  const opId = getActiveOperationId();

  if (typeof io === "undefined") {
    console.warn("socket.io no está cargado en la página");
    return;
  }

  socket = io(API_BASE, {
    transports: ["websocket", "polling"]
  });

  socket.on("connect", () => {
    console.log("Socket conectado:", socket.id);

    socket.emit("join_operacion", {
      id_operacion: opId
    });
  });

  socket.on("disconnect", () => {
    console.log("Socket desconectado");
  });

  socket.on("ruta_navegacion_creada", (data) => {
    console.log("Evento ruta_navegacion_creada:", data);

    if (!data?.ruta) return;
    drawRutaNavegacion(data.ruta);
  });

  socket.on("ruta_navegacion_eliminada", (data) => {
    console.log("Evento ruta_navegacion_eliminada:", data);
    if (!viewer || !data || !data.id_ruta) return;
    
    const entityId = `ruta_nav_${data.id_ruta}`;
    const entity = viewer.entities.getById(entityId);
    if (entity) {
      viewer.entities.remove(entity);
    }
    rutasNavegacionEntities.delete(entityId);
  });
}

// =================== CARGA DASHBOARD ===================
async function loadDashboardFromBackend() {
  const data = await fetchDashboardDataFromBackend();

  renderInfoPanel();
  renderOperationalDataOnMap();

  const op = getOperacionData();
  const nombre = firstString(op.nombre, op.titulo, op.title, "Operación");
  setRouteInfo(`Dashboard cargado: ${nombre}`);

  return data;
}

// =================== LEGACY CARGA DE OPERACION ACTUAL ===================
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
      setRouteInfo(`Mostrando operación local: ${op.title}`);
    } else {
      setRouteInfo("Operación local cargada. Falta ruta calculada.");
    }
  }
}

// =================== INIT GENERAL ===================
window.addEventListener("load", async () => {
  initCesium();
  setTacticalUI();
  setupRealtimeSocket();

  try {
    await loadDashboardFromBackend();
  } catch (err) {
    console.error("Error cargando dashboard:", err);

    renderInfoPanel();
    loadCurrentOperationOnMap();

    const container = document.getElementById("infoPanelContent");
    if (container) {
      container.innerHTML = `
        <div class="infoBlock">
          <h3>Error</h3>
          <p>${escapeHtml(err?.message || "No se pudo cargar el dashboard desde la base de datos.")}</p>
        </div>
      `;
    }

    setRouteInfo(err?.message || "No se pudo cargar el dashboard.");
  }

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