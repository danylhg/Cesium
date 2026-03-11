// control_vehiculos.js (con backend)

if (localStorage.getItem("session") !== "ok") {
  window.location.href = "login.html";
}

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
const token = localStorage.getItem("token");

if (!token) {
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
const ESTADOS = [
  "DISPONIBLE",
  "ASIGNADO",
  "MANTENIMIENTO",
  "BAJA",
];

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

const filterEstado = document.getElementById("filterEstado");
const filterMarca = document.getElementById("filterMarca");

const resultHint = document.getElementById("resultHint");
const tbody = document.getElementById("tbody");

// Modal
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const btnCloseModal = document.getElementById("btnCloseModal");
const btnCancel = document.getElementById("btnCancel");
const form = document.getElementById("form");

const fImagenVeh = document.getElementById("fImagenVeh");
const fCodigoInterno = document.getElementById("fCodigoInterno");
const fTipo = document.getElementById("fTipo");
const fMarca = document.getElementById("fMarca");
const fModelo = document.getElementById("fModelo");
const fEstado = document.getElementById("fEstado");
const fCapacidad = document.getElementById("fCapacidad");

/* =========================
   Estado
========================= */
let vehiculos = [];
let selectedId = null;
let mode = "add";
let imagenBase64 = "";

/* =========================
   Nav / Logout
========================= */
btnBack?.addEventListener("click", () => window.location.href = "menu_inicial.html");
btnLogout?.addEventListener("click", () => {
  localStorage.removeItem("session");
  localStorage.removeItem("token");
  window.location.href = "login.html";
});

/* =========================
   Helpers extra
========================= */
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/* =========================
   Init catálogos UI
========================= */
function initCatalogs() {
  if (filterEstado) fillSelect(filterEstado, ESTADOS, true);
  if (fEstado) fillSelect(fEstado, ESTADOS, false);
}

function refreshMarcaFilter() {
  if (!filterMarca) return;
  const marcas = uniqueSorted(vehiculos.map(v => v.marca || ""));
  fillSelect(filterMarca, marcas, true);
}

/* =========================
   Cargar desde backend
========================= */
async function loadFromApi() {
  const r = await api("/catalog/vehiculos");
  vehiculos = (r.items || []).map(v => ({
    id_vehiculo: v.id_vehiculo,
    imagen_veh: v.imagen_veh ?? "",
    codigo_interno: v.codigo_interno ?? "",
    tipo: v.tipo ?? "",
    marca: v.marca ?? "",
    modelo: v.modelo ?? "",
    estado: v.estado ?? "DISPONIBLE",
    capacidad: v.capacidad ?? "",
    fecha_registro: v.fecha_registro ?? "",
  }));

  refreshMarcaFilter();
}

/* =========================
   Filtros + render
========================= */
function getFiltered(){
  const q = normalize(searchInput?.value);
  const estado = filterEstado?.value || "";
  const marca = filterMarca?.value || "";

  return vehiculos.filter(v => {
    if (estado && v.estado !== estado) return false;
    if (marca && v.marca !== marca) return false;

    if (!q) return true;

    return (
      normalize(v.codigo_interno).includes(q) ||
      normalize(v.tipo).includes(q) ||
      normalize(v.marca).includes(q) ||
      normalize(v.modelo).includes(q) ||
      normalize(v.estado).includes(q)
    );
  });
}

function updateButtons(){
  const has = !!selectedId;
  if (btnEdit) btnEdit.disabled = !has;
  if (btnDelete) btnDelete.disabled = !has;
}

function renderTable(){
  const list = getFiltered();

  if (selectedId && !list.some(v => v.id_vehiculo === selectedId)) selectedId = null;

  tbody.innerHTML = "";

  if(!list.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="8" style="color: rgba(11,18,32,.65); padding: 16px;">
      No hay registros con los filtros actuales.
    </td>`;
    tbody.appendChild(tr);
  } else {
    list.forEach(v => {
      const tr = document.createElement("tr");
      if (v.id_vehiculo === selectedId) tr.classList.add("selected");

      tr.innerHTML = `
        <td>${v.imagen_veh ? `<img src="${v.imagen_veh}" style="width:60px;">` : "-"}</td>
        <td>${escapeHtml(v.codigo_interno)}</td>
        <td>${escapeHtml(v.tipo || "-")}</td>
        <td>${escapeHtml(v.marca || "-")}</td>
        <td>${escapeHtml(v.modelo || "-")}</td>
        <td>${escapeHtml(v.estado || "DISPONIBLE")}</td>
        <td>${escapeHtml(v.capacidad || "-")}</td>
        <td>${escapeHtml(v.fecha_registro || "-")}</td>
      `;

      tr.addEventListener("click", () => {
        selectedId = v.id_vehiculo;
        updateButtons();
        renderTable();
      });

      tbody.appendChild(tr);
    });
  }

  updateButtons();
  if (resultHint) resultHint.textContent = `${list.length} resultado(s)`;
}

/* =========================
   Modal
========================= */
function openModal(newMode){
  mode = newMode;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");

  if(mode === "add"){
    modalTitle.textContent = "Agregar vehículo";
    form.reset();
    imagenBase64 = "";
    if (fEstado) fEstado.value = "DISPONIBLE";
    if (fCodigoInterno) fCodigoInterno.disabled = false;
  } else {
    modalTitle.textContent = "Modificar vehículo";
    const v = vehiculos.find(x => x.id_vehiculo === selectedId);
    if(!v) return;

    imagenBase64 = v.imagen_veh || "";
    fCodigoInterno.value = v.codigo_interno ?? "";
    fTipo.value = v.tipo ?? "";
    fMarca.value = v.marca ?? "";
    fModelo.value = v.modelo ?? "";
    fEstado.value = v.estado ?? "DISPONIBLE";
    fCapacidad.value = v.capacidad ?? "";

    // si quieres permitir editar código interno, cambia esto a false
    fCodigoInterno.disabled = true;
  }
}

function closeModal(){
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
}

btnCloseModal?.addEventListener("click", closeModal);
btnCancel?.addEventListener("click", closeModal);
modal?.addEventListener("click", (e) => {
  if (e.target?.dataset?.close === "true") closeModal();
});

/* =========================
   Acciones
========================= */
btnAdd?.addEventListener("click", () => openModal("add"));
btnEdit?.addEventListener("click", () => selectedId && openModal("edit"));

btnDelete?.addEventListener("click", async () => {
  if (!selectedId) return;

  const v = vehiculos.find(x => x.id_vehiculo === selectedId);
  const name = v ? `${v.codigo_interno}` : "este registro";

  if (!confirm(`¿BORRAR definitivamente el vehículo ${name}?\n(Si está referenciado, no te dejará.)`)) return;

  try {
    await api(`/catalog/vehiculos/${selectedId}`, { method: "DELETE" });
    await loadFromApi();
    selectedId = null;
    renderTable();
  } catch (err) {
    alert(err.message);
  }
});

btnSearch?.addEventListener("click", renderTable);
searchInput?.addEventListener("keydown", (e) => {
  if(e.key === "Enter"){ e.preventDefault(); renderTable(); }
});

btnClear?.addEventListener("click", () => {
  if (searchInput) searchInput.value = "";
  if (filterEstado) filterEstado.value = "";
  if (filterMarca) filterMarca.value = "";
  renderTable();
});

filterEstado?.addEventListener("change", renderTable);
filterMarca?.addEventListener("change", renderTable);

/* =========================
   Guardar (POST/PUT)
========================= */
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    if (fImagenVeh?.files?.length > 0) {
      imagenBase64 = await fileToBase64(fImagenVeh.files[0]);
    }

    const capacidadNum = fCapacidad.value.trim() === "" ? null : Number(fCapacidad.value);

    const body = {
      imagen_veh: imagenBase64 || null,
      codigo_interno: fCodigoInterno.value.trim(),
      tipo: fTipo.value.trim() || null,
      marca: fMarca.value.trim() || null,
      modelo: fModelo.value.trim() || null,
      estado: fEstado.value.trim(),
      capacidad: Number.isNaN(capacidadNum) ? null : capacidadNum,
    };

    if (!body.codigo_interno || !body.estado) {
      alert("Completa los campos obligatorios.");
      return;
    }

    if (!ESTADOS.includes(body.estado)) {
      alert("Estado inválido.");
      return;
    }

    if (body.capacidad !== null && (!Number.isInteger(body.capacidad) || body.capacidad < 0)) {
      alert("Capacidad inválida.");
      return;
    }

    if(mode === "add"){
      await api("/catalog/vehiculos", { method: "POST", body });
      alert("Vehículo creado.");
    } else {
      await api(`/catalog/vehiculos/${selectedId}`, { method: "PUT", body });
      alert("Vehículo actualizado.");
    }

    closeModal();
    await loadFromApi();
    renderTable();

  } catch (err) {
    alert(err.message);
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
  } catch (err) {
    alert(`No se pudo cargar vehículos: ${err.message}\nRevisa API_BASE, token y endpoints.`);
  }
})();