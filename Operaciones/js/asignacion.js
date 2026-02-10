// ====== SESION ======
if (localStorage.getItem("session") !== "ok") {
  window.location.href = "login.html";
}
function qs(id){ return document.getElementById(id); }

// ====== TOP ======
const opInfo = qs("opInfo");
const btnBack = qs("btnBack");
btnBack.addEventListener("click", () => window.location.href = "menu_inicial.html");

// ====== OPS STORAGE ======
const STORAGE_OPS = "operations";
function getOps() {
  const raw = localStorage.getItem(STORAGE_OPS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
function setOps(list) {
  localStorage.setItem(STORAGE_OPS, JSON.stringify(list));
}

// ====== IZQUIERDA: CREAR OPERACION ======
const opName = qs("opName");
const opDesc = qs("opDesc");
const opDateCreated = qs("opDateCreated");
const opDateStart = qs("opDateStart");
const opDateEnd = qs("opDateEnd");
const btnFinalize = qs("btnFinalize");
const leftMsg = qs("leftMsg");

let ops = getOps();
function bootOpInfo(){
  ops = getOps();
  const activeId = localStorage.getItem("active_operation_id");
  if (!activeId) { opInfo.textContent = "Operación: —"; return; }
  const current = ops.find(o => o.id === activeId);
  opInfo.textContent = current ? `Operación: ${current.name}` : `Operación: ${activeId}`;
}
bootOpInfo();

(function setDefaultDates(){
  const today = new Date().toISOString().slice(0, 10);
  if (!opDateCreated.value) opDateCreated.value = today;
})();

btnFinalize.addEventListener("click", () => {
  leftMsg.textContent = "";

  const name = opName.value.trim();
  const desc = opDesc.value.trim();
  const created_at = opDateCreated.value;
  const start_at = opDateStart.value;
  const end_at = opDateEnd.value;

  if (!name || !desc) { leftMsg.textContent = "Completa el nombre y la descripción."; return; }
  if (!created_at || !start_at || !end_at) { leftMsg.textContent = "Completa las tres fechas."; return; }
  if (end_at < start_at) { leftMsg.textContent = "La fecha de fin no puede ser anterior a la fecha de inicio."; return; }

  const newOp = {
    id: crypto.randomUUID?.() ?? String(Date.now()),
    name, desc, created_at, start_at, end_at
  };

  ops = [newOp, ...ops];
  setOps(ops);

  localStorage.setItem("active_operation_id", newOp.id);
  bootOpInfo();
  leftMsg.textContent = "Operación creada y seleccionada. Ya puedes asignar.";
});

// ====== DERECHA: UI ======
const assignTitle = qs("assignTitle");
const btnAssignBack = qs("btnAssignBack");

const assignHome = qs("assignHome");
const assignList = qs("assignList");

const btnTabPersonal = qs("btnTabPersonal");
const btnTabEquipo = qs("btnTabEquipo");
const btnTabVehiculos = qs("btnTabVehiculos");
const btnNext = qs("btnNext");

const pickList = qs("pickList");
const btnAssign = qs("btnAssign");
const pickMsg = qs("pickMsg");
const btnAddName = qs("btnAddName");

// Inline editor (sin popups)
const inlineEditor = qs("inlineEditor");
const inlineTitle = qs("inlineTitle");
const btnInlineClose = qs("btnInlineClose");
const inlineInput = qs("inlineInput");
const btnInlineSave = qs("btnInlineSave");
const btnInlineCancel = qs("btnInlineCancel");

const inlineConfirm = qs("inlineConfirm");
const confirmText = qs("confirmText");
const btnConfirmYes = qs("btnConfirmYes");
const btnConfirmNo = qs("btnConfirmNo");

const order = ["personal", "equipo", "vehiculos"];
let currentTab = 0;

let currentScreen = "home";     // home | personalMenu | cutList | etc
let lastSelectionLabel = "";
let pendingAction = null;       // { type: 'add'|'edit'|'delete', index?: number }
let pendingDeleteIndex = null;

// ====== STORAGE para listas ======
function listKey(screen){ return `assign:list:${screen}`; }

function loadNames(screen, fallbackLabels){
  const raw = localStorage.getItem(listKey(screen));
  if (!raw) return fallbackLabels.slice();
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map(String);
    return fallbackLabels.slice();
  } catch {
    return fallbackLabels.slice();
  }
}
function saveNames(screen, labels){
  localStorage.setItem(listKey(screen), JSON.stringify(labels));
}

// ====== DATA ======
function dataFor(screen){
  if (screen === "home") return { title: "Asignar", items: [], mode: "home" };

  if (screen === "personalMenu") {
    return {
      title: "personal",
      mode: "menu",
      items: [
        { id: "cut", label: "Comandante Unidad Táctica", next: "cutList" },
        { id: "cet", label: "Comandante Equipo de Trabajo", next: "cetList" },
        { id: "cel", label: "CEL", next: "celList" }
      ]
    };
  }

  if (screen === "cutList") {
    const base = ["Luis Hernandez", "Uriel gallegos", "Santiago Mirón"];
    const labels = loadNames("cutList", base);
    return { title: "comandante unidad tactica", mode: "names", items: labels.map((label, idx) => ({ id:`n${idx}`, label })) };
  }

  if (screen === "cetList") {
    const base = [];
    const labels = loadNames("cetList", base);
    return { title: "comandante equipo de trabajo", mode: "names", items: labels.map((label, idx) => ({ id:`n${idx}`, label })) };
  }

  if (screen === "celList") {
    const base = [];
    const labels = loadNames("celList", base);
    return { title: "cel", mode: "names", items: labels.map((label, idx) => ({ id:`n${idx}`, label })) };
  }

  if (screen === "equipoMenu") return { title: "equipo", mode: "menu", items: [] };
  if (screen === "vehiculosMenu") return { title: "vehículos", mode: "menu", items: [] };

  return { title: "Asignar", items: [], mode: "home" };
}

// ====== helpers ======
function setActiveTabVisual(key){
  btnTabPersonal.classList.toggle("active", key === "personal");
  btnTabEquipo.classList.toggle("active", key === "equipo");
  btnTabVehiculos.classList.toggle("active", key === "vehiculos");
}
function showBackBtn(show){
  btnAssignBack.style.opacity = show ? "1" : "0";
  btnAssignBack.style.pointerEvents = show ? "auto" : "none";
}

function hideInlineEditor(){
  inlineEditor.classList.add("hidden");
  inlineConfirm.classList.add("hidden");
  inlineInput.value = "";
  pendingAction = null;
  pendingDeleteIndex = null;
}
function openInlineAdd(){
  inlineEditor.classList.remove("hidden");
  inlineConfirm.classList.add("hidden");
  inlineTitle.textContent = "agregar";
  inlineInput.value = "";
  inlineInput.placeholder = "Escribe el nombre...";
  pendingAction = { type: "add" };
  inlineInput.focus();
}
function openInlineEdit(index, currentValue){
  inlineEditor.classList.remove("hidden");
  inlineConfirm.classList.add("hidden");
  inlineTitle.textContent = "editar";
  inlineInput.value = currentValue;
  pendingAction = { type: "edit", index };
  inlineInput.focus();
}
function openInlineDelete(index, label){
  inlineEditor.classList.remove("hidden");
  inlineConfirm.classList.remove("hidden");
  inlineTitle.textContent = "eliminar";
  confirmText.textContent = `¿Eliminar "${label}"?`;
  pendingDeleteIndex = index;
  pendingAction = { type: "delete", index };
}

// ====== render ======
function renderHome(){
  currentScreen = "home";
  lastSelectionLabel = "";

  assignTitle.textContent = "Asignar";
  assignHome.classList.remove("hidden");
  assignList.classList.add("hidden");

  showBackBtn(false);
  btnAddName.classList.add("hidden");
  pickMsg.textContent = "";
  pickList.innerHTML = "";
  hideInlineEditor();

  setActiveTabVisual("");
}

function renderListScreen(screen){
  currentScreen = screen;
  lastSelectionLabel = "";

  assignHome.classList.add("hidden");
  assignList.classList.remove("hidden");

  const cfg = dataFor(screen);
  assignTitle.textContent = cfg.title;

  showBackBtn(true);
  pickList.innerHTML = "";
  pickMsg.textContent = "";
  hideInlineEditor();

  // Agregar solo en lists de nombres
  if (cfg.mode === "names") btnAddName.classList.remove("hidden");
  else btnAddName.classList.add("hidden");

  if (!cfg.items.length){
    const li = document.createElement("li");
    li.textContent = "— no hay disponibles —";
    li.style.opacity = "0.7";
    li.style.cursor = "default";
    pickList.appendChild(li);
    return;
  }

  cfg.items.forEach((it, index) => {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.className = "nameText";
    span.textContent = it.label;

    li.appendChild(span);

    // acciones solo en names
    if (cfg.mode === "names") {
      const actions = document.createElement("div");
      actions.className = "nameActions";

      const btnEdit = document.createElement("button");
      btnEdit.className = "miniBtn";
      btnEdit.type = "button";
      btnEdit.textContent = "Editar";

      const btnDel = document.createElement("button");
      btnDel.className = "miniBtn";
      btnDel.type = "button";
      btnDel.textContent = "Eliminar";

      btnEdit.addEventListener("click", (e) => {
        e.stopPropagation();
        openInlineEdit(index, it.label);
      });

      btnDel.addEventListener("click", (e) => {
        e.stopPropagation();
        openInlineDelete(index, it.label);
      });

      actions.appendChild(btnEdit);
      actions.appendChild(btnDel);
      li.appendChild(actions);
    }

    // click item (navegación o selección)
    li.addEventListener("click", () => {
      if (it.next){
        renderListScreen(it.next);
        return;
      }
      [...pickList.querySelectorAll("li")].forEach(x => x.classList.remove("selected"));
      li.classList.add("selected");
      lastSelectionLabel = it.label;
      pickMsg.textContent = `Seleccionado: ${it.label}`;
    });

    pickList.appendChild(li);
  });
}

// ====== acciones inline ======
btnAddName.addEventListener("click", () => {
  const cfg = dataFor(currentScreen);
  if (cfg.mode !== "names") return;
  openInlineAdd();
});

btnInlineClose.addEventListener("click", hideInlineEditor);
btnInlineCancel.addEventListener("click", hideInlineEditor);
btnConfirmNo.addEventListener("click", hideInlineEditor);

btnInlineSave.addEventListener("click", () => {
  const cfg = dataFor(currentScreen);
  if (cfg.mode !== "names") return;
  if (!pendingAction || (pendingAction.type !== "add" && pendingAction.type !== "edit")) return;

  const value = inlineInput.value.trim();
  if (!value) { pickMsg.textContent = "Escribe un nombre válido."; return; }

  const labels = cfg.items.map(x => x.label);

  if (pendingAction.type === "add") {
    labels.unshift(value);
    saveNames(currentScreen, labels);
    renderListScreen(currentScreen);
    pickMsg.textContent = `Agregado: ${value}`;
    return;
  }

  if (pendingAction.type === "edit") {
    labels[pendingAction.index] = value;
    saveNames(currentScreen, labels);
    renderListScreen(currentScreen);
    pickMsg.textContent = `Editado: ${value}`;
    return;
  }
});

btnConfirmYes.addEventListener("click", () => {
  const cfg = dataFor(currentScreen);
  if (cfg.mode !== "names") return;
  if (!pendingAction || pendingAction.type !== "delete") return;

  const labels = cfg.items.map(x => x.label);
  const idx = pendingAction.index;

  labels.splice(idx, 1);
  saveNames(currentScreen, labels);
  renderListScreen(currentScreen);
  pickMsg.textContent = "Eliminado ✔";
});

// ====== HOME buttons ======
btnTabPersonal.addEventListener("click", () => {
  setActiveTabVisual("personal");
  renderListScreen("personalMenu");
});
btnTabEquipo.addEventListener("click", () => {
  setActiveTabVisual("equipo");
  renderListScreen("equipoMenu");
});
btnTabVehiculos.addEventListener("click", () => {
  setActiveTabVisual("vehiculos");
  renderListScreen("vehiculosMenu");
});

btnNext.addEventListener("click", () => {
  currentTab = (currentTab + 1) % order.length;
  const nextCat = order[currentTab];
  setActiveTabVisual(nextCat);

  if (nextCat === "personal") renderListScreen("personalMenu");
  if (nextCat === "equipo") renderListScreen("equipoMenu");
  if (nextCat === "vehiculos") renderListScreen("vehiculosMenu");
});

// Back
btnAssignBack.addEventListener("click", () => {
  if (currentScreen === "cutList" || currentScreen === "cetList" || currentScreen === "celList") {
    renderListScreen("personalMenu");
    return;
  }
  if (currentScreen === "personalMenu" || currentScreen === "equipoMenu" || currentScreen === "vehiculosMenu") {
    renderHome();
    return;
  }
  renderHome();
});

// botón asignar (por ahora solo feedback)
btnAssign.addEventListener("click", () => {
  if (!lastSelectionLabel) {
    pickMsg.textContent = "Selecciona un nombre primero.";
    return;
  }
  pickMsg.textContent = `Asignado ✔ (${lastSelectionLabel})`;
});

// ====== BOOT ======
renderHome();


