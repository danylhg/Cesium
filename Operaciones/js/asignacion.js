/// asignacion.js — Integrado con backend real + borrador local + dashboard opcional

// ===============================
// Sesión / token
// ===============================
if (localStorage.getItem("session") !== "ok") {
  window.location.href = "login.html";
}

const API_BASE =
  window.API_BASE ||
  localStorage.getItem("API_BASE") ||
  `http://${window.location.hostname}:3001`;

function getToken() {
  return localStorage.getItem("token") || "";
}

async function api(path, { method = "GET", body } = {}) {
  const token = getToken();
  if (!token) {
    localStorage.removeItem("session");
    window.location.href = "login.html";
    return;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    const msg = data?.mensaje || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return data;
}

function isPositiveInt(v) {
  return Number.isInteger(Number(v)) && Number(v) > 0;
}

function fullName(p) {
  const n = (p?.nombre || "").trim();
  const a = (p?.apellido || "").trim();
  return `${n}${a ? " " + a : ""}`.trim();
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

// form izquierda
const opNombreEl = document.getElementById("opNombre");
const opDescEl = document.getElementById("opDesc");
const opInicioEl = document.getElementById("opInicio");
const opFinEl = document.getElementById("opFin");
const opPrioridadEl = document.getElementById("opPrioridad");

// panel izquierdo
const leftCardTitleEl = document.getElementById("leftCardTitle");
const opInfoFormEl = document.getElementById("opInfoForm");
const vehiculosLeftEl = document.getElementById("vehiculosLeft");

// dashboard opcional
const dashboardWrap = document.getElementById("dashboardWrap");
const btnDashboardGo = document.getElementById("btnDashboardGo");

// ===============================
// Storage borrador local
// ===============================
const STORAGE_WIZARD_DRAFT = "asignacion_wizard_draft";
const STORAGE_OPERACION_ACTUAL = "operacion_actual";

function readObjectStorage(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function removeStorage(key) {
  localStorage.removeItem(key);
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
// Persistencia local del borrador
// ===============================
function collectOperacionActual() {
  return {
    nombre: normalizeText(opNombreEl?.value),
    descripcion: normalizeText(opDescEl?.value),
    fecha_inicio: normalizeText(opInicioEl?.value),
    fecha_fin: normalizeText(opFinEl?.value),
    prioridad: normalizeText(opPrioridadEl?.value),
    updated_at: new Date().toISOString()
  };
}

function saveOperacionActualLocal() {
  const data = collectOperacionActual();
  writeStorage(STORAGE_OPERACION_ACTUAL, data);

  if (lblOperacion) {
    lblOperacion.textContent = data.nombre || "—";
  }
}

function loadOperacionActualIntoForm() {
  const stored = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
  const qsName = normalizeText(lblOperacion?.textContent);

  const nombre = normalizeText(stored.nombre) || (qsName && qsName !== "—" ? qsName : "");

  if (opNombreEl) opNombreEl.value = nombre;
  if (opDescEl) opDescEl.value = normalizeText(stored.descripcion);
  if (opInicioEl) opInicioEl.value = normalizeText(stored.fecha_inicio);
  if (opFinEl) opFinEl.value = normalizeText(stored.fecha_fin);
  if (opPrioridadEl) opPrioridadEl.value = normalizeText(stored.prioridad || "MEDIA");

  if (lblOperacion) lblOperacion.textContent = nombre || "—";
}

function buildDraftPayload() {
  return {
    opId: state.opId,
    categoria: state.categoria,
    pasoPersonal: state.pasoPersonal,

    cutSeleccionadoId: state.cutSeleccionadoId,
    cetSeleccionadosIds: [...state.cetSeleccionadosIds],
    cetActivoIndex: state.cetActivoIndex,
    asignacionCelulas: { ...state.asignacionCelulas },

    flotillaByCet: { ...state.flotillaByCet },
    searchByCet: { ...state.searchByCet },
    gruposByCet: JSON.parse(JSON.stringify(state.gruposByCet || {})),

    asignacionVehiculos: { ...state.asignacionVehiculos },
    cetActivoIndexVeh: state.cetActivoIndexVeh,
    selectedVehicleId: state.selectedVehicleId,
    selectedPersonIds: [...state.selectedPersonIds],

    equipoCategoria: state.equipoCategoria,
    equipoDestino: state.equipoDestino,
    equipoSelectedItems: [...state.equipoSelectedItems],
    equipoSelectedResource: state.equipoSelectedResource ? { ...state.equipoSelectedResource } : null,
    asignacionEquipos: JSON.parse(JSON.stringify(state.asignacionEquipos || { tactico: {}, comunicacion: {} })),

    operacion: collectOperacionActual(),
    updated_at: new Date().toISOString()
  };
}

function saveDraftLocal() {
  writeStorage(STORAGE_WIZARD_DRAFT, buildDraftPayload());
  saveOperacionActualLocal();
}

function restoreDraftLocal() {
  const draft = readObjectStorage(STORAGE_WIZARD_DRAFT, null);
  if (!draft || typeof draft !== "object") return false;

  state.opId = isPositiveInt(draft.opId) ? Number(draft.opId) : null;
  state.categoria = draft.categoria || null;
  state.pasoPersonal = draft.pasoPersonal || "home";

  state.cutSeleccionadoId = isPositiveInt(draft.cutSeleccionadoId) ? Number(draft.cutSeleccionadoId) : null;
  state.cetSeleccionadosIds = Array.isArray(draft.cetSeleccionadosIds)
    ? draft.cetSeleccionadosIds.map(Number).filter(isPositiveInt)
    : [];
  state.cetActivoIndex = Number(draft.cetActivoIndex || 0);

  state.asignacionCelulas = draft.asignacionCelulas || {};
  Object.keys(state.asignacionCelulas).forEach(k => {
    state.asignacionCelulas[k] = (state.asignacionCelulas[k] || []).map(Number).filter(isPositiveInt);
  });

  state.flotillaByCet = draft.flotillaByCet || {};
  state.searchByCet = draft.searchByCet || {};
  state.gruposByCet = draft.gruposByCet || {};

  Object.keys(state.gruposByCet).forEach(cetId => ensureCetState(Number(cetId)));

  state.asignacionVehiculos = draft.asignacionVehiculos || {};
  Object.keys(state.asignacionVehiculos).forEach(k => {
    state.asignacionVehiculos[k] = Number(state.asignacionVehiculos[k]);
  });

  state.cetActivoIndexVeh = Number(draft.cetActivoIndexVeh || 0);
  state.selectedVehicleId = isPositiveInt(draft.selectedVehicleId) ? Number(draft.selectedVehicleId) : null;
  state.selectedPersonIds = Array.isArray(draft.selectedPersonIds)
    ? draft.selectedPersonIds.map(Number).filter(isPositiveInt)
    : [];

  state.equipoCategoria = draft.equipoCategoria || null;
  state.equipoDestino = draft.equipoDestino || null;
  state.equipoSelectedItems = Array.isArray(draft.equipoSelectedItems)
    ? draft.equipoSelectedItems.map(Number).filter(isPositiveInt)
    : [];
  state.equipoSelectedResource = draft.equipoSelectedResource || null;
  state.asignacionEquipos = draft.asignacionEquipos || { tactico: {}, comunicacion: {} };

  if (draft.operacion && typeof draft.operacion === "object") {
    writeStorage(STORAGE_OPERACION_ACTUAL, draft.operacion);
  }

  return true;
}

function clearDraftLocal() {
  removeStorage(STORAGE_WIZARD_DRAFT);
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
  if (state.opId) {
    return { nombre: opNombreEl?.value.trim() || "", codigo: null, yaExistia: true };
  }

  const nombre = opNombreEl?.value.trim() || "";
  const descripcion = opDescEl?.value.trim() || "";
  const prioridad = opPrioridadEl?.value || "MEDIA";
  const fecha_inicio = opInicioEl?.value || null;
  const fecha_fin = opFinEl?.value || null;

  if (!nombre) throw new Error("Completa el nombre de la operación antes de continuar.");
  if (!state.cutSeleccionadoId) throw new Error("Falta seleccionar CUT.");
  if (state.cetSeleccionadosIds.length === 0) throw new Error("Falta seleccionar al menos un CET.");

  const opRes = await api("/ops", {
    method: "POST",
    body: { nombre, descripcion, prioridad, fecha_inicio, fecha_fin },
  });

  state.opId = opRes.id_operacion;
  if (lblOperacion) lblOperacion.textContent = nombre;

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

  const mandoItems = [];
  state.cetSeleccionadosIds.forEach(cetId => {
    (state.asignacionCelulas[cetId] || []).forEach(cellId => {
      mandoItems.push({ id_cet: Number(cetId), id_cell: Number(cellId) });
    });
  });

  await api(`/ops/${state.opId}/mando`, {
    method: "POST",
    body: { items: mandoItems },
  });

  saveDraftLocal();
  return { nombre, codigo: opRes.codigo, yaExistia: false };
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
        return {
          ...base,
          id_personal: Number(resource.id_personal)
        };
      }

      if (resource?.tipo === "vehiculo" && isPositiveInt(resource.id_vehiculo)) {
        return {
          ...base,
          id_vehiculo: Number(resource.id_vehiculo)
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
  hideDashboardButton();
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
          state.opId = null;
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
          state.opId = null;
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

  const cetId = getCetIdByIndex(state.cetActivoIndex);
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
  btnCrearGrupo.addEventListener("click", () => abrirModalCrearGrupo(cetId));

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

    state.cellList
      .filter(p => !term || p.label.toLowerCase().includes(term))
      .forEach(p => {
        const cellId = Number(p.id_personal);
        const enEste = asignadas.includes(cellId);
        const bloqueada = yaUsadas.has(cellId);

        const row = celulaRow({
          name: p.label,
          selected: enEste,
          disabled: bloqueada,
          status: bloqueada ? "Asignado" : (enEste ? "En este CET" : "Disponible"),
          onToggle: () => {
            if (bloqueada) return;
            const grupoActivo = info?.active || null;

            if (grupoActivo) {
              if (!info.map[grupoActivo]) info.map[grupoActivo] = [];

              if (enEste) {
                state.asignacionCelulas[cetId] = asignadas.filter(x => Number(x) !== cellId);
                Object.keys(info.map).forEach(g => {
                  info.map[g] = (info.map[g] || []).filter(x => Number(x) !== cellId);
                });
              } else {
                state.asignacionCelulas[cetId] = [...asignadas, cellId];
                if (!info.map[grupoActivo].includes(cellId)) info.map[grupoActivo].push(cellId);
              }
            } else {
              if (enEste) {
                state.asignacionCelulas[cetId] = asignadas.filter(x => Number(x) !== cellId);
              } else {
                state.asignacionCelulas[cetId] = [...asignadas, cellId];
              }
            }

            state.opId = null;
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
function abrirModalCrearGrupo(cetId) {
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

    rowAll.querySelector("input").indeterminate = (!allSel && someSel);
    cellulasList.appendChild(rowAll);
  }

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
  clearPanel();
  showBack(true);
  showVehiculosLeftPanel("Asignación de equipos");

  state.categoria = "equipo";
  state.equipoDestino = null;
  state.equipoSelectedItems = [];
  state.equipoSelectedResource = null;

  setHeader("Asignación de Equipos", "");
  setAccion("Siguiente", true);

  vehiculosLeftEl.innerHTML = "";

  const leftGrid = document.createElement("div");
  leftGrid.className = "optGrid";

  const btnPersonal = mkOpt("Asignar a personal");
  const btnVehiculo = mkOpt("Asignar a vehículo");

  btnPersonal.addEventListener("click", () => {
    state.equipoDestino = "personal";
    saveDraftLocal();
    renderEquipoAsignacion();
  });

  btnVehiculo.addEventListener("click", () => {
    state.equipoDestino = "vehiculo";
    saveDraftLocal();
    renderEquipoAsignacion();
  });

  leftGrid.appendChild(btnPersonal);
  leftGrid.appendChild(btnVehiculo);
  vehiculosLeftEl.appendChild(leftGrid);

  const rightGrid = document.createElement("div");
  rightGrid.className = "optGrid";

  const btnTactico = mkOpt("Equipo táctico");
  const btnCom = mkOpt("Equipo de comunicación");

  btnTactico.addEventListener("click", () => {
    state.equipoCategoria = "tactico";
    saveDraftLocal();
    renderEquipoHome();
  });

  btnCom.addEventListener("click", () => {
    state.equipoCategoria = "comunicacion";
    saveDraftLocal();
    renderEquipoHome();
  });

  if (state.equipoCategoria === "tactico") btnTactico.classList.add("active");
  if (state.equipoCategoria === "comunicacion") btnCom.classList.add("active");

  rightGrid.appendChild(btnTactico);
  rightGrid.appendChild(btnCom);
  panel.appendChild(rightGrid);

  btnAccion.onclick = () => {};
}

// ===============================
// Equipo asignación
// ===============================
function renderEquipoAsignacion() {
  clearPanel();
  showBack(true);
  showVehiculosLeftPanel("Asignación de equipos");

  setHeader(
    state.equipoCategoria === "tactico" ? "Equipo táctico" : "Equipo de comunicación",
    ""
  );
  setAccion("Guardar equipos", false);

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
    saveDraftLocal();
    renderEquipoAsignacion();
  });

  leftHeader.appendChild(chipPersonal);
  leftHeader.appendChild(chipVehiculo);
  vehiculosLeftEl.appendChild(leftHeader);

  if (state.equipoDestino === "personal") {
    renderEquipoLeftPersonal();
  } else {
    renderEquipoLeftVehiculo();
  }

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
      store[Number(id_equipo)] = { ...state.equipoSelectedResource };
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

  if (state.cutSeleccionadoId) {
    const cut = getPersonalById(state.cutSeleccionadoId);
    if (cut) {
      const cutTitle = document.createElement("div");
      cutTitle.className = "lbl";
      cutTitle.style.marginBottom = "8px";
      cutTitle.textContent = "CUT";
      box.appendChild(cutTitle);

      const cutRow = document.createElement("div");
      cutRow.className = "item" + (
        state.equipoSelectedResource?.tipo === "personal" &&
        Number(state.equipoSelectedResource?.id_personal) === Number(cut.id_personal)
          ? " selected"
          : ""
      );
      cutRow.style.cursor = "pointer";

      const left = document.createElement("div");
      left.className = "itemName";
      left.textContent = cut.label;

      cutRow.appendChild(left);
      cutRow.addEventListener("click", () => {
        state.equipoSelectedResource = {
          tipo: "personal",
          id_personal: Number(cut.id_personal),
          label: cut.label
        };
        saveDraftLocal();
        renderEquipoAsignacion();
      });

      box.appendChild(cutRow);
    }
  }

  if (!state.cetSeleccionadosIds.length) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.textContent = "No hay personal disponible.";
    box.appendChild(empty);
    vehiculosLeftEl.appendChild(box);
    return;
  }

  state.cetSeleccionadosIds.forEach(cet => {
    const cetObj = getPersonalById(cet);
    const flotilla = state.flotillaByCet[cet] || "—";
    const ginfo = state.gruposByCet[cet] || { names: [], map: {} };
    const hasGroups = (ginfo.names || []).length > 0;

    const bloque = document.createElement("div");
    bloque.style.display = "flex";
    bloque.style.flexDirection = "column";
    bloque.style.gap = "10px";
    bloque.style.marginBottom = "16px";
    bloque.style.paddingBottom = "12px";
    bloque.style.borderBottom = "1px solid #d7e3ff";

    const cetChipRow = document.createElement("div");
    cetChipRow.className = "chipRow";
    cetChipRow.style.marginBottom = "0";
    cetChipRow.style.paddingBottom = "0";
    cetChipRow.style.borderBottom = "none";

    const cetChip = document.createElement("div");
    cetChip.className = "chip active";
    cetChip.textContent = `CET: ${cetObj?.label || cet}`;
    cetChipRow.appendChild(cetChip);
    bloque.appendChild(cetChipRow);

    const cetRow = document.createElement("div");
    cetRow.className = "item" + (
      state.equipoSelectedResource?.tipo === "personal" &&
      Number(state.equipoSelectedResource?.id_personal) === Number(cet)
        ? " selected"
        : ""
    );
    cetRow.style.cursor = "pointer";

    const cetLeft = document.createElement("div");
    cetLeft.className = "itemName";
    cetLeft.textContent = `Asignar al CET: ${cetObj?.label || cet}`;

    cetRow.appendChild(cetLeft);
    cetRow.addEventListener("click", () => {
      state.equipoSelectedResource = {
        tipo: "personal",
        id_personal: Number(cet),
        label: cetObj?.label || `CET ${cet}`
      };
      saveDraftLocal();
      renderEquipoAsignacion();
    });
    bloque.appendChild(cetRow);

    const flotillaLbl = document.createElement("div");
    flotillaLbl.className = "lbl";
    flotillaLbl.textContent = "Nombre de la flotilla";
    bloque.appendChild(flotillaLbl);

    const flotillaChip = document.createElement("div");
    flotillaChip.className = "chip";
    flotillaChip.style.width = "max-content";
    flotillaChip.textContent = flotilla;
    bloque.appendChild(flotillaChip);

    if (hasGroups) {
      const gruposLbl = document.createElement("div");
      gruposLbl.className = "lbl";
      gruposLbl.textContent = "Grupos";
      bloque.appendChild(gruposLbl);

      const gruposRow = document.createElement("div");
      gruposRow.className = "groupsRow";

      ginfo.names.forEach(gName => {
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.textContent = gName;
        gruposRow.appendChild(chip);
      });

      bloque.appendChild(gruposRow);

      ginfo.names.forEach(gName => {
        const personasGrupo = Array.from(ginfo.map[gName] || []);
        if (!personasGrupo.length) return;

        const grupoTitle = document.createElement("div");
        grupoTitle.className = "lbl";
        grupoTitle.textContent = gName;
        bloque.appendChild(grupoTitle);

        personasGrupo.forEach(idPersona => {
          const persona = getPersonalById(idPersona);
          if (!persona) return;

          const row = document.createElement("div");
          row.className = "item" + (
            state.equipoSelectedResource?.tipo === "personal" &&
            Number(state.equipoSelectedResource?.id_personal) === Number(idPersona)
              ? " selected"
              : ""
          );
          row.style.cursor = "pointer";

          const left = document.createElement("div");
          left.className = "itemName";
          left.textContent = persona.label;

          row.appendChild(left);
          row.addEventListener("click", () => {
            state.equipoSelectedResource = {
              tipo: "personal",
              id_personal: Number(idPersona),
              label: persona.label
            };
            saveDraftLocal();
            renderEquipoAsignacion();
          });

          bloque.appendChild(row);
        });
      });
    } else {
      const personas = state.asignacionCelulas[cet] || [];

      personas.forEach(idPersona => {
        const persona = getPersonalById(idPersona);
        if (!persona) return;

        const row = document.createElement("div");
        row.className = "item" + (
          state.equipoSelectedResource?.tipo === "personal" &&
          Number(state.equipoSelectedResource?.id_personal) === Number(idPersona)
            ? " selected"
            : ""
        );
        row.style.cursor = "pointer";

        const left = document.createElement("div");
        left.className = "itemName";
        left.textContent = persona.label;

        row.appendChild(left);
        row.addEventListener("click", () => {
          state.equipoSelectedResource = {
            tipo: "personal",
            id_personal: Number(idPersona),
            label: persona.label
          };
          saveDraftLocal();
          renderEquipoAsignacion();
        });

        bloque.appendChild(row);
      });
    }

    box.appendChild(bloque);
  });

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

    const card = document.createElement("div");
    card.className = "item" + (
      state.equipoSelectedResource?.tipo === "vehiculo" &&
      Number(state.equipoSelectedResource?.id_vehiculo) === Number(v.id_vehiculo)
        ? " selected"
        : ""
    );
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
    content.style.gap = "6px";
    content.style.flex = "1";

    const title = document.createElement("div");
    title.className = "itemName";
    title.textContent = v.label;

    const sub = document.createElement("div");
    sub.style.fontSize = "12px";
    sub.style.opacity = "0.8";
    sub.textContent = [
      v.tipo ? `Tipo: ${v.tipo}` : "",
      v.estado ? `Estado: ${v.estado}` : ""
    ].filter(Boolean).join(" | ");

    const info1 = document.createElement("div");
    info1.textContent = `Flotilla: ${resumen.flotilla}`;

    const info2 = document.createElement("div");
    info2.textContent = `Grupo: ${resumen.grupo}`;

    const info3 = document.createElement("div");
    info3.textContent = `Personas: ${resumen.personas}`;

    content.appendChild(title);
    content.appendChild(sub);
    content.appendChild(info1);
    content.appendChild(info2);
    content.appendChild(info3);

    card.appendChild(content);

    card.addEventListener("click", () => {
      state.equipoSelectedResource = {
        tipo: "vehiculo",
        id_vehiculo: Number(v.id_vehiculo),
        label: v.label
      };
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

[opNombreEl, opDescEl, opInicioEl, opFinEl, opPrioridadEl].forEach((el) => {
  el?.addEventListener("input", () => {
    saveOperacionActualLocal();
    saveDraftLocal();
  });
  el?.addEventListener("change", () => {
    saveOperacionActualLocal();
    saveDraftLocal();
  });
});

// ===============================
// Init
// ===============================
(async function init() {
  try {
    await loadCatalogs();

    loadOperacionActualIntoForm();
    restoreDraftLocal();

    if (state.opId) showDashboardButton();
    else hideDashboardButton();

    renderHome();
  } catch (e) {
    alert(`Error inicializando: ${e.message}\n\n¿Hay token en localStorage.token? ¿API en ${API_BASE}?`);
  }
})();