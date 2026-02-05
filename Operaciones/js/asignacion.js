// ====== Demo state (por operación) ======
const sessionOK = localStorage.getItem("session") === "ok";
if (!sessionOK) window.location.href = "login.html";

const opId = localStorage.getItem("active_operation_id") || "default";
const KEY = (k) => `op:${opId}:${k}`;

const categories = ["personal", "vehiculos", "equipo"];
let currentIndex = 0;
let selectedAvailableId = null;

// Elements
const opInfo = document.getElementById("opInfo");

const assignedPersonal = document.getElementById("assignedPersonal");
const assignedVehiculos = document.getElementById("assignedVehiculos");
const assignedEquipo = document.getElementById("assignedEquipo");

const barTitle = document.getElementById("barTitle");
const availableList = document.getElementById("availableList");

const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnAssign = document.getElementById("btnAssign");
const msg = document.getElementById("msg");
const btnBack = document.getElementById("btnBack");

// Helpers
function loadJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function seedIfNeeded() {
  // Info de operación (opcional)
  const ops = loadJSON("operations", []);
  const current = ops.find(o => o.id === opId);
  opInfo.textContent = current ? `Operación: ${current.name}` : `Operación: ${opId}`;

  // Disponibles (catálogo)
  const seeded = localStorage.getItem(KEY("seeded")) === "1";
  if (seeded) return;

  const available = {
    personal: [
      { id: "p1", label: "Teniente A. Ramírez" },
      { id: "p2", label: "Sargento M. López" },
      { id: "p3", label: "Cabo J. Hernández" }
    ],
    vehiculos: [
      { id: "v1", label: "Unidad 01 — Pickup" },
      { id: "v2", label: "Unidad 12 — Humvee" },
      { id: "v3", label: "Unidad 07 — Camioneta" }
    ],
    equipo: [
      { id: "e1", label: "Radio Táctico X" },
      { id: "e2", label: "Dron Recon" },
      { id: "e3", label: "Botiquín" }
    ]
  };

  // Asignados inicia vacío
  saveJSON(KEY("available"), available);
  saveJSON(KEY("assigned"), { personal: [], vehiculos: [], equipo: [] });
  localStorage.setItem(KEY("seeded"), "1");
}

function getState() {
  const available = loadJSON(KEY("available"), { personal: [], vehiculos: [], equipo: [] });
  const assigned = loadJSON(KEY("assigned"), { personal: [], vehiculos: [], equipo: [] });
  return { available, assigned };
}

function setState(state) {
  saveJSON(KEY("available"), state.available);
  saveJSON(KEY("assigned"), state.assigned);
}

function currentCategory() {
  return categories[currentIndex];
}

function renderAssigned(assigned) {
  assignedPersonal.innerHTML = "";
  assignedVehiculos.innerHTML = "";
  assignedEquipo.innerHTML = "";

  const put = (ul, items) => {
    if (!items.length) {
      const li = document.createElement("li");
      li.style.opacity = "0.6";
      li.textContent = "— sin asignaciones —";
      ul.appendChild(li);
      return;
    }
    items.forEach(it => {
      const li = document.createElement("li");
      li.textContent = it.label;
      ul.appendChild(li);
    });
  };

  put(assignedPersonal, assigned.personal);
  put(assignedVehiculos, assigned.vehiculos);
  put(assignedEquipo, assigned.equipo);
}

function renderAvailable(available) {
  const cat = currentCategory();
  barTitle.textContent = cat === "vehiculos" ? "vehículos" : cat;

  availableList.innerHTML = "";
  selectedAvailableId = null;

  const items = available[cat] || [];
  if (!items.length) {
    const li = document.createElement("li");
    li.style.opacity = "0.6";
    li.textContent = "— no hay disponibles —";
    availableList.appendChild(li);
    return;
  }

  items.forEach(it => {
    const li = document.createElement("li");
    li.textContent = it.label;
    li.dataset.id = it.id;

    li.addEventListener("click", () => {
      // limpiar selección visual
      [...availableList.querySelectorAll("li")].forEach(x => x.classList.remove("active"));
      li.classList.add("active");
      selectedAvailableId = it.id;
      msg.textContent = "";
    });

    availableList.appendChild(li);
  });
}

function refreshUI() {
  const { available, assigned } = getState();
  renderAssigned(assigned);
  renderAvailable(available);
}

function moveSelectedToAssigned() {
  const cat = currentCategory();
  const { available, assigned } = getState();

  if (!selectedAvailableId) {
    msg.textContent = "Selecciona un elemento de la lista derecha para asignarlo.";
    return;
  }

  const idx = (available[cat] || []).findIndex(x => x.id === selectedAvailableId);
  if (idx < 0) {
    msg.textContent = "Selección inválida.";
    return;
  }

  const [item] = available[cat].splice(idx, 1);
  assigned[cat].push(item);

  setState({ available, assigned });
  msg.textContent = `Asignado a ${cat === "vehiculos" ? "vehículos" : cat}: ${item.label}`;
  refreshUI();
}

// Events
btnPrev.addEventListener("click", () => {
  currentIndex = (currentIndex - 1 + categories.length) % categories.length;
  msg.textContent = "";
  refreshUI();
});

btnNext.addEventListener("click", () => {
  currentIndex = (currentIndex + 1) % categories.length;
  msg.textContent = "";
  refreshUI();
});

btnAssign.addEventListener("click", moveSelectedToAssigned);

btnBack.addEventListener("click", () => {
  // Ajusta a donde quieras regresar
  window.location.href = "menu_inicial.html";
});

// Boot
seedIfNeeded();
refreshUI();
