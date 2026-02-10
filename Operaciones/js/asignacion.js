// ===============================
// ====== CONFIG / SESIÓN ========
// ===============================
const API = "http://localhost:3001";

const token = localStorage.getItem("token");
if (!token) window.location.href = "login.html";

function qs(id){ return document.getElementById(id); }

// Helper fetch con JWT
async function api(path, { method="GET", body } = {}) {
  const t = localStorage.getItem("token");
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await r.json(); } catch {}

  if (!r.ok || (data && data.ok === false)) {
    const msg = data?.mensaje || `Error ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

// ===============================
// ====== STATE GLOBAL ===========
// ===============================
const state = {
  ops: [],
  activeOpId: localStorage.getItem("active_operation_id") || null,

  // catálogo desde BD -> ahora son OBJETOS: {id, nombre}
  names: { cut: [], cet: [], celulas: [] },

  // asignaciones desde BD (por operación) -> siguen siendo strings (nombre)
  selected: {
    cut: null,
    cet: [],
    celulasByCET: {},
    activeCETIndex: 0,
    celulasDraft: []
  },

  loading: {
    ops: false,
    names: false,
    selected: false,
  }
};

// Guardado “suave” (debounce) para no spamear PUTs
let saveTimer = null;
function scheduleSaveSelected(delayMs = 250) {
  if (!state.activeOpId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await saveSelectedDB(state.activeOpId, state.selected);
    } catch (e) {
      const rightMsg = qs("rightMsg");
      if (rightMsg) rightMsg.textContent = e.message;
    }
  }, delayMs);
}

// ===============================
// ====== API WRAPPERS ===========
// ===============================
async function getOpsDB() {
  const data = await api("/ops");
  return Array.isArray(data) ? data : (data.ops || []);
}

async function createOpDB(payload) {
  const data = await api("/ops", { method: "POST", body: payload });
  return data.op ? data.op : data;
}

async function getNamesDB() {
  // esperado: { cut:[{id,nombre}], cet:[{id,nombre}], celulas:[{id,nombre}] }
  const data = await api("/catalog/personal");
  return {
    cut: Array.isArray(data.cut) ? data.cut : [],
    cet: Array.isArray(data.cet) ? data.cet : [],
    celulas: Array.isArray(data.celulas) ? data.celulas : [],
  };
}

async function loadSelectedDB(opId) {
  const data = await api(`/ops/${encodeURIComponent(opId)}/assignments`);
  const a = data.assignments ? data.assignments : data;

  return {
    cut: a?.cut ?? null,
    cet: Array.isArray(a?.cet) ? a.cet : [],
    celulasByCET: a?.celulasByCET && typeof a.celulasByCET === "object" ? a.celulasByCET : {},
    activeCETIndex: Number.isFinite(a?.activeCETIndex) ? a.activeCETIndex : 0,
    celulasDraft: Array.isArray(a?.celulasDraft) ? a.celulasDraft : [],
  };
}

async function saveSelectedDB(opId, obj) {
  await api(`/ops/${encodeURIComponent(opId)}/assignments`, { method: "PUT", body: obj });
}

// ===============================
// ====== TOP BAR ================
// ===============================
const opBadge = qs("opBadge");
const btnBack = qs("btnBack");
btnBack.addEventListener("click", () => window.location.href = "menu_inicial.html");

// ===============================
// ====== IZQUIERDA: CREAR OP ====
// ===============================
const opName = qs("opName");
const opDesc = qs("opDesc");
const opDateCreated = qs("opDateCreated");
const opDateStart = qs("opDateStart");
const opDateEnd = qs("opDateEnd");
const btnFinalize = qs("btnFinalize");
const leftMsg = qs("leftMsg");

function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  if (!opDateCreated.value) opDateCreated.value = today;
}
setDefaultDates();

btnFinalize.addEventListener("click", async () => {
  leftMsg.textContent = "";

  const name = opName.value.trim();
  const desc = opDesc.value.trim();
  const created_at = opDateCreated.value;
  const start_at = opDateStart.value;
  const end_at = opDateEnd.value;

  if (!name || !desc) { leftMsg.textContent = "Completa el nombre y la descripción."; return; }
  if (!created_at || !start_at || !end_at) { leftMsg.textContent = "Completa las tres fechas."; return; }
  if (end_at < start_at) { leftMsg.textContent = "La fecha de fin no puede ser anterior a la fecha de inicio."; return; }

  try {
    const op = await createOpDB({ name, desc, created_at, start_at, end_at });

    await loadOps();

    state.activeOpId = String(op.id);
    localStorage.setItem("active_operation_id", state.activeOpId);

    await refreshActiveOp();
    await loadSelectedForActiveOp();

    leftMsg.textContent = "Operación creada y seleccionada. Ya puedes asignar.";
  } catch (e) {
    leftMsg.textContent = e.message;
  }
});

// Mostrar operación activa (usa state.ops)
async function refreshActiveOp(){
  const activeId = state.activeOpId;
  if (!activeId) { opBadge.textContent = "Operación: —"; return; }

  const current = (state.ops || []).find(o => String(o.id) === String(activeId));
  opBadge.textContent = current ? `Operación: ${current.name}` : `Operación: ${activeId}`;
}

// ===============================
// ====== DERECHA: ASIGNAR =======
// ===============================
const rightTitle = qs("rightTitle");
const rightBody = qs("rightBody");
const btnRightAction = qs("btnRightAction");
const btnRightBack = qs("btnRightBack");
const rightMsg = qs("rightMsg");
const subLine = qs("subLine");

// ---- Vistas
const VIEW = {
  ROOT: "root",
  PERSONAL_MENU: "personal_menu",
  CUT_LIST: "cut_list",
  CET_LIST: "cet_list",
  CELULAS: "celulas",
  EQUIPO: "equipo",
  VEHICULOS: "vehiculos",
};
let view = VIEW.ROOT;

// ===== UI helpers =====
function el(tag, cls, text){
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function setHeader(title, showBack){
  rightTitle.textContent = title;
  btnRightBack.classList.toggle("hidden", !showBack);
}
function setActionLabel(text){ btnRightAction.textContent = text; }
function showSubLine(text){
  subLine.textContent = text;
  subLine.classList.remove("hidden");
}
function hideSubLine(){
  subLine.classList.add("hidden");
  subLine.textContent = "";
}

// ===============================
// ====== CARGAS INICIALES =======
// ===============================
async function loadOps(){
  state.loading.ops = true;
  try {
    state.ops = await getOpsDB();
  } finally {
    state.loading.ops = false;
  }
}

async function loadNames(){
  state.loading.names = true;
  try {
    state.names = await getNamesDB();
  } finally {
    state.loading.names = false;
  }
}

async function loadSelectedForActiveOp(){
  if (!state.activeOpId) {
    state.selected = {
      cut: null,
      cet: [],
      celulasByCET: {},
      activeCETIndex: 0,
      celulasDraft: []
    };
    return;
  }

  state.loading.selected = true;
  try {
    state.selected = await loadSelectedDB(state.activeOpId);
  } finally {
    state.loading.selected = false;
  }
}

// ===============================
// ===== Back button logic =======
// ===============================
btnRightBack.addEventListener("click", () => {
  rightMsg.textContent = "";

  if (view === VIEW.PERSONAL_MENU) view = VIEW.ROOT;
  else if (view === VIEW.CUT_LIST) view = VIEW.PERSONAL_MENU;
  else if (view === VIEW.CET_LIST) view = VIEW.PERSONAL_MENU;
  else if (view === VIEW.CELULAS) view = VIEW.PERSONAL_MENU;
  else if (view === VIEW.EQUIPO) view = VIEW.ROOT;
  else if (view === VIEW.VEHICULOS) view = VIEW.ROOT;

  render();
});

// ===============================
// ===== Main action button ======
// ===============================
btnRightAction.addEventListener("click", async () => {
  rightMsg.textContent = "";

  if (!state.activeOpId) {
    rightMsg.textContent = "Primero crea/selecciona una operación.";
    return;
  }

  if (view === VIEW.ROOT) {
    rightMsg.textContent = "Selecciona una opción (Personal, Equipo o Vehículos).";
    return;
  }

  if (view === VIEW.PERSONAL_MENU) {
    rightMsg.textContent = "Selecciona un apartado de Personal.";
    return;
  }

  if (view === VIEW.CUT_LIST) {
    if (!state.selected.cut) { rightMsg.textContent = "Selecciona 1 persona para CUT."; return; }
    view = VIEW.CET_LIST;
    render();
    return;
  }

  if (view === VIEW.CET_LIST) {
    if (!state.selected.cut) { rightMsg.textContent = "Primero selecciona CUT."; return; }
    if (!Array.isArray(state.selected.cet) || state.selected.cet.length !== 3) {
      rightMsg.textContent = "Selecciona exactamente 3 personas para CET.";
      return;
    }

    state.selected.activeCETIndex = 0;
    state.selected.celulasDraft = [];
    scheduleSaveSelected();

    view = VIEW.CELULAS;
    render();
    return;
  }

  if (view === VIEW.CELULAS) {
    const cetList = state.selected.cet || [];
    if (!state.selected.cut || cetList.length !== 3) {
      rightMsg.textContent = "Primero asigna CUT y 3 CET.";
      return;
    }

    const idx = state.selected.activeCETIndex ?? 0;
    const currentCET = cetList[idx];
    const draft = state.selected.celulasDraft || [];

    if (draft.length < 6) {
      rightMsg.textContent = "Debes seleccionar mínimo 6 para este CET.";
      return;
    }

    state.selected.celulasByCET = state.selected.celulasByCET || {};
    state.selected.celulasByCET[currentCET] = [...draft];

    const nextIdx = idx + 1;

    if (nextIdx <= 2) {
      state.selected.activeCETIndex = nextIdx;
      state.selected.celulasDraft = [];
      scheduleSaveSelected();
      render();
      return;
    }

    state.selected.celulasDraft = [];
    scheduleSaveSelected();
    rightMsg.textContent = "✅ Células asignadas a los 3 CET.";
    render();
    return;
  }

  rightMsg.textContent = "Acción disponible próximamente.";
});

// ===============================
// ===== UI blocks ===============
// ===============================
function buildBigMenu(items){
  const wrap = el("div", "bigStack");
  items.forEach(({label, onClick}) => {
    const b = el("button", "bigBtn");
    b.textContent = label;
    b.addEventListener("click", onClick);
    wrap.appendChild(b);
  });
  return wrap;
}

// ✅ Ahora pinta nombres desde BD (objetos {id, nombre})
function buildEditableSelectableList({ listKey, selectMode, multiMax = Infinity }){
  const names = state.names;      // {cut:[{id,nombre}], cet:[...], celulas:[...]}
  const selected = state.selected;

  const box = el("div", "list");

  const addBtn = el("button", "bigBtn");
  addBtn.textContent = "+ Agregar";
  addBtn.addEventListener("click", () => {
    rightMsg.textContent = "Aún no conectado (solo prueba de carga desde BD).";
  });
  box.appendChild(addBtn);

  (names[listKey] || []).forEach((obj) => {
    const name = obj?.nombre ?? String(obj);

    const item = el("div", "listItem");

    const isSelected =
      selectMode === "single"
        ? (selected[listKey] === name)
        : (Array.isArray(selected[listKey]) && selected[listKey].includes(name));

    const clickable = el("div", "name", name);
    clickable.style.cursor = "pointer";
    clickable.style.flex = "1";

    clickable.addEventListener("click", () => {
      if (!state.activeOpId) {
        rightMsg.textContent = "Primero crea/selecciona una operación.";
        return;
      }

      if (selectMode === "single") {
        state.selected[listKey] = name;
      } else {
        state.selected[listKey] = Array.isArray(state.selected[listKey]) ? state.selected[listKey] : [];
        const exists = state.selected[listKey].includes(name);

        if (exists) {
          state.selected[listKey] = state.selected[listKey].filter(x => x !== name);
        } else {
          if (state.selected[listKey].length >= multiMax) {
            rightMsg.textContent = `Máximo ${multiMax} seleccionados.`;
            return;
          }
          state.selected[listKey].push(name);
        }
      }

      scheduleSaveSelected();
      render();
    });

    const actions = el("div", "actionsRow");
    const btnEdit = el("button", "smallBtn", "Editar");
    const btnDel = el("button", "smallBtn danger", "Eliminar");

    btnEdit.addEventListener("click", () => rightMsg.textContent = "Aún no conectado (solo prueba).");
    btnDel.addEventListener("click", () => rightMsg.textContent = "Aún no conectado (solo prueba).");

    actions.appendChild(btnEdit);
    actions.appendChild(btnDel);

    item.appendChild(clickable);
    item.appendChild(actions);

    if (isSelected){
      item.style.borderColor = "rgba(37,99,235,.45)";
      item.style.boxShadow = "0 18px 26px rgba(37,99,235,.12)";
    }

    box.appendChild(item);
  });

  const footer = el("div", "hint");
  if (selectMode === "single") {
    footer.textContent = selected[listKey] ? `Seleccionado: ${selected[listKey]}` : "Selecciona 1.";
  } else {
    const count = Array.isArray(selected[listKey]) ? selected[listKey].length : 0;
    footer.textContent = `Seleccionados: ${count}/${multiMax}`;
  }

  const wrap = document.createElement("div");
  wrap.appendChild(box);
  wrap.appendChild(footer);
  return wrap;
}

// ======= CÉLULAS VIEW =======
// ✅ también ajustado a objetos {id, nombre}
function buildCelulasView(){
  const names = state.names;
  const sel = state.selected;

  const cetList = sel.cet || [];
  const idx = sel.activeCETIndex ?? 0;
  const currentCET = cetList[idx];

  const topInfo = el("div", "cetTopInfo");
  const cutLine = el("div", "cetLine", `CUT: ${sel.cut || "—"}`);
  topInfo.appendChild(cutLine);

  const chips = el("div", "cetChips");

  cetList.forEach((cetName, i) => {
    const chip = el("button", "cetChip" + (i === idx ? " active" : ""), `CET: ${cetName}`);
    chip.addEventListener("click", () => {
      state.selected.activeCETIndex = i;
      state.selected.celulasDraft = [];
      scheduleSaveSelected();
      render();
    });
    chips.appendChild(chip);
  });

  const btnSeeCET = el("button", "smallBtn", "Ver selección CET");
  btnSeeCET.addEventListener("click", () => {
    view = VIEW.CET_LIST;
    render();
  });

  const row = el("div", "cetRowTools");
  row.appendChild(chips);
  row.appendChild(btnSeeCET);

  const assignedMap = sel.celulasByCET || {};
  const used = new Set();
  Object.keys(assignedMap).forEach(k => {
    (assignedMap[k] || []).forEach(v => used.add(v));
  });

  const alreadyForThisCET = new Set(assignedMap[currentCET] || []);
  const draft = sel.celulasDraft || [];

  const list = el("div", "list");
  const listTitle = el("div", "hint", `Asignar células para: CET ${idx+1} (${currentCET}) — mínimo 6`);
  list.appendChild(listTitle);

  // ✅ itemObj = {id, nombre}
  (names.celulas || []).forEach((itemObj) => {
    const person = itemObj?.nombre ?? String(itemObj);

    const item = el("div", "listItem");

    const nameBox = el("div", "name", person);
    nameBox.style.flex = "1";
    nameBox.style.cursor = "pointer";

    const isPicked = draft.includes(person);
    const isBlocked = used.has(person) && !alreadyForThisCET.has(person);
    const isAlreadyAssignedHere = alreadyForThisCET.has(person);

    if (isPicked){
      item.style.borderColor = "rgba(37,99,235,.45)";
      item.style.boxShadow = "0 18px 26px rgba(37,99,235,.12)";
    }
    if (isBlocked){
      item.classList.add("disabledItem");
      nameBox.style.cursor = "not-allowed";
    }
    if (isAlreadyAssignedHere){
      item.classList.add("assignedHere");
    }

    nameBox.addEventListener("click", () => {
      if (isBlocked) return;

      state.selected.celulasDraft = Array.isArray(state.selected.celulasDraft) ? state.selected.celulasDraft : [];
      const exists = state.selected.celulasDraft.includes(person);

      if (exists) state.selected.celulasDraft = state.selected.celulasDraft.filter(x => x !== person);
      else state.selected.celulasDraft.push(person);

      scheduleSaveSelected();
      render();
    });

    const badge = el("div", "miniBadge");
    if (isBlocked) badge.textContent = "Asignado";
    else if (isAlreadyAssignedHere) badge.textContent = "En este CET";
    else if (isPicked) badge.textContent = "Seleccionado";
    else badge.textContent = "";

    item.appendChild(nameBox);
    item.appendChild(badge);
    list.appendChild(item);
  });

  const footer = el("div", "hint");
  footer.textContent = `Seleccionados para este CET: ${(draft || []).length}`;

  const wrap = document.createElement("div");
  wrap.appendChild(topInfo);
  wrap.appendChild(row);
  wrap.appendChild(list);
  wrap.appendChild(footer);

  return wrap;
}

// ===============================
// ===== render ===================
// ===============================
function render(){
  rightBody.innerHTML = "";
  rightMsg.textContent = "";

  const sel = state.selected;

  if (view === VIEW.ROOT){
    setHeader("Asignar", false);
    hideSubLine();
    setActionLabel("Siguiente");

    rightBody.appendChild(
      buildBigMenu([
        { label: "Personal", onClick: () => { view = VIEW.PERSONAL_MENU; render(); } },
        { label: "Equipo", onClick: () => { view = VIEW.EQUIPO; render(); } },
        { label: "Vehículos", onClick: () => { view = VIEW.VEHICULOS; render(); } },
      ])
    );
    return;
  }

  if (view === VIEW.PERSONAL_MENU){
    setHeader("personal", true);
    hideSubLine();
    setActionLabel("Siguiente");

    rightBody.appendChild(
      buildBigMenu([
        // ✅ AQUÍ el cambio clave: carga desde BD antes de mostrar CUT
        { label: "Comandante Unidad Táctica", onClick: async () => {
            try {
              rightMsg.textContent = "Cargando CUT desde BD...";
              await loadNames();           // pega a /catalog/personal
              view = VIEW.CUT_LIST;
              render();
            } catch (e) {
              rightMsg.textContent = e.message;
            }
        }},
        { label: "Comandante Equipo de Trabajo", onClick: async () => {
            try {
              rightMsg.textContent = "Cargando CET desde BD...";
              await loadNames();
              view = VIEW.CET_LIST;
              render();
            } catch (e) {
              rightMsg.textContent = e.message;
            }
        }},
        { label: "Células", onClick: async () => {
            if (!sel.cut || !Array.isArray(sel.cet) || sel.cet.length !== 3) {
              rightMsg.textContent = "Primero asigna CUT y 3 CET.";
              return;
            }
            try {
              rightMsg.textContent = "Cargando Células desde BD...";
              await loadNames();
              view = VIEW.CELULAS;
              render();
            } catch (e) {
              rightMsg.textContent = e.message;
            }
        }},
      ])
    );
    return;
  }

  if (view === VIEW.CUT_LIST){
    setHeader("comandante unidad tactica", true);
    hideSubLine();
    setActionLabel("Asignar");
    rightBody.appendChild(buildEditableSelectableList({ listKey: "cut", selectMode: "single" }));
    return;
  }

  if (view === VIEW.CET_LIST){
    setHeader("comandante equipo de trabajo", true);
    showSubLine(`CUT: ${sel.cut || "—"}`);
    setActionLabel("Asignar");
    rightBody.appendChild(buildEditableSelectableList({ listKey: "cet", selectMode: "multi", multiMax: 3 }));
    return;
  }

  if (view === VIEW.CELULAS){
    setHeader("células", true);

    const idx = sel.activeCETIndex ?? 0;
    const currentCET = (sel.cet || [])[idx];
    setActionLabel("Asignar");

    hideSubLine();
    rightBody.appendChild(buildCelulasView());

    if (!sel.cut || !Array.isArray(sel.cet) || sel.cet.length !== 3) {
      rightMsg.textContent = "Primero asigna CUT y 3 CET.";
    }
    return;
  }

  if (view === VIEW.EQUIPO){
    setHeader("equipo", true);
    hideSubLine();
    setActionLabel("Siguiente");
    rightBody.appendChild(buildBigMenu([{ label: "Próximamente (equipo)", onClick: () => rightMsg.textContent = "Aquí seguimos después." }]));
    return;
  }

  if (view === VIEW.VEHICULOS){
    setHeader("vehículos", true);
    hideSubLine();
    setActionLabel("Siguiente");
    rightBody.appendChild(buildBigMenu([{ label: "Próximamente (vehículos)", onClick: () => rightMsg.textContent = "Aquí seguimos después." }]));
    return;
  }
}

// ===============================
// ===== INIT =====================
// ===============================
(async function init(){
  try {
    await loadOps();

    // si no hay op activa, intenta poner la más reciente
    if (!state.activeOpId && state.ops.length > 0) {
      state.activeOpId = String(state.ops[0].id);
      localStorage.setItem("active_operation_id", state.activeOpId);
    }

    await refreshActiveOp();
    await loadSelectedForActiveOp();

  } catch (e) {
    rightMsg.textContent = e.message;
    opBadge.textContent = "Operación: —";
  }

  view = VIEW.ROOT;
  render();
})();
