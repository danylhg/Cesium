import { panel, btnAccion } from "../../core/dom.js";
import { state } from "../../core/state.js";
import {
  showOperacionInfo,
  setHeader,
  setAccion,
  showBack,
  clearPanel,
  getScrollTopInPanel,
  restoreScrollTop
} from "../../core/ui.js";
import { DEFAULT_GROUP_INFO } from "../../core/constants.js";
import { celulaRow } from "./personal.helpers.js";
import { saveAsignacionActual } from "../asignacion/asignacion.service.js";
import { abrirModalCrearGrupo } from "./grupos.modal.js";
import { renderVehiculos } from "../vehiculos/vehiculos.view.js";

export function renderCUT() {
  showOperacionInfo();
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  setHeader("Comandante de Unidad Táctica", "");
  setAccion("Siguiente", !state.cutSeleccionado);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  const search = document.createElement("input");
  search.className = "inp";
  search.placeholder = "Buscar CUT...";
  search.style.marginBottom = "10px";

  const data = state.cutList.slice();

  const rowsWrap = document.createElement("div");
  rowsWrap.style.display = "flex";
  rowsWrap.style.flexDirection = "column";
  rowsWrap.style.gap = "10px";

  function paint(filterText) {
    const ft = (filterText || "").toLowerCase().trim();
    rowsWrap.innerHTML = "";

    data
      .filter(n => !ft || n.toLowerCase().includes(ft))
      .forEach((name) => {
        const row = document.createElement("div");
        row.className = "item" + (state.cutSeleccionado === name ? " selected" : "");

        const left = document.createElement("div");
        left.className = "itemName";
        left.textContent = name;
        left.style.cursor = "pointer";
        left.addEventListener("click", () => {
          state.cutSeleccionado = name;
          state.cetSeleccionados = [];
          state.cetActivoIndex = 0;
          state.asignacionCelulas = {};
          saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
          renderCUT();
        });

        row.appendChild(left);
        rowsWrap.appendChild(row);
      });
  }

  search.addEventListener("input", () => paint(search.value));

  listBox.appendChild(search);
  listBox.appendChild(rowsWrap);
  panel.appendChild(listBox);

  paint("");
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = () => {
    if (!state.cutSeleccionado) return;
    saveAsignacionActual();
    state.pasoPersonal = "cet";
    renderCET();
  };
}

export function renderCET() {
  showOperacionInfo();
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  setHeader("Comandante de Equipo de Trabajo", "");
  setAccion("Siguiente", state.cetSeleccionados.length === 0);

  const chips = document.createElement("div");
  chips.className = "chipRow";

  const cutChip = document.createElement("div");
  cutChip.className = "chip";
  cutChip.textContent = `CUT: ${state.cutSeleccionado || "—"}`;
  chips.appendChild(cutChip);

  state.cetSeleccionados.forEach((n) => {
    const c = document.createElement("div");
    c.className = "chip active";
    c.textContent = `CET: ${n}`;
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  const search = document.createElement("input");
  search.className = "inp";
  search.placeholder = "Buscar CET...";
  search.style.marginBottom = "10px";

  const data = state.cetList.slice();

  const rowsWrap = document.createElement("div");
  rowsWrap.style.display = "flex";
  rowsWrap.style.flexDirection = "column";
  rowsWrap.style.gap = "10px";

  function paint(filterText) {
    const ft = (filterText || "").toLowerCase().trim();
    rowsWrap.innerHTML = "";

    data
      .filter(n => !ft || n.toLowerCase().includes(ft))
      .forEach((name) => {
        const isSel = state.cetSeleccionados.includes(name);

        const row = document.createElement("div");
        row.className = "item" + (isSel ? " selected" : "");

        const left = document.createElement("div");
        left.className = "itemName";
        left.textContent = name;
        left.style.cursor = "pointer";
        left.addEventListener("click", () => {
          if (isSel) {
            state.cetSeleccionados = state.cetSeleccionados.filter(n => n !== name);
          } else {
            state.cetSeleccionados.push(name);

            if (!state.flotillaByCet[name]) state.flotillaByCet[name] = "";
            if (!state.searchByCet[name]) state.searchByCet[name] = "";
            if (!state.gruposByCet[name]) {
              state.gruposByCet[name] = { ...DEFAULT_GROUP_INFO, map: {} };
            } else {
              if (state.gruposByCet[name].idx === undefined) state.gruposByCet[name].idx = 0;
              if (state.gruposByCet[name].vehActive === undefined) state.gruposByCet[name].vehActive = null;
            }
          }
          saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
          renderCET();
        });

        row.appendChild(left);
        rowsWrap.appendChild(row);
      });
  }

  search.addEventListener("input", () => paint(search.value));

  listBox.appendChild(search);
  listBox.appendChild(rowsWrap);
  panel.appendChild(listBox);

  paint("");
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = () => {
    if (state.cetSeleccionados.length === 0) return;

    state.cetSeleccionados.forEach(n => {
      if (!state.asignacionCelulas[n]) state.asignacionCelulas[n] = [];
      if (state.flotillaByCet[n] === undefined) state.flotillaByCet[n] = "";
      if (state.searchByCet[n] === undefined) state.searchByCet[n] = "";
      if (!state.gruposByCet[n]) state.gruposByCet[n] = { ...DEFAULT_GROUP_INFO, map: {} };
      if (state.gruposByCet[n].idx === undefined) state.gruposByCet[n].idx = 0;
      if (state.gruposByCet[n].vehActive === undefined) state.gruposByCet[n].vehActive = null;
    });

    saveAsignacionActual();

    state.pasoPersonal = "celulas";
    state.cetActivoIndex = 0;

    const firstCet = state.cetSeleccionados[0];
    const gi = state.gruposByCet[firstCet];
    if (gi && (gi.names || []).length > 0) {
      gi.idx = Math.max(0, Math.min(gi.idx || 0, gi.names.length - 1));
      gi.active = gi.names[gi.idx];
      if (!gi.vehActive) gi.vehActive = gi.active;
    }

    renderCelulas();
  };
}

export function pintarChipsGrupos(cet, container) {
  container.innerHTML = "";

  const info = state.gruposByCet[cet] || { ...DEFAULT_GROUP_INFO, map: {} };
  if (info.idx === undefined) info.idx = 0;
  if (info.vehActive === undefined) info.vehActive = null;

  const hasGroups = (info.names || []).length > 0;
  if (hasGroups) {
    info.idx = Math.max(0, Math.min(info.idx, info.names.length - 1));
    if (!info.active) info.active = info.names[info.idx];
    if (info.active && !info.names.includes(info.active)) {
      info.active = info.names[info.idx];
    }
    if (!info.vehActive) info.vehActive = info.active;
  } else {
    info.active = null;
    info.idx = 0;
    info.vehActive = null;
  }

  state.gruposByCet[cet] = info;

  info.names.forEach((gName, index) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (info.active === gName ? " active" : "");
    chip.textContent = gName;

    chip.addEventListener("click", () => {
      info.idx = index;
      info.active = gName;
      saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
      renderCelulas();
    });

    container.appendChild(chip);
  });
}

export function renderCelulas() {
  showOperacionInfo();
  const prevScroll = getScrollTopInPanel();
  clearPanel();
  showBack(true);

  const cetActivo = state.cetSeleccionados[state.cetActivoIndex];
  const asignadas = state.asignacionCelulas[cetActivo] || [];

  if (!state.gruposByCet[cetActivo]) {
    state.gruposByCet[cetActivo] = { ...DEFAULT_GROUP_INFO, map: {} };
  }

  const info = state.gruposByCet[cetActivo];
  if (info.idx === undefined) info.idx = 0;
  if (info.vehActive === undefined) info.vehActive = null;

  const hasGroups = (info.names || []).length > 0;
  if (hasGroups) {
    info.idx = Math.max(0, Math.min(info.idx, info.names.length - 1));
    if (!info.active) info.active = info.names[info.idx];
    if (info.active && !info.names.includes(info.active)) {
      info.active = info.names[info.idx];
    }
    if (!info.vehActive) info.vehActive = info.active;
  } else {
    info.active = null;
    info.idx = 0;
    info.vehActive = null;
  }

  setHeader("Células", "");

  const lastCet = state.cetActivoIndex === state.cetSeleccionados.length - 1;
  const lastGroup = !hasGroups ? true : (info.idx === info.names.length - 1);
  setAccion((lastCet && lastGroup) ? "Finalizar" : "Siguiente", false);

  const chips = document.createElement("div");
  chips.className = "chipRow";

  const cutChip = document.createElement("div");
  cutChip.className = "chip";
  cutChip.textContent = `CUT: ${state.cutSeleccionado || "—"}`;
  chips.appendChild(cutChip);

  state.cetSeleccionados.forEach((n, i) => {
    const c = document.createElement("div");
    c.className = "chip" + (i === state.cetActivoIndex ? " active" : "");
    c.textContent = `CET: ${n}`;
    c.addEventListener("click", () => {
      state.cetActivoIndex = i;

      const gi = state.gruposByCet[n];
      if (gi) {
        if (gi.idx === undefined) gi.idx = 0;
        if (gi.vehActive === undefined) gi.vehActive = null;

        if ((gi.names || []).length > 0) {
          gi.idx = Math.max(0, Math.min(gi.idx, gi.names.length - 1));
          gi.active = gi.names[gi.idx];
          if (!gi.vehActive) gi.vehActive = gi.active;
        } else {
          gi.idx = 0;
          gi.active = null;
          gi.vehActive = null;
        }
      }

      saveAsignacionActual();
      renderCelulas();
    });
    chips.appendChild(c);
  });

  panel.appendChild(chips);

  const listBox = document.createElement("div");
  listBox.className = "listBox";

  const sticky = document.createElement("div");
  sticky.className = "stickyTop";

  const flotillaRow = document.createElement("div");
  flotillaRow.className = "flotillaRow";

  const flotWrap = document.createElement("div");
  flotWrap.style.flex = "1";

  const flotLbl = document.createElement("div");
  flotLbl.className = "lbl";
  flotLbl.style.marginBottom = "6px";
  flotLbl.textContent = "Nombre de la flotilla";

  const flotInp = document.createElement("input");
  flotInp.className = "inp";
  flotInp.value = state.flotillaByCet[cetActivo] || "";
  flotInp.placeholder = "";

  flotInp.addEventListener("input", () => {
    state.flotillaByCet[cetActivo] = flotInp.value;
    saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
  });

  flotWrap.appendChild(flotLbl);
  flotWrap.appendChild(flotInp);

  const btnCrearGrupo = document.createElement("button");
  btnCrearGrupo.className = "btnSoft";
  btnCrearGrupo.textContent = "Crear grupo";
  btnCrearGrupo.addEventListener("click", () => abrirModalCrearGrupo(cetActivo));

  flotillaRow.appendChild(flotWrap);
  flotillaRow.appendChild(btnCrearGrupo);

  const groupsRow = document.createElement("div");
  groupsRow.className = "groupsRow";
  pintarChipsGrupos(cetActivo, groupsRow);

  const searchInp = document.createElement("input");
  searchInp.className = "inp";
  searchInp.placeholder = "Buscar células...";
  searchInp.value = state.searchByCet[cetActivo] || "";

  sticky.appendChild(flotillaRow);
  sticky.appendChild(groupsRow);
  sticky.appendChild(searchInp);

  listBox.appendChild(sticky);

  const rowsWrap = document.createElement("div");
  rowsWrap.style.display = "flex";
  rowsWrap.style.flexDirection = "column";
  rowsWrap.style.gap = "10px";

  const yaUsadas = new Set();
  state.cetSeleccionados.forEach((cet, i) => {
    if (i === state.cetActivoIndex) return;
    (state.asignacionCelulas[cet] || []).forEach(x => yaUsadas.add(x));
  });

  function paintCells() {
    const term = (state.searchByCet[cetActivo] || "").toLowerCase().trim();
    rowsWrap.innerHTML = "";

    state.celulasList
      .filter(cel => !term || cel.toLowerCase().includes(term))
      .forEach((cel) => {
        const enEste = asignadas.includes(cel);
        const bloqueada = yaUsadas.has(cel);

        const row = celulaRow({
          name: cel,
          selected: enEste,
          disabled: bloqueada,
          status: bloqueada ? "Asignado" : (enEste ? "En este CET" : "Disponible"),
          onToggle: () => {
            if (bloqueada) return;

            const grupoInfo = state.gruposByCet[cetActivo];
            const grupoActivo = grupoInfo?.active || null;

            if (grupoActivo) {
              if (!grupoInfo.map[grupoActivo]) grupoInfo.map[grupoActivo] = new Set();

              if (enEste) {
                state.asignacionCelulas[cetActivo] = asignadas.filter(x => x !== cel);
                Object.keys(grupoInfo.map).forEach(g => grupoInfo.map[g]?.delete(cel));
              } else {
                state.asignacionCelulas[cetActivo] = [...asignadas, cel];
                grupoInfo.map[grupoActivo].add(cel);
              }
            } else {
              if (enEste) {
                state.asignacionCelulas[cetActivo] = asignadas.filter(x => x !== cel);
              } else {
                state.asignacionCelulas[cetActivo] = [...asignadas, cel];
              }
            }

            saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
            renderCelulas();
          }
        });

        rowsWrap.appendChild(row);
      });
  }

  searchInp.addEventListener("input", () => {
    state.searchByCet[cetActivo] = searchInp.value;
    saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
    paintCells();
  });

  listBox.appendChild(rowsWrap);
  panel.appendChild(listBox);

  paintCells();
  restoreScrollTop(listBox, prevScroll);

  btnAccion.onclick = () => {
    const gi = state.gruposByCet[cetActivo] || { ...DEFAULT_GROUP_INFO, map: {} };
    const has = (gi.names || []).length > 0;

    if (has) {
      if (gi.idx < gi.names.length - 1) {
        gi.idx += 1;
        gi.active = gi.names[gi.idx];
        if (!gi.vehActive) gi.vehActive = gi.active;
        saveAsignacionActual();
        renderCelulas();
        return;
      }

      if (state.cetActivoIndex < state.cetSeleccionados.length - 1) {
        state.cetActivoIndex += 1;
        const nextCet = state.cetSeleccionados[state.cetActivoIndex];
        const ngi = state.gruposByCet[nextCet];
        if (ngi) {
          if (ngi.idx === undefined) ngi.idx = 0;
          if (ngi.vehActive === undefined) ngi.vehActive = null;
          if ((ngi.names || []).length > 0) {
            ngi.idx = Math.max(0, Math.min(ngi.idx, ngi.names.length - 1));
            ngi.active = ngi.names[ngi.idx];
            if (!ngi.vehActive) ngi.vehActive = ngi.active;
          } else {
            ngi.idx = 0;
            ngi.active = null;
            ngi.vehActive = null;
          }
        }
        saveAsignacionActual();
        renderCelulas();
        return;
      }

      state.cetActivoIndexVeh = 0;
      state.selectedVehicle = null;
      state.selectedCells = [];
      state.pasoPersonal = "vehiculos";
      saveAsignacionActual();
      renderVehiculos();
      return;
    }

    if (state.cetActivoIndex < state.cetSeleccionados.length - 1) {
      state.cetActivoIndex += 1;
      saveAsignacionActual();
      renderCelulas();
    } else {
      state.cetActivoIndexVeh = 0;
      state.selectedVehicle = null;
      state.selectedCells = [];
      state.pasoPersonal = "vehiculos";
      saveAsignacionActual();
      renderVehiculos();
    }
  };
}
