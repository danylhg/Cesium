// =================== TOKEN CESIUM ION ===================
// 🔥 Seguridad: el token se carga desde el backend para no exponerlo en el JS público.
let CESIUM_ACCESS_TOKEN = null;
// Token de reserva (se usará solo si el backend no está disponible)
const _CESIUM_FALLBACK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmMjQ3NDAzYi1mNDYyLTQzYTgtOTNiOC02MGE1YmJhOGYwYjQiLCJpZCI6NDAwOTM3LCJpYXQiOjE3NzQ1NDYwNjZ9.Phla8axJI8tGCSQwfvmvykzxW2tHXcuc0q1D5n01BmU";
async function loadCesiumToken() {
  try {
    const base = typeof API_BASE !== "undefined" ? API_BASE : `http://${window.location.hostname}:3001`;
    const tok  = localStorage.getItem("token") || "";
    const res  = await fetch(`${base}/config/cesium-token`, {
      headers: { Authorization: `Bearer ${tok}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    CESIUM_ACCESS_TOKEN = data.token || _CESIUM_FALLBACK;
  } catch (e) {
    console.warn("Token Cesium no cargado desde backend (usando fallback):", e.message);
    CESIUM_ACCESS_TOKEN = _CESIUM_FALLBACK;
  }
  // Asignar solo si Cesium ya está disponible en el scope global
  if (typeof Cesium !== "undefined") {
    Cesium.Ion.defaultAccessToken = CESIUM_ACCESS_TOKEN;
  }
}

// =================== HELPERS OPERACION ACTIVA ===================
function getActiveOperationId() {
  const qs = new URLSearchParams(window.location.search);
  const urlId = qs.get("id") || qs.get("opId");

  if (urlId && Number(urlId) > 0) {
    localStorage.setItem("active_operation_id", urlId);
    return Number(urlId);
  }

  const idValue = localStorage.getItem("active_operation_id");
  if (!idValue || idValue === "null" || idValue === "undefined") {
    throw new Error("No hay operación activa en la sesión.");
  }

  const num = Number(idValue);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("El id de operación activa no es válido.");
  }

  return num;
}


// =================== SESION (Ya validada en dashboard_auth.js) ===================
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
  window.location.href = "menu_inicial.html";
};

function parseJwtPayload(tokenValue) {
  try {
    const base64 = tokenValue.split(".")[1];
    if (!base64) return null;

    const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

const authPayload = parseJwtPayload(token);

function getCurrentActor() {
  const sub = Number(authPayload?.sub);
  const tabla = String(authPayload?.tabla || "").toLowerCase();

  return {
    id: Number.isFinite(sub) ? sub : null,
    tabla
  };
}

function rutaPerteneceAlUsuarioActual(ruta) {
  const actor = getCurrentActor();
  if (!ruta || !actor.id || !actor.tabla) return false;

  if (actor.tabla === "usuario") {
    return Number(ruta.id_usuario) === actor.id;
  }

  if (actor.tabla === "personal") {
    return Number(ruta.id_personal) === actor.id;
  }

  return false;
}

function getRutasNavegacionData() {
  return Array.isArray(dashboardData?.rutas_navegacion)
    ? dashboardData.rutas_navegacion
    : [];
}

function getRutaActualDelUsuario() {
  const rutas = getRutasNavegacionData();

  const propias = rutas
    .filter(rutaPerteneceAlUsuarioActual)
    .sort((a, b) => {
      const fa = new Date(a?.fecha_creacion || 0).getTime();
      const fb = new Date(b?.fecha_creacion || 0).getTime();
      return fb - fa;
    });

  return propias[0] || null;
}

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
class OpenStreetMapNominatimGeocoder {
  constructor() {
    this._credit = undefined;
  }

  get credit() {
    return this._credit;
  }

  async geocode(input) {
    const query = String(input || "").trim();
    if (!query) return [];

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=5`;

    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json"
        }
      });

      if (!response.ok) return [];

      const results = await response.json();

      return results.map((item) => {
        const south = parseFloat(item.boundingbox[0]);
        const north = parseFloat(item.boundingbox[1]);
        const west = parseFloat(item.boundingbox[2]);
        const east = parseFloat(item.boundingbox[3]);

        return {
          displayName: item.display_name,
          destination: Cesium.Rectangle.fromDegrees(west, south, east, north)
        };
      });
    } catch {
      return [];
    }
  }
}

let viewer;

let pickMode = null;
let startPoint = null;
let endPoint = null;
let lastRoute = null;
let myRouteId = null;
let currentVisibleRouteId = null;
let rutasNavegacionEntities = new Map();

let startEntity = null;
let endEntity = null;
let routeEntity = null;

let personalEntities = [];
let vehiculoEntities = [];
let equipoEntities = [];
let zonaEntity = null;

let socket = null;

const contextMenu = document.getElementById("contextMenu");
const ctxSetStart = document.getElementById("ctxSetStart");
const ctxSetEnd = document.getElementById("ctxSetEnd");
const ctxClearRoute = document.getElementById("ctxClearRoute");

let lastContextPos = null;

const saveOpMapBtn = document.getElementById("saveOpMapBtn");
const cancelOpMapBtn = document.getElementById("cancelOpMapBtn");
const mapActionButtons = document.getElementById("mapActionButtons");
const routeVehicleSelect = document.getElementById("routeVehicleSelect");

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

let selectedEntity = null;
let draggingEntity = null;
let isDragging = false;

let currentMilIconSrc = "";
let currentMilIconTitle = "";

let pendingShapePoints = [];
let pendingShapeMarkers = [];

let tacticalPreviewLine = null;
let tacticalPreviewFill = null;

// Área de planeación
let areaMode = false;
let areaDrawing = false;
let areaPoints = [];
let areaVertexEntities = [];
let areaPreviewLine = null;
let planningAreaFill = null;
let planningAreaBorder = null;
let planningAreaLabel = null;

// Popup flotante
const markAreaBtn = document.getElementById("markAreaBtn");
const clearAreaBtn = document.getElementById("clearAreaBtn");
const areaInfo = document.getElementById("areaInfo");

const entityPopup = document.getElementById("entityPopup");
const entityPopupName = document.getElementById("entityPopupName");
const entityPopupDelete = document.getElementById("entityPopupDelete");

const toolSelect = document.getElementById("toolSelect");
const milPreset = document.getElementById("milPreset");
const symLabel = document.getElementById("symLabel");
const placeBtn = document.getElementById("placeBtn");
const cancelPlace = document.getElementById("cancelPlace");
const clearTactical = document.getElementById("clearTactical");
const tbHint = document.getElementById("tbHint");

const finishShape = document.getElementById("finishShape");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const selectionInfo = document.getElementById("selectionInfo");

const colorSelect = document.getElementById("colorSelect");
const opacityRange = document.getElementById("opacityRange");
const widthRange = document.getElementById("widthRange");
const radiusInput = document.getElementById("radiusInput");

const iconPallet = document.getElementById("iconPallet");
const iconSettings = document.getElementById("iconSettings");
const iconScale = document.getElementById("iconScale");

// =================== CHAT UI ===================
const chatPanel = document.getElementById("chatPanel");
const toggleChatPanel = document.getElementById("toggleChatPanel");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatTabCet = document.getElementById("chatTabCet");
const chatTabCells = document.getElementById("chatTabCells");
const quickMsgBtns = document.querySelectorAll(".quickMsgBtn");
const recordVoiceBtn = document.getElementById("recordVoiceBtn");
const stopVoiceBtn = document.getElementById("stopVoiceBtn");
const voiceStatus = document.getElementById("voiceStatus");

let currentChatChannel = "CET";
let chatMessagesState = [];

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
  if (chatPanel) chatPanel.classList.remove("open");

  toggleInfoPanel.classList.remove("active");
  toggleRoutePanel.classList.remove("active");
  toggleTacticalPanel.classList.remove("active");
  if (toggleChatPanel) toggleChatPanel.classList.remove("active");
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
if (toggleChatPanel && chatPanel) {
  toggleChatPanel.addEventListener("click", () => {
    if (!isOperacionActiva()) {
      alert("El chat táctico solo está disponible cuando la operación está activa.");
      return;
    }
    togglePanel(chatPanel, toggleChatPanel);
    if (chatPanel.classList.contains("open")) {
      loadChatHistoryFromBackend().catch(() => {});
    }
  });
}

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

function isFechaHoy(fechaStr) {
  if (!fechaStr) return false;
  const hoy = new Date();
  const fecha = new Date(fechaStr);
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  );
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

function getCesiumColor(name = "red", alpha = 1) {
  const map = {
    red: Cesium.Color.RED,
    blue: Cesium.Color.BLUE,
    black: Cesium.Color.BLACK,
    yellow: Cesium.Color.YELLOW,
    green: Cesium.Color.LIME,
    orange: Cesium.Color.ORANGE,
    white: Cesium.Color.WHITE
  };
  const base = map[String(name).toLowerCase()] || Cesium.Color.RED;
  return base.withAlpha(Number(alpha) || 1);
}

function getStyleValues() {
  return {
    colorName: colorSelect?.value || "red",
    color: getCesiumColor(colorSelect?.value || "red", Number(opacityRange?.value || 0.35)),
    alpha: Number(opacityRange?.value || 0.35),
    width: Number(widthRange?.value || 3),
    radius: Number(radiusInput?.value || 5000),
    iconScale: Number(iconScale?.value || 0.2)
  };
}

function getLineWidth() {
  return Number(widthRange?.value || 3);
}

function getOpacity() {
  return Number(opacityRange?.value || 0.35);
}

function getRadius() {
  return Number(radiusInput?.value || 5000);
}

function getCurrentLabel() {
  return (symLabel?.value || "").trim();
}

function getCurrentColorName() {
  return colorSelect?.value || "red";
}

function toCartesianArray(points) {
  return points.map((p) => Cesium.Cartesian3.fromDegrees(p.lng, p.lat));
}

function cartesianToLatLng(cartesian) {
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lng: Cesium.Math.toDegrees(cartographic.longitude)
  };
}

function getMapClickPosition(screenPosition) {
  const scene = viewer.scene;

  let cartesian = null;

  if (scene.pickPositionSupported) {
    cartesian = scene.pickPosition(screenPosition);
  }

  if (!cartesian) {
    cartesian = viewer.camera.pickEllipsoid(screenPosition, scene.globe.ellipsoid);
  }

  return cartesian;
}

function isDraggableEntity(entity) {
  if (!entity) return false;

  const draggable =
    entity.properties?.draggable?.getValue?.() ??
    entity.properties?.draggable;

  return Boolean(draggable && entity.position);
}

function updateSelectionInfo() {
  if (!selectionInfo) return;

  if (!selectedEntity) {
    selectionInfo.textContent = "No hay elemento seleccionado.";
    return;
  }

  const name = selectedEntity.name || "Elemento táctico";
  const type =
    selectedEntity.properties?.tacticalType?.getValue?.() ||
    selectedEntity.properties?.type?.getValue?.() ||
    selectedEntity.properties?.tacticalType ||
    selectedEntity.properties?.type ||
    "Sin tipo";

  selectionInfo.textContent = `Seleccionado: ${name} · Tipo: ${type}`;
}

function addTacticalEntity(entity) {
  tacticalEntities.push(entity);
  return entity;
}

function clearPendingShapeMarkers() {
  if (!viewer) return;
  pendingShapeMarkers.forEach((ent) => viewer.entities.remove(ent));
  pendingShapeMarkers = [];
}

function resetDrawingState(keepTool = true) {
  placingMode = false;
  pendingShapePoints = [];
  clearPendingShapeMarkers();

  if (tacticalPreviewLine && viewer) viewer.entities.remove(tacticalPreviewLine);
  if (tacticalPreviewFill && viewer) viewer.entities.remove(tacticalPreviewFill);
  tacticalPreviewLine = null;
  tacticalPreviewFill = null;

  if (!keepTool) {
    toolMode = "none";
    if (toolSelect) toolSelect.value = "none";
  }

  setTacticalUI();
}

function addPendingShapeMarker(lat, lng) {
  if (!viewer) return;

  const ent = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    point: {
      pixelSize: 8,
      color: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    }
  });

  pendingShapeMarkers.push(ent);
}

function setSelectedEntity(entity) {
  selectedEntity = entity || null;

  if (!selectionInfo) return;

  if (!selectedEntity) {
    selectionInfo.textContent = "No hay elemento seleccionado.";
    if (entityPopup) entityPopup.style.display = "none";
    return;
  }

  const label =
    selectedEntity?.properties?.labelText?.getValue?.() ||
    selectedEntity?.label?.text?.getValue?.() ||
    selectedEntity?.label?.text ||
    selectedEntity?.name ||
    selectedEntity?.id ||
    "Elemento táctico";

  const type =
    selectedEntity?.properties?.tacticalType?.getValue?.() ||
    selectedEntity?.properties?.type?.getValue?.() ||
    selectedEntity?.properties?.tacticalType ||
    selectedEntity?.properties?.type ||
    "Sin tipo";

  selectionInfo.textContent = `Seleccionado: ${label} · Tipo: ${type}`;
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
    equiposRes,
    mapaRes
  ] = await Promise.all([
    getJson(`${API_BASE}/ops/${opId}`),
    getJson(`${API_BASE}/ops/${opId}/zona`, true),
    getJson(`${API_BASE}/ops/${opId}/personal`, true),
    getJson(`${API_BASE}/ops/${opId}/vehiculos-asignados`, true),
    getJson(`${API_BASE}/ops/${opId}/equipos-asignados`, true),
    getJson(`${API_BASE}/ops/${opId}/mapa`, true)
  ]);

  const operacionNormalizada =
    operacionRes?.item ||
    operacionRes?.operacion ||
    operacionRes ||
    mapaRes?.operacion ||
    {};

  const rutasActivas = Array.isArray(mapaRes?.rutas_navegacion)
    ? mapaRes.rutas_navegacion
    : [];

  dashboardData = {
    ok: true,
    operacion: operacionNormalizada,
    zona_operacion: zonaRes?.zona || mapaRes?.zona_operacion || null,
    personal: Array.isArray(personalRes?.items)
      ? personalRes.items
      : (Array.isArray(mapaRes?.personal) ? mapaRes.personal : []),
    vehiculos: Array.isArray(vehiculosRes?.items)
      ? vehiculosRes.items
      : (Array.isArray(mapaRes?.vehiculos) ? mapaRes.vehiculos : []),
    equipos: Array.isArray(equiposRes?.items)
      ? equiposRes.items
      : (Array.isArray(mapaRes?.equipos) ? mapaRes.equipos : []),
    rutas_navegacion: rutasActivas
  };

  console.log("OPERACION NORMALIZADA:", dashboardData.operacion);
  console.log("ESTADO DETECTADO:", dashboardData.operacion?.estado);

  // Si viene directo desde asignación (flag en sessionStorage) y el backend la
  // marcó ACTIVA con fecha de hoy, mantenerla en PLANIFICADA hasta que el
  // usuario confirme pulsando "Guardar operación".
  const estadoBackend = (dashboardData.operacion?.estado || "").trim().toUpperCase();
  const fechaInicioOp = dashboardData.operacion?.fecha_inicio || dashboardData.operacion?.fechaInicio || "";
  const pendienteKey = `pendiente_activar_${opId}`;
  if (
    sessionStorage.getItem(pendienteKey) === "1" &&
    estadoBackend === "ACTIVA" &&
    isFechaHoy(fechaInicioOp)
  ) {
    dashboardData.operacion = { ...dashboardData.operacion, estado: "PLANIFICADA" };
    console.log("Operación pendiente de confirmación: se mantiene en PLANIFICADA hasta guardar.");
  }

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

// =================== ESTADO OPERACION ===================
function getEstadoOperacionActual() {
  const op = getOperacionData();
  const raw = firstString(
    op.estado,
    op.status,
    op.estado_operacion,
    op.estado_actual,
    ""
  );
  return raw.trim().toUpperCase();
}

function isOperacionActiva() {
  return getEstadoOperacionActual() === "ACTIVA";
}

function isOperacionTerminada() {
  const s = getEstadoOperacionActual();
  return s === "TERMINADA" || s === "FINALIZADA";
}

function isOperacionPlanificada() {
  const s = getEstadoOperacionActual();
  return s === "PLANIFICADA" || s === "PLANEADA" || s === "";
}

function validateDashboardAccess() {
  try {
    getActiveOperationId();
    return true;
  } catch {
    window.location.href = "login.html";
    return false;
  }
}

function applyOperationStateUI() {
  const estado = getEstadoOperacionActual();
  const op = getOperacionData();

  const chatBtn = document.getElementById("toggleChatPanel");
  const chatPanelEl = document.getElementById("chatPanel");
  const mapActionButtonsEl = document.getElementById("mapActionButtons");
  const badge = document.getElementById("opStatusBadge");
  const title = document.getElementById("topbarTitle");
  const dot = document.getElementById("brandDot");

  const isActiva = estado === "ACTIVA";
  const isPlan = estado === "PLANIFICADA" || estado === "PLANEADA";
  const isTerm = estado === "TERMINADA" || estado === "FINALIZADA";

  // Badge y Título
  if (badge) badge.style.display = isActiva ? "inline-block" : "none";
  if (title) title.textContent = op.nombre || op.title || "Operación";
  if (dot) dot.style.background = isActiva ? "#ff4444" : isPlan ? "#00ffa6" : "#94a3b8";

  // Mostrar/ocultar botones guardar y cancelar
  if (mapActionButtonsEl) {
    mapActionButtonsEl.style.display = isPlan ? "flex" : "none";
  }

  // Botón Chat
  if (chatBtn) {
    chatBtn.style.display = (isActiva || isTerm) ? "flex" : "none";
  }

  if (!isActiva) {
    if (chatPanelEl) chatPanelEl.classList.remove("open");
    if (chatBtn) chatBtn.classList.remove("active");
  } else {
    // Lógica autoinicio de chat si fuera necesaria
    const chatKey = `chat_opened_${op.id || "op"}`;
    if (!localStorage.getItem(chatKey)) {
       localStorage.setItem(chatKey, "true");
       if (chatPanelEl) chatPanelEl.classList.add("open");
       if (chatBtn) chatBtn.classList.add("active");
    }
  }
}

function applyChatPermissions() {
  if (!chatInput || !sendChatBtn) return;

  if (isOperacionTerminada()) {
    chatInput.disabled = true;
    sendChatBtn.disabled = true;
  }

  if (isOperacionActiva()) {
    chatInput.disabled = false;
    sendChatBtn.disabled = false;
  }

  if (isOperacionPlanificada()) {
    chatInput.disabled = true;
    sendChatBtn.disabled = true;
  }
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

  const descripcion = firstString(
    operacion.descripcion,
    operacion.description,
    "Sin descripción"
  );

  const prioridad = firstString(operacion.prioridad, "No definida");
  const fechaInicio = formatDateText(operacion.fecha_inicio || operacion.fechaInicio);

  const centroideLat = firstNumber(zona.centroide_lat, zona.lat, zona.latitude);
  const centroideLon = firstNumber(zona.centroide_lon, zona.lon, zona.lng, zona.longitude);

  // --- Lógica de personal agrupado ---
  let personalHtml = "<p>Sin personal asignado.</p>";
  if (personal.length) {
    personalHtml = "";

    const cetTree = new Map();
    const seen = new Set();

    for (const row of personal) {
      const key = [
        row.id_personal,
        row.id_cet_ref || row.id_cet_mando || "",
        row.grupo_hijo_nombre || ""
      ].join("|");

      if (seen.has(key)) continue;
      seen.add(key);

      const rol = String(row.rol_en_operacion || row.rol || "").toUpperCase();

      if (rol === "CUT" || rol === "COMANDANTE DE UNIDAD DE TRABAJO") {
        // render aparte
        continue;
      }

      if (rol === "CET" || rol === "COMANDANTE DE EQUIPO DE TRABAJO") {
        const cetId = Number(row.id_personal);
        if (!cetTree.has(cetId)) {
          cetTree.set(cetId, {
            cet: row,
            flotilla: firstString(row.cet_flotilla, ""),
            directos: [],
            grupos: new Map()
          });
        }
        continue;
      }

      const cetId = Number(row.id_cet_ref || row.id_cet_mando);
      if (!cetId) continue;

      if (!cetTree.has(cetId)) {
        cetTree.set(cetId, {
          cet: {
            id_personal: cetId,
            apodo: firstString(row.cet_apodo, row.cet_nombre, `CET ${cetId}`)
          },
          flotilla: firstString(row.cet_flotilla, ""),
          directos: [],
          grupos: new Map()
        });
      }

      const bucket = cetTree.get(cetId);
      const grupo = firstString(row.grupo_hijo_nombre, "");

      if (grupo) {
        if (!bucket.grupos.has(grupo)) bucket.grupos.set(grupo, []);
        bucket.grupos.get(grupo).push(row);
      } else if (row.es_miembro_directo_flotilla) {
        bucket.directos.push(row);
      }
    }

    // CUTs render aparte
    const cuts = personal.filter(p => ["CUT", "COMANDANTE DE UNIDAD DE TRABAJO"].includes(String(p.rol_en_operacion || p.rol || "").toUpperCase()));
    for (const c of cuts) {
      const nombre = firstString(c.apodo, `${c.nombre || ""} ${c.apellido || ""}`.trim(), "Sin nombre");
      const puesto = c.puesto ? ` (${c.puesto})` : "";
      personalHtml += `<div class="miniCard" style="border-left: 3px solid #10b981; margin-bottom:12px;">
        <p style="margin:0;"><strong>CUT:</strong> ${escapeHtml(nombre)}${escapeHtml(puesto)}</p>
      </div>`;
    }

    for (const [, block] of cetTree) {
      const cetNombre = firstString(
        block.cet.apodo,
        `${block.cet.nombre || ""} ${block.cet.apellido || ""}`.trim(),
        "Sin nombre"
      );

      const flotilla = firstString(block.flotilla, "");

      personalHtml += `
        <div class="miniCard" style="border-left:3px solid #3b82f6; margin-top:15px; background:rgba(59,130,246,.05);">
          <p style="font-weight:bold; color:#60a5fa; font-size:14px; margin-bottom:8px;">
            CET: ${escapeHtml(cetNombre)}
            ${flotilla ? `<span style="font-size:11px; color:#94a3b8;"> (${escapeHtml(flotilla)})</span>` : ""}
          </p>
      `;

      for (const [grupoNombre, miembros] of block.grupos) {
        personalHtml += `
          <div style="margin-left:12px; margin-top:8px; padding-left:8px; border-left:1px solid rgba(255,255,255,.1);">
            <p style="font-size:12px; font-weight:bold; color:#d7e3ff; margin-bottom:4px;">
              ${escapeHtml(grupoNombre)}
            </p>
        `;

        for (const m of miembros) {
          const nombre = firstString(m.apodo, `${m.nombre || ""} ${m.apellido || ""}`.trim(), "Sin nombre");
          personalHtml += `<p style="font-size:12px; color:#fff; margin:2px 0; padding-left:8px;">• ${escapeHtml(nombre)}</p>`;
        }

        personalHtml += `</div>`;
      }

      if (block.directos.length) {
        personalHtml += `
          <div style="margin-left:12px; margin-top:8px; padding-left:8px; border-left:1px dashed rgba(255,255,255,.12);">
            <p style="font-size:12px; font-weight:bold; color:#d7e3ff; margin-bottom:4px;">
              ${flotilla ? 'Flotilla: ' + escapeHtml(flotilla) : 'Flotilla sin nombre'}
            </p>
        `;

        for (const m of block.directos) {
          const nombre = firstString(
            m.apodo,
            `${m.nombre || ""} ${m.apellido || ""}`.trim(),
            "Sin nombre"
          );

          personalHtml += `
            <p style="font-size:12px; color:#fff; margin:2px 0; padding-left:8px;">
              • ${escapeHtml(nombre)}
            </p>
          `;
        }

        personalHtml += `</div>`;
      }

      personalHtml += `</div>`;
    }

  } // end if (personal.length)

  container.innerHTML = `
    <div class="infoBlock">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0; font-size:16px; color:#fff;">Operación</h3>
        <button id="editOpInfoBtn" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:8px; border:1px solid #3b82f6; background:rgba(59,130,246,0.1); color:#3b82f6; cursor:pointer;">Editar ✏️</button>
      </div>
      <div style="display:grid; gap:6px; font-size:14px;">
        <p><strong>Nombre:</strong> ${escapeHtml(titulo)}</p>
        <p><strong>Descripción:</strong> ${escapeHtml(descripcion)}</p>
        <p><strong>Prioridad:</strong> <span class="badge" style="background:#1e293b; color:#d7e3ff; border:1px solid #334155;">${escapeHtml(prioridad)}</span></p>
        <p><strong>Fecha de inicio:</strong> ${escapeHtml(fechaInicio)}</p>
      </div>
    </div>

    <div class="infoBlock">
      <h3 style="font-size:16px; color:#fff; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">Zona de operación</h3>
      <div style="display:grid; gap:4px; font-size:13px; margin-top:8px;">
        <p><strong>Centro de la zona de operación:</strong> ${escapeHtml(centroideLat != null ? centroideLat.toFixed(6) : "—")}, ${escapeHtml(centroideLon != null ? centroideLon.toFixed(6) : "—")}</p>
      </div>
    </div>

    <div class="infoBlock">
      <h3 style="font-size:16px; color:#fff; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">Personal asignado</h3>
      <div style="margin-top:10px;">
        ${personalHtml}
      </div>
    </div>

    <div class="infoBlock">
      <h3 style="font-size:16px; color:#fff; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">Vehículos asignados</h3>
      <div style="margin-top:10px;">
        ${vehiculos.length
          ? vehiculos.map(v => {
            const unidad = firstString(v.codigo_interno, v.alias, 'Sin unidad');
            const tipoDestino = String(
              v.tipo_destino ||
              (v.grupo_nombre ? 'GRUPO' : '') ||
              (v.asignado_a_apodo || v.asignado_a_nombre ? 'PERSONAL' : '')
            ).toUpperCase();

            // 🔥 2. Usar tipo_destino real del backend
            let destinoHtml = '';
            if (tipoDestino === 'PERSONAL') {
              const nombre = firstString(v.asignado_a_apodo, v.asignado_a_nombre, '');
              if (nombre) destinoHtml = `<span style="color:#60a5fa; font-weight:600;">👤 Personal:</span> ${escapeHtml(nombre)}`;
            } else if (tipoDestino === 'GRUPO') {
              const grupo = firstString(v.grupo_nombre, v.grupo_apodo, '');
              if (grupo) destinoHtml = `<span style="color:#a78bfa; font-weight:600;">🗂 Grupo:</span> ${escapeHtml(grupo)}`;
            } else if (tipoDestino === 'FLOTILLA') {
              const flotilla = firstString(v.grupo_nombre, v.flotilla_nombre, '');
              if (flotilla) destinoHtml = `<span style="color:#fb923c; font-weight:600;">🚁 Flotilla:</span> ${escapeHtml(flotilla)}`;
            }

            const badgeColor = { PERSONAL: '#1d4ed8', GRUPO: '#7c3aed', FLOTILLA: '#c2410c' }[tipoDestino] || '#334155';

            return `
                <div class="miniCard" style="margin-bottom:8px; border-left: 3px solid ${badgeColor};">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                    <div>
                      <p style="font-weight:bold; color:#fff; font-size:14px; margin:0;">${escapeHtml(unidad)}</p>
                      <p style="font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; margin:2px 0;">${escapeHtml(v.tipo || 'Vehículo')}</p>
                    </div>
                    <span style="font-size:9px; background:${badgeColor}; color:#fff; border-radius:4px; padding:2px 6px; white-space:nowrap;">${escapeHtml(tipoDestino || '—')}</span>
                  </div>
                  ${destinoHtml ? `
                    <div style="margin-top:4px; padding:4px 0; border-top:1px solid rgba(255,255,255,0.06); font-size:11px; color:#fff;">
                      ${destinoHtml}
                    </div>
                  ` : ''}
                </div>`;
          }).join('')
          : `<p style="font-size:13px; color:#64748b;">Sin vehículos asignados.</p>`
        }
      </div>
    </div>

    <div class="infoBlock">
      <h3 style="font-size:16px; color:#fff; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">Equipos asignados</h3>
      <div style="margin-top:10px;">
        ${equipos.length
          ? equipos.map(e => {
            const nombre = firstString(e.nombre, 'Equipo');
            const tipoDestino = String(
              e.tipo_destino ||
              (e.grupo_asignado ? 'GRUPO' : '') ||
              (e.asignado_a_personal ? 'PERSONAL' : '') ||
              (e.asignado_a_vehiculo ? 'VEHICULO' : '')
            ).toUpperCase();

            // 🔥 3. Soporte completo de tipos de destino
            const iconos = { PERSONAL: '👤', VEHICULO: '🚗', GRUPO: '🗂', FLOTILLA: '🚁' };
            const colores = { PERSONAL: '#3b82f6', VEHICULO: '#f59e0b', GRUPO: '#8b5cf6', FLOTILLA: '#f97316' };
            const icono = iconos[tipoDestino] || '📦';
            const color = colores[tipoDestino] || '#64748b';

            let destinoTexto = 'Sin asignar';
            if (tipoDestino === 'PERSONAL') {
              destinoTexto = firstString(e.asignado_a_personal, e.asignado_a_apodo, 'Personal');
            } else if (tipoDestino === 'VEHICULO') {
              destinoTexto = firstString(e.asignado_a_vehiculo, e.vehiculo_codigo, 'Vehículo');
            } else if (tipoDestino === 'GRUPO') {
              destinoTexto = firstString(e.grupo_asignado, e.grupo_nombre, 'Grupo');
            } else if (tipoDestino === 'FLOTILLA') {
              destinoTexto = firstString(e.flotilla_nombre, e.grupo_nombre, 'Flotilla');
            }

            return `
              <div class="miniCard" style="display:flex; justify-content:space-between; align-items:center; border-left:3px solid ${color};">
                <div>
                  <p style="font-weight:bold; color:#fff; margin:0;">${escapeHtml(nombre)}</p>
                  <p style="font-size:10px; color:#94a3b8; margin:2px 0;">S/N: ${escapeHtml(e.numero_serie || '—')}</p>
                </div>
                <div style="text-align:right;">
                  ${tipoDestino ? `
                    <p style="font-size:10px; color:${color}; font-weight:700; margin:0;">${icono} ${escapeHtml(destinoTexto)}</p>
                    <p style="font-size:9px; color:#64748b; margin:1px 0 0 0; text-transform:uppercase;">${escapeHtml(tipoDestino)}</p>
                  ` : `<span style="font-size:10px; color:#64748b;">Sin asignar</span>`}
                  <p style="font-size:9px; color:#94a3b8; text-transform:lowercase; margin:2px 0 0;">${escapeHtml(e.categoria || '')}</p>
                </div>
              </div>`;
          }).join('')
          : `<p style="font-size:13px; color:#64748b;">Sin equipos asignados.</p>`
        }
      </div>
    </div>
  `;

  const editBtn = document.getElementById("editOpInfoBtn");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      window.location.href = "asignacion.html";
    });
  }
}

// =================== TACTICAL UI ===================
function setTacticalUI() {
  const isMilLegacy = toolMode === "mil";
  const isBldgLegacy = toolMode === "bldg";
  const isPoi = toolMode === "poi";
  const isCircle = toolMode === "circle";
  const isPolygon = toolMode === "polygon";
  const isPolyline = toolMode === "polyline";
  const isPerimeter = toolMode === "perimeter";
  const isLabel = toolMode === "label";
  const isMil = isMilLegacy;
  const isMultiPoint = ["polygon", "polyline", "perimeter"].includes(toolMode);

  if (milPreset) milPreset.disabled = !isMil;
  if (symLabel) symLabel.disabled = !(isMil || isBldgLegacy || isPoi || isLabel || isCircle || isPolygon || isPolyline || isPerimeter);

  if (placeBtn) {
    placeBtn.disabled =
      toolMode === "none" ||
      (isMil && !milPreset?.value && !currentMilIconSrc);
  }

  if (finishShape) {
    finishShape.disabled = !isMultiPoint && !areaDrawing;
  }

  if (iconPallet) iconPallet.style.display = isMil ? "grid" : "none";
  if (iconSettings) iconSettings.style.display = isMil ? "block" : "none";

  if (tbHint) {
    if (toolMode === "none" && !areaDrawing) tbHint.textContent = "Selecciona una herramienta para comenzar.";
    if (toolMode === "mil") tbHint.textContent = "Selecciona un símbolo MIL y luego colócalo en el mapa.";
    if (toolMode === "bldg") tbHint.textContent = "Escribe etiqueta y presiona 'Colocar'. Luego haz click en el mapa.";
    if (toolMode === "poi") tbHint.textContent = "Pon el nombre del punto y presiona 'Colocar / iniciar'. Luego haz click en el mapa.";
    if (toolMode === "circle") tbHint.textContent = "Presiona 'Colocar / iniciar' y luego haz click en el mapa para poner el centro.";
    if (toolMode === "polygon") tbHint.textContent = "Presiona 'Colocar / iniciar'. Haz varios clics en el mapa y al final 'Terminar figura'.";
    if (toolMode === "polyline") tbHint.textContent = "Presiona 'Colocar / iniciar'. Haz varios clics y después 'Terminar figura'.";
    if (toolMode === "perimeter") tbHint.textContent = "Presiona 'Colocar / iniciar'. Haz varios clics y después 'Terminar figura'.";
    if (toolMode === "label") tbHint.textContent = "Escribe un texto, presiona 'Colocar / iniciar' y luego haz click en el mapa.";
    if (areaDrawing) tbHint.textContent = "Marcando área de planeación. Haz clics y luego 'Terminar figura'.";
  }
}

if (toolSelect) {
  toolSelect.addEventListener("change", (e) => {
    toolMode = e.target.value;
    placingMode = false;
    pendingShapePoints = [];
    clearPendingShapeMarkers();
    setTacticalUI();
  });
}

if (milPreset) {
  milPreset.addEventListener("change", setTacticalUI);
}

document.querySelectorAll(".iconItem").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".iconItem").forEach((i) => i.classList.remove("selected"));
    item.classList.add("selected");
    currentMilIconSrc = item.dataset.src || "";
    currentMilIconTitle = item.dataset.title || "Símbolo MIL";
    setTacticalUI();
  });
});

placeBtn?.addEventListener("click", () => {
  if (toolMode === "mil" && !milPreset?.value && !currentMilIconSrc) return;
  placingMode = true;
  pendingShapePoints = [];
  clearPendingShapeMarkers();
  tbHint.textContent = "Modo colocar activo. Haz click en el mapa.";
});

cancelPlace?.addEventListener("click", () => {
  resetDrawingState(true);
  tbHint.textContent = "Cancelado. Selecciona 'Colocar / iniciar' cuando quieras poner otro.";
});

clearTactical?.addEventListener("click", () => {
  if (!viewer) return;
  tacticalEntities.forEach(ent => viewer.entities.remove(ent));
  tacticalEntities = [];
  setSelectedEntity(null);
  resetDrawingState(true);
  tbHint.textContent = "Elementos tácticos limpiados.";
});

markAreaBtn?.addEventListener("click", () => {
  if (areaDrawing) {
    clearPlanningArea();
    if (areaInfo) areaInfo.textContent = "Marcado de área cancelado.";
    return;
  }

  pickMode = null;
  placingMode = false;
  startAreaDrawing();
});

clearAreaBtn?.addEventListener("click", clearPlanningArea);

finishShape?.addEventListener("click", () => {
  if (areaDrawing) {
    finishPlanningAreaByPoints();
    return;
  }

  if (!viewer || !placingMode) return;

  if (toolMode === "polygon" || toolMode === "perimeter") {
    if (pendingShapePoints.length < 3) {
      tbHint.textContent = "Necesitas al menos 3 puntos.";
      return;
    }

    const style = getStyleValues();
    const hierarchy = pendingShapePoints.map((p) =>
      Cesium.Cartesian3.fromDegrees(p.lng, p.lat)
    );

    let entity;

    if (toolMode === "polygon") {
      entity = viewer.entities.add({
        polygon: {
          hierarchy,
          material: style.color,
          outline: true,
          outlineColor: getCesiumColor(style.colorName, 1),
          outlineWidth: style.width,
          perPositionHeight: false
        },
        properties: {
          tactical: true,
          tacticalType: "polygon",
          type: "polygon",
          labelText: symLabel?.value?.trim() || "Polígono",
          draggable: false
        }
      });
    } else {
      entity = viewer.entities.add({
        polyline: {
          positions: [
            ...hierarchy,
            hierarchy[0]
          ],
          width: style.width,
          material: new Cesium.PolylineDashMaterialProperty({
            color: getCesiumColor(style.colorName, 1),
            dashLength: 16
          }),
          clampToGround: true
        },
        properties: {
          tactical: true,
          tacticalType: "perimeter",
          type: "perimeter",
          labelText: symLabel?.value?.trim() || "Perímetro",
          draggable: false
        }
      });
    }

    addTacticalEntity(entity);
    setSelectedEntity(entity);
    resetDrawingState(true);
    tbHint.textContent = "Figura terminada.";
    return;
  }

  if (toolMode === "polyline") {
    if (pendingShapePoints.length < 2) {
      tbHint.textContent = "Necesitas al menos 2 puntos.";
      return;
    }

    const style = getStyleValues();
    const positions = pendingShapePoints.map((p) =>
      Cesium.Cartesian3.fromDegrees(p.lng, p.lat)
    );

    const entity = viewer.entities.add({
      polyline: {
        positions,
        width: style.width,
        material: getCesiumColor(style.colorName, style.alpha),
        clampToGround: true
      },
      properties: {
        tactical: true,
        tacticalType: "polyline",
        type: "polyline",
        labelText: symLabel?.value?.trim() || "Línea táctica",
        draggable: false
      }
    });

    addTacticalEntity(entity);
    setSelectedEntity(entity);
    resetDrawingState(true);
    tbHint.textContent = "Línea táctica terminada.";
  }
});

deleteSelectedBtn?.addEventListener("click", () => {
  if (!viewer || !selectedEntity) return;

  if (
    selectedEntity === planningAreaFill ||
    selectedEntity === planningAreaBorder ||
    selectedEntity === planningAreaLabel
  ) {
    clearPlanningArea();
  } else {
    viewer.entities.remove(selectedEntity);
    tacticalEntities = tacticalEntities.filter((e) => e !== selectedEntity);
  }

  setSelectedEntity(null);
  if (entityPopup) entityPopup.style.display = "none";
});

entityPopupDelete?.addEventListener("click", (e) => {
  e.stopPropagation();
  deleteSelectedBtn?.click();
});

clearSelectionBtn?.addEventListener("click", () => {
  setSelectedEntity(null);
  if (entityPopup) entityPopup.style.display = "none";
});

function updateTacticalPreview(currentLat, currentLng) {
  if (!viewer || pendingShapePoints.length === 0 || !placingMode) return;

  const validModes = ["polygon", "polyline", "perimeter"];
  if (!validModes.includes(toolMode)) return;

  const previewPoints = [...pendingShapePoints, { lat: currentLat, lng: currentLng }];

  if (toolMode === "polygon" || toolMode === "perimeter") {
    previewPoints.push(pendingShapePoints[0]);
  }

  if (tacticalPreviewLine) viewer.entities.remove(tacticalPreviewLine);
  if (tacticalPreviewFill) viewer.entities.remove(tacticalPreviewFill);

  const dashColor = toolMode === "perimeter" ? Cesium.Color.RED : Cesium.Color.YELLOW;

  tacticalPreviewLine = viewer.entities.add({
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

  if (toolMode === "polygon" && pendingShapePoints.length >= 2) {
    const polyPoints = [...pendingShapePoints, { lat: currentLat, lng: currentLng }];
    tacticalPreviewFill = viewer.entities.add({
      polygon: {
        hierarchy: toCartesianArray(polyPoints),
        material: Cesium.Color.WHITE.withAlpha(0.15),
        perPositionHeight: false
      }
    });
  } else {
    tacticalPreviewFill = null;
  }
}

function handleTacticalPlacement(lat, lng) {
  if (!viewer) return false;

  if (placingMode && toolMode !== "none") {
    const style = getStyleValues();

    if (toolMode === "mil") {
      const label = (symLabel.value || currentMilIconTitle || "Símbolo MIL").trim();

      let imageToUse = "";
      if (currentMilIconSrc) {
        imageToUse = currentMilIconSrc;
      } else if (milPreset?.value) {
        const sym = new ms.Symbol(milPreset.value, { size: 40 });
        const svg = sym.asSVG();
        imageToUse = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      }

      const ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        billboard: {
          image: imageToUse,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scale: style.iconScale || 0.2
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
        } : undefined,
        properties: {
          tactical: true,
          tacticalType: "mil",
          type: "mil",
          labelText: label,
          draggable: true
        }
      });

      addTacticalEntity(ent);
      setSelectedEntity(ent);
      placingMode = false;
      tbHint.textContent = "Símbolo colocado.";
      setTacticalUI();
      return true;
    }

    if (toolMode === "bldg" || toolMode === "poi") {
      const label = (symLabel.value || (toolMode === "poi" ? "Punto de interés" : "Edificio")).trim();

      const ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        point: {
          pixelSize: 10,
          color: getCesiumColor(style.colorName, 1),
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
        },
        properties: {
          tactical: true,
          tacticalType: toolMode,
          type: toolMode,
          labelText: label,
          draggable: true
        }
      });

      addTacticalEntity(ent);
      setSelectedEntity(ent);
      placingMode = false;
      tbHint.textContent = "Punto colocado.";
      setTacticalUI();
      return true;
    }

    if (toolMode === "label") {
      const text = (symLabel.value || "Etiqueta").trim();

      const ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        label: {
          text,
          font: "16px sans-serif",
          fillColor: getCesiumColor(style.colorName, 1),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        },
        properties: {
          tactical: true,
          tacticalType: "label",
          type: "label",
          labelText: text,
          draggable: true
        }
      });

      addTacticalEntity(ent);
      setSelectedEntity(ent);
      placingMode = false;
      tbHint.textContent = "Etiqueta colocada.";
      setTacticalUI();
      return true;
    }

    if (toolMode === "circle") {
      const radius = style.radius || 5000;
      const label = (symLabel.value || "Cobertura").trim();

      const ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          material: style.color,
          outline: true,
          outlineColor: getCesiumColor(style.colorName, 1),
          outlineWidth: style.width,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        },
        label: {
          text: label,
          font: "14px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -20)
        },
        properties: {
          tactical: true,
          tacticalType: "circle",
          type: "circle",
          labelText: label,
          draggable: true
        }
      });

      addTacticalEntity(ent);
      setSelectedEntity(ent);
      placingMode = false;
      tbHint.textContent = "Círculo colocado.";
      setTacticalUI();
      return true;
    }

    if (toolMode === "polygon" || toolMode === "polyline" || toolMode === "perimeter") {
      pendingShapePoints.push({ lat, lng });
      addPendingShapeMarker(lat, lng);
      tbHint.textContent = `Punto agregado (${pendingShapePoints.length}). Presiona "Terminar figura" al finalizar.`;
      return true;
    }
  }

  return false;
}

function clearAreaVertices() {
  if (!viewer) return;
  areaVertexEntities.forEach((ent) => viewer.entities.remove(ent));
  areaVertexEntities = [];
}

function addAreaVertex(lat, lng, index) {
  if (!viewer) return;

  const ent = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lng, lat),
    point: {
      pixelSize: 10,
      color: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    },
    label: {
      text: `${index + 1}`,
      font: "12px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -18),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    }
  });

  areaVertexEntities.push(ent);
}

function clearPlanningArea() {
  if (!viewer) return;

  if (planningAreaFill) viewer.entities.remove(planningAreaFill);
  if (planningAreaBorder) viewer.entities.remove(planningAreaBorder);
  if (planningAreaLabel) viewer.entities.remove(planningAreaLabel);
  if (areaPreviewLine) viewer.entities.remove(areaPreviewLine);

  planningAreaFill = null;
  planningAreaBorder = null;
  planningAreaLabel = null;
  areaPreviewLine = null;

  areaMode = false;
  areaDrawing = false;
  areaPoints = [];

  clearAreaVertices();

  if (markAreaBtn) markAreaBtn.textContent = "Marcar área";
  if (areaInfo) areaInfo.textContent = "Área de planeación eliminada.";
  setTacticalUI();
}

function startAreaDrawing() {
  clearPlanningArea();
  areaMode = true;
  areaDrawing = true;
  areaPoints = [];
  if (markAreaBtn) markAreaBtn.textContent = "Marcando...";
  if (areaInfo) {
    areaInfo.textContent =
      "Haz clic para colocar puntos del área. Usa 'Terminar figura' para cerrar el perímetro.";
  }
  setTacticalUI();
}

function updateAreaPreview(currentLat, currentLng) {
  if (!viewer || areaPoints.length === 0) return;

  const previewPoints = [...areaPoints, { lat: currentLat, lng: currentLng }];
  const positions = toCartesianArray(previewPoints);

  if (areaPreviewLine) {
    viewer.entities.remove(areaPreviewLine);
  }

  areaPreviewLine = viewer.entities.add({
    polyline: {
      positions,
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.YELLOW,
        dashLength: 12
      }),
      clampToGround: true
    }
  });
}

function finishPlanningAreaByPoints() {
  if (areaPoints.length < 3) {
    if (areaInfo) areaInfo.textContent = "Debes marcar al menos 3 puntos para formar el área.";
    return;
  }

  if (areaPreviewLine) {
    viewer.entities.remove(areaPreviewLine);
    areaPreviewLine = null;
  }

  const polygonPoints = [...areaPoints];
  const closedPoints = [...areaPoints, areaPoints[0]];

  planningAreaFill = viewer.entities.add({
    name: "Área de planeación",
    polygon: {
      hierarchy: toCartesianArray(polygonPoints),
      material: Cesium.Color.WHITE.withAlpha(0.05),
      outline: false,
      perPositionHeight: false
    },
    properties: {
      tacticalType: "planning-area",
      draggable: false
    }
  });

  planningAreaBorder = viewer.entities.add({
    name: "Perímetro del área",
    polyline: {
      positions: toCartesianArray(closedPoints),
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.BLACK.withAlpha(0.95),
        dashLength: 14
      }),
      clampToGround: true
    },
    properties: {
      tacticalType: "planning-area-border",
      draggable: false
    }
  });

  const center = areaPoints[0];

  planningAreaLabel = viewer.entities.add({
    name: "Área de planeación",
    position: Cesium.Cartesian3.fromDegrees(center.lng, center.lat),
    label: {
      text: "Área de planeación",
      font: "14px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    },
    properties: {
      tacticalType: "planning-area-label",
      draggable: false
    }
  });

  areaMode = false;
  areaDrawing = false;
  if (markAreaBtn) markAreaBtn.textContent = "Marcar área";
  if (areaInfo) areaInfo.textContent = "Área delimitada correctamente por puntos.";
  setTacticalUI();
}

function populateVehicleSelect() {
  if (!routeVehicleSelect) return;
  const originalVal = routeVehicleSelect.value;
  routeVehicleSelect.innerHTML = '<option value="global">Ruta General (Todos los vehículos)</option>';

  const vehiculos = getVehiculosData();
  vehiculos.forEach(v => {
    const name = firstString(v.codigo_interno, v.alias, `Vehículo ${v.id_vehiculo}`);
    const opt = document.createElement("option");
    opt.value = v.id_vehiculo;
    opt.textContent = name;
    routeVehicleSelect.appendChild(opt);
  });

  if (Array.from(routeVehicleSelect.options).some(o => o.value == originalVal)) {
    routeVehicleSelect.value = originalVal;
  }
}

function filterRoutesByVehicle(vehicleId) {
  if (!viewer) return;

  if (vehicleId === "global") {
    // Mostrar todas las rutas
    rutasNavegacionEntities.forEach((ent) => { ent.show = true; });
    setRouteInfo("Mostrando todas las rutas activas.");
    return;
  }

  // Construir mapa: id_personal -> id_vehiculo (desde vehiculos asignados)
  const vehiculos = getVehiculosData();
  const personalToVehicle = new Map();
  vehiculos.forEach(v => {
    if (v.tipo_destino === "PERSONAL" && v.asignado_a_id_personal) {
      personalToVehicle.set(Number(v.asignado_a_id_personal), Number(v.id_vehiculo));
    }
  });

  const targetVehicleId = Number(vehicleId);
  let rutasVisibles = 0;

  rutasNavegacionEntities.forEach((ent) => {
    const idPersonal = ent.properties?.id_personal?.getValue?.() ?? ent.properties?.id_personal;
    const idUsuario  = ent.properties?.id_usuario?.getValue?.()  ?? ent.properties?.id_usuario;

    // ¿Este personal tiene asignado el vehículo filtrado?
    let perteneceAlVehiculo = false;

    if (idPersonal != null) {
      const vehAsignado = personalToVehicle.get(Number(idPersonal));
      perteneceAlVehiculo = (vehAsignado === targetVehicleId);
    }

    // Fallback: buscar si algún campo directo coincide
    if (!perteneceAlVehiculo) {
      const idVehDirecto = ent.properties?.id_vehiculo?.getValue?.() ?? ent.properties?.id_vehiculo;
      if (idVehDirecto != null) {
        perteneceAlVehiculo = (Number(idVehDirecto) === targetVehicleId);
      }
    }

    ent.show = perteneceAlVehiculo;
    if (perteneceAlVehiculo) rutasVisibles++;
  });

  const vehData = vehiculos.find(v => Number(v.id_vehiculo) === targetVehicleId);
  const vehNombre = vehData ? firstString(vehData.codigo_interno, vehData.alias, `Vehículo ${targetVehicleId}`) : `Vehículo ${targetVehicleId}`;

  setRouteInfo(rutasVisibles > 0
    ? `Filtrando: ${vehNombre} · ${rutasVisibles} ruta(s) activa(s).`
    : `Sin rutas activas para ${vehNombre}.`
  );
}

let routeDebounceTimer = null;
function debounceCalculateRoute() {
  if (routeDebounceTimer) clearTimeout(routeDebounceTimer);
  routeDebounceTimer = setTimeout(() => {
    const calcBtn = document.getElementById("calcRoute");
    if (calcBtn) calcBtn.click();
  }, 500);
}

function setRoutePointFromClick(type, lat, lng) {
  if (!viewer) return;

  const isStart = type === "start";
  if (isStart) {
    startPoint = { lat, lng };
    document.getElementById("opLat").value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (startEntity) viewer.entities.remove(startEntity);
    startEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      point: { pixelSize: 12, color: Cesium.Color.LIME, heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND },
      label: { text: "ORIGEN", font: "14px sans-serif", fillColor: Cesium.Color.WHITE, pixelOffset: new Cesium.Cartesian2(0, -24), heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND },
      properties: { draggable: true }
    });
  } else {
    endPoint = { lat, lng };
    document.getElementById("opLng").value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (endEntity) viewer.entities.remove(endEntity);
    endEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      point: { pixelSize: 12, color: Cesium.Color.YELLOW, heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND },
      label: { text: "DESTINO", font: "14px sans-serif", fillColor: Cesium.Color.WHITE, pixelOffset: new Cesium.Cartesian2(0, -24), heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND },
      properties: { draggable: true }
    });
  }

  lastRoute = null;
  if (routeEntity) {
    viewer.entities.remove(routeEntity);
    routeEntity = null;
  }

  pickMode = null;
  // Quitar indicador visual de modo selección
  if (toggleRoutePanel) toggleRoutePanel.classList.remove("pickActive");

  if (startPoint && endPoint) {
    setRouteInfo("⏳ Calculando ruta automáticamente...");
    debounceCalculateRoute();
  } else {
    setRouteInfo(isStart ? "🟢 Origen fijado. Ahora elige el destino." : "🟡 Destino fijado. Ahora elige el origen.");
  }
}

// Listeners Menú Contextual
if (ctxSetStart) {
  ctxSetStart.onclick = () => {
    if (lastContextPos) setRoutePointFromClick("start", lastContextPos.lat, lastContextPos.lng);
    if (contextMenu) contextMenu.style.display = "none";
  };
}
if (ctxSetEnd) {
  ctxSetEnd.onclick = () => {
    if (lastContextPos) setRoutePointFromClick("end", lastContextPos.lat, lastContextPos.lng);
    if (contextMenu) contextMenu.style.display = "none";
  };
}
if (ctxClearRoute) {
  ctxClearRoute.onclick = () => {
    const btn = document.getElementById("clearRoute");
    if (btn) btn.click();
    if (contextMenu) contextMenu.style.display = "none";
  };
}

// =================== INIT MAPA ===================
function initCesium() {
  // El token ya fue asignado por loadCesiumToken() antes de llamar a initCesium().
  // Solo lo asignamos como fallback si por algún motivo aún no está configurado.
  if (typeof Cesium !== "undefined" && CESIUM_ACCESS_TOKEN) {
    Cesium.Ion.defaultAccessToken = CESIUM_ACCESS_TOKEN;
  }

  viewer = new Cesium.Viewer("map", {
    timeline: false,
    animation: false,
    geocoder: [new OpenStreetMapNominatimGeocoder()],
    baseLayerPicker: false,
    sceneModePicker: false,
    navigationHelpButton: true,
    homeButton: true,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false
  });

  if (viewer.geocoder?.viewModel) {
    viewer.geocoder.viewModel.destinationFound = function (_viewModel, destination) {
      viewer.camera.flyTo({ destination });
    };
  }

  setBaseLayer("osm");

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-99.1332, 19.4326, 2500000)
  });

  document.getElementById("layerSelect").addEventListener("change", (e) => {
    setBaseLayer(e.target.value);
  });

  if (routeVehicleSelect) {
    routeVehicleSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      filterRoutesByVehicle(val);
    });
  }

  document.getElementById("modeSelect").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "3d") viewer.scene.morphTo3D(1.0);
    if (v === "2d") viewer.scene.morphTo2D(1.0);
    if (v === "columbus") viewer.scene.morphToColumbusView(1.0);
  });

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((movement) => {
    const pickedObject = viewer.scene.pick(movement.position);

    if (pickedObject?.id) {
      setSelectedEntity(pickedObject.id);

      const tacticalType =
        pickedObject.id.properties?.tacticalType?.getValue?.() ||
        pickedObject.id.properties?.type?.getValue?.() ||
        pickedObject.id.properties?.tacticalType ||
        pickedObject.id.properties?.type;

      const isTactical = Boolean(tacticalType);

      if (entityPopup && isTactical) {
        const name = pickedObject.id.name || tacticalType || "Elemento táctico";
        if (entityPopupName) entityPopupName.textContent = name;

        const rect = viewer.canvas.getBoundingClientRect();
        const x = movement.position.x + rect.left + 15;
        const y = movement.position.y + rect.top - 20;

        entityPopup.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
        entityPopup.style.top = `${Math.max(y - 70, rect.top + 10)}px`;
        entityPopup.style.display = "block";
      } else if (entityPopup) {
        entityPopup.style.display = "none";
      }
    } else {
      setSelectedEntity(null);
      if (entityPopup) entityPopup.style.display = "none";
    }

    const cartesian = getMapClickPosition(movement.position);
    if (!cartesian) return;

    const pos = cartesianToLatLng(cartesian);
    const lat = pos.lat;
    const lng = pos.lng;

    if (areaDrawing) {
      areaPoints.push({ lat, lng });
      addAreaVertex(lat, lng, areaPoints.length - 1);
      if (areaInfo) {
        areaInfo.textContent = `Punto ${areaPoints.length} agregado. Sigue marcando o presiona "Terminar figura".`;
      }
      return;
    }

    if (handleTacticalPlacement(lat, lng)) return;

    if (pickMode === "start") {
      setRoutePointFromClick("start", lat, lng);
      return;
    }

    if (pickMode === "end") {
      setRoutePointFromClick("end", lat, lng);
      return;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // --- MANEJO DE CLIC DERECHO (Menú Contextual) ---
  handler.setInputAction((movement) => {
    if (!contextMenu) return;

    const cartesian = getMapClickPosition(movement.position);
    if (!cartesian) {
      contextMenu.style.display = "none";
      return;
    }

    const pos = cartesianToLatLng(cartesian);
    lastContextPos = pos;

    // Detectar si se hizo clic sobre una entidad táctica/operacional
    const pickedObj = viewer.scene.pick(movement.position);
    const pickedEnt = pickedObj?.id;

    // Actualizar subtítulo del menú si hay entidad
    const ctxEntityLabel = document.getElementById("ctxEntityLabel");
    if (ctxEntityLabel) {
      if (pickedEnt && pickedEnt.name) {
        const tipo = pickedEnt.properties?.tipo?.getValue?.() ||
                     pickedEnt.properties?.tacticalType?.getValue?.() ||
                     pickedEnt.properties?.tipo ||
                     pickedEnt.properties?.tacticalType || "";
        const tipoStr = tipo ? ` (${tipo})` : "";
        ctxEntityLabel.textContent = `📍 ${pickedEnt.name}${tipoStr}`;
        ctxEntityLabel.style.display = "block";
      } else {
        ctxEntityLabel.textContent = `📍 ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
        ctxEntityLabel.style.display = "block";
      }
    }

    // Ajustar posición del menú para que no salga de la pantalla
    const rect = viewer.canvas.getBoundingClientRect();
    let menuX = movement.position.x + rect.left;
    let menuY = movement.position.y + rect.top;

    // Mostrar brevemente para medir tamaño
    contextMenu.style.display = "block";
    const menuW = contextMenu.offsetWidth || 200;
    const menuH = contextMenu.offsetHeight || 140;

    if (menuX + menuW > window.innerWidth - 10)  menuX = window.innerWidth - menuW - 10;
    if (menuY + menuH > window.innerHeight - 10) menuY = window.innerHeight - menuH - 10;
    if (menuX < 5) menuX = 5;
    if (menuY < 5) menuY = 5;

    contextMenu.style.left = menuX + "px";
    contextMenu.style.top  = menuY + "px";
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

  // Cerrar menú al hacer clic izquierdo en cualquier parte del mapa
  handler.setInputAction(() => {
    if (contextMenu) contextMenu.style.display = "none";
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    if (!picked || !picked.id) return;

    if (isDraggableEntity(picked.id)) {
      draggingEntity = picked.id;
      selectedEntity = picked.id;
      isDragging = true;
      updateSelectionInfo();
      viewer.scene.screenSpaceCameraController.enableRotate = false;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((movement) => {
    if (!isDragging && areaDrawing) {
      const cartesian = getMapClickPosition(movement.endPosition);
      if (cartesian) {
        const pos = cartesianToLatLng(cartesian);
        updateAreaPreview(pos.lat, pos.lng);
      }
    }

    if (!isDragging && placingMode && ["polygon", "polyline", "perimeter"].includes(toolMode)) {
      const cartesian = getMapClickPosition(movement.endPosition);
      if (cartesian) {
        const pos = cartesianToLatLng(cartesian);
        updateTacticalPreview(pos.lat, pos.lng);
      }
    }

    if (!isDragging || !draggingEntity) return;

    const cartesian = getMapClickPosition(movement.endPosition);
    if (!cartesian) return;

    draggingEntity.position = cartesian;

    // Si arrastramos origen o destino, recalculamos ruta
    if (draggingEntity === startEntity || draggingEntity === endEntity) {
      const pos = cartesianToLatLng(cartesian);
      if (draggingEntity === startEntity) {
        startPoint = { lat: pos.lat, lng: pos.lng };
        document.getElementById("opLat").value = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
      } else {
        endPoint = { lat: pos.lat, lng: pos.lng };
        document.getElementById("opLng").value = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
      }
      debounceCalculateRoute();
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(() => {
    isDragging = false;
    draggingEntity = null;
    viewer.scene.screenSpaceCameraController.enableRotate = true;
  }, Cesium.ScreenSpaceEventType.LEFT_UP);


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
  setRouteInfo("⚪ Modo origen activo: haz click en el mapa o usa clic derecho.");
  routePanel.classList.add("open");
  toggleRoutePanel.classList.add("active");
  // Feedback visual en el botón de rutas
  toggleRoutePanel.classList.add("pickActive");
  setTimeout(() => toggleRoutePanel.classList.remove("pickActive"), 5000);
};

document.getElementById("setEnd").onclick = () => {
  pickMode = "end";
  setRouteInfo("🟡 Modo destino activo: haz click en el mapa o usa clic derecho.");
  routePanel.classList.add("open");
  toggleRoutePanel.classList.add("active");
  // Feedback visual en el botón de rutas
  toggleRoutePanel.classList.add("pickActive");
  setTimeout(() => toggleRoutePanel.classList.remove("pickActive"), 5000);
};

// Cerrar menú contextual con Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (contextMenu) contextMenu.style.display = "none";
    if (pickMode) {
      pickMode = null;
      toggleRoutePanel.classList.remove("pickActive");
      setRouteInfo("Selección cancelada.");
    }
  }
});

document.getElementById("clearRoute").onclick = async () => {
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

  const idOp = getActiveOperationId();

  // 1) si esta misma sesión web creó una ruta, esa tiene prioridad
  let routeIdToDelete = myRouteId;

  // 2) si no, busca la última ruta activa del usuario actual en backendData
  if (!routeIdToDelete) {
    const rutaPropia = getRutaActualDelUsuario();
    routeIdToDelete = rutaPropia?.id_ruta || null;
  }

  if (!routeIdToDelete) {
    setRouteInfo("No hay una ruta tuya activa para limpiar.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/ops/${idOp}/rutas/navegacion/${routeIdToDelete}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("No se pudo ocultar la ruta:", data?.mensaje || res.status);
      setRouteInfo(data?.mensaje || "No se pudo limpiar tu ruta.");
      return;
    }

    // quita visualmente esa ruta si está dibujada
    const entityId = `ruta_nav_${routeIdToDelete}`;
    const entity = viewer.entities.getById(entityId);
    if (entity) viewer.entities.remove(entity);
    rutasNavegacionEntities.delete(entityId);

    // sáquela también del estado local
    if (Array.isArray(dashboardData?.rutas_navegacion)) {
      dashboardData.rutas_navegacion = dashboardData.rutas_navegacion.filter(
        (r) => Number(r.id_ruta) !== Number(routeIdToDelete)
      );
    }

    if (myRouteId === routeIdToDelete) {
      myRouteId = null;
    }

    setRouteInfo("Tu ruta fue limpiada.");
  } catch (e) {
    console.error("Error al borrar ruta del mapa global", e);
    setRouteInfo("Error al limpiar tu ruta.");
  }
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

    const km = route.distance / 1000;
    const min = route.duration / 60;

    setRouteInfo(`Ruta lista. Distancia: ${km.toFixed(2)} km · Tiempo: ${min.toFixed(1)} min`);

    const idOp = getActiveOperationId();
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };

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
document.getElementById("saveOp")?.addEventListener("click", () => {
  const msg = document.getElementById("opsMsg");
  if (msg) msg.textContent = "";

  const title = document.getElementById("opTitle")?.value?.trim() || "";
  const description = document.getElementById("opDesc")?.value?.trim() || "";

  if (!startPoint || !endPoint) {
    if (msg) msg.textContent = "Primero selecciona origen y destino.";
    return;
  }

  if (!lastRoute) {
    if (msg) msg.textContent = "Primero calcula la ruta.";
    return;
  }

  if (!title) {
    if (msg) msg.textContent = "Pon un título para guardar la operación.";
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

  if (document.getElementById("opTitle")) document.getElementById("opTitle").value = "";
  if (document.getElementById("opDesc")) document.getElementById("opDesc").value = "";

  renderInfoPanel();
  if (msg) msg.textContent = "Operación guardada correctamente.";
});

document.getElementById("clearOps")?.addEventListener("click", async () => {
  localStorage.removeItem(OPERACION_ACTUAL_KEY);

  if (document.getElementById("opTitle")) document.getElementById("opTitle").value = "";
  if (document.getElementById("opDesc")) document.getElementById("opDesc").value = "";
  if (document.getElementById("opLat")) document.getElementById("opLat").value = "";
  if (document.getElementById("opLng")) document.getElementById("opLng").value = "";
  if (document.getElementById("opsMsg")) document.getElementById("opsMsg").textContent = "Operación actual eliminada.";

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
});

// =================== HISTORIAL ===================
document.getElementById("goHistory")?.addEventListener("click", () => {
  window.location.href = "historial.html";
});

// =================== OSRM ===================
async function getOsrmRoute(start, end) {
  // Intentar primero llamar directamente a OSRM desde el navegador (mejor rendimiento y evita 504 del proxy)
  const osrmDirectUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(osrmDirectUrl);
    if (response.ok) {
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        return data.routes[0];
      }
    }
  } catch (e) {
    console.warn("Fallo acceso directo a OSRM, intentando v\u00eda proxy backend...", e.message);
  }

  // Fallback: usar el proxy del backend (con token de autenticaci\u00f3n)
  const url =
    `${API_BASE}/route/osrm?` +
    `startLon=${encodeURIComponent(start.lng)}` +
    `&startLat=${encodeURIComponent(start.lat)}` +
    `&endLon=${encodeURIComponent(end.lng)}` +
    `&endLat=${encodeURIComponent(end.lat)}`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token || localStorage.getItem("token")}`
    }
  });

  if (!r.ok) {
    const errorData = await r.json().catch(() => ({}));
    throw new Error(errorData.mensaje || "No se pudo obtener la ruta desde el servidor.");
  }

  const data = await r.json();
  if (!data.routes || !data.routes.length) {
    throw new Error("No hay ruta disponible entre los puntos seleccionados.");
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

  const existente = viewer.entities.getById(entityId);
  if (existente) {
    viewer.entities.remove(existente);
  }

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

  // =================== ÁRBOL OPERACIONAL (JERARQUÍA REAL) ===================
// 🔥 1. Construir árbol CET → Flotilla → Grupo → Personal
function buildOperationalTree() {
  const personal = getPersonalData();
  const tree = new Map();

  for (const p of personal) {
    const rol = String(p.rol_en_operacion || p.rol || '').toUpperCase();
    if (rol === 'CUT' || rol === 'COMANDANTE DE UNIDAD DE TRABAJO') continue;

    const cetId = Number(p.id_cet_ref || p.id_cet_mando || 0);
    if (!cetId) continue;

    if (!tree.has(cetId)) {
      tree.set(cetId, {
        cetLabel: firstString(p.cet_apodo, p.cet_nombre, `CET ${cetId}`),
        flotilla: firstString(p.cet_flotilla, ''),
        grupos: new Map()
      });
    }

    const grupoNombre = firstString(p.grupo_hijo_nombre, 'SIN_GRUPO');
    const bucket = tree.get(cetId);

    if (!bucket.grupos.has(grupoNombre)) {
      bucket.grupos.set(grupoNombre, []);
    }
    bucket.grupos.get(grupoNombre).push(p);
  }

  return tree;
}

// 🔥 1. Dibujar personal usando jerarquía real (color por grupo)
function drawPersonalEntity(p, color) {
  const pos = getLatLonFromItem(p);
  if (!pos) return;

  const nombre = firstString(
    p.apodo,
    `${p.nombre || ''} ${p.apellido || ''}`.trim(),
    'Personal'
  );

  const entityId = `personal_${p.id_personal}`;
  const existing = viewer.entities.getById(entityId);
  if (existing) viewer.entities.remove(existing);

  const ent = viewer.entities.add({
    id: entityId,
    name: nombre,
    position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat),
    point: {
      pixelSize: 10,
      color: color || Cesium.Color.CYAN,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 1.5,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
    },
    label: {
      text: nombre,
      font: '13px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -20)
    },
    properties: { tipo: 'personal', id_personal: p.id_personal }
  });
  personalEntities.push(ent);
}

function renderOperationalTreeOnMap() {
  if (!viewer || !dashboardData) return;

  // Paleta de colores por CET para distinguir jerarquías
  const cetColors = [
    Cesium.Color.CYAN, Cesium.Color.AQUAMARINE,
    Cesium.Color.CORNFLOWERBLUE, Cesium.Color.LIGHTSKYBLUE
  ];

  const tree = buildOperationalTree();
  let cetIdx = 0;

  for (const [, cetBlock] of tree) {
    const cetColor = cetColors[cetIdx % cetColors.length];
    cetIdx++;

    for (const [, miembros] of cetBlock.grupos) {
      miembros.forEach(p => drawPersonalEntity(p, cetColor));
    }
  }

  // CUTs con color especial
  getPersonalData()
    .filter(p => ['CUT', 'COMANDANTE DE UNIDAD DE TRABAJO'].includes(String(p.rol_en_operacion || p.rol || '').toUpperCase()))
    .forEach(p => drawPersonalEntity(p, Cesium.Color.GOLD));
}

// 🔥 2. Vehículos con tipo_destino real y color según destino
function renderVehiculosOnMap() {
  if (!viewer || !dashboardData) return;

  const vehiculos = getVehiculosData();

  vehiculos.forEach((v) => {
    const pos = getLatLonFromItem(v);
    if (!pos) return;

    const nombre = firstString(v.codigo_interno, v.unidad, v.alias, 'Vehículo');
    const tipoDestino = String(v.tipo_destino || '').toUpperCase();

    // 🟡 PERSONAL = amarillo, 🔵 GRUPO = azul, 🟠 FLOTILLA = naranja
    const colorPorDestino = {
      PERSONAL: Cesium.Color.YELLOW,
      GRUPO:    Cesium.Color.DODGERBLUE,
      FLOTILLA: Cesium.Color.ORANGE
    };
    const vehColor = colorPorDestino[tipoDestino] || Cesium.Color.LIGHTYELLOW;

    // Etiqueta de destino real
    let destinoLabel = '';
    if (tipoDestino === 'PERSONAL' && v.asignado_a_apodo) {
      destinoLabel = `→ ${v.asignado_a_apodo}`;
    } else if ((tipoDestino === 'GRUPO' || tipoDestino === 'FLOTILLA') && v.grupo_nombre) {
      destinoLabel = `→ ${v.grupo_nombre}`;
    }

    const ent = viewer.entities.add({
      id: `vehiculo_${v.id_vehiculo}`,
      name: nombre,
      position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat),
      point: {
        pixelSize: 13,
        color: vehColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      },
      label: {
        text: destinoLabel ? `${nombre}\n${destinoLabel}` : nombre,
        font: '12px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -22)
      },
      properties: { tipo: 'vehiculo', id_vehiculo: v.id_vehiculo, tipo_destino: tipoDestino }
    });
    vehiculoEntities.push(ent);
  });
}

// 🔥 3. Equipos con soporte completo de tipo_destino
function renderEquiposOnMap() {
  if (!viewer || !dashboardData) return;

  const equipos = getEquiposData();

  equipos.forEach((e) => {
    const pos = getLatLonFromItem(e);
    if (!pos) return;

    const nombre = firstString(e.numero_serie, e.codigo, e.nombre, 'Equipo');
    const tipoDestino = String(e.tipo_destino || '').toUpperCase();

    const colorPorDestino = {
      PERSONAL: Cesium.Color.LIME,
      VEHICULO: Cesium.Color.GREENYELLOW,
      GRUPO:    Cesium.Color.LIGHTBLUE,
      FLOTILLA: Cesium.Color.LIGHTSALMON
    };
    const eqColor = colorPorDestino[tipoDestino] || Cesium.Color.LIME;

    const ent = viewer.entities.add({
      id: `equipo_${e.id_equipo}`,
      name: nombre,
      position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat),
      point: {
        pixelSize: 9,
        color: eqColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1
      },
      label: {
        text: nombre,
        font: '11px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -16)
      },
      properties: { tipo: 'equipo', id_equipo: e.id_equipo, tipo_destino: tipoDestino }
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
  renderOperationalTreeOnMap(); // 🔥 1. Jerarquía real CET→grupo→personal
  renderVehiculosOnMap();       // 🔥 2. Vehículos con tipo_destino
  renderEquiposOnMap();         // 🔥 3. Equipos con tipo_destino
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

  socket.on("reconnect", () => {
    console.log("Socket reconectado, volviendo a unirse a la operación...");
    socket.emit("join_operacion", { id_operacion: opId });
    loadChatHistoryFromBackend().catch(() => {});
  });

  socket.on("chat_message", (data) => {
    console.log("Evento chat_message:", data);

    const item = data?.item || data?.mensaje || data;
    if (!item) return;

    mergeIncomingChatMessage(item);
    renderChatMessages();
  });

  socket.on("ruta_navegacion_creada", (data) => {
    console.log("Evento ruta_navegacion_creada:", data);

    if (!data?.ruta) return;

    if (!Array.isArray(dashboardData?.rutas_navegacion)) {
      if (!dashboardData) dashboardData = {};
      dashboardData.rutas_navegacion = [];
    }

    dashboardData.rutas_navegacion = dashboardData.rutas_navegacion.filter(
      (r) => Number(r.id_ruta) !== Number(data.ruta.id_ruta)
    );
    dashboardData.rutas_navegacion.unshift(data.ruta);

    drawRutaNavegacion(data.ruta);
  });

  // 🔥 4. TRACKING EN TIEMPO REAL: Personal
  socket.on("tracking_personal", (data) => {
    if (!viewer || !data?.id_personal) return;
    const entityId = `personal_${data.id_personal}`;
    const entity = viewer.entities.getById(entityId);
    const lat = Number(data.latitud || data.lat);
    const lon = Number(data.longitud || data.lon || data.lng);
    if (!lat || !lon) return;
    const pos = Cesium.Cartesian3.fromDegrees(lon, lat);
    if (entity) {
      entity.position = pos;
    } else {
      // Nueva entidad si no estaba en el mapa
      const ent = viewer.entities.add({
        id: entityId,
        position: pos,
        point: { pixelSize: 10, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.BLACK, outlineWidth: 1 },
        label: { text: data.apodo || `P${data.id_personal}`, font: '12px sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -18) }
      });
      personalEntities.push(ent);
    }
  });

  // 🔥 4. TRACKING EN TIEMPO REAL: Vehículos
  socket.on("tracking_vehiculo", (data) => {
    if (!viewer || !data?.id_vehiculo) return;
    const entityId = `vehiculo_${data.id_vehiculo}`;
    const entity = viewer.entities.getById(entityId);
    const lat = Number(data.latitud || data.lat);
    const lon = Number(data.longitud || data.lon || data.lng);
    if (!lat || !lon) return;
    const pos = Cesium.Cartesian3.fromDegrees(lon, lat);
    if (entity) {
      entity.position = pos;
    } else {
      const ent = viewer.entities.add({
        id: entityId,
        position: pos,
        point: { pixelSize: 13, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
        label: { text: data.codigo_interno || `V${data.id_vehiculo}`, font: '12px sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -22) }
      });
      vehiculoEntities.push(ent);
    }
  });

  // 🔥 Actualización de ruta en tiempo real (cuando el Android actualiza)
  socket.on("ruta_navegacion_actualizada", (data) => {
    console.log("Evento ruta_navegacion_actualizada:", data);
    if (!data?.ruta) return;

    if (!Array.isArray(dashboardData?.rutas_navegacion)) {
      if (!dashboardData) dashboardData = {};
      dashboardData.rutas_navegacion = [];
    }

    // Reemplazar en el estado local
    dashboardData.rutas_navegacion = dashboardData.rutas_navegacion.filter(
      (r) => Number(r.id_ruta) !== Number(data.ruta.id_ruta)
    );
    dashboardData.rutas_navegacion.unshift(data.ruta);

    // Redibujar la ruta actualizada
    drawRutaNavegacion(data.ruta);

    // Actualizar filtro si está activo
    if (routeVehicleSelect && routeVehicleSelect.value !== "global") {
      filterRoutesByVehicle(routeVehicleSelect.value);
    }
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

    if (Array.isArray(dashboardData?.rutas_navegacion)) {
      dashboardData.rutas_navegacion = dashboardData.rutas_navegacion.filter(
        (r) => Number(r.id_ruta) !== Number(data.id_ruta)
      );
    }

    if (myRouteId === data.id_ruta) {
      myRouteId = null;
    }
  });
}

// =================== CARGA DASHBOARD ===================
async function loadDashboardFromBackend() {
  const data = await fetchDashboardDataFromBackend();

  renderInfoPanel();
  renderOperationalDataOnMap();
  populateVehicleSelect();

  // ── Centrar la cámara en la zona de operación ──────────────────────────────
  if (viewer) {
    const zona = getZonaData();
    const lat = firstNumber(zona.centroide_lat, zona.lat, zona.latitude);
    const lng = firstNumber(zona.centroide_lon, zona.lon, zona.lng, zona.longitude);
    const altitud = firstNumber(zona.zoom_inicial, zona.zoom, 25000);

    if (lat != null && lng != null) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, altitud),
        duration: 1.5
      });
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

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

    if (document.getElementById("opTitle")) {
      document.getElementById("opTitle").value = op.title || "";
    }
    if (document.getElementById("opDesc")) {
      document.getElementById("opDesc").value = op.description || "";
    }
    document.getElementById("opLat").value = `${op.start.lat.toFixed(5)}, ${op.start.lng.toFixed(5)}`;
    document.getElementById("opLng").value = `${op.end.lat.toFixed(5)}, ${op.end.lng.toFixed(5)}`;

    if (startEntity) viewer.entities.remove(startEntity);
    if (endEntity) viewer.entities.remove(endEntity);

    startEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(op.start.lng, op.start.lat),
      point: {
        pixelSize: 12,
        color: Cesium.Color.LIME,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
      },
      label: {
        text: "ORIGEN",
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(0, -24),
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
      },
      properties: { draggable: true }
    });

    endEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(op.end.lng, op.end.lat),
      point: {
        pixelSize: 12,
        color: Cesium.Color.YELLOW,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
      },
      label: {
        text: "DESTINO",
        font: "14px sans-serif",
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(0, -24),
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
      },
      properties: { draggable: true }
    });

    if (op.route?.geometry) {
      drawRouteOnCesium(op.route.geometry);
      setRouteInfo(`Mostrando operación local: ${op.title}`);
    } else {
      setRouteInfo("Operación local cargada. Falta ruta calculada.");
    }
  }
}

function normalizeChatMessage(item) {
  if (!item) return null;

  return {
    id_mensaje: item.id_mensaje ?? null,
    id_chat: item.id_chat ?? null,
    contenido: String(item.contenido || "").trim(),
    tipo_mensaje: String(item.tipo_mensaje || "NORMAL").toUpperCase(),
    fecha_envio: item.fecha_envio || new Date().toISOString(),
    tipo_participante: item.tipo_participante || null,
    id_usuario: item.id_usuario ?? null,
    id_personal: item.id_personal ?? null,
    autor_nombre: item.autor_nombre || "Sin nombre"
  };
}

function isOwnChatMessage(item) {
  if (!item) return false;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const sub = Number(payload?.sub);
    const tabla = String(payload?.tabla || "").toLowerCase();

    if (!Number.isFinite(sub)) return false;

    if (tabla === "usuario") {
      return Number(item.id_usuario) === sub;
    }

    if (tabla === "personal") {
      return Number(item.id_personal) === sub;
    }

    return false;
  } catch {
    return false;
  }
}

function formatChatTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function mergeIncomingChatMessage(item) {
  const normalized = normalizeChatMessage(item);
  if (!normalized) return;

  const idx = chatMessagesState.findIndex(
    (m) => Number(m.id_mensaje) === Number(normalized.id_mensaje)
  );

  if (idx >= 0) {
    chatMessagesState[idx] = normalized;
  } else {
    chatMessagesState.push(normalized);
  }

  chatMessagesState.sort((a, b) => {
    const fa = new Date(a.fecha_envio || 0).getTime();
    const fb = new Date(b.fecha_envio || 0).getTime();
    return fa - fb;
  });
}

async function loadChatHistoryFromBackend() {
  const opId = getActiveOperationId();

  const res = await fetch(`${API_BASE}/ops/${opId}/chat/messages`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("session");
    localStorage.removeItem("token");
    localStorage.removeItem("active_operation_id");
    throw new Error(data?.mensaje || "Tu sesión expiró. Inicia sesión nuevamente.");
  }

  if (!res.ok) {
    throw new Error(data?.mensaje || `Error ${res.status} cargando chat`);
  }

  chatMessagesState = Array.isArray(data?.items)
    ? data.items.map(normalizeChatMessage).filter(Boolean)
    : [];

  renderChatMessages();
}

// =================== CHAT FRONTEND ===================
function renderChatMessages() {
  if (!chatMessages) return;

  const items = chatMessagesState;

  if (!items.length) {
    chatMessages.innerHTML = `<div class="chatEmpty">No hay mensajes en este canal.</div>`;
    return;
  }

  chatMessages.innerHTML = items.map((m) => {
    const self = isOwnChatMessage(m);
    const tipo = String(m.tipo_mensaje || "NORMAL").toUpperCase();

    return `
      <div class="chatMsg ${self ? "self" : ""}">
        <div class="chatMsgMeta">
          <strong>${escapeHtml(m.autor_nombre || "Sin nombre")}</strong>
          <span>${escapeHtml(formatChatTime(m.fecha_envio))}</span>
        </div>
        <div class="chatMsgBody">
          ${tipo !== "NORMAL" ? `<span class="chatTypeTag">${escapeHtml(tipo)}</span> ` : ""}
          ${escapeHtml(m.contenido || "")}
        </div>
      </div>
    `;
  }).join("");

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setChatChannel(channel) {
  currentChatChannel = channel;

  if (chatTabCet) chatTabCet.classList.toggle("active", channel === "CET");
  if (chatTabCells) chatTabCells.classList.toggle("active", channel === "CELLS");

  // por ahora ambas tabs muestran el mismo chat real de la operación
  renderChatMessages();
}

async function sendChatMessageToBackend(contenido, tipoMensaje = "NORMAL") {
  const opId = getActiveOperationId();

  const res = await fetch(`${API_BASE}/ops/${opId}/chat/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      contenido,
      tipo_mensaje: tipoMensaje
    })
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("session");
    localStorage.removeItem("token");
    localStorage.removeItem("active_operation_id");
    throw new Error(data?.mensaje || "Tu sesión expiró. Inicia sesión nuevamente.");
  }

  if (!res.ok) {
    throw new Error(data?.mensaje || `Error ${res.status} enviando mensaje`);
  }

  // el backend ya emite chat_message, pero por si tarda el socket,
  // metemos el mensaje retornado también
  if (data?.item) {
    mergeIncomingChatMessage(data.item);
    renderChatMessages();
  }

  return data;
}

chatTabCet?.addEventListener("click", () => setChatChannel("CET"));
chatTabCells?.addEventListener("click", () => setChatChannel("CELLS"));

quickMsgBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const msg = btn.dataset.msg || "";
    if (chatInput) chatInput.value = msg;
  });
});

sendChatBtn?.addEventListener("click", async () => {
  if (!isOperacionActiva()) {
    alert("El chat está en modo solo lectura.");
    return;
  }

  const text = chatInput?.value || "";
  const clean = text.trim();
  if (!clean) return;

  sendChatBtn.disabled = true;

  try {
    await sendChatMessageToBackend(clean, "NORMAL");
    chatInput.value = "";
  } catch (err) {
    console.error("Error enviando mensaje:", err);
    alert(err?.message || "No se pudo enviar el mensaje.");
  } finally {
    sendChatBtn.disabled = false;
  }
});

chatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatBtn?.click();
  }
});

recordVoiceBtn?.addEventListener("click", () => {
  if (voiceStatus) voiceStatus.textContent = "Grabación simulada en frontend...";
  if (recordVoiceBtn) recordVoiceBtn.disabled = true;
  if (stopVoiceBtn) stopVoiceBtn.disabled = false;
});

stopVoiceBtn?.addEventListener("click", () => {
  if (voiceStatus) voiceStatus.textContent = "Micrófono inactivo.";
  if (recordVoiceBtn) recordVoiceBtn.disabled = false;
  if (stopVoiceBtn) stopVoiceBtn.disabled = true;
});

function ensureMapActionButtonsVisible() {
  if (!mapActionButtons) return;
  mapActionButtons.style.display = "flex";
}

saveOpMapBtn?.addEventListener("click", async () => {
  const opId = getActiveOperationId();

  saveOpMapBtn.disabled = true;
  saveOpMapBtn.textContent = "Activando...";

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ estado: "ACTIVA" })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data?.mensaje || `Error al activar la operación (${res.status})`);
      saveOpMapBtn.disabled = false;
      saveOpMapBtn.textContent = "Activar operación";
      return;
    }

    sessionStorage.removeItem(`pendiente_activar_${opId}`);

    if (dashboardData?.operacion) {
      dashboardData.operacion.estado = "ACTIVA";
    }

    applyOperationStateUI();
    applyChatPermissions();

    if (!socket) {
      setupRealtimeSocket();
    }

    await loadChatHistoryFromBackend();

  } catch (err) {
    console.error("Error activando operación:", err);
    alert(err?.message || "No se pudo activar la operación.");
    saveOpMapBtn.disabled = false;
    saveOpMapBtn.textContent = "Activar operación";
  }
});

cancelOpMapBtn?.addEventListener("click", async () => {
  if (!confirm("¿Deseas cancelar esta operación? Se marcará como CANCELADA en el sistema y no podrá reactivarse.")) return;

  cancelOpMapBtn.disabled = true;
  cancelOpMapBtn.textContent = "Cancelando...";

  try {
    const idOp = getActiveOperationId();

    const res = await fetch(`${API_BASE}/ops/${idOp}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ estado: "CANCELADA" })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data?.mensaje || `Error al cancelar la operación (${res.status})`);
      cancelOpMapBtn.disabled = false;
      cancelOpMapBtn.textContent = "Cancelar operación";
      return;
    }

    // Limpiar estado local
    localStorage.removeItem(OPERACION_ACTUAL_KEY);
    localStorage.removeItem("active_operation_id");

    window.location.href = "menu_inicial.html";

  } catch (err) {
    console.error("Error cancelando operación:", err);
    alert(err?.message || "No se pudo cancelar la operación.");
    cancelOpMapBtn.disabled = false;
    cancelOpMapBtn.textContent = "Cancelar operación";
  }
});

// =================== LOADING SCREEN LOGIC ===================
function addLoadingLog(message, status = "..") {
  const logBox = document.getElementById("loadingLogBox");
  if (!logBox) return;

  const entry = document.createElement("div");
  entry.className = "logEntry";
  entry.innerHTML = `<span class="logStatus">[${status}]</span> ${message}`;
  logBox.prepend(entry); // Newest at top, but container is column-reverse
}

function updateLoadingProgress(percent) {
  const fill = document.getElementById("loadingBarFill");
  const text = document.getElementById("loadingPercentage");
  if (fill) fill.style.width = `${percent}%`;
  if (text) text.textContent = `${Math.round(percent)}%`;
}

function finishLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    setTimeout(() => overlay.remove(), 1000);
  }
}

// =================== INIT GENERAL ===================
document.addEventListener("DOMContentLoaded", async () => {
  if (!validateDashboardAccess()) return;

  try {
    updateLoadingProgress(10);
    addLoadingLog("Autenticando sesión táctica...", "OK");

    // 🔥 5. SEGURIDAD: Cargar token Cesium desde backend
    updateLoadingProgress(20);
    addLoadingLog("Cargando configuración de mapas...");
    await loadCesiumToken();
    addLoadingLog("Configuración de mapas lista", "OK");

    // Inicializar Cesium (pesado)
    updateLoadingProgress(25);
    addLoadingLog("Inicializando motor de mapas Cesium JS...");
    initCesium();
    addLoadingLog("Motor de mapas listo", "OK");

    updateLoadingProgress(40);
    addLoadingLog("Configurando herramientas de campo...", "OK");
    setTacticalUI();
    ensureMapActionButtonsVisible();

    // Carga de datos
    updateLoadingProgress(60);
    addLoadingLog("Sincronizando activos de la operación...");
    await loadDashboardFromBackend();
    addLoadingLog("Activos sincronizados", "OK");

    updateLoadingProgress(80);
    addLoadingLog("Aplicando estado operacional...");
    applyOperationStateUI();
    applyChatPermissions();

    // SOCKET SOLO EN ACTIVA
    if (isOperacionActiva()) {
      addLoadingLog("Conectando a red de datos en tiempo real...");
      setupRealtimeSocket();
      addLoadingLog("Enlace de datos activo", "OK");
    }

    // CHAT EN ACTIVA Y TERMINADA
    if (isOperacionActiva() || isOperacionTerminada()) {
      updateLoadingProgress(90);
      addLoadingLog("Recuperando historial de comunicaciones...");
      await loadChatHistoryFromBackend();
      addLoadingLog("Canales de voz y texto listos", "OK");
    } else {
      if (chatMessages) {
        chatMessages.innerHTML = `
          <div class="chatEmpty">
            El chat solo está disponible cuando la operación está ACTIVA o TERMINADA.
          </div>
        `;
      }
    }

    updateLoadingProgress(100);
    addLoadingLog("SISTEMA LISTO Y OPERATIVO", "OK");

    // Pequeña espera para que se vea el 100%
    setTimeout(() => {
      finishLoading();
      infoPanel.classList.add("open");
      toggleInfoPanel.classList.add("active");
    }, 500);

  } catch (err) {
    console.error("Error durante el arranque:", err);
    addLoadingLog(`ERROR CRÍTICO: ${err.message}`, "FAIL");
    updateLoadingProgress(100);

    // Permitir entrar aunque falle algo, para no bloquear
    setTimeout(() => {
      finishLoading();
      setRouteInfo(err?.message || "Error en la carga parcial del sistema.");
    }, 2000);
  }
});

// =================== CERRAR PANELES AL DAR CLICK FUERA ===================
document.addEventListener("click", (e) => {
  const clickedInsidePanel = e.target.closest(".glassPanel");
  const clickedToolButton = e.target.closest(".toolFab");
  const clickedCesium = e.target.closest(".cesium-viewer");
  const clickedPopup = e.target.closest("#entityPopup");
  const clickedActionBtn = e.target.closest(".actionBtn");

  if (!clickedInsidePanel && !clickedToolButton && !clickedCesium && !clickedPopup && !clickedActionBtn) {
    closeAllPanels();
  }
});