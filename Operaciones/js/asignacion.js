/* =========================================================
   ASIGNACIÓN - Flujo con BD (Postgres)
   - Selección por IDs (no por nombres)
   - Carga listas desde API
   - Guarda: operacion, asignacion_operacion_personal, mando_operacion
   - Vehículos: vehiculo_operacion + grupos (auto)
========================================================= */

// ===============================
// ====== CONFIG / SESIÓN ========
// ===============================
const API = "http://localhost:3001";
const token = localStorage.getItem("token");
if (!token) window.location.href = "login.html";

async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok || (data && data.ok === false)) {
    throw new Error(data?.mensaje || `Error ${r.status}`);
  }
  return data;
}

// ===============================
// ====== DOM =====================
// ===============================
const panel = document.getElementById("panel");
const rightTitle = document.getElementById("rightTitle");
const rightHint = document.getElementById("rightHint");
const btnAccion = document.getElementById("btnAccion");
const btnBack = document.getElementById("btnBack");
const btnVolver = document.getElementById("btnVolver");

const lblOperacion = document.getElementById("lblOperacion");

// Form izq
const opNombre = document.getElementById("opNombre");
const opDesc = document.getElementById("opDesc");
const opCreacion = document.getElementById("opCreacion");
const opInicio = document.getElementById("opInicio");
const opFin = document.getElementById("opFin");
const opPrioridad = document.getElementById("opPrioridad");
const btnFinalizar = document.getElementById("btnFinalizar");

// ===============================
// ====== HELPERS UI ==============
// ===============================
function capFirst(str){ return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }
function setHeader(title, hint){ rightTitle.textContent = capFirst(title); rightHint.textContent = capFirst(hint); }
function setAccion(text, disabled=false){ btnAccion.textContent = capFirst(text); btnAccion.disabled = !!disabled; }
function showBack(show){ btnBack.style.visibility = show ? "visible" : "hidden"; }
function clearPanel(){ panel.innerHTML = ""; }
function getScrollTopInPanel(){ return panel.querySelector(".listBox")?.scrollTop ?? 0; }
function restoreScrollTop(listBoxEl, scrollTop){ if(!listBoxEl) return; requestAnimationFrame(() => { listBoxEl.scrollTop = scrollTop; }); }

// ===============================
// ====== STATE GLOBAL ============
// ===============================
const state = {
  // operación actual (ID real)
  id_operacion: null,
  operacionCodigo: null,

  // quien asigna (usuario logueado)
  id_usuario: null,

  categoria: null, // 'personal' | 'equipo' | 'vehiculos'
  pasoPersonal: "home", // home | cut | cet | celulas

  // catálogos desde BD
  catalog: {
    CUT: [],  // [{id_personal, nombre, apellido, rol}]
    CET: [],
    CELL: [],
    vehiculos: [], // [{id_vehiculo, codigo_interno, marca, modelo, imagen_veh, estado}]
  },

  // selecciones por ID
  cutSeleccionadoId: null,      // id_personal (rol CUT)
  cetSeleccionadosIds: [],      // [id_personal] (rol CET)
  cetActivoIndex: 0,

  // asignación de células por CET: { [id_cet]: [id_cell, ...] }
  asignacionCelulas: {},

  // vehículos por CET (tu UI actual): { [id_cet]: [id_vehiculo, ...] }
  asignacionVehiculos: {},
  cetActivoIndexVeh: 0,
};

function fullName(p){ return `${p.nombre} ${p.apellido}`.trim(); }

// ===============================
// ====== CARGA INICIAL ===========
// ===============================
async function loadCatalogs(){
  // usuario actual (para asignado_por)
  const me = await api("/me");
  state.id_usuario = me.id_usuario;

  // Traemos personal por rol
  const [cuts, cets, cells, vehs] = await Promise.all([
    api("/catalog/personal?rol=CUT"),
    api("/catalog/personal?rol=CET"),
    api("/catalog/personal?rol=CELL"),
    api("/catalog/vehiculos"),
  ]);

  state.catalog.CUT = cuts.items || cuts || [];
  state.catalog.CET = cets.items || cets || [];
  state.catalog.CELL = cells.items || cells || [];
  state.catalog.vehiculos = vehs.items || vehs || [];
}

// Si vienes con ?op_id=123 o ?op_codigo=OP-001
async function loadOperacionFromQS(){
  const qs = new URLSearchParams(window.location.search);
  const opId = qs.get("op_id");
  const opCodigo = qs.get("op_codigo");

  if(opId){
    const op = await api(`/ops/${opId}`);
    state.id_operacion = op.id_operacion;
    state.operacionCodigo = op.codigo;
    paintOperacionForm(op);
    lblOperacion.textContent = op.nombre || op.codigo || `#${op.id_operacion}`;
    return;
  }

  if(opCodigo){
    const op = await api(`/ops/by-codigo/${encodeURIComponent(opCodigo)}`);
    state.id_operacion = op.id_operacion;
    state.operacionCodigo = op.codigo;
    paintOperacionForm(op);
    lblOperacion.textContent = op.nombre || op.codigo || `#${op.id_operacion}`;
    return;
  }

  // si no hay operación, solo muestra “—”
  lblOperacion.textContent = "—";
}

function paintOperacionForm(op){
  opNombre.value = op.nombre || "";
  opDesc.value = op.descripcion || "";
  opPrioridad.value = op.prioridad || "";

  // fechas (input type=date usa YYYY-MM-DD)
  const toDate = (v) => v ? new Date(v).toISOString().slice(0,10) : "";
  opCreacion.value = toDate(op.fecha_creacion); // solo display (tu BD la genera)
  opInicio.value = toDate(op.fecha_inicio);
  opFin.value = toDate(op.fecha_fin);
}

// ===============================
// ====== GUARDAR OPERACIÓN =======
// ===============================
async function saveOperacion(){
  const payload = {
    nombre: opNombre.value.trim(),
    descripcion: opDesc.value.trim() || null,
    prioridad: opPrioridad.value || "MEDIA",
    fecha_inicio: opInicio.value ? new Date(opInicio.value).toISOString() : null,
    fecha_fin: opFin.value ? new Date(opFin.value).toISOString() : null,
  };

  if(!payload.nombre){
    alert("Ponle nombre a la operación.");
    return;
  }

  if(state.id_operacion){
    const op = await api(`/ops/${state.id_operacion}`, { method: "PUT", body: payload });
    lblOperacion.textContent = op.nombre || op.codigo || `#${op.id_operacion}`;
    return op;
  } else {
    const op = await api(`/ops`, { method: "POST", body: payload });
    state.id_operacion = op.id_operacion;
    state.operacionCodigo = op.codigo;
    lblOperacion.textContent = op.nombre || op.codigo || `#${op.id_operacion}`;
    paintOperacionForm(op);
    return op;
  }
}

// ===============================
// ====== RENDER HOME =============
// ===============================
function renderHome(){
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

  btnPersonal.addEventListener("click", async () => {
    if(!state.id_operacion){
      alert("Primero guarda la operación (izquierda).");
      return;
    }
    state.categoria = "personal";
    state.pasoPersonal = "cut";
    renderCUT();
  });

  btnEquipo.addEventListener("click", () => {
    if(!state.id_operacion){
      alert("Primero guarda la operación (izquierda).");
      return;
    }
    state.categoria = "equipo";
    renderPlaceholder("Equipo", "Aquí irá el flujo de Equipo.");
  });

  btnVehiculos.addEventListener("click", () => {
    if(!state.id_operacion){
      alert("Primero guarda la operación (izquierda).");
      return;
    }
    // Solo deja entrar si ya hay CET/células (tu flujo)
    if(state.cetSeleccionadosIds.length === 0){
      alert("Primero asigna CET y Células.");
      return;
    }
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
  setHeader(title, "");
  showBack(true);
  setAccion("Siguiente", true);
}

// ===============================
// ====== PERSONAL: CUT ===========
/*
  En BD:
  - CUT/CET/CELL están en tabla personal
  - Se guardan en asignacion_operacion_personal al finalizar (o por paso)
*/
function renderCUT(){
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  setHeader("Comandante de Unidad Táctica", "");
  setAccion("Siguiente", !state.cutSeleccionadoId);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  // Aquí NO “agregamos” personal desde UI porque personal vive en catálogo/BD.
  // Si quieres crear personal desde aquí, se hace con endpoint POST /catalog/personal
  // Por ahora: solo seleccionar.
  listBox.appendChild(stickyInfo("Selecciona 1 CUT del catálogo"));

  state.catalog.CUT.forEach((p) => {
    listBox.appendChild(personRow({
      name: fullName(p),
      selected: state.cutSeleccionadoId === p.id_personal,
      onSelect: () => {
        state.cutSeleccionadoId = p.id_personal;
        // reset dependencias
        state.cetSeleccionadosIds = [];
        state.cetActivoIndex = 0;
        state.asignacionCelulas = {};
        state.asignacionVehiculos = {};
        state.cetActivoIndexVeh = 0;
        renderCUT();
      }
    }));
  });

  panel.appendChild(listBox);
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = () => {
    if(!state.cutSeleccionadoId) return;
    state.pasoPersonal = "cet";
    renderCET();
  };
}

// ===============================
// ====== PERSONAL: CET ===========
function renderCET(){
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  setHeader("Comandante de Equipo de Trabajo", "");
  setAccion("Siguiente", state.cetSeleccionadosIds.length === 0);

  // chips arriba
  const chips = document.createElement("div");
  chips.className = "chipRow";

  const cut = state.catalog.CUT.find(x => x.id_personal === state.cutSeleccionadoId);
  const cutChip = document.createElement("div");
  cutChip.className = "chip";
  cutChip.textContent = `CUT: ${cut ? fullName(cut) : "—"}`;
  chips.appendChild(cutChip);

  state.cetSeleccionadosIds.forEach((id) => {
    const p = state.catalog.CET.find(x => x.id_personal === id);
    const c = document.createElement("div");
    c.className = "chip active";
    c.textContent = `CET: ${p ? fullName(p) : id}`;
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  const listBox = document.createElement("div");
  listBox.className = "listBox";
  listBox.appendChild(stickyInfo("Selecciona CET (tu regla: mínimo 3)"));

  state.catalog.CET.forEach((p) => {
    const isSel = state.cetSeleccionadosIds.includes(p.id_personal);
    listBox.appendChild(personRow({
      name: fullName(p),
      selected: isSel,
      onSelect: () => {
        if(isSel){
          state.cetSeleccionadosIds = state.cetSeleccionadosIds.filter(x => x !== p.id_personal);
          delete state.asignacionCelulas[p.id_personal];
          delete state.asignacionVehiculos[p.id_personal];
          renderCET();
          return;
        }
        state.cetSeleccionadosIds.push(p.id_personal);
        renderCET();
      }
    }));
  });

  panel.appendChild(listBox);
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = () => {
    if(state.cetSeleccionadosIds.length === 0) return;

    // inicializa buckets
    state.cetSeleccionadosIds.forEach(id => {
      if(!state.asignacionCelulas[id]) state.asignacionCelulas[id] = [];
      if(!state.asignacionVehiculos[id]) state.asignacionVehiculos[id] = [];
    });

    state.pasoPersonal = "celulas";
    state.cetActivoIndex = 0;
    renderCelulas();
  };
}

// ===============================
// ====== PERSONAL: CÉLULAS =======
function renderCelulas(){
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  const cetId = state.cetSeleccionadosIds[state.cetActivoIndex];
  const cet = state.catalog.CET.find(x => x.id_personal === cetId);
  const asignadas = state.asignacionCelulas[cetId] || [];

  setHeader("Células", "");
  setAccion(
    state.cetActivoIndex < state.cetSeleccionadosIds.length - 1 ? "Siguiente" : "Finalizar y Guardar",
    asignadas.length < 6
  );

  // chips
  const chips = document.createElement("div");
  chips.className = "chipRow";

  const cut = state.catalog.CUT.find(x => x.id_personal === state.cutSeleccionadoId);
  const cutChip = document.createElement("div");
  cutChip.className = "chip";
  cutChip.textContent = `CUT: ${cut ? fullName(cut) : "—"}`;
  chips.appendChild(cutChip);

  state.cetSeleccionadosIds.forEach((id, i) => {
    const p = state.catalog.CET.find(x => x.id_personal === id);
    const c = document.createElement("div");
    c.className = "chip" + (i === state.cetActivoIndex ? " active" : "");
    c.textContent = `CET: ${p ? fullName(p) : id}`;
    c.addEventListener("click", () => { state.cetActivoIndex = i; renderCelulas(); });
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  // listbox
  const listBox = document.createElement("div");
  listBox.className = "listBox";
  listBox.appendChild(stickyInfo(`Selecciona mínimo 6 Células para: ${cet ? fullName(cet) : "CET"}`));

  // celdas ya usadas en otros CET
  const yaUsadas = new Set();
  state.cetSeleccionadosIds.forEach((otherCetId, i) => {
    if(i === state.cetActivoIndex) return;
    (state.asignacionCelulas[otherCetId] || []).forEach(x => yaUsadas.add(x));
  });

  state.catalog.CELL.forEach((cell) => {
    const enEste = asignadas.includes(cell.id_personal);
    const bloqueada = yaUsadas.has(cell.id_personal);

    listBox.appendChild(celulaRow({
      name: fullName(cell),
      selected: enEste,
      disabled: bloqueada,
      status: bloqueada ? "Asignado" : (enEste ? "En este CET" : "Disponible"),
      onToggle: () => {
        if(bloqueada) return;
        if(enEste){
          state.asignacionCelulas[cetId] = asignadas.filter(x => x !== cell.id_personal);
        } else {
          state.asignacionCelulas[cetId] = [...asignadas, cell.id_personal];
        }
        renderCelulas();
      }
    }));
  });

  panel.appendChild(listBox);
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = async () => {
    const count = (state.asignacionCelulas[cetId] || []).length;
    if(count < 6) return;

    if(state.cetActivoIndex < state.cetSeleccionadosIds.length - 1){
      state.cetActivoIndex += 1;
      renderCelulas();
      return;
    }

    // Último CET => guardar en BD
    try{
      await persistPersonalAssignments();
      alert("Personal guardado: CUT/CET/CELL + mandos (CELL→CET).");
      state.categoria = null;
      state.pasoPersonal = "home";
      renderHome();
    }catch(e){
      alert(e.message || "Error guardando personal");
    }
  };
}

// ===============================
// ====== GUARDAR PERSONAL BD =====
// ===============================
async function persistPersonalAssignments(){
  if(!state.id_operacion) throw new Error("No hay operación");
  if(!state.cutSeleccionadoId) throw new Error("Selecciona CUT");
  if(state.cetSeleccionadosIds.length === 0) throw new Error("Selecciona CET");

  // 1) asig_op_personal: CUT + CET + CELL
  const personalIds = new Set();
  personalIds.add(state.cutSeleccionadoId);
  state.cetSeleccionadosIds.forEach(id => personalIds.add(id));
  Object.values(state.asignacionCelulas).forEach(arr => arr.forEach(id => personalIds.add(id)));

  const payloadPersonal = {
    asignado_por: state.id_usuario,
    items: Array.from(personalIds).map((id_personal) => ({
      id_personal,
      rol_en_operacion: null,
      estado_asignacion: "ASIGNADO",
    })),
  };

  await api(`/ops/${state.id_operacion}/personal`, { method: "POST", body: payloadPersonal });

  // 2) mando_operacion: por cada CET, sus cells
  const mandoItems = [];
  state.cetSeleccionadosIds.forEach((id_cet) => {
    const cells = state.asignacionCelulas[id_cet] || [];
    cells.forEach((id_cell) => {
      mandoItems.push({ id_cet, id_cell });
    });
  });

  await api(`/ops/${state.id_operacion}/mando`, {
    method: "POST",
    body: { asignado_por: state.id_usuario, items: mandoItems }
  });
}

// ===============================
// ====== VEHÍCULOS (UI) ==========
// ===============================
function renderVehiculos(){
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  const cetId = state.cetSeleccionadosIds[state.cetActivoIndexVeh];
  const cet = state.catalog.CET.find(x => x.id_personal === cetId);
  const asignadas = state.asignacionVehiculos[cetId] || [];

  setHeader("Vehículos", "");
  setAccion(state.cetActivoIndexVeh < state.cetSeleccionadosIds.length - 1 ? "Siguiente" : "Finalizar y Guardar", false);

  // chips
  const chips = document.createElement("div");
  chips.className = "chipRow";

  const cut = state.catalog.CUT.find(x => x.id_personal === state.cutSeleccionadoId);
  const cutChip = document.createElement("div");
  cutChip.className = "chip";
  cutChip.textContent = `CUT: ${cut ? fullName(cut) : "—"}`;
  chips.appendChild(cutChip);

  state.cetSeleccionadosIds.forEach((id, i) => {
    const p = state.catalog.CET.find(x => x.id_personal === id);
    const c = document.createElement("div");
    c.className = "chip" + (i === state.cetActivoIndexVeh ? " active" : "");
    c.textContent = `CET: ${p ? fullName(p) : id}`;
    c.addEventListener("click", () => { state.cetActivoIndexVeh = i; renderVehiculos(); });
    chips.appendChild(c);
  });
  panel.appendChild(chips);

  const listBox = document.createElement("div");
  listBox.className = "listBox";
  listBox.appendChild(stickyInfo(`Selecciona vehículos para ${cet ? fullName(cet) : "CET"} (luego se forman grupos)`));

  const content = document.createElement("div");
  content.className = "vehicleGrid";

  // Vehículos ya usados en otros CET (en tu UI actual)
  const yaUsadas = new Set();
  state.cetSeleccionadosIds.forEach((otherCetId, i) => {
    if(i === state.cetActivoIndexVeh) return;
    (state.asignacionVehiculos[otherCetId] || []).forEach(idVeh => yaUsadas.add(idVeh));
  });

  state.catalog.vehiculos.forEach((v) => {
    const enEste = asignadas.includes(v.id_vehiculo);
    const bloqueada = yaUsadas.has(v.id_vehiculo);

    const card = document.createElement("div");
    card.className = "vehicleCard" + (enEste ? " selected" : "") + (bloqueada ? " disabled" : "");

    const imgUrl = (v.imagen_veh || "").trim();

    if (imgUrl) {
      const img = document.createElement("img");
      img.src = imgUrl;
      img.alt = v.codigo_interno;
      // por si falla la URL:
      img.onerror = () => { img.remove(); };
      card.appendChild(img);
    }

    const nameP = document.createElement("p");
    nameP.textContent = `${v.codigo_interno} ${v.marca ? "· "+v.marca : ""} ${v.modelo ? v.modelo : ""}`.trim();

    card.addEventListener("click", () => {
      if(bloqueada) return;
      if(enEste){
        state.asignacionVehiculos[cetId] = asignadas.filter(x => x !== v.id_vehiculo);
      } else {
        state.asignacionVehiculos[cetId] = [...asignadas, v.id_vehiculo];
      }
      renderVehiculos();
    });

    card.append(nameP);
    content.appendChild(card);
  });

  listBox.appendChild(content);
  panel.appendChild(listBox);
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = async () => {
    if(state.cetActivoIndexVeh < state.cetSeleccionadosIds.length - 1){
      state.cetActivoIndexVeh += 1;
      renderVehiculos();
      return;
    }

    // Guardar vehículos + auto-grupos
    try{
      await persistVehiculosYGrupos();
      alert("Vehículos guardados y grupos generados.");
      state.categoria = null;
      state.pasoPersonal = "home";
      renderHome();
    }catch(e){
      alert(e.message || "Error guardando vehículos/grupos");
    }
  };
}

// Guarda:
async function persistVehiculosYGrupos(){
  if(!state.id_operacion) throw new Error("No hay operación");
  if(state.cetSeleccionadosIds.length === 0) throw new Error("No hay CET");

  // 1) mete vehículos a la operación (vehiculo_operacion)
  const vehSet = new Set();
  Object.values(state.asignacionVehiculos).forEach(arr => arr.forEach(id => vehSet.add(id)));

  await api(`/ops/${state.id_operacion}/vehiculos`, {
    method: "POST",
    body: {
      asignado_por: state.id_usuario,
      items: Array.from(vehSet).map(id_vehiculo => ({
        id_vehiculo,
        uso_en_operacion: null,
        estado_asignacion: "ASIGNADO"
      }))
    }
  });

  // 2) Crea grupos automáticamente para tu regla “vehículo para subconjuntos de células”
  //    Aquí delego al backend porque en BD ya tienes todo para hacerlo bien.
  //    Input: por cada CET -> cells (mando) y -> vehiculos seleccionados.
  const gruposInput = state.cetSeleccionadosIds.map((id_cet) => ({
    id_cet,
    cells: (state.asignacionCelulas[id_cet] || []),
    vehiculos: (state.asignacionVehiculos[id_cet] || []),
  }));

  await api(`/ops/${state.id_operacion}/grupos/auto`, {
    method: "POST",
    body: {
      creado_por: state.id_usuario,
      asignado_por: state.id_usuario,
      grupos: gruposInput
    }
  });
}

// ===============================
// ====== COMPONENTES UI ==========
// ===============================
function stickyInfo(text){
  const wrap = document.createElement("div");
  wrap.className = "stickyAdd";
  const p = document.createElement("div");
  p.style.fontSize = "12px";
  p.style.opacity = "0.8";
  p.style.padding = "8px 0";
  p.textContent = text;
  wrap.appendChild(p);
  return wrap;
}

function personRow({name, selected=false, onSelect}){
  const row = document.createElement("div");
  row.className = "item" + (selected ? " selected" : "");

  const left = document.createElement("div");
  left.className = "itemName";
  left.textContent = name;
  left.style.cursor = "pointer";
  left.addEventListener("click", onSelect);

  row.append(left);
  return row;
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

// ===============================
// ====== NAV BACK/EXIT ============
// ===============================
btnBack.addEventListener("click", () => {
  if(state.categoria !== "personal"){
    renderHome();
    return;
  }
  if(state.pasoPersonal === "celulas"){ state.pasoPersonal = "cet"; renderCET(); return; }
  if(state.pasoPersonal === "cet"){ state.pasoPersonal = "cut"; renderCUT(); return; }
  if(state.pasoPersonal === "cut"){ renderHome(); return; }
});

btnVolver.addEventListener("click", () => {
  window.location.href = "menu_inicial.html";
});

// ===============================
// ====== INIT ====================
// ===============================
(async function init(){
  try{
    await loadCatalogs();
    await loadOperacionFromQS();

    // Botón izquierdo: guardar operación
    btnFinalizar.addEventListener("click", async () => {
      try{
        const op = await saveOperacion();
        alert(`Operación guardada: ${op.nombre}`);
      }catch(e){
        alert(e.message || "Error guardando operación");
      }
    });

    renderHome();
  }catch(e){
    alert(e.message || "Error inicializando");
  }
})();
