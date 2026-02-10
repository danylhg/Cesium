// ===== Storage =====
const STORAGE_OPS = "operations";

function getOps() {
  const raw = localStorage.getItem(STORAGE_OPS);

  const seed = [
    {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      name: "Operación Centinela",
      desc: "Vigilancia y patrullaje preventivo en zona asignada.",
      created_at: "2026-02-01",
      start_at: "2026-02-03",
      end_at: "2026-02-10"
    },
    {
      id: crypto.randomUUID?.() ?? String(Date.now() + 1),
      name: "Operación Faro",
      desc: "Monitoreo de rutas y puntos de interés críticos.",
      created_at: "2026-02-02",
      start_at: "2026-02-04",
      end_at: "2026-02-12"
    }
  ];

  if (!raw) {
    localStorage.setItem(STORAGE_OPS, JSON.stringify(seed));
    return seed;
  }

  try {
    const list = JSON.parse(raw);
    localStorage.setItem(STORAGE_OPS, JSON.stringify(list));
    return list;
  } catch {
    localStorage.setItem(STORAGE_OPS, JSON.stringify(seed));
    return seed;
  }
}

function qs(id){ return document.getElementById(id); }

// ===== Session check =====
if (localStorage.getItem("session") !== "ok") {
  window.location.href = "login.html";
}

// ===== Elements =====
const welcomeText = qs("welcomeText");
const rightTitle  = qs("rightTitle");

const btnCreate   = qs("btnCreate");
const btnSelect   = qs("btnSelect");
const selectArea  = qs("selectArea");
const opSelect    = qs("opSelect");
const btnOpenSelected = qs("btnOpenSelected");
const rightMsg    = qs("rightMsg");

const btnLogout   = qs("btnLogout");

// ===== State =====
let mode = "none"; // "none" | "select"
let ops = getOps();

// ===== Init greeting =====
const username = localStorage.getItem("username") || "Usuario";
welcomeText.textContent = `Bienvenido(a), ${username}`;
rightTitle.textContent  = `bienvenido(a) ${username}`;

// ===== UI =====
function clearMsg(){
  rightMsg.textContent = "";
}

function setActiveButton() {
  btnSelect.classList.toggle("active", mode === "select");
  // btnCreate no se queda activo porque redirige
  btnCreate.classList.remove("active");
}

function fillCombobox() {
  opSelect.innerHTML = "";

  if (!ops.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No hay operaciones";
    opSelect.appendChild(opt);
    return;
  }

  ops.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = o.name;
    opSelect.appendChild(opt);
  });

  if (!opSelect.value) opSelect.value = ops[0].id;
}

function showSelectArea(show){
  selectArea.classList.toggle("hidden", !show);
}

// ===== Events =====
btnCreate.addEventListener("click", () => {
  // ✅ Si quieres que "Crear operación" vaya a otra página, cambia esta ruta.
  // Ejemplo: window.location.href = "crear_operacion.html";
  window.location.href = "asignacion.html";
});

btnSelect.addEventListener("click", () => {
  mode = "select";
  clearMsg();
  setActiveButton();
  showSelectArea(true);
  fillCombobox();
});

btnOpenSelected.addEventListener("click", () => {
  if (mode !== "select") return;

  const id = opSelect.value;
  const op = ops.find(o => o.id === id);

  if (!op) {
    rightMsg.textContent = "Selecciona una operación válida.";
    return;
  }

  localStorage.setItem("active_operation_id", op.id);
  window.location.href = "asignacion.html";
});

btnLogout.addEventListener("click", () => {
  localStorage.removeItem("session");
  window.location.href = "login.html";
});

// ===== Boot =====
setActiveButton();
showSelectArea(false);

