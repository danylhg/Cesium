/* =========================================================
   ASIGNACIÓN - Integrado con BD/API (JWT)
   - Usa /ops, /catalog/personal, /ops/:id/assignments
   - Catálogos (CUT/CET/Células) desde BD (objetos {id,nombre})
   - Asignaciones por operación se guardan con debounce (PUT)
   - Mantiene tu UI original: sticky + agregar, editar inline, eliminar
========================================================= */

/* ===============================
   ====== CONFIG / SESIÓN ========
=============================== */
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

/* ===============================
   ====== API WRAPPERS ===========
=============================== */
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

// (Opcional, si ya tienes endpoints para catálogo personal)
async function addCatalogPersonDB(roleKey, nombre){
  // ejemplo esperado (ajusta a tu API real):
  // POST /catalog/personal  body: { role: "CUT"|"CET"|"CELULA", nombre }
  const roleMap = { cut: "CUT", cet: "CET", celulas: "CELULA" };
  return api("/catalog/personal", { method:"POST", body:{ role: roleMap[roleKey], nombre }});
}
async function updateCatalogPersonDB(id, nombre){
  // PUT /catalog/personal/:id
  return api(`/catalog/personal/${encodeURIComponent(id)}`, { method:"PUT", body:{ nombre }});
}
async function deleteCatalogPersonDB(id){
  // DELETE /catalog/personal/:id
  return api(`/catalog/personal/${encodeURIComponent(id)}`, { method:"DELETE" });
}

/* --------------------------
   DOM (tu UI original)
-------------------------- */
const panel = document.getElementById("panel");
const rightTitle = document.getElementById("rightTitle");
const rightHint = document.getElementById("rightHint");
const btnAccion = document.getElementById("btnAccion");
const btnBack = document.getElementById("btnBack");
const btnVolver = document.getElementById("btnVolver");
const lblOperacion = document.getElementById("lblOperacion");

/* ===============================
   ====== STATE GLOBAL ===========
=============================== */
const state = {
  // navegación
  categoria: null, // 'personal' | 'equipo' | 'vehiculos'
  pasoPersonal: "home", // home | cut | cet | celulas

  // operaciones
  ops: [],
  activeOpId: localStorage.getItem("active_operation_id") || null,

  // catálogos desde BD (OBJETOS {id, nombre})
  names: { cut: [], cet: [], celulas: [] },

  // selección por operación (strings: nombre)
  selected: {
    cut: null,
    cet: [],             // 3
    celulasByCET: {},    // { [cetNombre]: [celulaNombre...] }
    activeCETIndex: 0,
    celulasDraft: []
  },

  loading: { ops:false, names:false, selected:false }
};

/* --------------------------
   Guardado “suave” debounce
-------------------------- */
let saveTimer = null;
function scheduleSaveSelected(delayMs = 250) {
  if (!state.activeOpId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await saveSelectedDB(state.activeOpId, state.selected);
    } catch (e) {
      setHeader(rightTitle.textContent, e.message || "Error al guardar");
    }
  }, delayMs);
}

/* --------------------------
   Helpers UI
-------------------------- */
function capFirst(str){
  if(!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function setHeader(title, hint){
  rightTitle.textContent = capFirst(title);
  rightHint.textContent = capFirst(hint || "");
}

function setAccion(text, disabled=false){
  btnAccion.textContent = capFirst(text);
  btnAccion.disabled = !!disabled;
}

function showBack(show){
  btnBack.style.visibility = show ? "visible" : "hidden";
}

function clearPanel(){ panel.innerHTML = ""; }

function opNameById(){
  const id = state.activeOpId;
  if(!id) return "—";
  const found = (state.ops||[]).find(o => String(o.id) === String(id));
  return found?.name || found?.nombre || String(id);
}

/* ===============================
   ====== LOADERS ================
=============================== */
async function loadOps(){
  state.loading.ops = true;
  try { state.ops = await getOpsDB(); }
  finally { state.loading.ops = false; }
}

async function loadNames(){
  state.loading.names = true;
  try { state.names = await getNamesDB(); }
  finally { state.loading.names = false; }
}

async function loadSelectedForActiveOp(){
  if (!state.activeOpId) {
    state.selected = { cut:null, cet:[], celulasByCET:{}, activeCETIndex:0, celulasDraft:[] };
    return;
  }
  state.loading.selected = true;
  try { state.selected = await loadSelectedDB(state.activeOpId); }
  finally { state.loading.selected = false; }
}

/* ===============================
   ====== HOME ===================
=============================== */
function renderHome(){
  clearPanel();
  state.categoria = null;
  state.pasoPersonal = "home";

  // muestra operación activa (si existe)
  const opLabel = state.activeOpId ? `Operación: ${opNameById()}` : "Operación: —";
  setHeader("Asignar", opLabel);

  setAccion("Siguiente", true);
  showBack(false);

  const grid = document.createElement("div");
  grid.className = "optGrid";

  const btnPersonal = mkOpt("Personal");
  const btnEquipo = mkOpt("Equipo");
  const btnVehiculos = mkOpt("Vehículos");

  btnPersonal.addEventListener("click", async () => {
    if(!state.activeOpId){
      setHeader("Asignar", "Primero crea/selecciona una operación");
      return;
    }
    state.categoria = "personal";
    state.pasoPersonal = "cut";
    await ensureCatalogLoaded();
    renderCUT();
  });

  btnEquipo.addEventListener("click", () => {
    state.categoria = "equipo";
    renderPlaceholder("Equipo", "Aquí irá el flujo de Equipo.");
  });

  btnVehiculos.addEventListener("click", () => {
    state.categoria = "vehiculos";
    renderVehiculos();
  });

  grid.append(btnPersonal, btnVehiculos, btnEquipo);
  panel.appendChild(grid);
}

function mkOpt(txt){
  const b = document.createElement("button");
  b.className = "optBtn";
  b.textContent = capFirst(txt);
  return b;
}

function renderPlaceholder(title){
  clearPanel();
  setHeader(title, `Operación: ${opNameById()}`);
  showBack(true);
  setAccion("Siguiente", true);
}

/* ===============================
   ====== PERSONAL: CUT ==========
=============================== */
async function ensureCatalogLoaded(){
  if (
    (state.names.cut && state.names.cut.length) ||
    (state.names.cet && state.names.cet.length) ||
    (state.names.celulas && state.names.celulas.length)
  ) return;
  setHeader("Cargando...", "Catálogo desde BD");
  await loadNames();
}

function renderCUT(){
  clearPanel();
  showBack(true);

  setHeader("Comandante de Unidad Táctica", `Operación: ${opNameById()}`);
  setAccion("Siguiente", !state.selected.cut);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  // sticky add (BD)
  listBox.appendChild(stickyAddButton("Agregar", () => {
    inlineAddRow(listBox, async (val) => {
      // si no tienes endpoint de catálogo, comenta estas 2 líneas y usa reload local
      await addCatalogPersonDB("cut", val);
      await loadNames();
      renderCUT();
    });
  }));

  // items (desde BD: {id,nombre})
  (state.names.cut || []).forEach((obj) => {
    const name = obj?.nombre ?? String(obj);
    const id = obj?.id;

    listBox.appendChild(personRow({
      name,
      selected: state.selected.cut === name,
      onSelect: () => {
        state.selected.cut = name;
        // reset dependencias
        state.selected.cet = [];
        state.selected.activeCETIndex = 0;
        state.selected.celulasByCET = {};
        state.selected.celulasDraft = [];
        scheduleSaveSelected();
        renderCUT();
      },
      onDelete: async () => {
        // quita selección si aplica
        if(state.selected.cut === name) state.selected.cut = null;
        state.selected.cet = (state.selected.cet || []).filter(n => n !== name);
        delete state.selected.celulasByCET[name];

        // BD
        if (id != null) await deleteCatalogPersonDB(id);
        await loadNames();

        scheduleSaveSelected();
        renderCUT();
      },
      onEdit: async (newName) => {
        // BD
        if (id != null) await updateCatalogPersonDB(id, newName);
        await loadNames();

        // actualizar selección por nombre (porque assignments guardan nombre)
        const oldName = name;
        if(state.selected.cut === oldName) state.selected.cut = newName;
        state.selected.cet = (state.selected.cet || []).map(n => n === oldName ? newName : n);

        if(state.selected.celulasByCET?.[oldName]){
          state.selected.celulasByCET[newName] = state.selected.celulasByCET[oldName];
          delete state.selected.celulasByCET[oldName];
        }
        scheduleSaveSelected();
        renderCUT();
      }
    }));
  });

  panel.appendChild(listBox);

  btnAccion.onclick = () => {
    if(!state.selected.cut) return;
    state.pasoPersonal = "cet";
    renderCET();
  };
}

/* ===============================
   ====== PERSONAL: CET (3) ======
=============================== */
function renderCET(){
  clearPanel();
  showBack(true);

  setHeader("Comandante de Equipo de Trabajo", `Operación: ${opNameById()}`);
  setAccion("Siguiente", (state.selected.cet || []).length !== 3);

  // chips arriba (CUT + CET seleccionados)
  const chips = document.createElement("div");
  chips.className = "chipRow";

  const cutChip = document.createElement("div");
  cutChip.className = "chip";
  cutChip.textContent = `CUT: ${state.selected.cut || "—"}`;
  chips.appendChild(cutChip);

  (state.selected.cet || []).forEach((n) => {
    const c = document.createElement("div");
    c.className = "chip active";
    c.textContent = `CET: ${n}`;
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  listBox.appendChild(stickyAddButton("Agregar", () => {
    inlineAddRow(listBox, async (val) => {
      await addCatalogPersonDB("cet", val);
      await loadNames();
      renderCET();
    });
  }));

  (state.names.cet || []).forEach((obj) => {
    const name = obj?.nombre ?? String(obj);
    const id = obj?.id;

    const isSel = (state.selected.cet || []).includes(name);

    listBox.appendChild(personRow({
      name,
      selected: isSel,
      onSelect: () => {
        state.selected.cet = Array.isArray(state.selected.cet) ? state.selected.cet : [];

        if(isSel){
          state.selected.cet = state.selected.cet.filter(n => n !== name);
          // limpia asignación si lo quitaste
          delete state.selected.celulasByCET?.[name];
        }else{
          if(state.selected.cet.length >= 3){
            setHeader("CET", "Máximo 3 seleccionados");
            return;
          }
          state.selected.cet.push(name);
          if(!state.selected.celulasByCET[name]) state.selected.celulasByCET[name] = [];
        }

        scheduleSaveSelected();
        renderCET();
      },
      onDelete: async () => {
        state.selected.cet = (state.selected.cet || []).filter(n => n !== name);
        delete state.selected.celulasByCET?.[name];

        if (id != null) await deleteCatalogPersonDB(id);
        await loadNames();

        scheduleSaveSelected();
        renderCET();
      },
      onEdit: async (newName) => {
        if (id != null) await updateCatalogPersonDB(id, newName);
        await loadNames();

        const oldName = name;
        state.selected.cet = (state.selected.cet || []).map(n => n === oldName ? newName : n);

        if(state.selected.celulasByCET?.[oldName]){
          state.selected.celulasByCET[newName] = state.selected.celulasByCET[oldName];
          delete state.selected.celulasByCET[oldName];
        }

        scheduleSaveSelected();
        renderCET();
      }
    }));
  });

  panel.appendChild(listBox);

  btnAccion.onclick = () => {
    if((state.selected.cet || []).length !== 3) return;

    // asegura map
    state.selected.cet.forEach(n => {
      if(!state.selected.celulasByCET[n]) state.selected.celulasByCET[n] = [];
    });

    state.pasoPersonal = "celulas";
    state.selected.activeCETIndex = 0;

    // si ya había guardado, puedes cargar draft vacío
    state.selected.celulasDraft = [];
    scheduleSaveSelected();
    renderCelulas();
  };
}

/* ===============================
   ====== PERSONAL: CÉLULAS ======
=============================== */
function renderCelulas(){
  clearPanel();
  showBack(true);

  const cetList = state.selected.cet || [];
  const idx = state.selected.activeCETIndex ?? 0;
  const cetActivo = cetList[idx];
  const asignadasEsteCET = (state.selected.celulasByCET?.[cetActivo]) || [];
  const draft = state.selected.celulasDraft || [];

  setHeader("Células", `Operación: ${opNameById()}`);

  const min = 6;
  const isLast = idx >= cetList.length - 1;
  const okDraft = draft.length >= min;
  setAccion(isLast ? "Finalizar" : "Siguiente", !okDraft);

  // chips CUT y CETs
  const chips = document.createElement("div");
  chips.className = "chipRow";

  const cutChip = document.createElement("div");
  cutChip.className = "chip";
  cutChip.textContent = `CUT: ${state.selected.cut || "—"}`;
  chips.appendChild(cutChip);

  cetList.forEach((n, i) => {
    const c = document.createElement("div");
    c.className = "chip" + (i === idx ? " active" : "");
    c.textContent = `CET: ${n}`;
    c.addEventListener("click", () => {
      state.selected.activeCETIndex = i;
      state.selected.celulasDraft = [];
      scheduleSaveSelected();
      renderCelulas();
    });
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  // listbox
  const listBox = document.createElement("div");
  listBox.className = "listBox";

  listBox.appendChild(stickyAddButton("Agregar", () => {
    inlineAddRow(listBox, async (val) => {
      await addCatalogPersonDB("celulas", val);
      await loadNames();
      renderCelulas();
    });
  }));

  // células usadas por otros CET
  const usedByOthers = new Set();
  Object.keys(state.selected.celulasByCET || {}).forEach(cetName => {
    if(cetName === cetActivo) return;
    (state.selected.celulasByCET[cetName] || []).forEach(x => usedByOthers.add(x));
  });

  const alreadyAssignedHere = new Set(asignadasEsteCET);

  // Si draft está vacío pero ya había asignadas, puedes precargarlo con las asignadas (opcional)
  // (esto hace más cómodo editar)
  const effectiveDraft = (draft.length === 0 && asignadasEsteCET.length > 0) ? [...asignadasEsteCET] : [...draft];

  // sincroniza draft si se precargó (solo una vez por render)
  if (draft.length === 0 && asignadasEsteCET.length > 0) {
    state.selected.celulasDraft = effectiveDraft;
  }

  (state.names.celulas || []).forEach((obj) => {
    const cel = obj?.nombre ?? String(obj);

    const bloqueada = usedByOthers.has(cel);
    const enEste = alreadyAssignedHere.has(cel);
    const picked = effectiveDraft.includes(cel);

    const row = celulaRow({
      name: cel,
      selected: picked,
      disabled: bloqueada,
      status: bloqueada ? "Asignado" : (enEste ? "En este CET" : (picked ? "Seleccionado" : "Disponible")),
      onToggle: () => {
        if(bloqueada) return;

        const exists = state.selected.celulasDraft.includes(cel);
        if(exists){
          state.selected.celulasDraft = state.selected.celulasDraft.filter(x => x !== cel);
        }else{
          state.selected.celulasDraft = [...state.selected.celulasDraft, cel];
        }
        scheduleSaveSelected();
        renderCelulas();
      }
    });

    listBox.appendChild(row);
  });

  panel.appendChild(listBox);

  btnAccion.onclick = () => {
    const cetNow = cetList[state.selected.activeCETIndex] || null;
    if(!cetNow) return;

    const count = (state.selected.celulasDraft || []).length;
    if(count < min) return;

    // persiste draft en map
    state.selected.celulasByCET = state.selected.celulasByCET || {};
    state.selected.celulasByCET[cetNow] = [...state.selected.celulasDraft];

    // limpia draft
    state.selected.celulasDraft = [];

    if(!isLast){
      state.selected.activeCETIndex += 1;
      scheduleSaveSelected();
      renderCelulas();
      return;
    }

    scheduleSaveSelected();
    // vuelve al home sin limpiar
    state.categoria = null;
    state.pasoPersonal = "home";
    renderHome();
  };
}

/* ===============================
   ====== VEHÍCULOS ==============
=============================== */
function renderVehiculos(){
  clearPanel();
  showBack(true);

  setHeader("Vehículos", `Operación: ${opNameById()}`);
  setAccion("Siguiente", true);

  const chips = document.createElement("div");
  chips.className = "chipRow";

  const cutChip = document.createElement("div");
  cutChip.className = "chip";
  cutChip.textContent = `CUT: ${state.selected.cut || "—"}`;
  chips.appendChild(cutChip);

  (state.selected.cet || []).forEach((n) => {
    const c = document.createElement("div");
    c.className = "chip active";
    c.textContent = `CET: ${n}`;
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  const content = document.createElement("div");
  content.className = "listBox";
  content.innerHTML = "<p style='text-align: center; padding: 20px; color: #666;'>Contenido de Vehículos</p>";
  panel.appendChild(content);

  btnAccion.onclick = () => {
    state.categoria = null;
    state.pasoPersonal = "home";
    renderHome();
  };
}

/* ===============================
   ====== UI Components ==========
=============================== */
function stickyAddButton(label, onClick){
  const wrap = document.createElement("div");
  wrap.className = "stickyAdd";

  const b = document.createElement("button");
  b.className = "addBtn";
  b.textContent = `+ ${capFirst(label)}`;
  b.addEventListener("click", onClick);

  wrap.appendChild(b);
  return wrap;
}

function personRow({name, selected=false, onSelect, onDelete, onEdit}){
  const row = document.createElement("div");
  row.className = "item" + (selected ? " selected" : "");

  const left = document.createElement("div");
  left.className = "itemName";
  left.textContent = name;

  left.style.cursor = "pointer";
  left.addEventListener("click", onSelect);

  const right = document.createElement("div");
  right.className = "itemRight";

  const btnEdit = document.createElement("button");
  btnEdit.className = "smallBtn";
  btnEdit.textContent = "Editar";

  const btnDel = document.createElement("button");
  btnDel.className = "smallBtn danger";
  btnDel.textContent = "Eliminar";

  btnDel.addEventListener("click", (e) => {
    e.stopPropagation();
    onDelete();
  });

  btnEdit.addEventListener("click", (e) => {
    e.stopPropagation();
    inlineEditRow(row, name, onEdit);
  });

  right.append(btnEdit, btnDel);
  row.append(left, right);

  return row;
}

function inlineEditRow(row, oldName, onSave){
  row.innerHTML = "";

  const edit = document.createElement("div");
  edit.className = "editInline";

  const inp = document.createElement("input");
  inp.value = oldName;

  const btnGuardar = document.createElement("button");
  btnGuardar.className = "smallBtn";
  btnGuardar.textContent = "Guardar";

  const btnCancelar = document.createElement("button");
  btnCancelar.className = "smallBtn danger";
  btnCancelar.textContent = "Cancelar";

  btnGuardar.addEventListener("click", () => {
    const val = inp.value.trim();
    if(!val) return;
    onSave(val);
  });

  btnCancelar.addEventListener("click", () => {
    // vuelve a pintar desde quien llamó (guardando igual)
    onSave(oldName);
  });

  edit.append(inp, btnGuardar, btnCancelar);
  row.appendChild(edit);

  inp.focus();
  inp.select();
}

// ✅ ahora inlineAddRow recibe un callback async (saveFn)
function inlineAddRow(listBox, saveFn){
  const container = document.createElement("div");
  container.className = "item";

  const edit = document.createElement("div");
  edit.className = "editInline";

  const inp = document.createElement("input");
  inp.placeholder = "Nombre";
  inp.value = "";

  const btnGuardar = document.createElement("button");
  btnGuardar.className = "smallBtn";
  btnGuardar.textContent = "Guardar";

  const btnCancelar = document.createElement("button");
  btnCancelar.className = "smallBtn danger";
  btnCancelar.textContent = "Cancelar";

  btnGuardar.addEventListener("click", async () => {
    const val = inp.value.trim();
    if(!val) return;

    try {
      btnGuardar.disabled = true;
      btnCancelar.disabled = true;
      await saveFn(val);
    } catch (e) {
      setHeader(rightTitle.textContent, e.message || "Error al agregar");
    } finally {
      btnGuardar.disabled = false;
      btnCancelar.disabled = false;
    }
  });

  btnCancelar.addEventListener("click", () => {
    // re-render lo hace quien llamó después de onDone
    if(container.parentNode) container.parentNode.removeChild(container);
  });

  edit.append(inp, btnGuardar, btnCancelar);
  container.appendChild(edit);

  const afterSticky = listBox.children[0]?.nextSibling;
  listBox.insertBefore(container, afterSticky);

  inp.focus();
}

function celulaRow({name, selected=false, disabled=false, status="Disponible", onToggle}){
  const row = document.createElement("div");
  row.className = "item" + (selected ? " selected" : "") + (disabled ? " disabled" : "");

  const left = document.createElement("div");
  left.className = "itemName";
  left.textContent = name;

  const right = document.createElement("div");
  right.className = "badgeRight";
  right.textContent = status;

  row.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if(!disabled) onToggle();
  });

  row.append(left, right);
  return row;
}

/* --------------------------
   Navegación back
-------------------------- */
btnBack.addEventListener("click", () => {
  if(state.categoria !== "personal"){
    renderHome();
    return;
  }

  if(state.pasoPersonal === "celulas"){
    state.pasoPersonal = "cet";
    renderCET();
    return;
  }
  if(state.pasoPersonal === "cet"){
    state.pasoPersonal = "cut";
    renderCUT();
    return;
  }
  if(state.pasoPersonal === "cut"){
    renderHome();
    return;
  }
});

btnVolver.addEventListener("click", () => {
  window.location.href = "menu_inicial.html";
});

/* ===============================
   ===== INIT =====================
=============================== */
(async function init(){
  // Ejemplo: si traes nombre de operación por querystring
  const qsp = new URLSearchParams(window.location.search);
  const op = qsp.get("op");
  if(op) lblOperacion.textContent = op;

  try {
    await loadOps();

    // si no hay op activa, intenta poner la más reciente
    if (!state.activeOpId && state.ops.length > 0) {
      state.activeOpId = String(state.ops[0].id);
      localStorage.setItem("active_operation_id", state.activeOpId);
    }

    await loadSelectedForActiveOp();
    await loadNames(); // precarga catálogos

  } catch (e) {
    setHeader("Asignar", e.message || "Error de carga");
  }

  renderHome();
})();
