/// asignacion.js — UI v1 + Backend + Operación desde form izquierdo

// ===============================
// Sesión / token
// ===============================
if (localStorage.getItem("session") !== "ok") {
  window.location.href = "login.html";
}

const API_BASE = window.API_BASE || localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

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
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    const msg = data?.mensaje || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

function fullName(p) {
  const n = (p?.nombre || "").trim();
  const a = (p?.apellido || "").trim();
  return `${n}${a ? " " + a : ""}`.trim();
}

// ===============================
// DOM principal
// ===============================
const panel         = document.getElementById("panel");
const rightTitle    = document.getElementById("rightTitle");
const rightHint     = document.getElementById("rightHint");
const btnAccion     = document.getElementById("btnAccion");
const btnBack       = document.getElementById("btnBack");
const btnVolver     = document.getElementById("btnVolver");
const lblOperacion  = document.getElementById("lblOperacion");

// Form izquierdo (datos de la operación)
const opNombreEl    = document.getElementById("opNombre");
const opDescEl      = document.getElementById("opDesc");
const opInicioEl    = document.getElementById("opInicio");
const opFinEl       = document.getElementById("opFin");
const opPrioridadEl = document.getElementById("opPrioridad");

// Panel izquierdo: alternar entre FORM y VEHÍCULOS (NO destruir)
const leftCardTitleEl = document.getElementById("leftCardTitle");
const opInfoFormEl    = document.getElementById("opInfoForm");
const vehiculosLeftEl = document.getElementById("vehiculosLeft");

function showOperacionInfo() {
  if (leftCardTitleEl) leftCardTitleEl.textContent = "Información de operación";
  if (opInfoFormEl)    opInfoFormEl.style.display  = "flex";
  if (vehiculosLeftEl) {
    vehiculosLeftEl.style.display = "none";
    vehiculosLeftEl.innerHTML     = "";
  }
}

function showVehiculosLeftPanel() {
  if (leftCardTitleEl) leftCardTitleEl.textContent = "Asignación de personal al vehículo";
  if (opInfoFormEl)    opInfoFormEl.style.display  = "none";
  if (vehiculosLeftEl) {
    vehiculosLeftEl.style.display = "block";
    vehiculosLeftEl.innerHTML     = "";
  }
}

// ===============================
// Estado (IDs reales del backend)
// ===============================
const state = {
  categoria:    null,
  pasoPersonal: "home",

  // id_operacion se resuelve al guardar (POST /ops)
  opId: null,

  // Catálogos desde backend
  cutList:      [],
  cetList:      [],
  cellList:     [],
  vehiclesList: [],

  // Selecciones por ID
  cutSeleccionadoId:   null,
  cetSeleccionadosIds: [],
  cetActivoIndex:      0,

  // { [cetId]: [cellId, ...] }
  asignacionCelulas: {},

  flotillaByCet: {},
  searchByCet:   {},
  // { [cetId]: { names:[], active:string|null, map:{[groupName]: cellId[]}, idx:number, vehActive:string|null } }
  gruposByCet:   {},

  // { [id_personal]: id_vehiculo }
  asignacionVehiculos: {},
  cetActivoIndexVeh:   0,
  selectedVehicleId:   null,
  selectedPersonIds:   [],
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
  rightHint.textContent  = capFirst(hint);
}
function setAccion(text, disabled = false) {
  btnAccion.textContent = capFirst(text);
  btnAccion.disabled    = !!disabled;
}
function showBack(show) {
  btnBack.style.visibility = show ? "visible" : "hidden";
}
function clearPanel() { panel.innerHTML = ""; }

function getScrollTopInPanel() {
  return panel.querySelector(".listBox")?.scrollTop ?? 0;
}
function restoreScrollTop(listBoxEl, scrollTop) {
  if (!listBoxEl) return;
  requestAnimationFrame(() => { listBoxEl.scrollTop = scrollTop; });
}
function mkOpt(txt) {
  const b = document.createElement("button");
  b.className   = "optBtn";
  b.textContent = capFirst(txt);
  return b;
}

function ensureCetState(cetId) {
  if (state.flotillaByCet[cetId] === undefined) state.flotillaByCet[cetId] = "";
  if (state.searchByCet[cetId]   === undefined) state.searchByCet[cetId]   = "";
  if (!state.gruposByCet[cetId]) {
    state.gruposByCet[cetId] = { names: [], active: null, map: {}, idx: 0, vehActive: null };
  } else {
    const gi = state.gruposByCet[cetId];
    if (gi.idx       === undefined) gi.idx       = 0;
    if (gi.vehActive === undefined) gi.vehActive = null;
    if (!gi.map) gi.map = {};
  }
}

function getCetIdByIndex(idx) {
  return state.cetSeleccionadosIds[idx];
}

function getPersonalById(id) {
  return [...state.cutList, ...state.cetList, ...state.cellList].find(x => x.id_personal === id) || null;
}

// ===============================
// CARGA INICIAL DESDE BACKEND
// ===============================
async function loadCatalogs() {
  const [cutRes, cetRes, cellRes, vehRes] = await Promise.all([
    api(`/catalog/personal?rol=CUT`),
    api(`/catalog/personal?rol=CET`),
    api(`/catalog/personal?rol=CELL`),
    api(`/catalog/vehiculos`),
  ]);

  state.cutList  = (cutRes.items  || []).map(p => ({ ...p, label: fullName(p) }));
  state.cetList  = (cetRes.items  || []).map(p => ({ ...p, label: fullName(p) }));
  state.cellList = (cellRes.items || []).map(p => ({ ...p, label: fullName(p) }));

  state.vehiclesList = (vehRes.items || []).map(v => ({
    ...v,
    label: `${v.codigo_interno} — ${v.marca} ${v.modelo}`.trim(),
    image: v.imagen_veh || "",
  }));

  // Código de operación desde URL (si viene)
  const qs       = new URLSearchParams(window.location.search);
  const opCodigo = qs.get("op");
  if (opCodigo && lblOperacion) lblOperacion.textContent = opCodigo;
}

// ===============================
// GUARDAR EN BACKEND
// ===============================
// Paso 1: crea la operación + guarda personal y mando. Se llama al pasar de células → vehículos.
async function crearOperacionYPersonal() {
  const nombre       = opNombreEl?.value.trim()  || "";
  const descripcion  = opDescEl?.value.trim()    || "";
  const prioridad    = opPrioridadEl?.value      || "MEDIA";
  const fecha_inicio = opInicioEl?.value         || null;
  const fecha_fin    = opFinEl?.value            || null;

  if (!nombre)                               throw new Error("Completa el nombre de la operación antes de continuar.");
  if (!state.cutSeleccionadoId)              throw new Error("Falta seleccionar CUT.");
  if (state.cetSeleccionadosIds.length === 0) throw new Error("Falta seleccionar al menos un CET.");

  // Crear operación
  const opRes        = await api("/ops", {
    method: "POST",
    body: { nombre, descripcion, prioridad, fecha_inicio, fecha_fin },
  });

  state.opId = opRes.id_operacion;
  if (lblOperacion) lblOperacion.textContent = nombre;

  // Personal: CUT + todos los CET + todas las CELL
  const uniquePersonalIds = new Set();
  uniquePersonalIds.add(state.cutSeleccionadoId);
  state.cetSeleccionadosIds.forEach(id => uniquePersonalIds.add(id));
  Object.values(state.asignacionCelulas || {}).forEach(arr =>
    (arr || []).forEach(id => uniquePersonalIds.add(id))
  );

  const personalItems = [];
  for (const id_personal of uniquePersonalIds) {
    const p = getPersonalById(id_personal);
    personalItems.push({
      id_personal,
      rol_en_operacion:  p?.rol || null,
      estado_asignacion: "ASIGNADO",
    });
  }

  await api(`/ops/${state.opId}/personal`, {
    method: "POST",
    body:   { items: personalItems },
  });

  // Mando: mapeo CET → CELL
  const mandoItems = [];
  state.cetSeleccionadosIds.forEach(cetId => {
    (state.asignacionCelulas[cetId] || []).forEach(cellId => {
      mandoItems.push({ id_cet: cetId, id_cell: cellId });
    });
  });

  await api(`/ops/${state.opId}/mando`, {
    method: "POST",
    body:   { items: mandoItems },
  });

  return { nombre, codigo: opRes.codigo };
}

// Paso 2: guarda solo los vehículos. Se llama al Finalizar en la pantalla de vehículos.
async function saveVehiculos() {
  if (!state.opId) throw new Error("No hay operación activa. Regresa y completa el paso de personal.");

  const vehItems = Object.entries(state.asignacionVehiculos || {}).map(([id_personal, id_vehiculo]) => ({
    id_personal: Number(id_personal),
    id_vehiculo: Number(id_vehiculo),
  }));

  await api(`/ops/${state.opId}/vehiculos`, {
    method: "POST",
    body:   { items: vehItems },
  });
}

// ===============================
// HOME
// ===============================
function renderHome() {
  showOperacionInfo();
  clearPanel();
  state.categoria    = null;
  state.pasoPersonal = "home";

  setHeader("Asignar", "");
  setAccion("Siguiente", true);
  showBack(false);

  const grid = document.createElement("div");
  grid.className = "optGrid";

  const btnPersonal  = mkOpt("Personal");
  const btnEquipo    = mkOpt("Equipo");
  const btnVehiculos = mkOpt("Vehículos");

  btnPersonal.addEventListener("click", () => {
    state.categoria    = "personal";
    state.pasoPersonal = "cut";
    renderCUT();
  });

  btnEquipo.addEventListener("click", () => {
    state.categoria = "equipo";
    renderPlaceholder("Equipo", "Aquí irá el flujo de Equipo.");
  });

  btnVehiculos.addEventListener("click", () => {
    state.categoria = "vehiculos";
    if (!state.cutSeleccionadoId || state.cetSeleccionadosIds.length === 0) {
      alert("Primero asigna CUT y CET/CELL.");
      state.categoria    = "personal";
      state.pasoPersonal = "cut";
      renderCUT();
      return;
    }
    state.cetActivoIndexVeh = 0;
    state.selectedVehicleId = null;
    state.selectedPersonIds = [];
    renderVehiculos();
  });

  grid.append(btnPersonal, btnVehiculos, btnEquipo);
  panel.appendChild(grid);
}

function renderPlaceholder(title) {
  showOperacionInfo();
  clearPanel();
  setHeader(title, "");
  showBack(true);
  setAccion("Siguiente", true);
}

// ===============================
// PERSONAL (CUT)
// ===============================
function renderCUT() {
  showOperacionInfo();
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  setHeader("Comandante de Unidad Táctica", "");
  setAccion("Siguiente", !state.cutSeleccionadoId);

  const listBox     = document.createElement("div");
  listBox.className = "listBox";

  const search              = document.createElement("input");
  search.className          = "inp";
  search.placeholder        = "Buscar CUT...";
  search.style.marginBottom = "10px";

  const rowsWrap = document.createElement("div");
  rowsWrap.style.display       = "flex";
  rowsWrap.style.flexDirection = "column";
  rowsWrap.style.gap           = "10px";

  function paint(filterText) {
    const ft = (filterText || "").toLowerCase().trim();
    rowsWrap.innerHTML = "";
    state.cutList
      .filter(p => !ft || p.label.toLowerCase().includes(ft))
      .forEach(p => {
        const row     = document.createElement("div");
        row.className = "item" + (state.cutSeleccionadoId === p.id_personal ? " selected" : "");

        const left        = document.createElement("div");
        left.className    = "itemName";
        left.textContent  = p.label;
        left.style.cursor = "pointer";
        left.addEventListener("click", () => {
          state.cutSeleccionadoId   = p.id_personal;
          state.cetSeleccionadosIds = [];
          state.cetActivoIndex      = 0;
          state.asignacionCelulas   = {};
          state.asignacionVehiculos = {};
          state.gruposByCet         = {};
          state.flotillaByCet       = {};
          state.searchByCet         = {};
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
    renderCET();
  };
}

// ===============================
// PERSONAL (CET)
// ===============================
function renderCET() {
  showOperacionInfo();
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  setHeader("Comandante de Equipo de Trabajo", "");
  setAccion("Siguiente", state.cetSeleccionadosIds.length === 0);

  const chips     = document.createElement("div");
  chips.className = "chipRow";

  const cutObj  = state.cutList.find(x => x.id_personal === state.cutSeleccionadoId);
  const cutChip = document.createElement("div");
  cutChip.className   = "chip";
  cutChip.textContent = `CUT: ${cutObj?.label || "—"}`;
  chips.appendChild(cutChip);

  state.cetSeleccionadosIds.forEach(id => {
    const p = getPersonalById(id);
    const c = document.createElement("div");
    c.className   = "chip active";
    c.textContent = `CET: ${p?.label || id}`;
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  const listBox     = document.createElement("div");
  listBox.className = "listBox";

  const search              = document.createElement("input");
  search.className          = "inp";
  search.placeholder        = "Buscar CET...";
  search.style.marginBottom = "10px";

  const rowsWrap = document.createElement("div");
  rowsWrap.style.display       = "flex";
  rowsWrap.style.flexDirection = "column";
  rowsWrap.style.gap           = "10px";

  function paint(filterText) {
    const ft = (filterText || "").toLowerCase().trim();
    rowsWrap.innerHTML = "";
    state.cetList
      .filter(p => !ft || p.label.toLowerCase().includes(ft))
      .forEach(p => {
        const isSel   = state.cetSeleccionadosIds.includes(p.id_personal);
        const row     = document.createElement("div");
        row.className = "item" + (isSel ? " selected" : "");

        const left        = document.createElement("div");
        left.className    = "itemName";
        left.textContent  = p.label;
        left.style.cursor = "pointer";
        left.addEventListener("click", () => {
          if (isSel) {
            state.cetSeleccionadosIds = state.cetSeleccionadosIds.filter(id => id !== p.id_personal);
          } else {
            state.cetSeleccionadosIds.push(p.id_personal);
            ensureCetState(p.id_personal);
          }
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

    state.pasoPersonal   = "celulas";
    state.cetActivoIndex = 0;

    const firstCet = getCetIdByIndex(0);
    const gi       = state.gruposByCet[firstCet];
    if (gi && (gi.names || []).length > 0) {
      gi.idx    = Math.max(0, Math.min(gi.idx || 0, gi.names.length - 1));
      gi.active = gi.names[gi.idx];
      if (!gi.vehActive) gi.vehActive = gi.active;
    }

    renderCelulas();
  };
}

// ===============================
// CHIPS DE GRUPOS
// ===============================
function pintarChipsGrupos(cetId, container) {
  container.innerHTML = "";
  ensureCetState(cetId);
  const info      = state.gruposByCet[cetId];
  const hasGroups = (info.names || []).length > 0;

  if (hasGroups) {
    info.idx = Math.max(0, Math.min(info.idx, info.names.length - 1));
    if (!info.active) info.active = info.names[info.idx];
    if (info.active && !info.names.includes(info.active)) info.active = info.names[info.idx];
    if (!info.vehActive) info.vehActive = info.active;
  } else {
    info.active    = null;
    info.idx       = 0;
    info.vehActive = null;
  }

  info.names.forEach((gName, index) => {
    const chip       = document.createElement("button");
    chip.className   = "chip" + (info.active === gName ? " active" : "");
    chip.textContent = gName;
    chip.addEventListener("click", () => {
      info.idx    = index;
      info.active = gName;
      renderCelulas();
    });
    container.appendChild(chip);
  });
}

// ===============================
// CÉLULAS (CELL)
// ===============================
function renderCelulas() {
  showOperacionInfo();
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  const cetId    = getCetIdByIndex(state.cetActivoIndex);
  const asignadas = state.asignacionCelulas[cetId] || [];

  ensureCetState(cetId);
  const info      = state.gruposByCet[cetId];
  const hasGroups = (info.names || []).length > 0;

  if (hasGroups) {
    info.idx = Math.max(0, Math.min(info.idx, info.names.length - 1));
    if (!info.active) info.active = info.names[info.idx];
    if (info.active && !info.names.includes(info.active)) info.active = info.names[info.idx];
    if (!info.vehActive) info.vehActive = info.active;
  } else {
    info.active    = null;
    info.idx       = 0;
    info.vehActive = null;
  }

  setHeader("Células", "");

  const lastCet   = state.cetActivoIndex === state.cetSeleccionadosIds.length - 1;
  const lastGroup = !hasGroups || (info.idx === info.names.length - 1);
  setAccion((lastCet && lastGroup) ? "Finalizar" : "Siguiente", false);

  // Chips CUT + CETs
  const chips     = document.createElement("div");
  chips.className = "chipRow";

  const cutObj  = state.cutList.find(x => x.id_personal === state.cutSeleccionadoId);
  const cutChip = document.createElement("div");
  cutChip.className   = "chip";
  cutChip.textContent = `CUT: ${cutObj?.label || "—"}`;
  chips.appendChild(cutChip);

  state.cetSeleccionadosIds.forEach((id, i) => {
    const p = getPersonalById(id);
    const c = document.createElement("div");
    c.className   = "chip" + (i === state.cetActivoIndex ? " active" : "");
    c.textContent = `CET: ${p?.label || id}`;
    c.addEventListener("click", () => {
      state.cetActivoIndex = i;
      const gi = state.gruposByCet[id];
      if (gi) {
        if (gi.idx       === undefined) gi.idx       = 0;
        if (gi.vehActive === undefined) gi.vehActive = null;
        if ((gi.names || []).length > 0) {
          gi.idx    = Math.max(0, Math.min(gi.idx, gi.names.length - 1));
          gi.active = gi.names[gi.idx];
          if (!gi.vehActive) gi.vehActive = gi.active;
        } else {
          gi.idx      = 0;
          gi.active   = null;
          gi.vehActive = null;
        }
      }
      renderCelulas();
    });
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  const listBox     = document.createElement("div");
  listBox.className = "listBox";

  const sticky     = document.createElement("div");
  sticky.className = "stickyTop";

  // Flotilla
  const flotillaRow     = document.createElement("div");
  flotillaRow.className = "flotillaRow";

  const flotWrap      = document.createElement("div");
  flotWrap.style.flex = "1";

  const flotLbl              = document.createElement("div");
  flotLbl.className          = "lbl";
  flotLbl.style.marginBottom = "6px";
  flotLbl.textContent        = "Nombre de la flotilla";

  const flotInp       = document.createElement("input");
  flotInp.className   = "inp";
  flotInp.value       = state.flotillaByCet[cetId] || "";
  flotInp.placeholder = "";
  flotInp.addEventListener("input", () => { state.flotillaByCet[cetId] = flotInp.value; });

  flotWrap.appendChild(flotLbl);
  flotWrap.appendChild(flotInp);

  const btnCrearGrupo       = document.createElement("button");
  btnCrearGrupo.className   = "btnSoft";
  btnCrearGrupo.textContent = "Crear grupo";
  btnCrearGrupo.addEventListener("click", () => abrirModalCrearGrupo(cetId));

  flotillaRow.appendChild(flotWrap);
  flotillaRow.appendChild(btnCrearGrupo);

  const groupsRow     = document.createElement("div");
  groupsRow.className = "groupsRow";
  pintarChipsGrupos(cetId, groupsRow);

  const searchInp       = document.createElement("input");
  searchInp.className   = "inp";
  searchInp.placeholder = "Buscar células...";
  searchInp.value       = state.searchByCet[cetId] || "";

  sticky.appendChild(flotillaRow);
  sticky.appendChild(groupsRow);
  sticky.appendChild(searchInp);
  listBox.appendChild(sticky);

  const rowsWrap = document.createElement("div");
  rowsWrap.style.display       = "flex";
  rowsWrap.style.flexDirection = "column";
  rowsWrap.style.gap           = "10px";

  const yaUsadas = new Set();
  state.cetSeleccionadosIds.forEach((otherCetId, i) => {
    if (i === state.cetActivoIndex) return;
    (state.asignacionCelulas[otherCetId] || []).forEach(x => yaUsadas.add(x));
  });

  function paintCells() {
    const term = (state.searchByCet[cetId] || "").toLowerCase().trim();
    rowsWrap.innerHTML = "";

    state.cellList
      .filter(p => !term || p.label.toLowerCase().includes(term))
      .forEach(p => {
        const cellId    = p.id_personal;
        const enEste    = asignadas.includes(cellId);
        const bloqueada = yaUsadas.has(cellId);

        const row = celulaRow({
          name:     p.label,
          selected: enEste,
          disabled: bloqueada,
          status:   bloqueada ? "Asignado" : (enEste ? "En este CET" : "Disponible"),
          onToggle: () => {
            if (bloqueada) return;
            const grupoActivo = info?.active || null;

            if (grupoActivo) {
              if (!info.map[grupoActivo]) info.map[grupoActivo] = [];
              if (enEste) {
                state.asignacionCelulas[cetId] = asignadas.filter(x => x !== cellId);
                Object.keys(info.map).forEach(g => {
                  info.map[g] = (info.map[g] || []).filter(x => x !== cellId);
                });
              } else {
                state.asignacionCelulas[cetId] = [...asignadas, cellId];
                if (!info.map[grupoActivo].includes(cellId)) info.map[grupoActivo].push(cellId);
              }
            } else {
              if (enEste) {
                state.asignacionCelulas[cetId] = asignadas.filter(x => x !== cellId);
              } else {
                state.asignacionCelulas[cetId] = [...asignadas, cellId];
              }
            }
            renderCelulas();
          }
        });

        rowsWrap.appendChild(row);
      });
  }

  searchInp.addEventListener("input", () => {
    state.searchByCet[cetId] = searchInp.value;
    paintCells();
  });

  listBox.appendChild(rowsWrap);
  panel.appendChild(listBox);

  paintCells();
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = async () => {
    if (hasGroups && info.idx < info.names.length - 1) {
      info.idx    += 1;
      info.active  = info.names[info.idx];
      if (!info.vehActive) info.vehActive = info.active;
      renderCelulas();
      return;
    }

    if (state.cetActivoIndex < state.cetSeleccionadosIds.length - 1) {
      state.cetActivoIndex += 1;
      const nextCet = getCetIdByIndex(state.cetActivoIndex);
      const ngi     = state.gruposByCet[nextCet];
      if (ngi) {
        if (ngi.idx       === undefined) ngi.idx       = 0;
        if (ngi.vehActive === undefined) ngi.vehActive = null;
        if ((ngi.names || []).length > 0) {
          ngi.idx    = Math.max(0, Math.min(ngi.idx, ngi.names.length - 1));
          ngi.active = ngi.names[ngi.idx];
          if (!ngi.vehActive) ngi.vehActive = ngi.active;
        } else {
          ngi.idx      = 0;
          ngi.active   = null;
          ngi.vehActive = null;
        }
      }
      renderCelulas();
      return;
    }

    // Fin células → vehículos: crear operación y guardar personal/mando primero
    try {
      setAccion("Guardando...", true);
      await crearOperacionYPersonal();
      state.cetActivoIndexVeh = 0;
      state.selectedVehicleId = null;
      state.selectedPersonIds = [];
      renderVehiculos();
    } catch (e) {
      setAccion("Finalizar", false);
      alert(`Error al crear la operación: ${e.message}`);
    }
  };
}

// ===============================
// MODAL CREAR GRUPOS
// ===============================
function abrirModalCrearGrupo(cetId) {
  const overlay = document.createElement("div");
  overlay.style.position       = "fixed";
  overlay.style.inset          = "0";
  overlay.style.background     = "rgba(15,23,42,.35)";
  overlay.style.display        = "flex";
  overlay.style.alignItems     = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex         = "9999";
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  const modal = document.createElement("div");
  modal.style.width        = "520px";
  modal.style.maxWidth     = "92vw";
  modal.style.background   = "#fff";
  modal.style.borderRadius = "16px";
  modal.style.border       = "1px solid #d7e3ff";
  modal.style.boxShadow    = "0 24px 60px rgba(15,23,42,.20)";
  modal.style.padding      = "16px";

  const title = document.createElement("div");
  title.style.fontWeight   = "900";
  title.style.fontSize     = "18px";
  title.style.textAlign    = "center";
  title.style.marginBottom = "12px";
  title.textContent        = "Crear Grupos";

  const row1 = document.createElement("div");
  row1.style.display      = "flex";
  row1.style.gap          = "10px";
  row1.style.alignItems   = "center";
  row1.style.marginBottom = "10px";

  const lbl            = document.createElement("div");
  lbl.style.fontWeight = "800";
  lbl.textContent      = "Cuantos";

  const inpNum       = document.createElement("input");
  inpNum.type        = "number";
  inpNum.min         = "1";
  inpNum.className   = "inp";
  inpNum.style.width = "120px";

  row1.append(lbl, inpNum);

  const formWrap = document.createElement("div");
  formWrap.style.display       = "flex";
  formWrap.style.flexDirection = "column";
  formWrap.style.gap           = "10px";
  formWrap.style.marginTop     = "6px";

  const btnRow = document.createElement("div");
  btnRow.style.display        = "flex";
  btnRow.style.gap            = "8px";
  btnRow.style.justifyContent = "flex-end";
  btnRow.style.marginTop      = "14px";

  const btnCancel       = document.createElement("button");
  btnCancel.className   = "btnGhost";
  btnCancel.textContent = "Cancelar";
  btnCancel.addEventListener("click", () => overlay.remove());

  const btnCreate       = document.createElement("button");
  btnCreate.className   = "btnPrimary";
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
      line.style.display    = "flex";
      line.style.gap        = "10px";
      line.style.alignItems = "center";

      const l            = document.createElement("div");
      l.style.fontWeight = "800";
      l.style.width      = "140px";
      l.textContent      = "Nombre del grupo";

      const inp     = document.createElement("input");
      inp.className = "inp";
      inp.value     = "";
      nameInputs.push(inp);

      line.append(l, inp);
      formWrap.appendChild(line);
    }
  }

  inpNum.addEventListener("input", buildFields);

  btnCreate.addEventListener("click", () => {
    const names     = nameInputs.map(i => i.value.trim()).filter(Boolean);
    const nExpected = Number(inpNum.value || 0);

    if (!nExpected || nExpected < 1) return alert("Pon un número válido en 'Cuantos'.");
    if (names.length !== nExpected)  return alert("Completa todos los nombres de grupo.");

    ensureCetState(cetId);
    const info = state.gruposByCet[cetId];

    names.forEach(g => {
      if (!info.names.includes(g)) {
        info.names.push(g);
        if (!info.map[g]) info.map[g] = [];
      }
    });

    if (info.names.length > 0 && (!info.active || !info.names.includes(info.active))) {
      info.idx    = Math.max(0, Math.min(info.idx, info.names.length - 1));
      info.active = info.names[info.idx];
    }
    if (!info.vehActive && info.names.length > 0) {
      info.vehActive = info.active || info.names[0];
    }

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
// VEHÍCULOS
// ===============================
function renderVehiculos() {
  clearPanel();
  showBack(true);
  showVehiculosLeftPanel();

  const vehCount = {};
  Object.values(state.asignacionVehiculos || {}).forEach(vId => {
    if (!vId) return;
    vehCount[vId] = (vehCount[vId] || 0) + 1;
  });

  const cetId  = getCetIdByIndex(state.cetActivoIndexVeh);
  const cetObj = getPersonalById(cetId);

  ensureCetState(cetId);
  const ginfo     = state.gruposByCet[cetId];
  const hasGroups = (ginfo.names || []).length > 0;

  if (hasGroups) {
    if (!ginfo.vehActive || !ginfo.names.includes(ginfo.vehActive)) {
      ginfo.vehActive = (ginfo.active && ginfo.names.includes(ginfo.active))
        ? ginfo.active : ginfo.names[0];
    }
  } else {
    ginfo.vehActive = null;
  }

  const groupIndex     = hasGroups ? Math.max(0, ginfo.names.indexOf(ginfo.vehActive)) : 0;
  const lastGroupIndex = hasGroups ? (ginfo.names.length - 1) : 0;

  setHeader("Asignación de Vehículos", "");
  const lastCet       = state.cetActivoIndexVeh === state.cetSeleccionadosIds.length - 1;
  const isLastOverall = lastCet && (!hasGroups || groupIndex === lastGroupIndex);
  setAccion(isLastOverall ? "Finalizar" : "Siguiente", false);

  // Chips CET
  const cetButtons              = document.createElement("div");
  cetButtons.className          = "chipRow";
  cetButtons.style.marginBottom = "12px";

  state.cetSeleccionadosIds.forEach((id, i) => {
    const p   = getPersonalById(id);
    const btn = document.createElement("button");
    btn.className    = "chip" + (i === state.cetActivoIndexVeh ? " active" : "");
    btn.textContent  = `CET: ${p?.label || id}`;
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => {
      state.cetActivoIndexVeh = i;
      state.selectedPersonIds = [];
      state.selectedVehicleId = null;
      renderVehiculos();
    });
    cetButtons.appendChild(btn);
  });
  vehiculosLeftEl.appendChild(cetButtons);

  // Header flotilla + grupos
  const headerBox = document.createElement("div");
  headerBox.className          = "stickyTop";
  headerBox.style.position     = "relative";
  headerBox.style.top          = "auto";
  headerBox.style.padding      = "10px 0";
  headerBox.style.background   = "#fff";
  headerBox.style.borderBottom = "1px solid #d7e3ff";
  headerBox.style.marginBottom = "10px";

  const flotillaLbl              = document.createElement("div");
  flotillaLbl.className          = "lbl";
  flotillaLbl.style.marginBottom = "8px";
  flotillaLbl.textContent        = "Nombre de la flotilla";

  const flotillaChip           = document.createElement("div");
  flotillaChip.className       = "chip active";
  flotillaChip.style.display   = "inline-block";
  flotillaChip.style.cursor    = "default";
  flotillaChip.textContent     = state.flotillaByCet[cetId] || "—";

  headerBox.appendChild(flotillaLbl);
  headerBox.appendChild(flotillaChip);

  if (hasGroups) {
    const grpLbl        = document.createElement("div");
    grpLbl.className    = "lbl";
    grpLbl.style.margin = "12px 0 8px";
    grpLbl.textContent  = "Grupos";

    const grpRow     = document.createElement("div");
    grpRow.className = "groupsRow";

    ginfo.names.forEach(gName => {
      const chip       = document.createElement("button");
      chip.className   = "chip" + (ginfo.vehActive === gName ? " active" : "");
      chip.textContent = gName;
      chip.addEventListener("click", () => {
        ginfo.vehActive         = gName;
        state.selectedPersonIds = [];
        state.selectedVehicleId = null;
        renderVehiculos();
      });
      grpRow.appendChild(chip);
    });

    headerBox.appendChild(grpLbl);
    headerBox.appendChild(grpRow);
  }

  vehiculosLeftEl.appendChild(headerBox);

  // Lista checkboxes
  const cellulasList           = document.createElement("div");
  cellulasList.style.maxHeight = "350px";
  cellulasList.style.overflowY = "auto";

  const cellsForCet = state.asignacionCelulas[cetId] || [];
  let   cellsToShow = cellsForCet.slice();
  if (hasGroups && ginfo.vehActive) {
    const arr   = (ginfo.map[ginfo.vehActive] || []);
    cellsToShow = arr.filter(id => cellsForCet.includes(id));
  }

  function toggleSelectedId(id, checked) {
    const set = new Set(state.selectedPersonIds || []);
    if (checked) set.add(id);
    else         set.delete(id);
    state.selectedPersonIds = Array.from(set);
  }

  function mkCheckRow({ labelText, idKey, disabled = false, checked = false, onChange }) {
    const label = document.createElement("label");
    label.style.display         = "flex";
    label.style.alignItems      = "center";
    label.style.gap             = "10px";
    label.style.marginBottom    = "10px";
    label.style.padding         = "10px";
    label.style.cursor          = disabled ? "not-allowed" : "pointer";
    label.style.borderRadius    = "8px";
    label.style.backgroundColor = "#f5f5f5";
    if (disabled) label.style.opacity = "0.65";

    const chk    = document.createElement("input");
    chk.type     = "checkbox";
    chk.checked  = checked;
    chk.disabled = disabled;
    chk.addEventListener("change", e => onChange?.(e.target.checked));

    const textSpan       = document.createElement("span");
    textSpan.style.flex  = "1";
    textSpan.textContent = labelText;

    label.appendChild(chk);
    label.appendChild(textSpan);
    return label;
  }

  // Fila CET
  const cetLocked = !!state.asignacionVehiculos[cetId];
  cellulasList.appendChild(mkCheckRow({
    labelText: cetLocked
      ? `CET: ${cetObj?.label || cetId} (Asignado)`
      : `CET: ${cetObj?.label || cetId}`,
    idKey:    cetId,
    disabled: cetLocked,
    checked:  (state.selectedPersonIds || []).includes(cetId),
    onChange: checked => { toggleSelectedId(cetId, checked); renderVehiculos(); }
  }));

  // Seleccionar todo lo visible
  if (cellsToShow.length > 0) {
    const visibleIds      = [cetId, ...cellsToShow];
    const unlockedVisible = visibleIds.filter(id => !state.asignacionVehiculos[id]);
    const allSel          = unlockedVisible.length > 0 && unlockedVisible.every(id => (state.selectedPersonIds || []).includes(id));
    const someSel         = unlockedVisible.some(id => (state.selectedPersonIds || []).includes(id));

    const rowAll = mkCheckRow({
      labelText: "Seleccionar todo lo visible",
      idKey:    -1,
      disabled: unlockedVisible.length === 0,
      checked:  allSel,
      onChange: checked => {
        const set = new Set(state.selectedPersonIds || []);
        if (checked) unlockedVisible.forEach(id => set.add(id));
        else         unlockedVisible.forEach(id => set.delete(id));
        state.selectedPersonIds = Array.from(set);
        renderVehiculos();
      }
    });
    rowAll.querySelector("input").indeterminate = (!allSel && someSel);
    cellulasList.appendChild(rowAll);
  }

  // Filas células
  cellsToShow.forEach(cellId => {
    const p      = getPersonalById(cellId);
    const locked = !!state.asignacionVehiculos[cellId];
    cellulasList.appendChild(mkCheckRow({
      labelText: locked ? `${p?.label || cellId} (Asignado)` : (p?.label || cellId),
      idKey:    cellId,
      disabled: locked,
      checked:  (state.selectedPersonIds || []).includes(cellId),
      onChange: checked => { toggleSelectedId(cellId, checked); renderVehiculos(); }
    }));
  });

  vehiculosLeftEl.appendChild(cellulasList);

  // Panel derecho: tarjetas vehículos
  const vehiclesWrap     = document.createElement("div");
  vehiclesWrap.className = "listBox";
  vehiclesWrap.style.gap = "12px";

  const vehicleGrid           = document.createElement("div");
  vehicleGrid.className       = "vehicleGrid";
  vehicleGrid.style.maxHeight = "300px";
  vehicleGrid.style.overflowY = "auto";

  state.vehiclesList.forEach(veh => {
    const card        = document.createElement("div");
    card.className    = "vehicleCard";
    card.style.cursor = "pointer";

    const isSelected = state.selectedVehicleId === veh.id_vehiculo;
    if (isSelected) card.classList.add("selected");

    const estadoUp   = (veh.estado || "").toString().toUpperCase();
    const isDisabled = !["DISPONIBLE", "OPERATIVO", "EN_SERVICIO"].includes(estadoUp);
    if (isDisabled) {
      card.classList.add("disabled");
      card.style.cursor = "not-allowed";
    }

    const img         = document.createElement("img");
    img.src           = veh.image || "";
    img.alt           = veh.label;

    const nameP       = document.createElement("p");
    nameP.textContent = veh.label;

    const used              = vehCount[veh.id_vehiculo] || 0;
    const infoP             = document.createElement("p");
    infoP.style.margin      = "6px 0 0";
    infoP.style.fontWeight  = "700";
    infoP.style.fontSize    = "12px";
    infoP.style.opacity     = "0.85";
    infoP.textContent       = `Asignados: ${used}`;

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

  // Botón Asignar
  const assignBtn           = document.createElement("button");
  assignBtn.className       = "btnPrimary";
  assignBtn.style.marginTop = "20px";
  assignBtn.style.width     = "100%";
  assignBtn.textContent     = "Asignarle";

  const selectedAssignable = (state.selectedPersonIds || []).filter(id =>
    typeof id === "number" || Number.isInteger(Number(id))
  );
  const lockedSelected = selectedAssignable.filter(id => !!state.asignacionVehiculos[id]);

  assignBtn.disabled = !(state.selectedVehicleId && selectedAssignable.length > 0 && lockedSelected.length === 0);

  assignBtn.addEventListener("click", () => {
    if (!state.selectedVehicleId)        return alert("Selecciona un vehículo");
    if (selectedAssignable.length === 0) return alert("Selecciona al menos CET o una CELL");

    const locked = selectedAssignable.filter(id => !!state.asignacionVehiculos[id]);
    if (locked.length > 0) return alert("Uno o más ya tienen vehículo asignado.");

    selectedAssignable.forEach(id => {
      state.asignacionVehiculos[id] = state.selectedVehicleId;
    });

    state.selectedVehicleId = null;
    state.selectedPersonIds = [];
    renderVehiculos();
  });

  panel.appendChild(assignBtn);

  // Avance: grupos → CETs → Finalizar (guarda)
  btnAccion.onclick = async () => {
    if (hasGroups && groupIndex < lastGroupIndex) {
      ginfo.vehActive         = ginfo.names[groupIndex + 1];
      state.selectedVehicleId = null;
      state.selectedPersonIds = [];
      renderVehiculos();
      return;
    }

    if (state.cetActivoIndexVeh < state.cetSeleccionadosIds.length - 1) {
      state.cetActivoIndexVeh += 1;
      const nextCetId     = getCetIdByIndex(state.cetActivoIndexVeh);
      ensureCetState(nextCetId);
      const ngi           = state.gruposByCet[nextCetId];
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
      renderVehiculos();
      return;
    }

    // Último CET + último grupo → guardar todo en el backend
    try {
      setAccion("Guardando...", true);
      await saveVehiculos();
      const nombre = opNombreEl?.value.trim() || "";
      alert(`Operación "${nombre}" guardada completamente.`);
      state.categoria    = null;
      state.pasoPersonal = "home";
      renderHome();
    } catch (e) {
      setAccion("Finalizar", false);
      alert(`Error guardando: ${e.message}`);
    }
  };
}

// ===============================
// Fila célula reutilizable
// ===============================
function celulaRow({ name, selected = false, disabled = false, status = "Disponible", onToggle }) {
  const row     = document.createElement("div");
  row.className = "item" + (selected ? " selected" : "") + (disabled ? " disabled" : "");

  const left       = document.createElement("div");
  left.className   = "itemName";
  left.textContent = name;

  const right       = document.createElement("div");
  right.className   = "badgeRight";
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
// Back / Volver
// ===============================
btnBack.addEventListener("click", () => {
  if (state.categoria === "vehiculos") {
    state.categoria    = "personal";
    state.pasoPersonal = "celulas";
    renderCelulas();
    return;
  }
  if (state.categoria !== "personal") { renderHome(); return; }
  if (state.pasoPersonal === "celulas") { state.pasoPersonal = "cet"; renderCET();  return; }
  if (state.pasoPersonal === "cet")     { state.pasoPersonal = "cut"; renderCUT();  return; }
  if (state.pasoPersonal === "cut")     { renderHome(); return; }
});

btnVolver.addEventListener("click", () => {
  window.location.href = "menu_inicial.html";
});

// ===============================
// Init
// ===============================
(async function init() {
  try {
    await loadCatalogs();
    renderHome();
  } catch (e) {
    alert(`Error inicializando: ${e.message}\n\n¿Hay token en localStorage.token? ¿API en ${API_BASE}?`);
  }
})();
