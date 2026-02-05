// --- Helpers demo ---
const STORAGE_OPS = "operations";

function getOps() {
  const raw = localStorage.getItem(STORAGE_OPS);

  // Seed inicial (con fechas)
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

  // Mapa de seed por nombre (para rellenar fechas conocidas)
  const seedByName = new Map(seed.map(s => [s.name, s]));

  const migrated = list.map(op => {
    const fromSeed = seedByName.get(op.name);

    return {
      ...op,
      created_at: op.created_at || fromSeed?.created_at || "",
      start_at:   op.start_at   || fromSeed?.start_at   || "",
      end_at:     op.end_at     || fromSeed?.end_at     || ""
    };
  });

  localStorage.setItem(STORAGE_OPS, JSON.stringify(migrated));
  return migrated;
} catch {
  localStorage.setItem(STORAGE_OPS, JSON.stringify(seed));
  return seed;
}
}

function setOps(list) {
  localStorage.setItem(STORAGE_OPS, JSON.stringify(list));
}

function qs(id){ return document.getElementById(id); }

// --- Session check (demo) ---
if (localStorage.getItem("session") !== "ok") {
  window.location.href = "login.html";
}

// --- Elements ---
const welcomeText = qs("welcomeText");
const rightTitle  = qs("rightTitle");

const btnCreate   = qs("btnCreate");
const btnSelect   = qs("btnSelect");
const selectArea  = qs("selectArea");
const opSelect    = qs("opSelect");
const btnOpenSelected = qs("btnOpenSelected");
const opDateCreated = qs("opDateCreated");
const opDateStart   = qs("opDateStart");
const opDateEnd     = qs("opDateEnd");
const opName      = qs("opName");
const opDesc      = qs("opDesc");
const btnFinalize = qs("btnFinalize");

const leftMsg     = qs("leftMsg");
const rightMsg    = qs("rightMsg");

const btnLogout   = qs("btnLogout");

// --- State ---
let mode = "select"; // "create" | "select"
let ops = getOps();

// --- Init greeting ---
const username = localStorage.getItem("username") || "Usuario";
welcomeText.textContent = `Bienvenido(a), ${username}`;
rightTitle.textContent  = `bienvenido(a) ${username}`;

// --- UI functions ---
function clearMsgs(){
  leftMsg.textContent = "";
  rightMsg.textContent = "";
}

function setActiveButton() {
  btnCreate.classList.toggle("active", mode === "create");
  btnSelect.classList.toggle("active", mode === "select");
}

function setFieldsForMode() {
  clearMsgs();
  setActiveButton();

  if (mode === "select") {
    selectArea.classList.remove("hidden");
    btnFinalize.classList.add("hidden");
    btnOpenSelected.classList.remove("hidden");

    opName.readOnly = true;
    opDesc.readOnly = true;

    opDateCreated.readOnly = true;
    opDateStart.readOnly = true;
    opDateEnd.readOnly = true;

    opDateCreated.disabled = true;
    opDateStart.disabled = true;
    opDateEnd.disabled = true;

    if (!opSelect.value && ops.length) opSelect.value = ops[0].id;
    renderSelected();
} else {
  selectArea.classList.add("hidden");
  btnFinalize.classList.remove("hidden");
  btnOpenSelected.classList.add("hidden");

  opName.readOnly = false;
  opDesc.readOnly = false;

  // ✅ habilitar edición de fechas
  opDateCreated.disabled = false;
  opDateStart.disabled = false;
  opDateEnd.disabled = false;

  opDateCreated.readOnly = false;
  opDateStart.readOnly = false;
  opDateEnd.readOnly = false;

  // limpiar campos
  opName.value = "";
  opDesc.value = "";

  // fecha de creación: hoy por defecto
  const today = new Date().toISOString().slice(0, 10);
  opDateCreated.value = today;
  opDateStart.value = "";
  opDateEnd.value = "";

  leftMsg.textContent = "Captura el nombre, la descripción y las fechas para crear la operación.";
}
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
}

function renderSelected() {
  const id = opSelect.value;
  const op = ops.find(o => o.id === id);

  if (!op) {
    opName.value = "";
    opDesc.value = "";
    opDateCreated.value = "";
    opDateStart.value = "";
    opDateEnd.value = "";
    return;
  }

  opName.value = op.name || "";
  opDesc.value = op.desc || "";

  opDateCreated.value = op.created_at || "";
  opDateStart.value   = op.start_at || "";
  opDateEnd.value     = op.end_at || "";
}

// --- Events ---
btnCreate.addEventListener("click", () => {
  mode = "create";
  setFieldsForMode();
});

btnSelect.addEventListener("click", () => {
  mode = "select";
  setFieldsForMode();
});

opSelect.addEventListener("change", () => {
  if (mode === "select") renderSelected();
});

btnOpenSelected.addEventListener("click", () => {
  if (mode !== "select") return;

  const id = opSelect.value;
  const op = ops.find(o => o.id === id);

  if (!op) {
    leftMsg.textContent = "Selecciona una operación válida.";
    return;
  }

  // Guardar la operación activa (demo)
  localStorage.setItem("active_operation_id", op.id);

  // Redirigir a tu siguiente pantalla (cámbiala a la que tú uses)
  window.location.href = "dashboard.html";
});


btnFinalize.addEventListener("click", () => {
  clearMsgs();

  const name = opName.value.trim();
  const desc = opDesc.value.trim();

  if (!name || !desc) {
    leftMsg.textContent = "Completa el nombre y la descripción.";
    return;
  }

  const created_at = opDateCreated.value;
    const start_at   = opDateStart.value;
    const end_at     = opDateEnd.value;

    if (!created_at || !start_at || !end_at) {
    leftMsg.textContent = "Completa las tres fechas.";
    return;
    }

    if (end_at < start_at) {
    leftMsg.textContent = "La fecha de fin no puede ser anterior a la fecha de inicio.";
    return;
    }

  const newOp = {
    id: crypto.randomUUID?.() ?? String(Date.now()),
    name,
    desc,
    created_at,
    start_at,
    end_at
  };

  ops = [newOp, ...ops];
  setOps(ops);
  fillCombobox();

  rightMsg.textContent = "Operación creada. Ahora puedes seleccionarla.";
  mode = "select";
  opSelect.value = newOp.id;
  setFieldsForMode();
});

btnLogout.addEventListener("click", () => {
  localStorage.removeItem("session");
  window.location.href = "login.html";
});

// --- Boot ---
fillCombobox();
setFieldsForMode();
