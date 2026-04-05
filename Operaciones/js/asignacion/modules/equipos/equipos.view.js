import { panel, btnAccion, vehiculosLeftEl } from "../../core/dom.js";
import { state } from "../../core/state.js";
import {
  clearPanel,
  showBack,
  showVehiculosLeftPanel,
  setHeader,
  setAccion,
  showDashboardButton
} from "../../core/ui.js";
import { renderHome } from "../../views/home.view.js";
import {
  getEquipoAssignmentsBucket as getBucket,
  getEquipoListByCategoria as getList,
  formatEquipoAsignado
} from "./equipos.helpers.js";
import { asignarEquipo } from "./equipos.service.js";
import {
  getResumenVehiculoDetallado,
  getVehiclesUsedInAssignments
} from "../vehiculos/vehiculos.helpers.js";
import { saveOperacionActual } from "../operacion/operacion.service.js";
import { saveAsignacionActual } from "../asignacion/asignacion.service.js";

function finalizarAsignacionCompleta() {
  saveOperacionActual(); // BACKEND: se vuelve async con PUT /ops/:id
  renderHome();
  showDashboardButton();
}

export function renderEquipoAsignacion() {
  clearPanel();
  showBack(true);
  showVehiculosLeftPanel("Asignación de equipos");

  setHeader("Selecciona equipo", "");
  setAccion("Finalizar", false);

  vehiculosLeftEl.innerHTML = "";

  const leftHeader = document.createElement("div");
  leftHeader.className = "chipRow";

  const chipPersonal = document.createElement("button");
  chipPersonal.className = "chip" + (state.equipoDestino === "personal" ? " active" : "");
  chipPersonal.textContent = "Asignar a personal";
  chipPersonal.addEventListener("click", () => {
    state.equipoDestino = "personal";
    state.equipoSelectedResource = null;
    state.equipoSelectedItems = [];
    state.equipoSelectedCet = state.cetSeleccionados[0] || null;

    const primerCet = state.equipoSelectedCet;
    if (primerCet) {
      const ginfo = state.gruposByCet[primerCet] || { names: [], map: {} };
      state.equipoSelectedGrupo =
        (ginfo.names && ginfo.names.length > 0) ? ginfo.names[0] : null;
    } else {
      state.equipoSelectedGrupo = null;
    }

    saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
    renderEquipoAsignacion();
  });

  const chipVehiculo = document.createElement("button");
  chipVehiculo.className = "chip" + (state.equipoDestino === "vehiculo" ? " active" : "");
  chipVehiculo.textContent = "Asignar a vehículo";
  chipVehiculo.addEventListener("click", () => {
    state.equipoDestino = "vehiculo";
    state.equipoSelectedResource = null;
    state.equipoSelectedItems = [];
    state.equipoSelectedCet = null;
    state.equipoSelectedGrupo = null;
    saveAsignacionActual();
    renderEquipoAsignacion();
  });

  leftHeader.appendChild(chipPersonal);
  leftHeader.appendChild(chipVehiculo);
  vehiculosLeftEl.appendChild(leftHeader);

  if (state.equipoDestino === "personal") {
    renderEquipoLeftPersonal();
  } else {
    renderEquipoLeftVehiculo();
  }

  const rightHeaderBox = document.createElement("div");
  rightHeaderBox.className = "chipRow";
  rightHeaderBox.style.marginBottom = "10px";

  const chipComunicacion = document.createElement("button");
  chipComunicacion.className = "chip" + (state.equipoCategoria === "comunicacion" ? " active" : "");
  chipComunicacion.textContent = "Comunicación";
  chipComunicacion.addEventListener("click", () => {
    state.equipoCategoria = "comunicacion";
    saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
    renderEquipoAsignacion();
  });

  const chipTactico = document.createElement("button");
  chipTactico.className = "chip" + (state.equipoCategoria === "tactico" ? " active" : "");
  chipTactico.textContent = "Táctico";
  chipTactico.addEventListener("click", () => {
    state.equipoCategoria = "tactico";
    saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
    renderEquipoAsignacion();
  });

  rightHeaderBox.appendChild(chipComunicacion);
  rightHeaderBox.appendChild(chipTactico);
  panel.appendChild(rightHeaderBox);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  const equipTitle = document.createElement("div");
  equipTitle.className = "lbl";
  equipTitle.style.marginBottom = "10px";
  equipTitle.textContent = "Selecciona equipo";

  const eqWrap = document.createElement("div");
  eqWrap.style.display = "flex";
  eqWrap.style.flexDirection = "column";
  eqWrap.style.gap = "10px";

  const bucket = getBucket(state.equipoCategoria);

  getList(state.equipoCategoria).forEach((eq) => {
    const eqId = eq.id;
    const assignedTo = formatEquipoAsignado(eqId);
    const isSelected = state.equipoSelectedItems.includes(eqId);

    const row = document.createElement("div");
    row.className = "item" + (isSelected ? " selected" : "");
    row.style.cursor = assignedTo ? "not-allowed" : "pointer";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "12px";

    const leftWrap = document.createElement("div");
    leftWrap.style.display = "flex";
    leftWrap.style.alignItems = "center";
    leftWrap.style.gap = "12px";

    if (eq.image) {
      const img = document.createElement("img");
      img.src = eq.image;
      img.alt = eq.nombre;
      img.style.width = "54px";
      img.style.height = "54px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "10px";
      img.style.border = "1px solid #d7e3ff";
      leftWrap.appendChild(img);
    }

    const textWrap = document.createElement("div");
    textWrap.style.display = "flex";
    textWrap.style.flexDirection = "column";
    textWrap.style.gap = "4px";

    const left = document.createElement("div");
    left.className = "itemName";
    left.textContent = eq.nombre;

    const meta = document.createElement("div");
    meta.style.fontSize = "12px";
    meta.style.opacity = "0.8";
    meta.textContent = [
      eq.numeroSerie ? `Serie: ${eq.numeroSerie}` : "",
      eq.estado ? `Estado: ${eq.estado}` : ""
    ].filter(Boolean).join(" | ");

    textWrap.appendChild(left);
    textWrap.appendChild(meta);
    leftWrap.appendChild(textWrap);

    const right = document.createElement("div");
    right.className = "badgeRight";
    right.textContent = assignedTo;

    row.appendChild(leftWrap);
    row.appendChild(right);

    row.addEventListener("click", () => {
      if (assignedTo !== "Disponible") return;

      if (isSelected) {
        state.equipoSelectedItems = state.equipoSelectedItems.filter(x => x !== eqId);
      } else {
        state.equipoSelectedItems.push(eqId);
      }
      renderEquipoAsignacion();
    });

    eqWrap.appendChild(row);
  });

  const assignBtn = document.createElement("button");
  assignBtn.className = "btnPrimary";
  assignBtn.textContent = "Asignarle";
  assignBtn.style.marginTop = "12px";

  const canAssign = !!state.equipoSelectedResource && state.equipoSelectedItems.length > 0;
  assignBtn.disabled = !canAssign;

  assignBtn.addEventListener("click", () => {
    if (!state.equipoCategoria) {
      alert("Selecciona una categoría de equipo.");
      return;
    }

    if (!state.equipoSelectedResource || state.equipoSelectedItems.length === 0) {
      alert("Selecciona destino y equipo.");
      return;
    }

    // Mapear destino a ids
    let tipoDestino, idPersonal = null, idVehiculo = null;
    if (state.equipoDestino === "personal") {
      tipoDestino = "personal";
      const parts = state.equipoSelectedResource.split(" - ");
      if (parts.length === 2) {
        const cet = parts[0];
        const personaNombre = parts[1];
        const celulas = state.asignacionCelulas[cet] || [];
        const persona = celulas.find(p => p.nombre === personaNombre);
        if (persona) idPersonal = persona.id;
      }
    } else {
      tipoDestino = "vehiculo";
      const veh = state.vehiclesList.find(v => v.name === state.equipoSelectedResource);
      if (veh) idVehiculo = veh.id;
    }

    if (!idPersonal && !idVehiculo) {
      alert("Destino inválido.");
      return;
    }

    // Asignar usando el service
    state.equipoSelectedItems.forEach(eqId => {
      try {
        asignarEquipo(eqId, tipoDestino, idPersonal, idVehiculo, state.equipoCategoria);
      } catch (e) {
        alert(`Error asignando equipo: ${e.message}`);
      }
    });

    state.equipoSelectedItems = [];
    renderEquipoAsignacion();
  });

  listBox.appendChild(equipTitle);
  listBox.appendChild(eqWrap);
  listBox.appendChild(assignBtn);
  panel.appendChild(listBox);

  btnAccion.onclick = () => {
    state.categoria = null;
    state.pasoPersonal = "home";
    state.equipoCategoria = null;
    state.equipoDestino = null;
    state.equipoSelectedItems = [];
    state.equipoSelectedResource = null;
    state.equipoSelectedCet = null;
    state.equipoSelectedGrupo = null;

    finalizarAsignacionCompleta();
  };
}

export function renderEquipoLeftPersonal() {
  const box = document.createElement("div");
  box.className = "listBox";
  box.style.gap = "12px";

  if (!state.cetSeleccionados.length) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.textContent = "No hay personal disponible.";
    box.appendChild(empty);
    vehiculosLeftEl.appendChild(box);
    return;
  }

  if (!state.equipoSelectedCet || !state.cetSeleccionados.includes(state.equipoSelectedCet)) {
    state.equipoSelectedCet = state.cetSeleccionados[0];
  }

  const cetRow = document.createElement("div");
  cetRow.className = "chipRow";
  cetRow.style.marginBottom = "0";
  cetRow.style.paddingBottom = "0";
  cetRow.style.borderBottom = "none";

  state.cetSeleccionados.forEach((cet) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (state.equipoSelectedCet === cet ? " active" : "");
    chip.textContent = `CET: ${cet}`;

    chip.addEventListener("click", () => {
      state.equipoSelectedCet = cet;
      state.equipoSelectedResource = null;

      const ginfo = state.gruposByCet[cet] || { names: [], map: {} };
      state.equipoSelectedGrupo =
        (ginfo.names && ginfo.names.length > 0) ? ginfo.names[0] : null;

      saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
      renderEquipoAsignacion();
    });

    cetRow.appendChild(chip);
  });

  box.appendChild(cetRow);

  const cet = state.equipoSelectedCet;
  const flotilla = state.flotillaByCet[cet] || "—";
  const ginfo = state.gruposByCet[cet] || { names: [], map: {} };
  const hasGroups = (ginfo.names || []).length > 0;

  const flotillaLbl = document.createElement("div");
  flotillaLbl.className = "lbl";
  flotillaLbl.textContent = "Nombre de la flotilla";
  box.appendChild(flotillaLbl);

  const flotillaChip = document.createElement("div");
  flotillaChip.className = "chip";
  flotillaChip.style.width = "max-content";
  flotillaChip.textContent = flotilla;
  box.appendChild(flotillaChip);

  if (hasGroups) {
    if (!state.equipoSelectedGrupo || !ginfo.names.includes(state.equipoSelectedGrupo)) {
      state.equipoSelectedGrupo = ginfo.names[0];
    }

    const gruposLbl = document.createElement("div");
    gruposLbl.className = "lbl";
    gruposLbl.textContent = "Grupos";
    box.appendChild(gruposLbl);

    const gruposRow = document.createElement("div");
    gruposRow.className = "groupsRow";

    ginfo.names.forEach((gName) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (state.equipoSelectedGrupo === gName ? " active" : "");
      chip.textContent = gName;

      chip.addEventListener("click", () => {
        state.equipoSelectedGrupo = gName;
        state.equipoSelectedResource = null;
        saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
        renderEquipoAsignacion();
      });
      gruposRow.appendChild(chip);
    });

    box.appendChild(gruposRow);
  } else {
    state.equipoSelectedGrupo = null;
  }

  const personasWrap = document.createElement("div");
  personasWrap.style.display = "flex";
  personasWrap.style.flexDirection = "column";
  personasWrap.style.gap = "10px";
  personasWrap.style.maxHeight = "340px";
  personasWrap.style.overflowY = "auto";

  let personas = [];

  if (hasGroups && state.equipoSelectedGrupo) {
    personas = Array.from(ginfo.map[state.equipoSelectedGrupo] || []);
  } else {
    personas = (state.asignacionCelulas[cet] || []).map(p => p.nombre ?? p);
  }

  if (!personas.length) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.textContent = "No hay personas en esta selección.";
    personasWrap.appendChild(empty);
  } else {
    personas.forEach((persona) => {
      const key = `${cet} - ${persona}`;
      const row = document.createElement("div");
      row.className = "item" + (state.equipoSelectedResource === key ? " selected" : "");
      row.style.cursor = "pointer";

      const left = document.createElement("div");
      left.className = "itemName";
      left.textContent = persona;

      row.appendChild(left);

      row.addEventListener("click", () => {
        state.equipoSelectedResource = key;
        saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
        renderEquipoAsignacion();
      });

      personasWrap.appendChild(row);
    });
  }

  box.appendChild(personasWrap);
  vehiculosLeftEl.appendChild(box);
}

export function renderEquipoLeftVehiculo() {
  const box = document.createElement("div");
  box.className = "listBox";

  const usados = getVehiclesUsedInAssignments();

  if (usados.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.textContent = "No hay vehículos asignados todavía.";
    box.appendChild(empty);
    vehiculosLeftEl.appendChild(box);
    return;
  }

  usados.forEach(v => {
    const resumen = getResumenVehiculoDetallado(v.id);

    const card = document.createElement("div");
    card.className = "item" + (state.equipoSelectedResource === v.name ? " selected" : "");
    card.style.display = "flex";
    card.style.alignItems = "flex-start";
    card.style.gap = "12px";
    card.style.cursor = "pointer";

    if (v.image) {
      const img = document.createElement("img");
      img.src = v.image;
      img.alt = v.name;
      img.style.width = "72px";
      img.style.height = "72px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "12px";
      img.style.border = "1px solid #d7e3ff";
      card.appendChild(img);
    }

    const content = document.createElement("div");
    content.style.display = "flex";
    content.style.flexDirection = "column";
    content.style.gap = "6px";
    content.style.flex = "1";

    const title = document.createElement("div");
    title.className = "itemName";
    title.textContent = v.name;

    const sub = document.createElement("div");
    sub.style.fontSize = "12px";
    sub.style.opacity = "0.8";
    sub.textContent = [
      v.serialNumber ? `Código: ${v.serialNumber}` : "",
      v.status ? `Estado: ${v.status}` : ""
    ].filter(Boolean).join(" | ");

    const info1 = document.createElement("div");
    info1.textContent = `Flotilla: ${resumen.flotilla}`;

    const info2 = document.createElement("div");
    info2.textContent = `Grupo: ${resumen.grupo}`;

    const info3 = document.createElement("div");
    info3.textContent = `Personas: ${resumen.personas}`;

    content.appendChild(title);
    content.appendChild(sub);
    content.appendChild(info1);
    content.appendChild(info2);
    content.appendChild(info3);

    card.appendChild(content);

    card.addEventListener("click", () => {
      state.equipoSelectedResource = v.name;
      saveAsignacionActual();
      renderEquipoAsignacion();
    });

    box.appendChild(card);
  });

  vehiculosLeftEl.appendChild(box);
}
