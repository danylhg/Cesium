/// asignacion.js — Integrado con backend real + borrador local + dashboard opcional

// ===============================
// Sesión / token
// ===============================
const ALLOWED_ROLES = ["ADMIN", "CUT"];
const LOGIN_URL = "login.html";

function redirectToLogin(reason = "Tu sesión ya no es válida.") {
  try {
    localStorage.removeItem("session");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("usuario");
    localStorage.removeItem("personal");
  } catch {}

  alert(reason);
  window.location.href = LOGIN_URL;
}

function getSessionFlag() {
  return localStorage.getItem("session");
}

function getToken() {
  return localStorage.getItem("token") || "";
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;

    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getStoredUser() {
  const candidates = ["usuario", "user", "personal"];

  for (const key of candidates) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }

  return null;
}

function getUserRole() {
  const user = getStoredUser();
  const token = getToken();
  const payload = decodeJwtPayload(token);

  return String(
    user?.rol ||
    user?.role ||
    payload?.rol ||
    ""
  ).toUpperCase().trim();
}

function getUserTable() {
  const user = getStoredUser();
  const token = getToken();
  const payload = decodeJwtPayload(token);

  return String(
    user?.tabla ||
    payload?.tabla ||
    ""
  ).toLowerCase().trim();
}

// auth_check.js en el head ya validó el token básico.
// Aquí dejamos las utilerías para usar el token en el API.

const API_BASE =
  window.API_BASE ||
  localStorage.getItem("API_BASE") ||
  `http://${window.location.hostname}:3001`;

async function api(path, { method = "GET", body } = {}) {
  const token = getToken();

  if (!token) {
    redirectToLogin("Tu sesión expiró. Vuelve a iniciar sesión.");
    return;
  }

  let res;

  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error("Error de red. No se pudo conectar con el servidor.");
  }

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (res.status === 401) {
    redirectToLogin(data?.mensaje || "Tu sesión expiró. Inicia sesión otra vez.");
    return;
  }

  if (res.status === 403) {
    throw new Error(data?.mensaje || "No tienes permisos para realizar esta acción.");
  }

  if (!res.ok) {
    const msg =
      data?.mensaje ||
      data?.error ||
      `HTTP ${res.status} ${res.statusText}`;

    throw new Error(msg);
  }

  return data;
}

function isPositiveInt(v) {
  return Number.isInteger(Number(v)) && Number(v) > 0;
}

function formatPuesto(str) {
  if (!str) return "";
  const low = str.toLowerCase().trim();
  if (low.includes("teniente")) return "Tte.";
  if (low.includes("capit")) return "Cap.";
  if (low.includes("sargento")) return "Sgto.";
  if (low.includes("cabo") || low === "cb") return "Cb.";
  if (low.includes("soldado")) return "Sold.";
  if (low.includes("general")) return "Gral.";
  if (low.includes("coronel")) return "Cnel.";
  if (low.includes("comandante")) return "Cmdt.";
  if (low.includes("mayor")) return "Myr.";
  return str;
}


function fullName(p) {
  const pto = formatPuesto(p?.puesto);
  const n = (p?.nombre || "").trim();
  const a = (p?.apellido || "").trim();
  const base = `${n}${a ? " " + a : ""}`.trim();
  return pto ? `${pto} ${base}` : base;
}

function getUserDisplayName() {
  const user = getStoredUser();
  const payload = decodeJwtPayload(getToken()) || {};

  const nombre =
    user?.nombre ||
    payload?.nombre ||
    payload?.name ||
    "";

  const apellido =
    user?.apellido ||
    payload?.apellido ||
    payload?.last_name ||
    "";

  const username =
    user?.username ||
    user?.usuario ||
    payload?.username ||
    payload?.usuario ||
    localStorage.getItem("username") ||
    "";

  const rol = getUserRole();

  const nombreCompleto = `${String(nombre).trim()} ${String(apellido).trim()}`.trim();

  if (nombreCompleto) return rol ? `${rol}: ${nombreCompleto}` : nombreCompleto;
  if (username) return rol ? `${rol}: ${username}` : username;
  return rol || "Usuario";
}

function setUsuarioHeader() {
  if (!lblUsuario) return;
  lblUsuario.textContent = getUserDisplayName();
}

function getTodayLocalDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeHoraInput(value) {
  let v = String(value || "").replace(/\D/g, "");
  if (v.length > 4) v = v.slice(0, 4);
  if (v.length > 2) v = `${v.slice(0, 2)}:${v.slice(2)}`;
  return v;
}

function sanitizeHoraFinal(value) {
  const v = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(v)) return "";

  let [h, m] = v.split(":").map(Number);
  h = Math.min(23, Math.max(0, h || 0));
  m = Math.min(59, Math.max(0, m || 0));

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function validateDateTime() {
  if (!opInicioEl || !opHoraInicioEl || !opInicioEl.value) return true;

  const today = new Date();
  const todayStr = getTodayLocalDateString();

  if (opInicioEl.value < todayStr) {
    opInicioEl.value = todayStr;
    alert("No puedes planificar una operación en una fecha pasada.");
    return false;
  }

  if (opInicioEl.value === todayStr && opHoraInicioEl.value) {
    const [hStr, mStr] = opHoraInicioEl.value.split(":");
    if (hStr !== undefined && mStr !== undefined) {
      const selectedMins = (parseInt(hStr, 10) * 60) + parseInt(mStr, 10);
      const currentMins = (today.getHours() * 60) + today.getMinutes();

      if (selectedMins < currentMins) {
        opHoraInicioEl.value =
          `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
        alert("La hora de inicio no puede ser menor a la hora actual.");
        return false;
      }
    }
  }

  return true;
}

// ===============================
// DOM principal
// ===============================
const panel = document.getElementById("panel");
const rightTitle = document.getElementById("rightTitle");
const rightHint = document.getElementById("rightHint");
const btnAccion = document.getElementById("btnAccion");
const btnBack = document.getElementById("btnBack");
const btnVolver = document.getElementById("btnVolver");
const lblOperacion = document.getElementById("lblOperacion");
const lblUsuario = document.getElementById("lblUsuario");

// form izquierda
const opNombreEl = document.getElementById("opNombre");
const opDescEl = document.getElementById("opDesc");
const opInicioEl = document.getElementById("opInicio");
const opHoraInicioEl = document.getElementById("opHoraInicio");
const opPrioridadEl = document.getElementById("opPrioridad");
const btnHoy = document.getElementById("btnHoy");

// panel izquierdo
const leftCardTitleEl = document.getElementById("leftCardTitle");
const opInfoFormEl = document.getElementById("opInfoForm");
const vehiculosLeftEl = document.getElementById("vehiculosLeft");

// dashboard opcional
const dashboardWrap = document.getElementById("dashboardWrap");
const btnDashboardGo = document.getElementById("btnDashboardGo");

function validateCriticalDOM() {
  const required = [
    ["panel", panel],
    ["rightTitle", rightTitle],
    ["rightHint", rightHint],
    ["btnAccion", btnAccion],
    ["btnBack", btnBack],
    ["btnVolver", btnVolver],
    ["lblOperacion", lblOperacion],
    ["lblUsuario", lblUsuario],
    ["opNombre", opNombreEl],
    ["opDesc", opDescEl],
    ["opInicio", opInicioEl],
    ["opHoraInicio", opHoraInicioEl],
    ["opPrioridad", opPrioridadEl],
    ["btnHoy", btnHoy],
    ["leftCardTitle", leftCardTitleEl],
    ["opInfoForm", opInfoFormEl],
    ["vehiculosLeft", vehiculosLeftEl]
  ];

  const missing = required
    .filter(([, el]) => !el)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Faltan elementos críticos del DOM en asignación: ${missing.join(", ")}`
    );
  }
}

validateCriticalDOM();

// ===============================
// Storage borrador local (DESACTIVADO)
// ===============================
const STORAGE_WIZARD_DRAFT = "asignacion_wizard_draft";
const STORAGE_OPERACION_ACTUAL = "operacion_actual";

function readObjectStorage(key, fallback = {}) {
  return fallback;
}

function writeStorage(key, value) {
  // desactivado
}

function removeStorage(key) {
  // desactivado
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

// ===============================
// UI helpers layout
// ===============================
function showOperacionInfo() {
  if (leftCardTitleEl) leftCardTitleEl.textContent = "Información de operación";
  if (opInfoFormEl) opInfoFormEl.style.display = "flex";
  if (vehiculosLeftEl) {
    vehiculosLeftEl.style.display = "none";
    vehiculosLeftEl.innerHTML = "";
  }
}

function showVehiculosLeftPanel(title = "Asignación de personal al vehículo") {
  if (leftCardTitleEl) leftCardTitleEl.textContent = title;
  if (opInfoFormEl) opInfoFormEl.style.display = "none";
  if (vehiculosLeftEl) {
    vehiculosLeftEl.style.display = "block";
    vehiculosLeftEl.innerHTML = "";
  }
}

function hideDashboardButton() {
  if (dashboardWrap) dashboardWrap.style.display = "none";
}

function showDashboardButton() {
  if (dashboardWrap) dashboardWrap.style.display = "flex";
}

// ===============================
// Estado
// ===============================
const state = {
  categoria: null,
  pasoPersonal: "home",
  opId: null,

  // catálogos backend
  cutList: [],
  cetList: [],
  cellList: [],
  vehiclesList: [],
  tacticalEquipmentList: [],
  communicationEquipmentList: [],

  // personal
  cutSeleccionadoId: null,
  cetSeleccionadosIds: [],
  cetActivoIndex: 0,
  asignacionCelulas: {},

  flotillaByCet: {},
  searchByCet: {},
  gruposByCet: {}, // { [cetId]: { names:[], active:null, map:{[grupo]: [id_personal...]}, idx:0, vehActive:null } }

  // vehículos
  asignacionVehiculos: {}, // { [id_personal]: id_vehiculo }
  cetActivoIndexVeh: 0,
  selectedVehicleId: null,
  selectedPersonIds: [],

  // equipos
  equipoCategoria: null, // tactico | comunicacion
  equipoDestino: null, // personal | vehiculo
  equipoSelectedItems: [], // [id_equipo]
  equipoSelectedResource: null, // { tipo, id_personal? id_vehiculo? label }
  equipoSelectedCet: null,
  equipoSelectedGrupo: null,
  asignacionEquipos: {
    tactico: {},
    comunicacion: {}
  }
};

// ===============================
// Helpers UI
// ===============================
function capFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getResourceLabel(res) {
  if (!res) return "—";
  if (res.label) return res.label;
  if (res.tipo === "personal") {
    const p = getPersonalById(res.id_personal);
    return p?.label || `Personal ${res.id_personal}`;
  }
  if (res.tipo === "vehiculo") {
    const v = state.vehiclesList.find(x => Number(x.id_vehiculo) === Number(res.id_vehiculo));
    return v?.label || `Vehículo ${res.id_vehiculo}`;
  }
  return "—";
}


function setHeader(title, hint) {
  rightTitle.textContent = capFirst(title);
  rightHint.textContent = capFirst(hint);
}

function setAccion(text, disabled = false) {
  btnAccion.textContent = capFirst(text);
  btnAccion.disabled = !!disabled;
}

function showBack(show) {
  btnBack.style.visibility = show ? "visible" : "hidden";
}

function clearPanel() {
  panel.innerHTML = "";
}

function getScrollTopInPanel() {
  return panel.querySelector(".listBox")?.scrollTop ?? 0;
}

function restoreScrollTop(listBoxEl, scrollTop) {
  if (!listBoxEl) return;
  requestAnimationFrame(() => {
    listBoxEl.scrollTop = scrollTop;
  });
}

function mkOpt(txt) {
  const b = document.createElement("button");
  b.className = "optBtn";
  b.textContent = capFirst(txt);
  return b;
}

function ensureCetState(cetId) {
  const id = Number(cetId);

  if (state.flotillaByCet[id] === undefined) state.flotillaByCet[id] = "";
  if (state.searchByCet[id] === undefined) state.searchByCet[id] = "";

  if (!state.gruposByCet[id]) {
    state.gruposByCet[id] = { names: [], active: null, map: {}, idx: 0, vehActive: null };
  } else {
    const gi = state.gruposByCet[id];
    if (!Array.isArray(gi.names)) gi.names = [];
    if (!gi.map || typeof gi.map !== "object") gi.map = {};
    if (gi.idx === undefined) gi.idx = 0;
    if (gi.vehActive === undefined) gi.vehActive = null;

    Object.keys(gi.map).forEach(k => {
      if (!Array.isArray(gi.map[k])) gi.map[k] = [];
      gi.map[k] = gi.map[k].map(Number).filter(isPositiveInt);
    });
  }
}

function getCetIdByIndex(idx) {
  return state.cetSeleccionadosIds[idx];
}

function getPersonalById(id) {
  return [...state.cutList, ...state.cetList, ...state.cellList].find(
    x => Number(x.id_personal) === Number(id)
  ) || null;
}

function getVehicleById(id) {
  return state.vehiclesList.find(v => Number(v.id_vehiculo) === Number(id)) || null;
}

function getEquipoListByCategoria() {
  if (state.equipoCategoria === "tactico") return state.tacticalEquipmentList;
  if (state.equipoCategoria === "comunicacion") return state.communicationEquipmentList;
  return [];
}

function getEquipoAssignmentsBucket() {
  if (state.equipoCategoria === "tactico") return state.asignacionEquipos.tactico;
  if (state.equipoCategoria === "comunicacion") return state.asignacionEquipos.comunicacion;
  return {};
}

function mapEquipoFromBackend(e) {
  return {
    id_equipo: Number(e.id_equipo),
    nombre: e.nombre || "Equipo",
    numeroSerie: e.numero_serie || "",
    categoria: String(e.categoria || "").toUpperCase(),
    image: e.imagen_eq || "",
    estado: e.estado || "DISPONIBLE",
    detalles: e.detalles || "",
    label: `${e.nombre || "Equipo"}${e.numero_serie ? ` — ${e.numero_serie}` : ""}`
  };
}

function getResourceLabel(resource) {
  if (!resource) return "";
  if (resource.tipo === "personal" && isPositiveInt(resource.id_personal)) {
    const p = getPersonalById(resource.id_personal);
    return resource.label || fullName(p) || `Personal ${resource.id_personal}`;
  }
  if (resource.tipo === "vehiculo" && isPositiveInt(resource.id_vehiculo)) {
    const v = getVehicleById(resource.id_vehiculo);
    return resource.label || v?.label || `Vehículo ${resource.id_vehiculo}`;
  }
  return "";
}

function resetEquipoFlow() {
  state.equipoCategoria = null;
  state.equipoDestino = null;
  state.equipoSelectedItems = [];
  state.equipoSelectedResource = null;
}

// ===============================
// Persistencia local del borrador (DESACTIVADA)
// ===============================
function collectOperacionActual() {
  return {
    nombre: normalizeText(opNombreEl?.value),
    descripcion: normalizeText(opDescEl?.value),
    fecha_inicio: normalizeText(opInicioEl?.value),
    hora_inicio: normalizeText(opHoraInicioEl?.value),
    prioridad: normalizeText(opPrioridadEl?.value),
    updated_at: new Date().toISOString()
  };
}

function saveOperacionActualLocal() {
  if (lblOperacion) {
    lblOperacion.textContent = normalizeText(opNombreEl?.value) || "—";
  }
  setUsuarioHeader();
}

function loadOperacionActualIntoForm() {
  if (lblOperacion) {
    const qsName = normalizeText(lblOperacion?.textContent);
    lblOperacion.textContent = qsName || "—";
  }
}

function buildDraftPayload() {
  return null;
}

function saveDraftLocal() {
  // desactivado
}

function restoreDraftLocal() {
  return false;
}

function clearDraftLocal() {
  localStorage.removeItem(STORAGE_WIZARD_DRAFT);
  localStorage.removeItem(STORAGE_OPERACION_ACTUAL);
}

// ===============================
// Carga inicial backend
// ===============================
async function loadCatalogs() {
  const [cutRes, cetRes, cellRes, vehRes, eqRes] = await Promise.all([
    api(`/catalog/personal?rol=CUT`),
    api(`/catalog/personal?rol=CET`),
    api(`/catalog/personal?rol=CELL`),
    api(`/catalog/vehiculos`),
    api(`/catalog/equipos`)
  ]);

  state.cutList = (cutRes.items || []).map(p => ({ ...p, label: fullName(p) }));
  state.cetList = (cetRes.items || []).map(p => ({ ...p, label: fullName(p) }));
  state.cellList = (cellRes.items || []).map(p => ({ ...p, label: fullName(p) }));

  state.vehiclesList = (vehRes.items || []).map(v => ({
    ...v,
    id_vehiculo: Number(v.id_vehiculo),
    capacidad: Number(v.capacidad || 0),
    label: [v.codigo_interno, v.alias].filter(Boolean).join(" — ") || v.codigo_interno || v.alias || `Vehículo ${v.id_vehiculo}`,
    image: v.imagen_veh || ""
  }));

  const equipos = (eqRes.items || []).map(mapEquipoFromBackend);
  state.tacticalEquipmentList = equipos.filter(e => e.categoria === "TACTICO");
  state.communicationEquipmentList = equipos.filter(e => e.categoria === "COMUNICACION");

  const qs = new URLSearchParams(window.location.search);
  const opCodigo = qs.get("op");
  if (opCodigo && lblOperacion) lblOperacion.textContent = opCodigo;
}

// ===============================
// Guardado backend
// ===============================
async function crearOperacionYPersonal() {
  const nombre = opNombreEl?.value.trim() || "";
  const descripcion = opDescEl?.value.trim() || "";
  const prioridad = opPrioridadEl?.value || "MEDIA";
  const fecha_inicio = opInicioEl?.value || null;
  const hora_inicio = opHoraInicioEl?.value || null;

  if (!nombre) throw new Error("Completa el nombre de la operación antes de continuar.");
  if (!state.cutSeleccionadoId) throw new Error("Falta seleccionar CUT.");
  if (state.cetSeleccionadosIds.length === 0) throw new Error("Falta seleccionar al menos un CET.");

  validateDateTime();

  let datetime_inicio = fecha_inicio;
  if (fecha_inicio && hora_inicio) {
    datetime_inicio = `${fecha_inicio}T${hora_inicio}:00`;
  }

  const opBody = { 
    nombre, 
    descripcion, 
    prioridad, 
    fecha_inicio: datetime_inicio
  };

  let yaExistia = false;
  let opRes;

  if (state.opId) {
    yaExistia = true;
    await api(`/ops/${state.opId}`, {
      method: "PUT",
      body: opBody
    });
    if (lblOperacion) lblOperacion.textContent = nombre;
  } else {
    opRes = await api("/ops", {
      method: "POST",
      body: opBody
    });
    state.opId = opRes.id_operacion;
    if (lblOperacion) lblOperacion.textContent = nombre;
  }

  const uniquePersonalIds = new Set();
  uniquePersonalIds.add(Number(state.cutSeleccionadoId));
  state.cetSeleccionadosIds.forEach(id => uniquePersonalIds.add(Number(id)));
  Object.values(state.asignacionCelulas || {}).forEach(arr =>
    (arr || []).forEach(id => uniquePersonalIds.add(Number(id)))
  );

  const personalItems = [];
  for (const id_personal of uniquePersonalIds) {
    const p = getPersonalById(id_personal);
    personalItems.push({
      id_personal,
      rol_en_operacion: p?.rol || null,
      estado_asignacion: "ASIGNADO",
    });
  }

  await api(`/ops/${state.opId}/personal`, {
    method: "POST",
    body: { items: personalItems },
  });

  // ELIMINADO: Ya no guardamos /mando por separado. 
  // La jerarquía se reconstruirá 100% desde /grupos para evitar conflictos.

  // NUEVO: Guardar Grupos creados en el Wizard
  const gruposPayload = [];
  state.cetSeleccionadosIds.forEach(cetId => {
    const info = state.gruposByCet[cetId];
    if (info && info.names && info.names.length > 0) {
      info.names.forEach(gName => {
        const id_cet_fix = Number(cetId);
        const cetObj = getPersonalById(id_cet_fix);
        if (id_cet_fix > 0) {
          gruposPayload.push({
            nombre: gName,
            id_cet: id_cet_fix,
            cet_nombre: cetObj?.label || (`CET ${id_cet_fix}`),
            flotilla: state.flotillaByCet[cetId] || "",
            integrantes: (info.map[gName] || []).map(Number),
            vehiculos: (info.vehMap && info.vehMap[gName]) ? [Number(info.vehMap[gName])] : []
          });
        }
      });
    }
  });

  // Siempre enviamos /grupos para asegurar que se registre el mando directo de las CELULAS
  // incluso si la operación no tuviera subgrupos.
  await api(`/ops/${state.opId}/grupos`, {
    method: "POST",
    body: { grupos: gruposPayload, directos: state.asignacionCelulas }
  });

  saveDraftLocal();
  return { nombre, codigo: opRes?.codigo || null, yaExistia };
}


async function saveVehiculos() {
  if (!state.opId) throw new Error("No hay operación activa.");

  const vehItems = Object.entries(state.asignacionVehiculos || {}).map(([id_personal, id_vehiculo]) => ({
    id_personal: Number(id_personal),
    id_vehiculo: Number(id_vehiculo),
  }));

  await api(`/ops/${state.opId}/vehiculos`, {
    method: "POST",
    body: { items: vehItems },
  });

  saveDraftLocal();
}

async function saveEquipos() {
  if (!state.opId) throw new Error("No hay operación activa.");

  const allBuckets = [
    ...Object.entries(state.asignacionEquipos.tactico || {}),
    ...Object.entries(state.asignacionEquipos.comunicacion || {})
  ];

  const items = allBuckets
    .map(([id_equipo, resource]) => {
      const base = {
        id_equipo: Number(id_equipo),
        cantidad: 1,
        estado_asignacion: "ASIGNADO",
        uso_en_operacion: getResourceLabel(resource) || null
      };

      if (resource?.tipo === "personal" && isPositiveInt(resource.id_personal)) {
        // Validar que el personal esté asignado a esta operación
        return {
          ...base,
          id_personal: Number(resource.id_personal)
        };
      }

      if (resource?.tipo === "vehiculo" && isPositiveInt(resource.id_vehiculo)) {
        // Validar que el vehículo esté en la selección actual
        const vId = Number(resource.id_vehiculo);
        const existsInSelection = Object.values(state.asignacionVehiculos || {}).includes(vId);
        
        // Si el vehículo no está en la selección actual, no lo guardamos (evita stale VH-001)
        if (!existsInSelection) return null;

        return {
          ...base,
          id_vehiculo: vId
        };
      }

      return null;
    })
    .filter(Boolean);

  await api(`/ops/${state.opId}/equipos`, {
    method: "POST",
    body: { items }
  });

  saveDraftLocal();
}

// ===============================
// Home
// ===============================
function renderHome() {
  // Solo ocultar el botón de Dashboard si la operación NO tiene id (es nueva)
  const esExistente = !!(state.opId);
  if (!esExistente) {
    hideDashboardButton();
  }
  showOperacionInfo();
  clearPanel();
  state.categoria = null;
  state.pasoPersonal = "home";

  setHeader("Asignar", "");
  setAccion("Siguiente", true);
  showBack(false);

  const grid = document.createElement("div");
  grid.className = "optGrid";

  const btnPersonal = mkOpt("Personal");
  const btnEquipo = mkOpt("Equipo");
  const btnVehiculos = mkOpt("Vehículos");

  btnPersonal.addEventListener("click", () => {
    state.categoria = "personal";
    state.pasoPersonal = "cut";
    saveDraftLocal();
    renderCUT();
  });

  btnVehiculos.addEventListener("click", () => {
    state.categoria = "vehiculos";
    if (!state.cutSeleccionadoId || state.cetSeleccionadosIds.length === 0) {
      alert("Primero asigna CUT y CET/CELL.");
      state.categoria = "personal";
      state.pasoPersonal = "cut";
      saveDraftLocal();
      renderCUT();
      return;
    }
    state.cetActivoIndexVeh = 0;
    state.selectedVehicleId = null;
    state.selectedPersonIds = [];
    saveDraftLocal();
    renderVehiculos();
  });

  btnEquipo.addEventListener("click", () => {
    if (!state.opId) {
      alert("Primero crea la operación pasando por personal y vehículos.");
      return;
    }
    state.categoria = "equipo";
    resetEquipoFlow();
    saveDraftLocal();
    renderEquipoHome();
  });

  grid.append(btnPersonal, btnVehiculos, btnEquipo);
  panel.appendChild(grid);
}

// ===============================
// CUT
// ===============================
function renderCUT() {
  showOperacionInfo();
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  setHeader("Comandante de Unidad Táctica", "");
  setAccion("Siguiente", !state.cutSeleccionadoId);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  const search = document.createElement("input");
  search.className = "inp";
  search.placeholder = "Buscar CUT...";
  search.style.marginBottom = "10px";

  const rowsWrap = document.createElement("div");
  rowsWrap.style.display = "flex";
  rowsWrap.style.flexDirection = "column";
  rowsWrap.style.gap = "10px";

  function paint(filterText) {
    const ft = (filterText || "").toLowerCase().trim();
    rowsWrap.innerHTML = "";

    state.cutList
      .filter(p => !ft || p.label.toLowerCase().includes(ft))
      .forEach(p => {
        const row = document.createElement("div");
        row.className = "item" + (state.cutSeleccionadoId === p.id_personal ? " selected" : "");

        const left = document.createElement("div");
        left.className = "itemName";
        left.textContent = p.label;
        left.style.cursor = "pointer";
        left.addEventListener("click", () => {
          state.cutSeleccionadoId = Number(p.id_personal);
          state.cetSeleccionadosIds = [];
          state.cetActivoIndex = 0;
          state.asignacionCelulas = {};
          state.asignacionVehiculos = {};
          state.gruposByCet = {};
          state.flotillaByCet = {};
          state.searchByCet = {};
          state.asignacionEquipos = { tactico: {}, comunicacion: {} };
          resetEquipoFlow();

          saveDraftLocal();
          renderCUT();
        });

        row.appendChild(left);
        rowsWrap.appendChild(row);
      });
  }

  search.addEventListener("input", () => paint(search.value));
  listBox.appendChild(search);
  listBox.appendChild(rowsWrap);
  panel.appendChild(listBox);

  paint("");
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = () => {
    if (!state.cutSeleccionadoId) return;
    state.pasoPersonal = "cet";
    saveDraftLocal();
    renderCET();
  };
}

// ===============================
// CET
// ===============================
function renderCET() {
  showOperacionInfo();
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  setHeader("Comandante de Equipo de Trabajo", "");
  setAccion("Siguiente", state.cetSeleccionadosIds.length === 0);

  const chips = document.createElement("div");
  chips.className = "chipRow";

  const cutObj = state.cutList.find(x => Number(x.id_personal) === Number(state.cutSeleccionadoId));
  const cutChip = document.createElement("div");
  cutChip.className = "chip";
  cutChip.textContent = `CUT: ${cutObj?.label || "—"}`;
  chips.appendChild(cutChip);

  state.cetSeleccionadosIds.forEach(id => {
    const p = getPersonalById(id);
    const c = document.createElement("div");
    c.className = "chip active";
    c.textContent = `CET: ${p?.label || id}`;
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  const search = document.createElement("input");
  search.className = "inp";
  search.placeholder = "Buscar CET...";
  search.style.marginBottom = "10px";

  const rowsWrap = document.createElement("div");
  rowsWrap.style.display = "flex";
  rowsWrap.style.flexDirection = "column";
  rowsWrap.style.gap = "10px";

  function paint(filterText) {
    const ft = (filterText || "").toLowerCase().trim();
    rowsWrap.innerHTML = "";

    state.cetList
      .filter(p => !ft || p.label.toLowerCase().includes(ft))
      .forEach(p => {
        const isSel = state.cetSeleccionadosIds.includes(Number(p.id_personal));

        const row = document.createElement("div");
        row.className = "item" + (isSel ? " selected" : "");

        const left = document.createElement("div");
        left.className = "itemName";
        left.textContent = p.label;
        left.style.cursor = "pointer";
        left.addEventListener("click", () => {
          if (isSel) {
            state.cetSeleccionadosIds = state.cetSeleccionadosIds.filter(id => Number(id) !== Number(p.id_personal));
            delete state.asignacionCelulas[Number(p.id_personal)];
            delete state.flotillaByCet[Number(p.id_personal)];
            delete state.searchByCet[Number(p.id_personal)];
            delete state.gruposByCet[Number(p.id_personal)];
          } else {
            state.cetSeleccionadosIds.push(Number(p.id_personal));
            ensureCetState(Number(p.id_personal));
          }
          saveDraftLocal();

          renderCET();
        });

        row.appendChild(left);
        rowsWrap.appendChild(row);
      });
  }

  search.addEventListener("input", () => paint(search.value));
  listBox.appendChild(search);
  listBox.appendChild(rowsWrap);
  panel.appendChild(listBox);

  paint("");
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = () => {
    if (state.cetSeleccionadosIds.length === 0) return;

    state.cetSeleccionadosIds.forEach(cetId => {
      if (!state.asignacionCelulas[cetId]) state.asignacionCelulas[cetId] = [];
      ensureCetState(cetId);
    });

    state.pasoPersonal = "celulas";
    state.cetActivoIndex = 0;

    const firstCet = getCetIdByIndex(0);
    const gi = state.gruposByCet[firstCet];
    if (gi && (gi.names || []).length > 0) {
      gi.idx = Math.max(0, Math.min(gi.idx || 0, gi.names.length - 1));
      gi.active = gi.names[gi.idx];
      if (!gi.vehActive) gi.vehActive = gi.active;
    }

    saveDraftLocal();
    renderCelulas();
  };
}

// ===============================
// Chips grupos
// ===============================
function pintarChipsGrupos(cetId, container) {
  container.innerHTML = "";
  ensureCetState(cetId);
  const info = state.gruposByCet[cetId];
  const hasGroups = (info.names || []).length > 0;

  if (hasGroups) {
    info.idx = Math.max(0, Math.min(info.idx, info.names.length - 1));
    if (!info.active) info.active = info.names[info.idx];
    if (info.active && !info.names.includes(info.active)) info.active = info.names[info.idx];
    if (!info.vehActive) info.vehActive = info.active;
  } else {
    info.active = null;
    info.idx = 0;
    info.vehActive = null;
  }

  info.names.forEach((gName, index) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (info.active === gName ? " active" : "");
    chip.textContent = gName;
    chip.addEventListener("click", () => {
      info.idx = index;
      info.active = gName;
      saveDraftLocal();
      renderCelulas();
    });
    container.appendChild(chip);
  });
}

// ===============================
// Células
// ===============================
function renderCelulas() {
  showOperacionInfo();
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  const cetId = state.cetSeleccionadosIds[state.cetActivoIndex];
  const asignadas = state.asignacionCelulas[cetId] || [];

  ensureCetState(cetId);
  const info = state.gruposByCet[cetId];
  const hasGroups = (info.names || []).length > 0;

  if (hasGroups) {
    info.idx = Math.max(0, Math.min(info.idx, info.names.length - 1));
    if (!info.active) info.active = info.names[info.idx];
    if (info.active && !info.names.includes(info.active)) info.active = info.names[info.idx];
    if (!info.vehActive) info.vehActive = info.active;
  } else {
    info.active = null;
    info.idx = 0;
    info.vehActive = null;
  }

  setHeader("Células", "");

  const lastCet = state.cetActivoIndex === state.cetSeleccionadosIds.length - 1;
  const lastGroup = !hasGroups || (info.idx === info.names.length - 1);
  setAccion((lastCet && lastGroup) ? "Crear operación" : "Siguiente", false);

  const chips = document.createElement("div");
  chips.className = "chipRow";

  const cutObj = state.cutList.find(x => Number(x.id_personal) === Number(state.cutSeleccionadoId));
  const cutChip = document.createElement("div");
  cutChip.className = "chip";
  cutChip.textContent = `CUT: ${cutObj?.label || "—"}`;
  chips.appendChild(cutChip);

  state.cetSeleccionadosIds.forEach((id, i) => {
    const p = getPersonalById(id);
    const c = document.createElement("div");
    c.className = "chip" + (i === state.cetActivoIndex ? " active" : "");
    c.textContent = `CET: ${p?.label || id}`;
    c.addEventListener("click", () => {
      state.cetActivoIndex = i;
      const gi = state.gruposByCet[id];
      if (gi) {
        if (gi.idx === undefined) gi.idx = 0;
        if (gi.vehActive === undefined) gi.vehActive = null;
        if ((gi.names || []).length > 0) {
          gi.idx = Math.max(0, Math.min(gi.idx, gi.names.length - 1));
          gi.active = gi.names[gi.idx];
          if (!gi.vehActive) gi.vehActive = gi.active;
        } else {
          gi.idx = 0;
          gi.active = null;
          gi.vehActive = null;
        }
      }
      saveDraftLocal();
      renderCelulas();
    });
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  const sticky = document.createElement("div");
  sticky.className = "stickyTop";

  const flotillaRow = document.createElement("div");
  flotillaRow.className = "flotillaRow";

  const flotWrap = document.createElement("div");
  flotWrap.style.flex = "1";

  const flotLbl = document.createElement("div");
  flotLbl.className = "lbl";
  flotLbl.style.marginBottom = "6px";
  flotLbl.textContent = "Nombre de la flotilla";

  const flotInp = document.createElement("input");
  flotInp.className = "inp";
  flotInp.value = state.flotillaByCet[cetId] || "";
  flotInp.addEventListener("input", () => {
    state.flotillaByCet[cetId] = flotInp.value;
    saveDraftLocal();
  });

  flotWrap.appendChild(flotLbl);
  flotWrap.appendChild(flotInp);

  const btnCrearGrupo = document.createElement("button");
  btnCrearGrupo.className = "btnSoft";
  btnCrearGrupo.textContent = "Crear grupo";
  btnCrearGrupo.addEventListener("click", () => abrirModalCrearGrupo());

  flotillaRow.appendChild(flotWrap);
  flotillaRow.appendChild(btnCrearGrupo);

  const groupsRow = document.createElement("div");
  groupsRow.className = "groupsRow";
  pintarChipsGrupos(cetId, groupsRow);

  const searchInp = document.createElement("input");
  searchInp.className = "inp";
  searchInp.placeholder = "Buscar células...";
  searchInp.value = state.searchByCet[cetId] || "";

  sticky.appendChild(flotillaRow);
  sticky.appendChild(groupsRow);
  sticky.appendChild(searchInp);
  listBox.appendChild(sticky);

  const rowsWrap = document.createElement("div");
  rowsWrap.style.display = "flex";
  rowsWrap.style.flexDirection = "column";
  rowsWrap.style.gap = "10px";

  const yaUsadas = new Set();
  state.cetSeleccionadosIds.forEach((otherCetId, i) => {
    if (i === state.cetActivoIndex) return;
    (state.asignacionCelulas[otherCetId] || []).forEach(x => yaUsadas.add(Number(x)));
  });

  function paintCells() {
    const term = (state.searchByCet[cetId] || "").toLowerCase().trim();
    rowsWrap.innerHTML = "";

    const grupoActivo = info?.active || null;

    state.cellList
      .filter(p => !term || p.label.toLowerCase().includes(term))
      .forEach(p => {
        const cellId = Number(p.id_personal);
        
        // 1. ¿Está asignado a OTRO CET?
        const bloqueada = yaUsadas.has(cellId);

        // 2. ¿Está asignado a ESTE CET?
        const enEsteCet = asignadas.includes(cellId);

        // 3. ¿En qué grupo de este CET está?
        let grupoPertenece = null;
        if (enEsteCet) {
          grupoPertenece = Object.keys(info.map || {}).find(g => 
            (info.map[g] || []).map(Number).includes(cellId)
          );
        }

        // 4. Visualmente: ¿está "Seleccionado" para el grupo ACTIVO?
        const visualmenteSeleccionado = !!(grupoActivo && grupoPertenece === grupoActivo);

        // 5. Determinar Status y Propiedades
        let status = "Disponible";
        if (bloqueada) {
          status = "Asignado (Otro CET)";
        } else if (enEsteCet) {
          status = grupoPertenece ? `En ${grupoPertenece}` : "En este CET";
        }

        const row = celulaRow({
          name: p.label,
          selected: visualmenteSeleccionado,
          disabled: bloqueada,
          status: status,
          onToggle: () => {
            if (bloqueada) return;
            
            if (!grupoActivo) {
              // Si no hay grupo activo, lógica simple de toggle en el CET
              if (enEsteCet) {
                state.asignacionCelulas[cetId] = asignadas.filter(x => Number(x) !== cellId);
              } else {
                state.asignacionCelulas[cetId] = [...asignadas, cellId];
              }
            } else {
              // Lógica con Grupo Activo (EXCLUSIVIDAD)
              if (!info.map[grupoActivo]) info.map[grupoActivo] = [];

              if (visualmenteSeleccionado) {
                // Deseleccionar del grupo activo y borrar del CET
                info.map[grupoActivo] = info.map[grupoActivo].filter(x => Number(x) !== cellId);
                state.asignacionCelulas[cetId] = asignadas.filter(x => Number(x) !== cellId);
              } else {
                // Seleccionar para el grupo activo
                
                // a) Quitar de cualquier OTRO grupo en este mismo CET si existía
                Object.keys(info.map).forEach(g => {
                  info.map[g] = (info.map[g] || []).filter(x => Number(x) !== cellId);
                });

                // b) Agregar al grupo activo
                info.map[grupoActivo].push(cellId);

                // c) Asegurar que esté en la lista del CET
                if (!enEsteCet) {
                  state.asignacionCelulas[cetId] = [...asignadas, cellId];
                }
              }
            }


            saveDraftLocal();

            renderCelulas();
          }
        });

        rowsWrap.appendChild(row);
      });
  }

  searchInp.addEventListener("input", () => {
    state.searchByCet[cetId] = searchInp.value;
    saveDraftLocal();
    paintCells();
  });

  listBox.appendChild(rowsWrap);
  panel.appendChild(listBox);

  paintCells();
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = async () => {
    if (hasGroups && info.idx < info.names.length - 1) {
      info.idx += 1;
      info.active = info.names[info.idx];
      if (!info.vehActive) info.vehActive = info.active;
      saveDraftLocal();
      renderCelulas();
      return;
    }

    if (state.cetActivoIndex < state.cetSeleccionadosIds.length - 1) {
      state.cetActivoIndex += 1;
      const nextCet = getCetIdByIndex(state.cetActivoIndex);
      const ngi = state.gruposByCet[nextCet];
      if (ngi) {
        if (ngi.idx === undefined) ngi.idx = 0;
        if (ngi.vehActive === undefined) ngi.vehActive = null;
        if ((ngi.names || []).length > 0) {
          ngi.idx = Math.max(0, Math.min(ngi.idx, ngi.names.length - 1));
          ngi.active = ngi.names[ngi.idx];
          if (!ngi.vehActive) ngi.vehActive = ngi.active;
        } else {
          ngi.idx = 0;
          ngi.active = null;
          ngi.vehActive = null;
        }
      }
      saveDraftLocal();
      renderCelulas();
      return;
    }

    try {
      setAccion("Guardando...", true);
      await crearOperacionYPersonal();
      state.cetActivoIndexVeh = 0;
      state.selectedVehicleId = null;
      state.selectedPersonIds = [];
      saveDraftLocal();
      renderVehiculos();
    } catch (e) {
      setAccion("Crear operación", false);
      alert(`Error al crear la operación: ${e.message}`);
    }
  };
}

// ===============================
// Modal crear grupos
// ===============================
function abrirModalCrearGrupo() {
  const cetId = state.cetSeleccionadosIds[state.cetActivoIndex];
  if (!cetId) return;

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(15,23,42,.35)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.remove();
  });

  const modal = document.createElement("div");
  modal.style.width = "520px";
  modal.style.maxWidth = "92vw";
  modal.style.background = "#fff";
  modal.style.borderRadius = "16px";
  modal.style.border = "1px solid #d7e3ff";
  modal.style.boxShadow = "0 24px 60px rgba(15,23,42,.20)";
  modal.style.padding = "16px";

  const title = document.createElement("div");
  title.style.fontWeight = "900";
  title.style.fontSize = "18px";
  title.style.textAlign = "center";
  title.style.marginBottom = "12px";
  title.textContent = "Crear Grupos";

  const row1 = document.createElement("div");
  row1.style.display = "flex";
  row1.style.gap = "10px";
  row1.style.alignItems = "center";
  row1.style.marginBottom = "10px";

  const lbl = document.createElement("div");
  lbl.style.fontWeight = "800";
  lbl.textContent = "Cuantos";

  const inpNum = document.createElement("input");
  inpNum.type = "number";
  inpNum.min = "1";
  inpNum.className = "inp";
  inpNum.style.width = "120px";

  row1.append(lbl, inpNum);

  const formWrap = document.createElement("div");
  formWrap.style.display = "flex";
  formWrap.style.flexDirection = "column";
  formWrap.style.gap = "10px";
  formWrap.style.marginTop = "6px";

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "8px";
  btnRow.style.justifyContent = "flex-end";
  btnRow.style.marginTop = "14px";

  const btnCancel = document.createElement("button");
  btnCancel.className = "btnGhost";
  btnCancel.textContent = "Cancelar";
  btnCancel.addEventListener("click", () => overlay.remove());

  const btnCreate = document.createElement("button");
  btnCreate.className = "btnPrimary";
  btnCreate.textContent = "Crear grupos";
  btnCreate.style.width = "180px";

  let nameInputs = [];

  function buildFields() {
    formWrap.innerHTML = "";
    nameInputs = [];
    const n = Number(inpNum.value || 0);
    if (!n || n < 1) return;

    for (let i = 0; i < n; i++) {
      const line = document.createElement("div");
      line.style.display = "flex";
      line.style.gap = "10px";
      line.style.alignItems = "center";

      const l = document.createElement("div");
      l.style.fontWeight = "800";
      l.style.width = "140px";
      l.textContent = "Nombre del grupo";

      const inp = document.createElement("input");
      inp.className = "inp";
      inp.value = "";
      nameInputs.push(inp);

      line.append(l, inp);
      formWrap.appendChild(line);
    }
  }

  inpNum.addEventListener("input", buildFields);

  btnCreate.addEventListener("click", () => {
    const names = nameInputs.map(i => i.value.trim()).filter(Boolean);
    const nExpected = Number(inpNum.value || 0);

    if (!nExpected || nExpected < 1) return alert("Pon un número válido en 'Cuantos'.");
    if (names.length !== nExpected) return alert("Completa todos los nombres de grupo.");

    ensureCetState(cetId);
    const info = state.gruposByCet[cetId];

    names.forEach(g => {
      if (!info.names.includes(g)) {
        info.names.push(g);
        if (!info.map[g]) info.map[g] = [];
      }
    });

    if (info.names.length > 0 && (!info.active || !info.names.includes(info.active))) {
      info.idx = Math.max(0, Math.min(info.idx, info.names.length - 1));
      info.active = info.names[info.idx];
    }
    if (!info.vehActive && info.names.length > 0) {
      info.vehActive = info.active || info.names[0];
    }

    saveDraftLocal();
    overlay.remove();
    renderCelulas();
  });

  btnRow.append(btnCancel, btnCreate);
  modal.append(title, row1, formWrap, btnRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  inpNum.focus();
}

// ===============================
// Vehículos
// ===============================
function renderVehiculos() {
  clearPanel();
  showBack(true);
  showVehiculosLeftPanel("Asignación de personal al vehículo");

  const vehCount = {};
  Object.values(state.asignacionVehiculos || {}).forEach(vId => {
    if (!vId) return;
    vehCount[vId] = (vehCount[vId] || 0) + 1;
  });

  const cetId = getCetIdByIndex(state.cetActivoIndexVeh);
  const cetObj = getPersonalById(cetId);

  ensureCetState(cetId);
  const ginfo = state.gruposByCet[cetId];
  const hasGroups = (ginfo.names || []).length > 0;

  if (hasGroups) {
    if (!ginfo.vehActive || !ginfo.names.includes(ginfo.vehActive)) {
      ginfo.vehActive = (ginfo.active && ginfo.names.includes(ginfo.active))
        ? ginfo.active
        : ginfo.names[0];
    }
  } else {
    ginfo.vehActive = null;
  }

  const groupIndex = hasGroups ? Math.max(0, ginfo.names.indexOf(ginfo.vehActive)) : 0;
  const lastGroupIndex = hasGroups ? (ginfo.names.length - 1) : 0;

  setHeader("Asignación de Vehículos", "");
  const lastCet = state.cetActivoIndexVeh === state.cetSeleccionadosIds.length - 1;
  const isLastOverall = lastCet && (!hasGroups || groupIndex === lastGroupIndex);
  setAccion(isLastOverall ? "Guardar y pasar a equipos" : "Siguiente", false);

  const cetButtons = document.createElement("div");
  cetButtons.className = "chipRow";
  cetButtons.style.marginBottom = "12px";

  state.cetSeleccionadosIds.forEach((id, i) => {
    const p = getPersonalById(id);
    const btn = document.createElement("button");
    btn.className = "chip" + (i === state.cetActivoIndexVeh ? " active" : "");
    btn.textContent = `CET: ${p?.label || id}`;
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => {
      state.cetActivoIndexVeh = i;
      state.selectedPersonIds = [];
      state.selectedVehicleId = null;
      saveDraftLocal();
      renderVehiculos();
    });
    cetButtons.appendChild(btn);
  });
  vehiculosLeftEl.appendChild(cetButtons);

  const headerBox = document.createElement("div");
  headerBox.className = "stickyTop";
  headerBox.style.position = "relative";
  headerBox.style.top = "auto";
  headerBox.style.padding = "10px 0";
  headerBox.style.background = "#fff";
  headerBox.style.borderBottom = "1px solid #d7e3ff";
  headerBox.style.marginBottom = "10px";

  const flotillaLbl = document.createElement("div");
  flotillaLbl.className = "lbl";
  flotillaLbl.style.marginBottom = "8px";
  flotillaLbl.textContent = "Nombre de la flotilla";

  const flotillaChip = document.createElement("div");
  flotillaChip.className = "chip active";
  flotillaChip.style.display = "inline-block";
  flotillaChip.style.cursor = "default";
  flotillaChip.textContent = state.flotillaByCet[cetId] || "—";

  headerBox.appendChild(flotillaLbl);
  headerBox.appendChild(flotillaChip);

  if (hasGroups) {
    const grpLbl = document.createElement("div");
    grpLbl.className = "lbl";
    grpLbl.style.margin = "12px 0 8px";
    grpLbl.textContent = "Grupos";

    const grpRow = document.createElement("div");
    grpRow.className = "groupsRow";

    ginfo.names.forEach(gName => {
      const chip = document.createElement("button");
      chip.className = "chip" + (ginfo.vehActive === gName ? " active" : "");
      chip.textContent = gName;
      chip.addEventListener("click", () => {
        ginfo.vehActive = gName;
        state.selectedPersonIds = [];
        state.selectedVehicleId = null;
        saveDraftLocal();
        renderVehiculos();
      });
      grpRow.appendChild(chip);
    });

    headerBox.appendChild(grpLbl);
    headerBox.appendChild(grpRow);
  }

  vehiculosLeftEl.appendChild(headerBox);

  const cellulasList = document.createElement("div");
  cellulasList.style.maxHeight = "350px";
  cellulasList.style.overflowY = "auto";

  const cellsForCet = state.asignacionCelulas[cetId] || [];
  let cellsToShow = cellsForCet.slice();

  if (hasGroups && ginfo.vehActive) {
    const arr = (ginfo.map[ginfo.vehActive] || []);
    cellsToShow = arr.filter(id => cellsForCet.includes(id));
  }

  function toggleSelectedId(id, checked) {
    const set = new Set(state.selectedPersonIds || []);
    if (checked) set.add(Number(id));
    else set.delete(Number(id));
    state.selectedPersonIds = Array.from(set);
  }

  function mkCheckRow({ labelText, disabled = false, checked = false, onChange }) {
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "10px";
    label.style.marginBottom = "10px";
    label.style.padding = "10px";
    label.style.cursor = disabled ? "not-allowed" : "pointer";
    label.style.borderRadius = "8px";
    label.style.backgroundColor = "#f5f5f5";
    if (disabled) label.style.opacity = "0.65";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = checked;
    chk.disabled = disabled;
    chk.addEventListener("change", e => onChange?.(e.target.checked));

    const textSpan = document.createElement("span");
    textSpan.style.flex = "1";
    textSpan.textContent = labelText;

    label.appendChild(chk);
    label.appendChild(textSpan);
    return label;
  }

  if (cellsToShow.length > 0) {
    const visibleIds = [Number(cetId), ...cellsToShow.map(Number)];
    const unlockedVisible = visibleIds.filter(id => !state.asignacionVehiculos[id]);
    const allSel =
      unlockedVisible.length > 0 &&
      unlockedVisible.every(id => (state.selectedPersonIds || []).includes(Number(id)));
    const someSel =
      unlockedVisible.some(id => (state.selectedPersonIds || []).includes(Number(id)));

    const rowAll = mkCheckRow({
      labelText: "Seleccionar todo lo visible",
      disabled: unlockedVisible.length === 0,
      checked: allSel,
      onChange: checked => {
        const set = new Set(state.selectedPersonIds || []);
        if (checked) unlockedVisible.forEach(id => set.add(Number(id)));
        else unlockedVisible.forEach(id => set.delete(Number(id)));
        state.selectedPersonIds = Array.from(set);
        renderVehiculos();
      }
    });

    rowAll.style.borderBottom = "2px solid #d7e3ff";
    rowAll.style.marginBottom = "15px";
    rowAll.style.paddingBottom = "15px";
    rowAll.querySelector("input").indeterminate = (!allSel && someSel);
    cellulasList.appendChild(rowAll);
  }

  const cetLocked = !!state.asignacionVehiculos[cetId];
  cellulasList.appendChild(mkCheckRow({
    labelText: cetLocked
      ? `CET: ${cetObj?.label || cetId} (Asignado)`
      : `CET: ${cetObj?.label || cetId}`,
    disabled: cetLocked,
    checked: (state.selectedPersonIds || []).includes(Number(cetId)),
    onChange: checked => {
      toggleSelectedId(cetId, checked);
      renderVehiculos();
    }
  }));

  cellsToShow.forEach(cellId => {
    const p = getPersonalById(cellId);
    const locked = !!state.asignacionVehiculos[cellId];
    cellulasList.appendChild(mkCheckRow({
      labelText: locked ? `${p?.label || cellId} (Asignado)` : (p?.label || cellId),
      disabled: locked,
      checked: (state.selectedPersonIds || []).includes(Number(cellId)),
      onChange: checked => {
        toggleSelectedId(cellId, checked);
        renderVehiculos();
      }
    }));
  });


  vehiculosLeftEl.appendChild(cellulasList);

  const vehiclesWrap = document.createElement("div");
  vehiclesWrap.className = "listBox";
  vehiclesWrap.style.gap = "12px";

  const vehicleGrid = document.createElement("div");
  vehicleGrid.className = "vehicleGrid";
  vehicleGrid.style.maxHeight = "300px";
  vehicleGrid.style.overflowY = "auto";

  state.vehiclesList.forEach(veh => {
    const card = document.createElement("div");
    card.className = "vehicleCard";
    card.style.cursor = "pointer";

    const used = vehCount[veh.id_vehiculo] || 0;
    const cap = Number(veh.capacidad || 0);
    const isFull = cap > 0 && used >= cap;
    const estadoUp = (veh.estado || "").toString().toUpperCase();
    const isDisabledByStatus = !["DISPONIBLE", "OPERATIVO", "EN_SERVICIO"].includes(estadoUp);
    const isDisabled = isDisabledByStatus || isFull;

    const isSelected = state.selectedVehicleId === veh.id_vehiculo;
    if (isSelected) card.classList.add("selected");
    if (isDisabled) {
      card.classList.add("disabled");
      card.style.cursor = "not-allowed";
    }

    const img = document.createElement("img");
    img.src = veh.image || "";
    img.alt = veh.label;

    const nameP = document.createElement("p");
    nameP.textContent = veh.label;

    const infoP = document.createElement("p");
    infoP.style.margin = "6px 0 0";
    infoP.style.fontWeight = "700";
    infoP.style.fontSize = "12px";
    infoP.style.opacity = "0.85";
    infoP.textContent = cap > 0
      ? `Capacidad: ${used}/${cap}`
      : `Asignados: ${used}`;

    card.append(img, nameP, infoP);

    card.addEventListener("click", () => {
      if (isDisabled) return;
      state.selectedVehicleId = (state.selectedVehicleId === veh.id_vehiculo) ? null : veh.id_vehiculo;
      renderVehiculos();
    });

    vehicleGrid.appendChild(card);
  });

  vehiclesWrap.appendChild(vehicleGrid);
  panel.appendChild(vehiclesWrap);

  const assignBtn = document.createElement("button");
  assignBtn.className = "btnPrimary";
  assignBtn.style.marginTop = "20px";
  assignBtn.style.width = "100%";
  assignBtn.textContent = "Asignarle";

  const selectedAssignable = (state.selectedPersonIds || []).filter(id => isPositiveInt(id));
  const lockedSelected = selectedAssignable.filter(id => !!state.asignacionVehiculos[id]);
  const selectedVehicleObj = getVehicleById(state.selectedVehicleId);
  const usedNow = state.selectedVehicleId ? (vehCount[state.selectedVehicleId] || 0) : 0;
  const capNow = selectedVehicleObj ? Number(selectedVehicleObj.capacidad || 0) : 0;
  const remaining = capNow > 0 ? (capNow - usedNow) : Number.MAX_SAFE_INTEGER;

  assignBtn.disabled = !(
    state.selectedVehicleId &&
    selectedAssignable.length > 0 &&
    lockedSelected.length === 0 &&
    remaining >= selectedAssignable.length
  );

  assignBtn.addEventListener("click", () => {
    if (!state.selectedVehicleId) return alert("Selecciona un vehículo");
    if (selectedAssignable.length === 0) return alert("Selecciona al menos CET o una CELL");

    const locked = selectedAssignable.filter(id => !!state.asignacionVehiculos[id]);
    if (locked.length > 0) return alert("Uno o más ya tienen vehículo asignado.");

    if (capNow > 0 && selectedAssignable.length > remaining) {
      return alert(`Capacidad insuficiente. Disponible: ${remaining}/${capNow}`);
    }

    selectedAssignable.forEach(id => {
      state.asignacionVehiculos[id] = Number(state.selectedVehicleId);
    });

    if (ginfo && ginfo.vehActive) {
      if (!ginfo.vehMap) ginfo.vehMap = {};
      ginfo.vehMap[ginfo.vehActive] = [Number(state.selectedVehicleId)];
    }

    state.selectedVehicleId = null;
    state.selectedPersonIds = [];
    saveDraftLocal();
    renderVehiculos();
  });

  panel.appendChild(assignBtn);

  btnAccion.onclick = async () => {
    if (hasGroups && groupIndex < lastGroupIndex) {
      ginfo.vehActive = ginfo.names[groupIndex + 1];
      state.selectedVehicleId = null;
      state.selectedPersonIds = [];
      saveDraftLocal();
      renderVehiculos();
      return;
    }

    if (state.cetActivoIndexVeh < state.cetSeleccionadosIds.length - 1) {
      state.cetActivoIndexVeh += 1;
      const nextCetId = getCetIdByIndex(state.cetActivoIndexVeh);
      ensureCetState(nextCetId);
      const ngi = state.gruposByCet[nextCetId];
      const hasNextGroups = (ngi.names || []).length > 0;
      if (hasNextGroups) {
        if (!ngi.vehActive || !ngi.names.includes(ngi.vehActive)) {
          ngi.vehActive = (ngi.active && ngi.names.includes(ngi.active)) ? ngi.active : ngi.names[0];
        }
      } else {
        ngi.vehActive = null;
      }
      state.selectedVehicleId = null;
      state.selectedPersonIds = [];
      saveDraftLocal();
      renderVehiculos();
      return;
    }

    try {
      setAccion("Guardando...", true);
      await saveVehiculos();
      // Guardar grupos nuevamente para amarrar los vehículos
      await crearOperacionYPersonal(); 
      state.categoria = "equipo";
      resetEquipoFlow();
      saveDraftLocal();
      renderEquipoHome();
    } catch (e) {
      setAccion("Guardar y pasar a equipos", false);
      alert(`Error guardando vehículos: ${e.message}`);
    }
  };
}

// ===============================
// Equipo home
// ===============================
function renderEquipoHome() {
  state.categoria = "equipo";
  
  if (!state.equipoCategoria) state.equipoCategoria = "comunicacion";
  if (!state.equipoDestino) state.equipoDestino = "personal";
  
  state.equipoSelectedItems = [];
  state.equipoSelectedResource = null;

  if (state.equipoDestino === "personal") {
    if (!state.equipoSelectedCet && state.cetSeleccionadosIds.length > 0) {
      state.equipoSelectedCet = state.cetSeleccionadosIds[0];
    }
  }

  saveDraftLocal();
  renderEquipoAsignacion();
}


// ===============================
// Equipo asignación
// ===============================
function renderEquipoAsignacion() {
  clearPanel();
  showBack(true);
  showVehiculosLeftPanel("Asignación de equipos");

  setHeader("Selecciona equipo", "");
  setAccion("Finalizar", false);

  vehiculosLeftEl.innerHTML = "";

  const leftHeader = document.createElement("div");
  leftHeader.className = "chipRow";

  const chipPersonal = document.createElement("button");
  chipPersonal.className = "chip" + (state.equipoDestino === "personal" ? " active" : "");
  chipPersonal.textContent = "Asignar a personal";
  chipPersonal.addEventListener("click", () => {
    state.equipoDestino = "personal";
    state.equipoSelectedResource = null;
    state.equipoSelectedItems = [];
    saveDraftLocal();
    renderEquipoAsignacion();
  });

  const chipVehiculo = document.createElement("button");
  chipVehiculo.className = "chip" + (state.equipoDestino === "vehiculo" ? " active" : "");
  chipVehiculo.textContent = "Asignar a vehículo";
  chipVehiculo.addEventListener("click", () => {
    state.equipoDestino = "vehiculo";
    state.equipoSelectedResource = null;
    state.equipoSelectedItems = [];
    state.equipoSelectedCet = null;
    state.equipoSelectedGrupo = null;
    saveDraftLocal();
    renderEquipoAsignacion();
  });

  leftHeader.appendChild(chipPersonal);
  leftHeader.appendChild(chipVehiculo);
  vehiculosLeftEl.appendChild(leftHeader);

  if (state.equipoDestino === "personal") {
    if (!state.equipoSelectedCet && state.cetSeleccionadosIds.length > 0) {
      state.equipoSelectedCet = state.cetSeleccionadosIds[0];
    }
    renderEquipoLeftPersonal();
  } else {
    renderEquipoLeftVehiculo();
  }

  const rightHeaderBox = document.createElement("div");
  rightHeaderBox.className = "chipRow";
  rightHeaderBox.style.marginBottom = "10px";

  const chipCom = document.createElement("button");
  chipCom.className = "chip" + (state.equipoCategoria === "comunicacion" ? " active" : "");
  chipCom.textContent = "Comunicación";
  chipCom.addEventListener("click", () => {
    state.equipoCategoria = "comunicacion";
    saveDraftLocal();
    renderEquipoAsignacion();
  });

  const chipTac = document.createElement("button");
  chipTac.className = "chip" + (state.equipoCategoria === "tactico" ? " active" : "");
  chipTac.textContent = "Táctico";
  chipTac.addEventListener("click", () => {
    state.equipoCategoria = "tactico";
    saveDraftLocal();
    renderEquipoAsignacion();
  });

  rightHeaderBox.appendChild(chipCom);
  rightHeaderBox.appendChild(chipTac);
  panel.appendChild(rightHeaderBox);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  const equipTitle = document.createElement("div");
  equipTitle.className = "lbl";
  equipTitle.style.marginBottom = "10px";
  equipTitle.textContent = "Selecciona equipo";


  const eqWrap = document.createElement("div");
  eqWrap.style.display = "flex";
  eqWrap.style.flexDirection = "column";
  eqWrap.style.gap = "10px";

  const bucket = getEquipoAssignmentsBucket();

  getEquipoListByCategoria().forEach(eq => {
    const eqKey = Number(eq.id_equipo);
    const assignedTo = bucket[eqKey];
    const isSelected = state.equipoSelectedItems.includes(eqKey);

    const row = document.createElement("div");
    row.className = "item" + (isSelected ? " selected" : "");
    row.style.cursor = assignedTo ? "not-allowed" : "pointer";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "12px";

    const leftWrap = document.createElement("div");
    leftWrap.style.display = "flex";
    leftWrap.style.alignItems = "center";
    leftWrap.style.gap = "12px";

    if (eq.image) {
      const img = document.createElement("img");
      img.src = eq.image;
      img.alt = eq.nombre;
      img.style.width = "54px";
      img.style.height = "54px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "10px";
      img.style.border = "1px solid #d7e3ff";
      leftWrap.appendChild(img);
    }

    const textWrap = document.createElement("div");
    textWrap.style.display = "flex";
    textWrap.style.flexDirection = "column";
    textWrap.style.gap = "4px";

    const left = document.createElement("div");
    left.className = "itemName";
    left.textContent = eq.nombre;

    const meta = document.createElement("div");
    meta.style.fontSize = "12px";
    meta.style.opacity = "0.8";
    meta.textContent = [
      eq.numeroSerie ? `Serie: ${eq.numeroSerie}` : "",
      eq.estado ? `Estado: ${eq.estado}` : ""
    ].filter(Boolean).join(" | ");

    textWrap.appendChild(left);
    textWrap.appendChild(meta);
    leftWrap.appendChild(textWrap);

    const right = document.createElement("div");
    right.className = "badgeRight";
    right.textContent = assignedTo ? `Asignado a: ${getResourceLabel(assignedTo)}` : "Disponible";

    row.appendChild(leftWrap);
    row.appendChild(right);

    row.addEventListener("click", () => {
      if (assignedTo) return;

      if (isSelected) {
        state.equipoSelectedItems = state.equipoSelectedItems.filter(x => Number(x) !== eqKey);
      } else {
        state.equipoSelectedItems.push(eqKey);
      }
      saveDraftLocal();
      renderEquipoAsignacion();
    });

    eqWrap.appendChild(row);
  });

  const assignBtn = document.createElement("button");
  assignBtn.className = "btnPrimary";
  assignBtn.textContent = "Asignarle";
  assignBtn.style.marginTop = "12px";

  const canAssign = !!state.equipoSelectedResource && state.equipoSelectedItems.length > 0;
  assignBtn.disabled = !canAssign;

  assignBtn.addEventListener("click", () => {
    if (!state.equipoCategoria) return alert("Selecciona una categoría de equipo.");
    if (!state.equipoSelectedResource || state.equipoSelectedItems.length === 0) {
      return alert("Selecciona destino y equipo.");
    }

    const store = getEquipoAssignmentsBucket();

    state.equipoSelectedItems.forEach(id_equipo => {
      store[Number(id_equipo)] = { 
        ...state.equipoSelectedResource,
        fecha_asignacion: new Date().toISOString()
      };
    });

    state.equipoSelectedItems = [];
    saveDraftLocal();
    renderEquipoAsignacion();

  });

  listBox.appendChild(equipTitle);
  listBox.appendChild(eqWrap);
  listBox.appendChild(assignBtn);
  panel.appendChild(listBox);

  btnAccion.onclick = async () => {
    try {
      setAccion("Guardando...", true);
      
      // 1) Sincronización Final: Re-guardamos grupos con sus vehículos actualizados
      await crearOperacionYPersonal();
      
      // 2) Guardamos equipos
      await saveEquipos();
      
      const nombre = opNombreEl?.value.trim() || "";
      clearDraftLocal();
      showDashboardButton();
      alert(`Operación "${nombre}" guardada completamente.`);

      state.categoria = null;
      state.pasoPersonal = "home";
      resetEquipoFlow();
      renderHome();
    } catch (e) {
      setAccion("Guardar equipos", false);
      alert(`Error guardando equipos: ${e.message}`);
    }
  };
}

// ===============================
// Equipo izquierda - personal
// ===============================
function renderEquipoLeftPersonal() {
  const box = document.createElement("div");
  box.className = "listBox";
  box.style.gap = "12px";

  if (!state.cetSeleccionadosIds.length && !state.cutSeleccionadoId) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.textContent = "No hay personal disponible.";
    box.appendChild(empty);
    vehiculosLeftEl.appendChild(box);
    return;
  }

  // Chips para CETs
  const cetRow = document.createElement("div");
  cetRow.className = "chipRow";
  cetRow.style.marginBottom = "0";

  if (state.cutSeleccionadoId) {
    const p = getPersonalById(state.cutSeleccionadoId);
    if (p) {
      const chip = document.createElement("button");
      chip.className = "chip" + (state.equipoSelectedCet === "CUT" ? " active" : "");
      chip.textContent = "CUT";
      chip.addEventListener("click", () => {
        state.equipoSelectedCet = "CUT";
        state.equipoSelectedResource = null;
        state.equipoSelectedGrupo = null;
        saveDraftLocal();
        renderEquipoAsignacion();
      });
      cetRow.appendChild(chip);
    }
  }

  state.cetSeleccionadosIds.forEach((id) => {
    const p = getPersonalById(id);
    const chip = document.createElement("button");
    chip.className = "chip" + (state.equipoSelectedCet === Number(id) ? " active" : "");
    chip.textContent = `CET: ${p?.label || id}`;
    chip.addEventListener("click", () => {
      state.equipoSelectedCet = Number(id);
      state.equipoSelectedResource = null;
      const ginfo = state.gruposByCet[id] || { names: [], map: {} };
      state.equipoSelectedGrupo = (ginfo.names && ginfo.names.length > 0) ? ginfo.names[0] : null;
      saveDraftLocal();
      renderEquipoAsignacion();
    });
    cetRow.appendChild(chip);
  });

  box.appendChild(cetRow);

  if (state.equipoSelectedCet === "CUT") {
    const cut = getPersonalById(state.cutSeleccionadoId);
    const row = document.createElement("div");
    row.className = "item" + (
      state.equipoSelectedResource?.tipo === "personal" &&
      Number(state.equipoSelectedResource?.id_personal) === Number(cut.id_personal)
        ? " selected"
        : ""
    );
    row.style.cursor = "pointer";
    row.textContent = cut.label;
    row.addEventListener("click", () => {
      state.equipoSelectedResource = { tipo: "personal", id_personal: Number(cut.id_personal), label: cut.label };
      saveDraftLocal();
      renderEquipoAsignacion();
    });
    box.appendChild(row);
  } else if (state.equipoSelectedCet) {
    const cetId = state.equipoSelectedCet;
    const cetObj = getPersonalById(cetId);
    const flotilla = state.flotillaByCet[cetId] || "—";
    const ginfo = state.gruposByCet[cetId] || { names: [], map: {} };
    const hasGroups = (ginfo.names || []).length > 0;

    const rowCet = document.createElement("div");
    rowCet.className = "item" + (
      state.equipoSelectedResource?.tipo === "personal" &&
      Number(state.equipoSelectedResource?.id_personal) === Number(cetId)
        ? " selected"
        : ""
    );
    rowCet.style.cursor = "pointer";
    rowCet.textContent = `Asignar al CET: ${cetObj?.label || cetId}`;
    rowCet.addEventListener("click", () => {
      state.equipoSelectedResource = { tipo: "personal", id_personal: Number(cetId), label: cetObj?.label || `CET ${cetId}` };
      saveDraftLocal();
      renderEquipoAsignacion();
    });
    box.appendChild(rowCet);

    const flotillaLbl = document.createElement("div");
    flotillaLbl.className = "lbl";
    flotillaLbl.textContent = "Nombre de la flotilla";
    box.appendChild(flotillaLbl);

    const flotillaChip = document.createElement("div");
    flotillaChip.className = "chip";
    flotillaChip.style.width = "max-content";
    flotillaChip.textContent = flotilla;
    box.appendChild(flotillaChip);

    if (hasGroups) {
      const gruposLbl = document.createElement("div");
      gruposLbl.className = "lbl";
      gruposLbl.textContent = "Grupos";
      box.appendChild(gruposLbl);

      const gruposRow = document.createElement("div");
      gruposRow.className = "groupsRow";
      ginfo.names.forEach((gName) => {
        const chip = document.createElement("button");
        chip.className = "chip" + (state.equipoSelectedGrupo === gName ? " active" : "");
        chip.textContent = gName;
        chip.addEventListener("click", () => {
          state.equipoSelectedGrupo = gName;
          state.equipoSelectedResource = null;
          saveDraftLocal();
          renderEquipoAsignacion();
        });
        gruposRow.appendChild(chip);
      });
      box.appendChild(gruposRow);
    }

    const personasWrap = document.createElement("div");
    personasWrap.style.display = "flex";
    personasWrap.style.flexDirection = "column";
    personasWrap.style.gap = "10px";
    personasWrap.style.maxHeight = "340px";
    personasWrap.style.overflowY = "auto";

    let personasIds = [];
    if (hasGroups && state.equipoSelectedGrupo) {
      personasIds = Array.from(ginfo.map[state.equipoSelectedGrupo] || []);
    } else {
      personasIds = state.asignacionCelulas[cetId] || [];
    }

    if (!personasIds.length) {
      const empty = document.createElement("div");
      empty.className = "item";
      empty.textContent = "No hay personas en esta selección.";
      personasWrap.appendChild(empty);
    } else {
      personasIds.forEach((id) => {
        const p = getPersonalById(id);
        if (!p) return;
        const row = document.createElement("div");
        row.className = "item" + (
          state.equipoSelectedResource?.tipo === "personal" &&
          Number(state.equipoSelectedResource?.id_personal) === Number(id)
            ? " selected"
            : ""
        );
        row.style.cursor = "pointer";
        row.textContent = p.label;
        row.addEventListener("click", () => {
          state.equipoSelectedResource = { tipo: "personal", id_personal: Number(id), label: p.label };
          saveDraftLocal();
          renderEquipoAsignacion();
        });
        personasWrap.appendChild(row);
      });
    }
    box.appendChild(personasWrap);
  }
  vehiculosLeftEl.appendChild(box);
}


// ===============================
// Equipo izquierda - vehículo
// ===============================
function getVehiclesUsedInAssignments() {
  const usados = new Set(
    Object.values(state.asignacionVehiculos || {})
      .filter(Boolean)
      .map(Number)
  );
  return state.vehiclesList.filter(v => usados.has(Number(v.id_vehiculo)));
}

function getResumenVehiculoDetallado(idVehiculo) {
  const entries = Object.entries(state.asignacionVehiculos || {})
    .filter(([_, veh]) => Number(veh) === Number(idVehiculo));

  const cets = new Set();
  const grupos = new Set();
  let totalPersonas = 0;

  entries.forEach(([idPersonalStr]) => {
    const idPersonal = Number(idPersonalStr);

    if (state.cetSeleccionadosIds.includes(idPersonal)) {
      cets.add(idPersonal);
      totalPersonas += 1;
      return;
    }

    const cetEncontrado = state.cetSeleccionadosIds.find(cetId =>
      (state.asignacionCelulas[cetId] || []).includes(idPersonal)
    );

    if (cetEncontrado) {
      cets.add(cetEncontrado);
      totalPersonas += 1;

      const ginfo = state.gruposByCet[cetEncontrado];
      if (ginfo && ginfo.map) {
        Object.keys(ginfo.map).forEach(gName => {
          const arr = ginfo.map[gName] || [];
          if (arr.includes(idPersonal)) grupos.add(gName);
        });
      }
    }
  });

  const flotillas = Array.from(cets)
    .map(cet => state.flotillaByCet[cet])
    .filter(Boolean);

  return {
    flotilla: flotillas.length ? flotillas.join(", ") : "—",
    grupo: grupos.size ? Array.from(grupos).join(", ") : "—",
    personas: totalPersonas
  };
}

function renderEquipoLeftVehiculo() {
  const box = document.createElement("div");
  box.className = "listBox";

  const usados = getVehiclesUsedInAssignments();

  if (usados.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.textContent = "No hay vehículos asignados todavía.";
    box.appendChild(empty);
    vehiculosLeftEl.appendChild(box);
    return;
  }

  usados.forEach(v => {
    const resumen = getResumenVehiculoDetallado(v.id_vehiculo);
    const isSelected = state.equipoSelectedResource?.tipo === "vehiculo" &&
                       Number(state.equipoSelectedResource?.id_vehiculo) === Number(v.id_vehiculo);

    const card = document.createElement("div");
    card.className = "item" + (isSelected ? " selected" : "");
    card.style.display = "flex";
    card.style.alignItems = "flex-start";
    card.style.gap = "12px";
    card.style.cursor = "pointer";

    if (v.image) {
      const img = document.createElement("img");
      img.src = v.image;
      img.alt = v.label;
      img.style.width = "72px";
      img.style.height = "72px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "12px";
      img.style.border = "1px solid #d7e3ff";
      card.appendChild(img);
    }

    const content = document.createElement("div");
    content.style.display = "flex";
    content.style.flexDirection = "column";
    content.style.gap = "4px";
    content.style.flex = "1";

    const title = document.createElement("div");
    title.className = "itemName";
    title.textContent = v.label;

    const info = document.createElement("div");
    info.style.fontSize = "12px";
    info.style.opacity = "0.8";
    info.innerHTML = `
      <div style="margin-bottom:2px">Flotilla: ${resumen.flotilla}</div>
      <div style="margin-bottom:2px">Grupo: ${resumen.grupo}</div>
      <div>Personas: ${resumen.personas}</div>
    `;

    content.appendChild(title);
    content.appendChild(info);
    card.appendChild(content);

    card.addEventListener("click", () => {
      state.equipoSelectedResource = { tipo: "vehiculo", id_vehiculo: Number(v.id_vehiculo), label: v.label };
      saveDraftLocal();
      renderEquipoAsignacion();
    });

    box.appendChild(card);
  });

  vehiculosLeftEl.appendChild(box);
}


// ===============================
// Fila reutilizable
// ===============================
function celulaRow({ name, selected = false, disabled = false, status = "Disponible", onToggle }) {
  const row = document.createElement("div");
  row.className = "item" + (selected ? " selected" : "") + (disabled ? " disabled" : "");

  const left = document.createElement("div");
  left.className = "itemName";
  left.textContent = name;

  const right = document.createElement("div");
  right.className = "badgeRight";
  right.textContent = status;

  row.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) onToggle();
  });

  row.append(left, right);
  return row;
}

// ===============================
// Navegación
// ===============================
btnBack.addEventListener("click", () => {
  if (state.categoria === "vehiculos") {
    state.categoria = "personal";
    state.pasoPersonal = "celulas";
    saveDraftLocal();
    renderCelulas();
    return;
  }

  if (state.categoria === "equipo") {
    if (state.equipoDestino) {
      saveDraftLocal();
      renderEquipoHome();
      return;
    }

    state.categoria = "vehiculos";
    saveDraftLocal();
    renderVehiculos();
    return;
  }

  if (state.categoria !== "personal") {
    saveDraftLocal();
    renderHome();
    return;
  }

  if (state.pasoPersonal === "celulas") {
    state.pasoPersonal = "cet";
    saveDraftLocal();
    renderCET();
    return;
  }

  if (state.pasoPersonal === "cet") {
    state.pasoPersonal = "cut";
    saveDraftLocal();
    renderCUT();
    return;
  }

  if (state.pasoPersonal === "cut") {
    saveDraftLocal();
    renderHome();
    return;
  }
});

btnVolver.addEventListener("click", () => {
  saveDraftLocal();
  window.location.href = "menu_inicial.html";
});

btnDashboardGo?.addEventListener("click", () => {
  saveDraftLocal();
  window.location.href = "dashboard.html";
});

if (btnHoy && opInicioEl) {
  btnHoy.addEventListener("click", () => {
    opInicioEl.value = getTodayLocalDateString();
    validateDateTime();
    saveOperacionActualLocal();
  });
}

if (opHoraInicioEl) {
  opHoraInicioEl.addEventListener("input", (e) => {
    e.target.value = normalizeHoraInput(e.target.value);
    saveOperacionActualLocal();
  });

  opHoraInicioEl.addEventListener("blur", (e) => {
    e.target.value = sanitizeHoraFinal(e.target.value);
    validateDateTime();
    saveOperacionActualLocal();
  });
}

[opNombreEl, opDescEl, opInicioEl, opHoraInicioEl, opPrioridadEl]
  .filter(Boolean)
  .forEach((el) => {
    el.addEventListener("input", () => {
      if (lblOperacion && opNombreEl) {
        lblOperacion.textContent = opNombreEl.value.trim() || "—";
      }

      saveOperacionActualLocal();
    });

    el.addEventListener("change", () => {
      if (el === opInicioEl || el === opHoraInicioEl) {
        validateDateTime();
      }

      if (lblOperacion && opNombreEl) {
        lblOperacion.textContent = opNombreEl.value.trim() || "—";
      }

      saveOperacionActualLocal();
    });
  });

// ===============================
// Init
// ===============================
(async function init() {
  try {
    localStorage.removeItem(STORAGE_WIZARD_DRAFT);
    localStorage.removeItem(STORAGE_OPERACION_ACTUAL);

    setUsuarioHeader();

    await loadCatalogs();

    if (lblOperacion) {
      const qs = new URLSearchParams(window.location.search);
      const opCodigo = qs.get("op");
      lblOperacion.textContent = opCodigo || "—";
    }

    loadOperacionActualIntoForm();
    saveOperacionActualLocal();

    hideDashboardButton();
    renderHome();

    if (btnDashboardGo) {
      btnDashboardGo.onclick = () => {
        if (!state.opId) return alert("No hay una operación activa seleccionada.");
        localStorage.setItem("active_operation_id", state.opId);
        window.location.href = "dashboard.html?id=" + state.opId;
      };
    }
  } catch (e) {

    alert(`Error inicializando: ${e.message}\n\n¿Hay token en localStorage.token? ¿API en ${API_BASE}?`);
  }
})();