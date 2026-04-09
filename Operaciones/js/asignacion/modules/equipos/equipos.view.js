import { panel, btnAccion, vehiculosLeftEl } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { getGrupoDeCelula } from "../personal/personal.helpers.js";
import { saveAsignacionActual } from "../asignacion/asignacion.service.js";
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
import { saveOperacionActual, syncOperacionCompleta } from "../operacion/operacion.service.js";
import { readObjectStorage } from "../../core/storage.js";
import { STORAGE_OPERACION_ACTUAL } from "../../core/constants.js";

async function finalizarAsignacionCompleta() {
  saveOperacionActual(); 
  
  btnAccion.disabled = true;
  btnAccion.textContent = "Sincronizando...";

  const opLoc = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
  if (opLoc.id) {
    try {
      await syncOperacionCompleta(opLoc.id);
    } catch (e) {
      alert("Error al sincronizar operación: " + e.message);
      console.error(e);
      btnAccion.disabled = false;
      btnAccion.textContent = "Finalizar";
      return; // Do not go home if failed
    }
  }

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
    state.equipoSelectedGrupo = null;

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
    const isEnOperacion = eq.estado && eq.estado !== "DISPONIBLE";
    const assignedInFlow = formatEquipoAsignado(eqId); // "Disponible" o destino del flujo actual
    const isAssignedInFlow = assignedInFlow !== "Disponible";
    const isDisabled = isEnOperacion || isAssignedInFlow;
    const badgeText = isEnOperacion ? "En operación" : assignedInFlow;
    const isSelected = !isDisabled && state.equipoSelectedItems.includes(eqId);

    const row = document.createElement("div");
    row.className = "item" + (isSelected ? " selected" : "");
    row.style.cursor = isDisabled ? "not-allowed" : "pointer";
    if (isDisabled) row.style.opacity = "0.55";
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
    right.textContent = badgeText;
    if (isEnOperacion) {
      right.style.color = "#c0392b";
      right.style.fontWeight = "700";
    }

    row.appendChild(leftWrap);
    row.appendChild(right);

    row.addEventListener("click", () => {
      if (isDisabled) return;

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
        const nombreNorm = personaNombre.replace(/^CET: /, "");
        const idFromMap = state.personalMap[nombreNorm] || state.personalMap[personaNombre];
        if (idFromMap) idPersonal = idFromMap;
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

  btnAccion.onclick = async () => {
    state.categoria = null;
    state.pasoPersonal = "home";
    state.equipoCategoria = null;
    state.equipoDestino = null;
    state.equipoSelectedItems = [];
    state.equipoSelectedResource = null;
    state.equipoSelectedCet = null;
    state.equipoSelectedGrupo = null;

    await finalizarAsignacionCompleta();
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
      state.equipoSelectedGrupo = null;
      saveAsignacionActual();
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

  const gruposLbl = document.createElement("div");
  gruposLbl.className = "lbl";
  gruposLbl.textContent = "Grupos";
  box.appendChild(gruposLbl);

  const gruposRow = document.createElement("div");
  gruposRow.className = "groupsRow";

  // Botones de subgrupos existentes
  ginfo.names.forEach((gName) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (state.equipoSelectedGrupo === gName ? " active" : "");
    chip.textContent = gName;
    chip.addEventListener("click", () => {
      state.equipoSelectedGrupo = gName;
      state.equipoSelectedResource = null;
      saveAsignacionActual();
      renderEquipoAsignacion();
    });
    gruposRow.appendChild(chip);
  });

  // Botón "Sin grupo"
  const sinGrupoBtn = document.createElement("button");
  sinGrupoBtn.className = "chip" + (state.equipoSelectedGrupo === null ? " active" : "");
  sinGrupoBtn.textContent = "Sin grupo";
  sinGrupoBtn.addEventListener("click", () => {
    state.equipoSelectedGrupo = null;
    state.equipoSelectedResource = null;
    saveAsignacionActual();
    renderEquipoAsignacion();
  });
  gruposRow.appendChild(sinGrupoBtn);

  box.appendChild(gruposRow);

  const personasWrap = document.createElement("div");
  personasWrap.style.display = "flex";
  personasWrap.style.flexDirection = "column";
  personasWrap.style.gap = "10px";
  personasWrap.style.maxHeight = "340px";
  personasWrap.style.overflowY = "auto";

  let personas = [];

  if (state.equipoSelectedGrupo) {
    personas = Array.from(ginfo.map[state.equipoSelectedGrupo] || []);
  } else {
    // Modo "Sin grupo" o mando directo
    // Siempre incluimos al CET solo en la lista de mando directo para equipos
    const id_cet = state.personalMap[cet];
    if (id_cet) {
      personas.push(`CET: ${cet}`);
    }

    const celulasParaCet = (state.asignacionCelulas[cet] || []).map(p => p.nombre ?? p);
    const cellsSinGrupo = celulasParaCet.filter(c => !getGrupoDeCelula(cet, c));
    personas = [...personas, ...cellsSinGrupo];
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
