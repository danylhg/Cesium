// ====== SESIÓN ======
if (localStorage.getItem("session") !== "ok") {
  window.location.href = "login.html";
}
function qs(id){ return document.getElementById(id); }

// ====== TOP ======
const opBadge = qs("opBadge");
const btnBack = qs("btnBack");
btnBack.addEventListener("click", () => window.location.href = "menu_inicial.html");

// ====== STORAGE OPS ======
const STORAGE_OPS = "operations";
function getOps() {
  const raw = localStorage.getItem(STORAGE_OPS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
function setOps(list) {
  localStorage.setItem(STORAGE_OPS, JSON.stringify(list));
}

// ====== IZQUIERDA: CREAR OPERACIÓN ======
const opName = qs("opName");
const opDesc = qs("opDesc");
const opDateCreated = qs("opDateCreated");
const opDateStart = qs("opDateStart");
const opDateEnd = qs("opDateEnd");
const btnFinalize = qs("btnFinalize");
const leftMsg = qs("leftMsg");

let ops = getOps();

function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  if (!opDateCreated.value) opDateCreated.value = today;
}
setDefaultDates();

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
  refreshActiveOp();
  leftMsg.textContent = "Operación creada y seleccionada. Ya puedes asignar.";
});

// Mostrar operación activa
function refreshActiveOp(){
  const activeId = localStorage.getItem("active_operation_id");
  if (!activeId) { opBadge.textContent = "Operación: —"; return; }
  const list = getOps();
  const current = list.find(o => o.id === activeId);
  opBadge.textContent = current ? `Operación: ${current.name}` : `Operación: ${activeId}`;
}
refreshActiveOp();


// =====================================================
// ====== DERECHA: ASIGNAR (FLOW EN EL MISMO PANEL) =====
// =====================================================
const rightTitle = qs("rightTitle");
const rightBody = qs("rightBody");
const btnRightAction = qs("btnRightAction");
const btnRightBack = qs("btnRightBack");
const rightMsg = qs("rightMsg");
const subLine = qs("subLine");

// ---- STORAGE para nombres y selecciones
const STORE_NAMES = "assign_names_v2";
const STORE_SELECTED = "assign_selected_v2";

function getNames(){
  const raw = localStorage.getItem(STORE_NAMES);
  if (!raw) {
    // Pools por defecto
    const base = {
      cut: ["Luis Hernandez", "Uriel gallegos", "Santiago Mirón"],
      cet: ["Luis Hernandez", "Uriel gallegos", "Santiago Mirón"],
      celulas: [
        "Alfa 01","Alfa 02","Alfa 03","Alfa 04","Alfa 05","Alfa 06",
        "Bravo 01","Bravo 02","Bravo 03","Bravo 04","Bravo 05","Bravo 06",
        "Charlie 01","Charlie 02","Charlie 03","Charlie 04","Charlie 05","Charlie 06",
        "Delta 01","Delta 02","Delta 03","Delta 04","Delta 05","Delta 06",
      ],
    };
    localStorage.setItem(STORE_NAMES, JSON.stringify(base));
    return base;
  }
  try { return JSON.parse(raw); } catch { return {cut:[], cet:[], celulas:[]}; }
}
function setNames(obj){ localStorage.setItem(STORE_NAMES, JSON.stringify(obj)); }

function getSelected(){
  const raw = localStorage.getItem(STORE_SELECTED);
  if (!raw) {
    return {
      cut: null,
      cet: [],              // 3 personas
      celulasByCET: {},     // { "NombreCET": ["x","y"...] }
      activeCETIndex: 0,    // 0..2
      celulasDraft: []      // selección temporal para el CET actual
    };
  }
  try { return JSON.parse(raw); } catch {
    return { cut:null, cet:[], celulasByCET:{}, activeCETIndex:0, celulasDraft:[] };
  }
}
function setSelected(obj){ localStorage.setItem(STORE_SELECTED, JSON.stringify(obj)); }

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

// ===== Back button logic =====
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

// ===== Main action button logic =====
btnRightAction.addEventListener("click", () => {
  rightMsg.textContent = "";
  const sel = getSelected();

  if (view === VIEW.ROOT) {
    rightMsg.textContent = "Selecciona una opción (Personal, Equipo o Vehículos).";
    return;
  }

  if (view === VIEW.PERSONAL_MENU) {
    rightMsg.textContent = "Selecciona un apartado de Personal.";
    return;
  }

  if (view === VIEW.CUT_LIST) {
    if (!sel.cut) { rightMsg.textContent = "Selecciona 1 persona para CUT."; return; }
    // pasa a CET
    view = VIEW.CET_LIST;
    render();
    return;
  }

  if (view === VIEW.CET_LIST) {
    if (!sel.cut) { rightMsg.textContent = "Primero selecciona CUT."; return; }
    if (!Array.isArray(sel.cet) || sel.cet.length !== 3) {
      rightMsg.textContent = "Selecciona exactamente 3 personas para CET.";
      return;
    }

    // Cuando ya hay 3, manda a CÉLULAS
    sel.activeCETIndex = 0;
    sel.celulasDraft = [];
    setSelected(sel);

    view = VIEW.CELULAS;
    render();
    return;
  }

  if (view === VIEW.CELULAS) {
    const cetList = sel.cet || [];
    if (!sel.cut || cetList.length !== 3) {
      rightMsg.textContent = "Primero asigna CUT y 3 CET.";
      return;
    }

    const idx = sel.activeCETIndex ?? 0;
    const currentCET = cetList[idx];
    const draft = sel.celulasDraft || [];

    if (draft.length < 6) {
      rightMsg.textContent = "Debes seleccionar mínimo 6 para este CET.";
      return;
    }

    // guardar asignación para el CET actual
    sel.celulasByCET = sel.celulasByCET || {};
    sel.celulasByCET[currentCET] = [...draft];

    // avanzar al siguiente CET pendiente
    const nextIdx = idx + 1;

    if (nextIdx <= 2) {
      sel.activeCETIndex = nextIdx;
      sel.celulasDraft = [];
      setSelected(sel);
      render();
      return;
    }

    // finalizó los 3 CET
    sel.celulasDraft = [];
    setSelected(sel);
    rightMsg.textContent = "✅ Células asignadas a los 3 CET.";
    return;
  }

  rightMsg.textContent = "Acción disponible próximamente.";
});


// ====== UI blocks ======
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

// List (CUT/CET) editable + selectable
function buildEditableSelectableList({ listKey, selectMode, multiMax = Infinity }){
  const names = getNames();
  const selected = getSelected();

  const box = el("div", "list");

  // + Agregar (inline)
  const addBtn = el("button", "bigBtn");
  addBtn.textContent = "+ Agregar";
  addBtn.addEventListener("click", () => {
    const existing = box.querySelector(".addRow");
    if (existing) return;

    const row = el("div", "addRow");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Escribe el nombre…";
    const btnOk = el("button", "smallBtn", "Guardar");
    const btnNo = el("button", "smallBtn danger", "Cancelar");

    btnOk.addEventListener("click", () => {
      const v = input.value.trim();
      if (!v) return;
      names[listKey] = [v, ...(names[listKey] || [])];
      setNames(names);
      render();
    });
    btnNo.addEventListener("click", () => row.remove());

    row.appendChild(input);
    row.appendChild(btnOk);
    row.appendChild(btnNo);
    box.prepend(row);
    input.focus();
  });

  box.appendChild(addBtn);

  (names[listKey] || []).forEach((name) => {
    const item = el("div", "listItem");

    // seleccionado?
    const isSelected =
      selectMode === "single"
        ? (selected[listKey] === name)
        : (Array.isArray(selected[listKey]) && selected[listKey].includes(name));

    const clickable = el("div", "name", name);
    clickable.style.cursor = "pointer";
    clickable.style.flex = "1";

    clickable.addEventListener("click", () => {
      const sel = getSelected();

      if (selectMode === "single") {
        sel[listKey] = name;
      } else {
        sel[listKey] = Array.isArray(sel[listKey]) ? sel[listKey] : [];
        const exists = sel[listKey].includes(name);

        if (exists) {
          sel[listKey] = sel[listKey].filter(x => x !== name);
        } else {
          if (sel[listKey].length >= multiMax) {
            rightMsg.textContent = `Máximo ${multiMax} seleccionados.`;
            return;
          }
          sel[listKey].push(name);
        }
      }

      setSelected(sel);
      render();
    });

    const actions = el("div", "actionsRow");
    const btnEdit = el("button", "smallBtn", "Editar");
    const btnDel = el("button", "smallBtn danger", "Eliminar");

    // eliminar directo
    btnDel.addEventListener("click", () => {
      const nn = getNames();
      nn[listKey] = (nn[listKey] || []).filter(x => x !== name);
      setNames(nn);

      const sel = getSelected();
      if (selectMode === "single") {
        if (sel[listKey] === name) sel[listKey] = null;
      } else {
        sel[listKey] = (sel[listKey] || []).filter(x => x !== name);
      }
      setSelected(sel);
      render();
    });

    // editar inline en el mismo item
    btnEdit.addEventListener("click", () => {
      item.innerHTML = "";

      const editWrap = el("div", "inlineEdit");
      const input = document.createElement("input");
      input.value = name;

      const rightActions = el("div", "actionsRow");
      const btnSave = el("button", "smallBtn", "Guardar");
      const btnCancel = el("button", "smallBtn danger", "Cancelar");

      btnSave.addEventListener("click", () => {
        const v = input.value.trim();
        if (!v) return;

        const nn = getNames();
        nn[listKey] = (nn[listKey] || []).map(x => x === name ? v : x);
        setNames(nn);

        const sel = getSelected();
        if (selectMode === "single") {
          if (sel[listKey] === name) sel[listKey] = v;
        } else {
          sel[listKey] = (sel[listKey] || []).map(x => x === name ? v : x);
        }
        setSelected(sel);

        render();
      });

      btnCancel.addEventListener("click", () => render());

      editWrap.appendChild(input);
      rightActions.appendChild(btnSave);
      rightActions.appendChild(btnCancel);

      item.appendChild(editWrap);
      item.appendChild(rightActions);

      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });

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

  // footer count
  const selectedNow = getSelected();
  const footer = el("div", "hint");
  if (selectMode === "single") {
    footer.textContent = selectedNow[listKey] ? `Seleccionado: ${selectedNow[listKey]}` : "Selecciona 1.";
  } else {
    const count = Array.isArray(selectedNow[listKey]) ? selectedNow[listKey].length : 0;
    footer.textContent = `Seleccionados: ${count}/${multiMax}`;
  }

  const wrap = document.createElement("div");
  wrap.appendChild(box);
  wrap.appendChild(footer);
  return wrap;
}


// ======= CÉLULAS VIEW =======
function buildCelulasView(){
  const names = getNames();
  const sel = getSelected();

  const cetList = sel.cet || [];
  const idx = sel.activeCETIndex ?? 0;
  const currentCET = cetList[idx];

  // HEADER LINES: CUT + 3 CET
  const topInfo = el("div", "cetTopInfo");

  const cutLine = el("div", "cetLine", `CUT: ${sel.cut || "—"}`);
  topInfo.appendChild(cutLine);

  const chips = el("div", "cetChips");

  cetList.forEach((cetName, i) => {
    const chip = el("button", "cetChip" + (i === idx ? " active" : ""), `CET: ${cetName}`);
    chip.addEventListener("click", () => {
      const s = getSelected();
      s.activeCETIndex = i;
      s.celulasDraft = []; // draft cambia por CET para no mezclar
      setSelected(s);
      render();
    });
    chips.appendChild(chip);
  });

  // Botón para ver la pantalla de selección CET
  const btnSeeCET = el("button", "smallBtn", "Ver selección CET");
  btnSeeCET.addEventListener("click", () => {
    view = VIEW.CET_LIST;
    render();
  });

  const row = el("div", "cetRowTools");
  row.appendChild(chips);
  row.appendChild(btnSeeCET);

  // LISTA DE CÉLULAS
  // deshabilitar las ya asignadas por otros CET
  const assignedMap = sel.celulasByCET || {};
  const used = new Set();
  Object.keys(assignedMap).forEach(k => {
    (assignedMap[k] || []).forEach(v => used.add(v));
  });

  // permitir seleccionar los ya asignados al CET actual (para visualización), pero no dejarlos “seleccionables” si ya están guardados.
  const alreadyForThisCET = new Set(assignedMap[currentCET] || []);
  const draft = sel.celulasDraft || [];

  const list = el("div", "list");
  const listTitle = el("div", "hint", `Asignar células para: CET ${idx+1} (${currentCET}) — mínimo 6`);
  list.appendChild(listTitle);

  // Botones tipo lista
  (names.celulas || []).forEach((person) => {
    const item = el("div", "listItem");

    const nameBox = el("div", "name", person);
    nameBox.style.flex = "1";
    nameBox.style.cursor = "pointer";

    const isPicked = draft.includes(person);
    const isBlocked = used.has(person) && !alreadyForThisCET.has(person); // ya fue usada en otro CET
    const isAlreadyAssignedHere = alreadyForThisCET.has(person);

    // estilo
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

    // toggle select (solo si no está bloqueado)
    nameBox.addEventListener("click", () => {
      if (isBlocked) return;

      const s = getSelected();
      s.celulasDraft = Array.isArray(s.celulasDraft) ? s.celulasDraft : [];
      const exists = s.celulasDraft.includes(person);

      if (exists) {
        s.celulasDraft = s.celulasDraft.filter(x => x !== person);
      } else {
        s.celulasDraft.push(person);
      }

      setSelected(s);
      render();
    });

    // indicador derecha
    const badge = el("div", "miniBadge");
    if (isBlocked) badge.textContent = "Asignado";
    else if (isAlreadyAssignedHere) badge.textContent = "En este CET";
    else if (isPicked) badge.textContent = "Seleccionado";
    else badge.textContent = "";

    item.appendChild(nameBox);
    item.appendChild(badge);
    list.appendChild(item);
  });

  // footer count
  const footer = el("div", "hint");
  footer.textContent = `Seleccionados para este CET: ${(draft || []).length}`;

  const wrap = document.createElement("div");
  wrap.appendChild(topInfo);
  wrap.appendChild(row);
  wrap.appendChild(list);
  wrap.appendChild(footer);

  return wrap;
}


// ===== render =====
function render(){
  rightBody.innerHTML = "";
  rightMsg.textContent = "";

  const sel = getSelected();

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
        { label: "Comandante Unidad Táctica", onClick: () => { view = VIEW.CUT_LIST; render(); } },
        { label: "Comandante Equipo de Trabajo", onClick: () => { view = VIEW.CET_LIST; render(); } },
        { label: "Células", onClick: () => {
            // si ya tiene 3 CET, deja entrar
            const s = getSelected();
            if (!s.cut || !Array.isArray(s.cet) || s.cet.length !== 3) {
              rightMsg.textContent = "Primero asigna CUT y 3 CET.";
              return;
            }
            view = VIEW.CELULAS;
            render();
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

    // acción depende si terminó o no
    const idx = sel.activeCETIndex ?? 0;
    const currentCET = (sel.cet || [])[idx];
    setActionLabel(currentCET ? "Asignar" : "Asignar");

    hideSubLine();
    rightBody.appendChild(buildCelulasView());

    // mensaje de bloqueo del flujo si falta algo
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

// default
view = VIEW.ROOT;
render();

