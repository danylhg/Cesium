/* =========================================================
   ASIGNACIÓN - Flujo con BD (Postgres) + UI Mejorada
   - Selección por IDs (no por nombres)
   - Carga listas desde API
   - Sticky "+ Agregar" (crea en BD)
   - Editar inline (actualiza en BD)
   - Eliminar (borra en BD)
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

// Parse "Nombre Apellido" -> {nombre, apellido}
// (si solo ponen 1 palabra, apellido queda vacío)
function parseNombreApellido(full){
  const s = (full || "").trim().replace(/\s+/g, " ");
  if(!s) return { nombre: "", apellido: "" };
  const parts = s.split(" ");
  if(parts.length === 1) return { nombre: parts[0], apellido: "" };
  return { nombre: parts.slice(0, -1).join(" "), apellido: parts.slice(-1).join("") };
}

// ===============================
// ====== STATE GLOBAL ============
// ===============================
const state = {
  id_operacion: null,
  operacionCodigo: null,

  id_usuario: null,

  categoria: null, // 'personal' | 'equipo' | 'vehiculos'
  pasoPersonal: "home", // home | cut | cet | celulas

  catalog: {
    CUT: [],
    CET: [],
    CELL: [],
    vehiculos: [],
  },

  cutSeleccionadoId: null,
  cetSeleccionadosIds: [],
  cetActivoIndex: 0,

  asignacionCelulas: {},
  asignacionVehiculos: {},
  cetActivoIndexVeh: 0,
};

function fullName(p){ return `${p.nombre} ${p.apellido}`.trim(); }

// ===============================
// ====== CARGA INICIAL ===========
// ===============================
async function loadCatalogs(){
  const me = await api("/me");
  state.id_usuario = me.id_usuario;

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

async function reloadPersonalCatalog(rol){
  const data = await api(`/catalog/personal?rol=${encodeURIComponent(rol)}`);
  state.catalog[rol] = data.items || data || [];
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

  lblOperacion.textContent = "—";
}

function paintOperacionForm(op){
  opNombre.value = op.nombre || "";
  opDesc.value = op.descripcion || "";
  opPrioridad.value = op.prioridad || "";

  const toDate = (v) => v ? new Date(v).toISOString().slice(0,10) : "";
  opCreacion.value = toDate(op.fecha_creacion);
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
// ====== CRUD PERSONAL (BD) ======
// ===============================
async function createPersonal({ rol, nombreCompleto }){
  const { nombre, apellido } = parseNombreApellido(nombreCompleto);
  if(!nombre || !apellido) throw new Error("Escribe nombre y apellido");

  const resp = await api("/catalog/personal", {
    method: "POST",
    body: { rol, nombre, apellido }
  });
  return resp.item; // <- importante
}

async function updatePersonal({ id_personal, nombreCompleto }){
  const { nombre, apellido } = parseNombreApellido(nombreCompleto);
  if(!nombre || !apellido) throw new Error("Escribe nombre y apellido");

  const resp = await api(`/catalog/personal/${id_personal}`, {
    method: "PUT",
    body: { nombre, apellido }
  });
  return resp.item; // <- importante
}

async function deletePersonal(id_personal){
  await api(`/catalog/personal/${id_personal}`, { method: "DELETE" });
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
// ====== UI row con Edit/Delete ==
// ===============================
function personRowCrud({ name, selected=false, onSelect, onDelete, onEdit }){
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
    onDelete?.();
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

  btnGuardar.addEventListener("click", async () => {
    const val = inp.value.trim();
    if(!val) return;
    await onSave(val);
  });

  btnCancelar.addEventListener("click", () => {
    // cancel => re-render normal
    onSave(oldName);
  });

  edit.append(inp, btnGuardar, btnCancelar);
  row.appendChild(edit);

  inp.focus();
  inp.select();
}

function inlineAddRow(listBox, { placeholder="Nombre", onSave, onCancel }){
  const container = document.createElement("div");
  container.className = "item";

  const edit = document.createElement("div");
  edit.className = "editInline";

  const inp = document.createElement("input");
  inp.placeholder = placeholder;
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
    await onSave(val);
  });

  btnCancelar.addEventListener("click", () => onCancel?.());

  edit.append(inp, btnGuardar, btnCancelar);
  container.appendChild(edit);

  const afterSticky = listBox.children[0]?.nextSibling;
  listBox.insertBefore(container, afterSticky);
  inp.focus();
}

// ===============================
// ====== PERSONAL: CUT ===========
// ===============================
function renderCUT(){
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  setHeader("Comandante de Unidad Táctica", "");
  setAccion("Siguiente", !state.cutSeleccionadoId);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  listBox.appendChild(stickyAddButton("Agregar", () => {
    inlineAddRow(listBox, {
      placeholder: "Nombre Apellido",
      onSave: async (nombreCompleto) => {
        try{
          await createPersonal({ rol: "CUT", nombreCompleto });
          await reloadPersonalCatalog("CUT");
          renderCUT();
        }catch(e){ alert(e.message || "Error creando CUT"); renderCUT(); }
      },
      onCancel: () => renderCUT()
    });
  }));

  listBox.appendChild(stickyInfo("Selecciona 1 CUT del catálogo (BD)"));

  state.catalog.CUT.forEach((p) => {
    listBox.appendChild(personRowCrud({
      name: fullName(p),
      selected: state.cutSeleccionadoId === p.id_personal,
      onSelect: () => {
        state.cutSeleccionadoId = p.id_personal;
        state.cetSeleccionadosIds = [];
        state.cetActivoIndex = 0;
        state.asignacionCelulas = {};
        state.asignacionVehiculos = {};
        state.cetActivoIndexVeh = 0;
        renderCUT();
      },
      onDelete: async () => {
        if(!confirm(`Eliminar a ${fullName(p)} del catálogo?`)) return;
        try{
          await deletePersonal(p.id_personal);
          if(state.cutSeleccionadoId === p.id_personal) state.cutSeleccionadoId = null;
          await reloadPersonalCatalog("CUT");
          renderCUT();
        }catch(e){ alert(e.message || "Error eliminando CUT"); }
      },
      onEdit: async (nuevoNombreCompleto) => {
        try{
          await updatePersonal({ id_personal: p.id_personal, nombreCompleto: nuevoNombreCompleto });
          await reloadPersonalCatalog("CUT");
          renderCUT();
        }catch(e){ alert(e.message || "Error editando CUT"); renderCUT(); }
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
// ===============================
function renderCET(){
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  setHeader("Comandante de Equipo de Trabajo", "");
  setAccion("Siguiente", state.cetSeleccionadosIds.length === 0);

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

  listBox.appendChild(stickyAddButton("Agregar", () => {
    inlineAddRow(listBox, {
      placeholder: "Nombre Apellido",
      onSave: async (nombreCompleto) => {
        try{
          await createPersonal({ rol: "CET", nombreCompleto });
          await reloadPersonalCatalog("CET");
          renderCET();
        }catch(e){ alert(e.message || "Error creando CET"); renderCET(); }
      },
      onCancel: () => renderCET()
    });
  }));

  listBox.appendChild(stickyInfo("Selecciona CET (tu regla: mínimo 3)"));

  state.catalog.CET.forEach((p) => {
    const isSel = state.cetSeleccionadosIds.includes(p.id_personal);

    listBox.appendChild(personRowCrud({
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
      },
      onDelete: async () => {
        if(!confirm(`Eliminar a ${fullName(p)} del catálogo?`)) return;
        try{
          await deletePersonal(p.id_personal);
          state.cetSeleccionadosIds = state.cetSeleccionadosIds.filter(x => x !== p.id_personal);
          delete state.asignacionCelulas[p.id_personal];
          delete state.asignacionVehiculos[p.id_personal];
          await reloadPersonalCatalog("CET");
          renderCET();
        }catch(e){ alert(e.message || "Error eliminando CET"); }
      },
      onEdit: async (nuevoNombreCompleto) => {
        try{
          await updatePersonal({ id_personal: p.id_personal, nombreCompleto: nuevoNombreCompleto });
          await reloadPersonalCatalog("CET");
          renderCET();
        }catch(e){ alert(e.message || "Error editando CET"); renderCET(); }
      }
    }));
  });

  panel.appendChild(listBox);
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = () => {
    if(state.cetSeleccionadosIds.length === 0) return;

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
// ===============================
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

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  listBox.appendChild(stickyAddButton("Agregar", () => {
    inlineAddRow(listBox, {
      placeholder: "Nombre Apellido (CELL)",
      onSave: async (nombreCompleto) => {
        try{
          await createPersonal({ rol: "CELL", nombreCompleto });
          await reloadPersonalCatalog("CELL");
          renderCelulas();
        }catch(e){ alert(e.message || "Error creando CELL"); renderCelulas(); }
      },
      onCancel: () => renderCelulas()
    });
  }));

  listBox.appendChild(stickyInfo(`Selecciona mínimo 6 Células para: ${cet ? fullName(cet) : "CET"}`));

  const yaUsadas = new Set();
  state.cetSeleccionadosIds.forEach((otherCetId, i) => {
    if(i === state.cetActivoIndex) return;
    (state.asignacionCelulas[otherCetId] || []).forEach(x => yaUsadas.add(x));
  });

  state.catalog.CELL.forEach((cell) => {
    const enEste = asignadas.includes(cell.id_personal);
    const bloqueada = yaUsadas.has(cell.id_personal);

    // aquí “editar/eliminar” sería del catálogo CELL (no de la asignación)
    // Para no ensuciar UI, lo dejamos como selección; si quieres CRUD también en CELL,
    // dímelo y te lo dejo como en CUT/CET.
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

  const mandoItems = [];
  state.cetSeleccionadosIds.forEach((id_cet) => {
    const cells = state.asignacionCelulas[id_cet] || [];
    cells.forEach((id_cell) => mandoItems.push({ id_cet, id_cell }));
  });

  await api(`/ops/${state.id_operacion}/mando`, {
    method: "POST",
    body: { asignado_por: state.id_usuario, items: mandoItems }
  });
}

// ===============================
// ====== VEHÍCULOS (como Código 1)
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

async function persistVehiculosYGrupos(){
  if(!state.id_operacion) throw new Error("No hay operación");
  if(state.cetSeleccionadosIds.length === 0) throw new Error("No hay CET");

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