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
  showDashboardButton,
  restoreScrollTop
} from "../../core/ui.js";
import { renderHome } from "../../views/home.view.js";
import { saveOperacionActual, syncOperacionCompleta } from "../operacion/operacion.service.js";
import { readObjectStorage } from "../../core/storage.js";
import { STORAGE_OPERACION_ACTUAL } from "../../core/constants.js";
import {
  asignarDispositivo,
  removerAsignacionDispositivo,
  getAsignacionDispositivo,
  getDestinoDispositivo,
  getNombrePersonalById
} from "./dispositivos.service.js";

const logAlert = (message) => {
  if (message) console.warn(message);
};

function assignmentMatchesResource(asignacion, resourceKey) {
  if (!asignacion || !resourceKey) return false;
  const personaNombre = getNombrePersonalById(asignacion.id_personal);
  if (!personaNombre) return false;

  if (state.cetSeleccionados.includes(personaNombre)) {
    return resourceKey === `${personaNombre} - CET: ${personaNombre}`;
  }

  for (const cet of state.cetSeleccionados) {
    const celulas = state.asignacionCelulas[cet] || [];
    if (celulas.includes(personaNombre)) {
      return resourceKey === `${cet} - ${personaNombre}`;
    }
  }

  return false;
}

function destinoActualCoincide(asignacion) {
  return assignmentMatchesResource(asignacion, state.dispositivoSelectedResource);
}

function enfocarDestinoAsignado(asignacion) {
  const personaNombre = getNombrePersonalById(asignacion?.id_personal);
  if (!personaNombre) return;

  if (state.cetSeleccionados.includes(personaNombre)) {
    state.dispositivoSelectedCet = personaNombre;
    state.dispositivoSelectedGrupo = null;
    state.dispositivoSelectedResource = `${personaNombre} - CET: ${personaNombre}`;
    return;
  }

  for (const cet of state.cetSeleccionados) {
    const celulas = state.asignacionCelulas[cet] || [];
    if (!celulas.includes(personaNombre)) continue;
    state.dispositivoSelectedCet = cet;
    state.dispositivoSelectedGrupo = getGrupoDeCelula(cet, personaNombre) || null;
    state.dispositivoSelectedResource = `${cet} - ${personaNombre}`;
    return;
  }
}

function removerAsignacionDeSeleccionActual(resourceKey) {
  let removioAlgo = false;

  state.dispositivoSelectedItems.forEach(idDispositivo => {
    const asignacion = getAsignacionDispositivo(idDispositivo);
    if (!assignmentMatchesResource(asignacion, resourceKey)) return;
    removioAlgo = removerAsignacionDispositivo(idDispositivo) || removioAlgo;
    if (!state.dispositivosLiberadosLocalmente.includes(idDispositivo)) {
      state.dispositivosLiberadosLocalmente.push(idDispositivo);
    }
  });

  return removioAlgo;
}

async function finalizarAsignacionCompleta() {
  saveOperacionActual();

  btnAccion.disabled = true;
  btnAccion.textContent = "Sincronizando...";

  const opLoc = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
  if (opLoc.id) {
    try {
      await syncOperacionCompleta(opLoc.id);
    } catch (e) {
      console.error(e);
      btnAccion.disabled = false;
      btnAccion.textContent = "Finalizar";
      return;
    }
  }

  renderHome();
  showDashboardButton();
}

function getIdPersonalFromResource(resourceKey) {
  if (!resourceKey) return null;
  const parts = resourceKey.split(" - ");
  if (parts.length !== 2) return null;

  const personaNombre = parts[1].replace(/^CET: /, "");
  return state.personalMap[personaNombre] || state.personalMap[parts[1]] || null;
}

export function renderDispositivoAsignacion() {
  clearPanel();
  showBack(true);
  showVehiculosLeftPanel("Asignación de dispositivos");

  setHeader("Selecciona dispositivo", "");
  setAccion("Finalizar", false);

  vehiculosLeftEl.innerHTML = "";
  renderDispositivoLeftPersonal();

  const title = document.createElement("div");
  title.className = "lbl";
  title.style.marginBottom = "10px";
  title.textContent = "Dispositivos disponibles";

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "10px";
  wrap.style.maxHeight = "390px";
  wrap.style.overflowY = "auto";
  wrap.addEventListener("scroll", () => {
    state.dispositivosRightScrollTop = wrap.scrollTop;
  });

  state.dispositivosList.forEach((disp) => {
    const asigActual = getAsignacionDispositivo(disp.id);
    const assignedInFlow = getDestinoDispositivo(asigActual);
    const isAssignedInFlow = !!asigActual;
    const fueLiberadoLocalmente = state.dispositivosLiberadosLocalmente.includes(disp.id);
    const isEnOtraOperacion = !isAssignedInFlow && !fueLiberadoLocalmente && disp.estado && disp.estado !== "DISPONIBLE";
    const isSelected = state.dispositivoSelectedItems.includes(disp.id);

    const row = document.createElement("div");
    row.className = "item" + (isSelected ? " selected" : "");
    row.style.cursor = isEnOtraOperacion ? "not-allowed" : "pointer";
    if (isEnOtraOperacion) row.style.opacity = "0.55";

    const textWrap = document.createElement("div");
    textWrap.style.display = "flex";
    textWrap.style.flexDirection = "column";
    textWrap.style.gap = "4px";

    const name = document.createElement("div");
    name.className = "itemName";
    name.textContent = [disp.tipo, disp.marca, disp.modelo].filter(Boolean).join(" ");

    const meta = document.createElement("div");
    meta.style.fontSize = "12px";
    meta.style.opacity = "0.8";
    meta.textContent = [
      disp.numeroTelefono ? `Tel: ${disp.numeroTelefono}` : "",
      disp.imei ? `IMEI: ${disp.imei}` : "",
      disp.numeroSerie ? `Serie: ${disp.numeroSerie}` : ""
    ].filter(Boolean).join(" | ");

    textWrap.appendChild(name);
    textWrap.appendChild(meta);

    const badge = document.createElement("div");
    badge.className = "badgeRight";
    badge.textContent = isAssignedInFlow
      ? assignedInFlow
      : (isEnOtraOperacion ? "En otra operación" : "Disponible");

    row.appendChild(textWrap);
    row.appendChild(badge);

    row.addEventListener("click", () => {
      if (isEnOtraOperacion) return;

      if (isSelected) {
        state.dispositivoSelectedItems = state.dispositivoSelectedItems.filter(x => x !== disp.id);
        if (asigActual) {
          removerAsignacionDispositivo(disp.id);
          if (!state.dispositivosLiberadosLocalmente.includes(disp.id)) {
            state.dispositivosLiberadosLocalmente.push(disp.id);
          }
          if (state.dispositivoSelectedItems.length === 0) {
            state.dispositivoSelectedResource = null;
          }
        }
      } else {
        state.dispositivoSelectedItems.push(disp.id);
        if (asigActual) enfocarDestinoAsignado(asigActual);
      }

      saveAsignacionActual();
      renderDispositivoAsignacion();
    });

    wrap.appendChild(row);
  });

  const assignBtn = document.createElement("button");
  assignBtn.className = "btnPrimary";
  assignBtn.textContent = "Asignarle";
  assignBtn.style.marginTop = "12px";
  assignBtn.disabled = !(
    state.dispositivoSelectedResource &&
    state.dispositivoSelectedItems.length > 0 &&
    state.dispositivoSelectedItems.some(id => !destinoActualCoincide(getAsignacionDispositivo(id)))
  );

  assignBtn.addEventListener("click", () => {
    const idPersonal = getIdPersonalFromResource(state.dispositivoSelectedResource);
    if (!idPersonal) {
      logAlert("Selecciona una persona válida.");
      return;
    }

    state.dispositivoSelectedItems.forEach(idDispositivo => {
      try {
        removerAsignacionDispositivo(idDispositivo);
        asignarDispositivo(idDispositivo, idPersonal);
        state.dispositivosLiberadosLocalmente = state.dispositivosLiberadosLocalmente.filter(id => id !== idDispositivo);
      } catch (e) {
        logAlert(`Error asignando dispositivo: ${e.message}`);
      }
    });

    state.dispositivoSelectedItems = [];
    renderDispositivoAsignacion();
  });

  const footer = document.createElement("div");
  footer.className = "rightFooter";
  footer.appendChild(assignBtn);

  listBox.appendChild(title);
  listBox.appendChild(wrap);
  panel.appendChild(listBox);
  panel.appendChild(footer);
  restoreScrollTop(wrap, state.dispositivosRightScrollTop || 0);

  btnAccion.onclick = async () => {
    state.categoria = null;
    state.pasoPersonal = "home";
    state.dispositivoSelectedItems = [];
    state.dispositivoSelectedResource = null;
    state.dispositivoSelectedCet = null;
    state.dispositivoSelectedGrupo = null;

    await finalizarAsignacionCompleta();
  };
}

export function renderDispositivoLeftPersonal() {
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

  if (!state.dispositivoSelectedCet || !state.cetSeleccionados.includes(state.dispositivoSelectedCet)) {
    state.dispositivoSelectedCet = state.cetSeleccionados[0];
  }

  const cet = state.dispositivoSelectedCet;
  const ginfo = state.gruposByCet[cet] || { names: [], map: {} };

  const cetRow = document.createElement("div");
  cetRow.className = "chipRow";
  cetRow.style.marginBottom = "12px";

  state.cetSeleccionados.forEach((c) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (state.dispositivoSelectedCet === c ? " active" : "");
    chip.textContent = state.flotillaByCet[c] || c;
    chip.addEventListener("click", () => {
      state.dispositivoSelectedCet = c;
      state.dispositivoSelectedResource = null;
      state.dispositivoSelectedGrupo = null;
      saveAsignacionActual();
      renderDispositivoAsignacion();
    });
    cetRow.appendChild(chip);
  });
  box.appendChild(cetRow);

  const headerBox = document.createElement("div");
  headerBox.style.padding = "0 0 10px";
  headerBox.style.borderBottom = "1px solid #d7e3ff";
  headerBox.style.marginBottom = "10px";

  const cetLbl = document.createElement("div");
  cetLbl.className = "lbl";
  cetLbl.style.marginBottom = "8px";
  cetLbl.textContent = "CET a cargo";
  headerBox.appendChild(cetLbl);

  const cetKey = `${cet} - CET: ${cet}`;
  const cetItem = document.createElement("div");
  cetItem.className = "item" + (state.dispositivoSelectedResource === cetKey ? " selected" : "");
  cetItem.style.cursor = "pointer";
  cetItem.textContent = `CET: ${cet}`;
  cetItem.addEventListener("click", () => {
    if (state.dispositivoSelectedResource === cetKey) {
      removerAsignacionDeSeleccionActual(cetKey);
      state.dispositivoSelectedResource = null;
    } else {
      state.dispositivoSelectedResource = cetKey;
    }
    saveAsignacionActual();
    renderDispositivoAsignacion();
  });
  headerBox.appendChild(cetItem);

  const celulasParaCet = (state.asignacionCelulas[cet] || []).map(p => p.nombre ?? p);
  const cellsSinGrupo = celulasParaCet.filter(c => !getGrupoDeCelula(cet, c));
  const hasUnassigned = cellsSinGrupo.length > 0;
  const hasGroups = (ginfo.names || []).length > 0;

  if (hasGroups || hasUnassigned) {
    const gruposLbl = document.createElement("div");
    gruposLbl.className = "lbl";
    gruposLbl.style.margin = "12px 0 8px";
    gruposLbl.textContent = "Grupos";
    headerBox.appendChild(gruposLbl);

    const gruposRow = document.createElement("div");
    gruposRow.className = "groupsRow";

    ginfo.names.forEach((gName) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (state.dispositivoSelectedGrupo === gName ? " active" : "");
      chip.textContent = gName;
      chip.addEventListener("click", () => {
        state.dispositivoSelectedGrupo = gName;
        state.dispositivoSelectedResource = null;
        saveAsignacionActual();
        renderDispositivoAsignacion();
      });
      gruposRow.appendChild(chip);
    });

    if (hasUnassigned) {
      const sinGrupoBtn = document.createElement("button");
      sinGrupoBtn.className = "chip" + (state.dispositivoSelectedGrupo === null ? " active" : "");
      sinGrupoBtn.textContent = "Sin grupo";
      sinGrupoBtn.addEventListener("click", () => {
        state.dispositivoSelectedGrupo = null;
        state.dispositivoSelectedResource = null;
        saveAsignacionActual();
        renderDispositivoAsignacion();
      });
      gruposRow.appendChild(sinGrupoBtn);
    }

    if (hasGroups && !hasUnassigned && state.dispositivoSelectedGrupo === null) {
      state.dispositivoSelectedGrupo = ginfo.names[0];
    }

    headerBox.appendChild(gruposRow);
  }

  box.appendChild(headerBox);

  const personasWrap = document.createElement("div");
  personasWrap.style.display = "flex";
  personasWrap.style.flexDirection = "column";
  personasWrap.style.gap = "10px";
  personasWrap.style.maxHeight = "340px";
  personasWrap.style.overflowY = "auto";
  personasWrap.addEventListener("scroll", () => {
    state.dispositivosLeftScrollTop = personasWrap.scrollTop;
  });

  const personas = state.dispositivoSelectedGrupo
    ? Array.from(ginfo.map[state.dispositivoSelectedGrupo] || [])
    : cellsSinGrupo;

  if (!personas.length) {
    const empty = document.createElement("div");
    empty.className = "item";
    empty.style.opacity = "0.6";
    empty.textContent = "No hay personas en esta selección.";
    personasWrap.appendChild(empty);
  } else {
    personas.forEach((persona) => {
      const key = `${cet} - ${persona}`;
      const row = document.createElement("div");
      row.className = "item" + (state.dispositivoSelectedResource === key ? " selected" : "");
      row.style.cursor = "pointer";
      row.textContent = persona;
      row.addEventListener("click", () => {
        if (state.dispositivoSelectedResource === key) {
          removerAsignacionDeSeleccionActual(key);
          state.dispositivoSelectedResource = null;
        } else {
          state.dispositivoSelectedResource = key;
        }
        saveAsignacionActual();
        renderDispositivoAsignacion();
      });
      personasWrap.appendChild(row);
    });
  }

  box.appendChild(personasWrap);
  vehiculosLeftEl.appendChild(box);
  restoreScrollTop(personasWrap, state.dispositivosLeftScrollTop || 0);
}
