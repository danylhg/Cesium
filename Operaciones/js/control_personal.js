// control_personal.js (con backend)

if (localStorage.getItem("session") !== "ok") {
  window.location.href = "login.html";
}

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
const token = localStorage.getItem("token"); // <-- AJUSTA si tu login guarda otro key

if (!token) {
  // si no hay token, no podemos pegarle al backend
  localStorage.removeItem("session");
  window.location.href = "login.html";
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.mensaje || `Error ${res.status} en ${path}`;
    throw new Error(msg);
  }
  return data;
}

/* =========================
   Catálogos (UI)
========================= */
// UI labels
const ROLES_UI = [
  "Comandante de Unidad de Trabajo",
  "Comandante de Equipo de trabajo",
  "Celulas",
];

const PUESTOS = [
  "Soldado / Marinero",
  "Cabo",
  "Sargento Segundo",
  "Sargento Primero",
  "Subteniente",
  "Teniente",
  "Capitán",
  "Mayor",
  "Teniente Coronel",
  "Coronel",
  "General Brigadier",
  "General de Brigada",
  "General de División",
  "Contraalmirante",
  "Vicealmirante",
  "Almirante",
  // (si quieres, también puedes meter aquí tus puestos “tácticos”)
];

// mapeo UI <-> backend
function uiRolToApi(uiRol) {
  const r = (uiRol || "").toLowerCase();
  if (r.includes("unidad")) return "CUT";
  if (r.includes("equipo")) return "CET";
  return "CELL";
}

function apiRolToUi(apiRol) {
  const r = (apiRol || "").toUpperCase();
  if (r === "CUT") return "Comandante de Unidad de Trabajo";
  if (r === "CET") return "Comandante de Equipo de trabajo";
  return "Celulas";
}

function normalize(s){ return (s ?? "").toString().trim().toLowerCase(); }

function escapeHtml(text) {
  return (text ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fillSelect(selectEl, options, includeAll=false) {
  const base = includeAll
    ? `<option value="">Todos</option>`
    : `<option value="" disabled selected>Selecciona...</option>`;

  selectEl.innerHTML =
    base + options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
}

/* =========================
   DOM
========================= */
const btnBack = document.getElementById("btnBack");
const btnLogout = document.getElementById("btnLogout");

const btnAdd = document.getElementById("btnAdd");
const btnEdit = document.getElementById("btnEdit");
const btnDelete = document.getElementById("btnDelete");

const searchInput = document.getElementById("searchInput");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");

const filterRol = document.getElementById("filterRol");
const filterPuesto = document.getElementById("filterPuesto");
const filterActivo = document.getElementById("filterActivo");

const resultHint = document.getElementById("resultHint");
const tbody = document.getElementById("tbody");

// Modal
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const btnCloseModal = document.getElementById("btnCloseModal");
const btnCancel = document.getElementById("btnCancel");
const form = document.getElementById("form");

const fApodo = document.getElementById("fApodo");
const fRol = document.getElementById("fRol");
const fNombre = document.getElementById("fNombre");
const fApellido = document.getElementById("fApellido");
const fPuesto = document.getElementById("fPuesto");
const fUsername = document.getElementById("fUsername");
const fPassword = document.getElementById("fPassword");
const fActivo = document.getElementById("fActivo");
const fLastAccess = document.getElementById("fLastAccess");

/* =========================
   Estado
========================= */
let personal = [];          // lista en memoria desde backend
let selectedId = null;      // id_personal seleccionado
let mode = "add";           // add|edit

/* =========================
   Nav / Logout
========================= */
btnBack.addEventListener("click", () => window.location.href = "menu_inicial.html");
btnLogout.addEventListener("click", () => {
  localStorage.removeItem("session");
  localStorage.removeItem("token");
  window.location.href = "login.html";
});

/* =========================
   Init catálogos UI
========================= */
function initCatalogs() {
  fillSelect(filterRol, ROLES_UI, true);
  fillSelect(filterPuesto, PUESTOS, true);

  fillSelect(fRol, ROLES_UI, false);
  fillSelect(fPuesto, PUESTOS, false);
}

/* =========================
   Cargar desde backend
========================= */
async function loadFromApi() {
  // Trae CUT/CET/CELL y junta
  const [cut, cet, cell] = await Promise.all([
    api("/catalog/personal?rol=CUT"),
    api("/catalog/personal?rol=CET"),
    api("/catalog/personal?rol=CELL"),
  ]);

  const all = [...(cut.items || []), ...(cet.items || []), ...(cell.items || [])];

  // Normaliza a estructura de UI
  personal = all.map(p => ({
    id_personal: p.id_personal,
    apodo: p.apodo ?? "",              // OJO: tu backend/seed ya debe llenar apodo
    nombre: p.nombre ?? "",
    apellido: p.apellido ?? "",
    rol_api: (p.rol || "").toUpperCase(),
    rol_ui: apiRolToUi(p.rol),
    puesto: p.puesto ?? "",
    username: p.username ?? "",
    activo: p.activo !== false,        // por defecto true
    ultimo_acceso: p.ultimo_acceso ?? "",
    // password NO existe en backend (correcto). Si backend manda tempPassword al crear, se maneja aparte.
  }));
}

/* =========================
   Filtros + render
========================= */
function getFiltered(){
  const q = normalize(searchInput.value);
  const rol = filterRol.value;
  const puesto = filterPuesto.value;
  const act = filterActivo.value; // "" | "true" | "false"

  return personal.filter(p => {
    if (rol && p.rol_ui !== rol) return false;
    if (puesto && p.puesto !== puesto) return false;
    if (act !== "" && String(!!p.activo) !== act) return false;

    if (!q) return true;

    return (
      normalize(p.apodo).includes(q) ||
      normalize(p.nombre).includes(q) ||
      normalize(p.apellido).includes(q) ||
      normalize(p.rol_ui).includes(q) ||
      normalize(p.puesto).includes(q) ||
      normalize(p.username).includes(q)
    );
  });
}

function updateButtons(){
  const has = !!selectedId;
  btnEdit.disabled = !has;
  btnDelete.disabled = !has;
}

function renderTable(){
  const list = getFiltered();

  if (selectedId && !list.some(p => p.id_personal === selectedId)) selectedId = null;

  tbody.innerHTML = "";

  if(!list.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="9" style="color: rgba(11,18,32,.65); padding: 16px;">
      No hay registros con los filtros actuales.
    </td>`;
    tbody.appendChild(tr);
  } else {
    list.forEach(p => {
      const tr = document.createElement("tr");
      if (p.id_personal === selectedId) tr.classList.add("selected");

      // ✅ IMPORTANTE: 9 celdas EXACTAS (para que nunca “se corra”)
      tr.innerHTML = `
        <td>${escapeHtml(p.apodo)}</td>
        <td>${escapeHtml(p.nombre)}</td>
        <td>${escapeHtml(p.apellido)}</td>
        <td>${escapeHtml(p.rol_ui)}</td>
        <td>${escapeHtml(p.puesto)}</td>
        <td>${escapeHtml(p.username)}</td>
        <td style="color: rgba(11,18,32,.45);">—</td>
        <td>${p.activo ? `<span class="badge ok">Sí</span>` : `<span class="badge no">No</span>`}</td>
        <td>${escapeHtml(p.ultimo_acceso)}</td>
      `;

      tr.addEventListener("click", () => {
        selectedId = p.id_personal;
        updateButtons();
        renderTable();
      });

      tbody.appendChild(tr);
    });
  }

  updateButtons();
  resultHint.textContent = `${list.length} resultado(s)`;
}

/* =========================
   Modal
========================= */
function openModal(newMode){
  mode = newMode;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");

  if(mode === "add"){
    modalTitle.textContent = "Agregar personal";
    form.reset();
    fActivo.value = "true";
    fLastAccess.value = "";
    fRol.selectedIndex = 0;
    fPuesto.selectedIndex = 0;

    // en alta sí permitimos
    fRol.disabled = false;
    fUsername.disabled = false;
    fPassword.disabled = true; // backend genera temporal, no metas passwords en claro aquí
    fPassword.value = "";
  } else {
    modalTitle.textContent = "Modificar personal";
    const p = personal.find(x => x.id_personal === selectedId);
    if(!p) return;

    fApodo.value = p.apodo ?? "";
    fRol.value = p.rol_ui ?? "";
    fNombre.value = p.nombre ?? "";
    fApellido.value = p.apellido ?? "";
    fPuesto.value = p.puesto ?? "";
    fUsername.value = p.username ?? "";
    fPassword.value = "";
    fActivo.value = String(!!p.activo);
    fLastAccess.value = p.ultimo_acceso ?? "";

    // en edición, tu backend NO cambia rol ni username en PUT
    fRol.disabled = true;
    fUsername.disabled = true;
    fPassword.disabled = true;
  }
}

function closeModal(){
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
}

btnCloseModal.addEventListener("click", closeModal);
btnCancel.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target?.dataset?.close === "true") closeModal();
});

/* =========================
   Acciones
========================= */
btnAdd.addEventListener("click", () => openModal("add"));
btnEdit.addEventListener("click", () => selectedId && openModal("edit"));

btnDelete.addEventListener("click", async () => {
  if (!selectedId) return;

  const p = personal.find(x => x.id_personal === selectedId);
  const name = p ? `${p.nombre} ${p.apellido}` : "este registro";

  // Si quieres hard delete real:
  if (!confirm(`¿BORRAR definitivamente a ${name}?\n(Si tiene asignaciones, no te dejará.)`)) return;

  try {
    await api(`/catalog/personal/${selectedId}?hard=1`, { method: "DELETE" });
    await loadFromApi();
    selectedId = null;
    renderTable();
  } catch (e) {
    alert(e.message);
  }
});

btnSearch.addEventListener("click", renderTable);
searchInput.addEventListener("keydown", (e) => {
  if(e.key === "Enter"){ e.preventDefault(); renderTable(); }
});

btnClear.addEventListener("click", () => {
  searchInput.value = "";
  filterRol.value = "";
  filterPuesto.value = "";
  filterActivo.value = "";
  renderTable();
});

filterRol.addEventListener("change", renderTable);
filterPuesto.addEventListener("change", renderTable);
filterActivo.addEventListener("change", renderTable);

/* =========================
   Guardar (POST/PUT al backend)
========================= */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    if(mode === "add"){
      // En tu backend actual POST /catalog/personal NO recibe apodo, y genera username+tempPassword.
      // Pero tu DB exige apodo. Así que:
      //  - o cambias backend para que apodo = username (recomendado)
      //  - o cambias backend para aceptar apodo
      //
      // Aquí mando rol/nombre/apellido/puesto como tú lo tienes.

      const body = {
        rol: uiRolToApi(fRol.value),
        apodo: fApodo.value.trim(),
        nombre: fNombre.value.trim(),
        apellido: fApellido.value.trim(),
        puesto: fPuesto.value.trim(),
      };

      const r = await api("/catalog/personal", { method: "POST", body });

      // Si backend regresa tempPassword, muéstralo una sola vez
      if (r?.tempPassword) {
        alert(`Personal creado.\nUsername: ${r.item.username}\nPassword temporal: ${r.tempPassword}`);
      } else {
        alert("Personal creado.");
      }

    } else {
      // Edit: tu backend PUT no cambia rol/username
      const body = {
        apodo: fApodo.value.trim(),
        nombre: fNombre.value.trim(),
        apellido: fApellido.value.trim(),
        puesto: fPuesto.value.trim(),
        activo: (fActivo.value === "true"),
      };
      await api(`/catalog/personal/${selectedId}`, { method: "PUT", body });
      alert("Personal actualizado.");
    }

    closeModal();
    await loadFromApi();
    renderTable();

  } catch (e) {
    alert(e.message);
  }
});

/* =========================
   Init
========================= */
(async function init(){
  initCatalogs();
  try {
    await loadFromApi();
    renderTable();
  } catch (e) {
    alert(`No se pudo cargar personal: ${e.message}\nRevisa API_BASE y token.`);
  }
})();