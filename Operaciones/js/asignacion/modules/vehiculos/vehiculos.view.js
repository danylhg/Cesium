import { panel, btnAccion, vehiculosLeftEl } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { DEFAULT_GROUP_INFO, STORAGE_OPERACION_ACTUAL } from "../../core/constants.js";
import { readObjectStorage, writeStorage } from "../../core/storage.js";
import {
  clearPanel,
  showBack,
  showVehiculosLeftPanel,
  setHeader,
  setAccion,
  restoreScrollTop
} from "../../core/ui.js";
import { getGrupoDeCelula } from "../personal/personal.helpers.js";
import { saveAsignacionActual } from "../asignacion/asignacion.service.js";
import { asignarVehiculo, removerAsignacionVehiculo, getNombreVehiculoAsignado } from "./vehiculos.service.js";
import { renderEquipoAsignacion } from "../equipos/equipos.view.js";
import { guardarOperacionBaseDatos, collectOperacionActual } from "../operacion/operacion.service.js";

function getNombrePersonalById(idPersonal) {
  for (const [nombre, id] of Object.entries(state.personalMap)) {
    if (id === idPersonal) return nombre;
  }
  return null;
}

function getSelectedVehicleId() {
  return state.vehiclesList.find(v => v.name === state.selectedVehicle)?.id || null;
}

function getKeysAsignadosAVehiculo(idVehiculo) {
  if (!idVehiculo) return [];

  const keys = [];
  state.asignacionVehiculos
    .filter(a => a.id_vehiculo === idVehiculo && a.id_personal)
    .forEach(asig => {
      const nombre = getNombrePersonalById(asig.id_personal);
      if (!nombre) return;

      if (state.cetSeleccionados.includes(nombre)) {
        keys.push(nombre);
        return;
      }

      for (const cet of state.cetSeleccionados) {
        const cells = state.asignacionCelulas[cet] || [];
        if (cells.includes(nombre)) {
          keys.push(`${cet}-${nombre}`);
          return;
        }
      }
    });

  return keys;
}

function removerAsignacionPorKey(key) {
  const separador = key.indexOf('-');
  const cet = separador === -1 ? key : key.slice(0, separador);
  const celula = separador === -1 ? null : key.slice(separador + 1);
  const nombre = celula || cet;
  const idPersonal = state.personalMap[nombre];
  if (!idPersonal) return false;

  const asignacion = state.asignacionVehiculos.find(a => a.id_personal === idPersonal);
  if (!asignacion) return false;

  removerAsignacionVehiculo(
    asignacion.id_vehiculo,
    asignacion.tipo_destino,
    idPersonal,
    asignacion.id_grupo_operacion ?? null
  );

  const quedanAsignacionesVeh = state.asignacionVehiculos.some(a => a.id_vehiculo === asignacion.id_vehiculo);
  if (!quedanAsignacionesVeh && !state.vehiculosLiberadosLocalmente.includes(asignacion.id_vehiculo)) {
    state.vehiculosLiberadosLocalmente.push(asignacion.id_vehiculo);
  }

  if (!quedanAsignacionesVeh) {
    const equiposLiberados = state.asignacionEquipos
      .filter(a => a.id_vehiculo === asignacion.id_vehiculo)
      .map(a => a.id_equipo);

    state.asignacionEquipos = state.asignacionEquipos.filter(a => a.id_vehiculo !== asignacion.id_vehiculo);
    equiposLiberados.forEach(idEquipo => {
      if (!state.equiposLiberadosLocalmente.includes(idEquipo)) {
        state.equiposLiberadosLocalmente.push(idEquipo);
      }
    });
  }

  return true;
}

export function renderVehiculos() {
  clearPanel();
  showBack(true);

  showVehiculosLeftPanel("Asignación de personal al vehículo");

  const vehCount = {};
  state.asignacionVehiculos.forEach(asig => {
    const veh = state.vehiclesList.find(v => v.id === asig.id_vehiculo);
    if (veh) {
      vehCount[veh.name] = (vehCount[veh.name] || 0) + 1;
    }
  });

  const selectedVehicleId = getSelectedVehicleId();
  const keysAsignadosAlVehiculoSeleccionado = new Set(getKeysAsignadosAVehiculo(selectedVehicleId));

  const cet = state.cetSeleccionados[state.cetActivoIndexVeh];

  if (!state.gruposByCet[cet]) {
    state.gruposByCet[cet] = structuredClone(DEFAULT_GROUP_INFO);
  }

  const ginfo = state.gruposByCet[cet];
  if (ginfo.vehActive === undefined) ginfo.vehActive = null;

  const hasGroups = (ginfo.names || []).length > 0;
  if (hasGroups) {
    // null ("Sin grupo") es válido aunque haya grupos — no forzar a un grupo
    if (ginfo.vehActive !== null && ginfo.vehActive !== undefined && !ginfo.names.includes(ginfo.vehActive)) {
      ginfo.vehActive = null;
    }
  } else {
    ginfo.vehActive = null;
  }

  const groupIndex = hasGroups ? Math.max(0, ginfo.names.indexOf(ginfo.vehActive)) : 0;
  const lastGroupIndex = hasGroups ? (ginfo.names.length - 1) : 0;

  setHeader("Asignación de Vehículos", "");
  const lastCet = state.cetActivoIndexVeh === state.cetSeleccionados.length - 1;
  const isLastOverall = lastCet && (!hasGroups || groupIndex === lastGroupIndex);
  setAccion(isLastOverall ? "Finalizar" : "Siguiente", false);

  const cetButtons = document.createElement("div");
  cetButtons.className = "chipRow";
  cetButtons.style.marginBottom = "12px";

  state.cetSeleccionados.forEach((n, i) => {
    const btn = document.createElement("button");
    btn.className = "chip" + (i === state.cetActivoIndexVeh ? " active" : "");
    btn.textContent = `CET: ${n}`;
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => {
      state.cetActivoIndexVeh = i;
      saveAsignacionActual(); // BACKEND: saveAsignacionActual() se vuelve async con POST /ops/:id/personal, /grupos, /vehiculos, /equipos
      renderVehiculos();
    });
    cetButtons.appendChild(btn);
  });

  vehiculosLeftEl.appendChild(cetButtons);

  const headerBox = document.createElement("div");
  headerBox.className = "stickyTop";
  headerBox.style.position = "relative";
  headerBox.style.top = "auto";
  headerBox.style.padding = "10px 0 10px";
  headerBox.style.background = "#fff";
  headerBox.style.borderBottom = "1px solid #d7e3ff";
  headerBox.style.marginBottom = "10px";

  const flotillaLbl = document.createElement("div");
  flotillaLbl.className = "lbl";
  flotillaLbl.style.marginBottom = "8px";
  flotillaLbl.textContent = "Nombre de la flotilla";

  const flotillaChip = document.createElement("div");
  flotillaChip.className = "chip active";
  flotillaChip.style.display = "inline-block";
  flotillaChip.style.cursor = "default";
  flotillaChip.textContent = state.flotillaByCet[cet] ? state.flotillaByCet[cet] : "—";

  headerBox.appendChild(flotillaLbl);
  headerBox.appendChild(flotillaChip);

  const grpLbl = document.createElement("div");
  grpLbl.className = "lbl";
  grpLbl.style.margin = "12px 0 8px";
  grpLbl.textContent = "Grupos";
  headerBox.appendChild(grpLbl);

  const grpRow = document.createElement("div");
  grpRow.className = "groupsRow";
  grpRow.style.display = "flex";
  grpRow.style.gap = "8px";
  grpRow.style.flexWrap = "wrap";

  // Grupos existentes (a, b...)
  ginfo.names.forEach((gName) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (ginfo.vehActive === gName ? " active" : "");
    chip.textContent = gName;
    chip.addEventListener("click", () => {
      ginfo.vehActive = gName;
      saveAsignacionActual();
      renderVehiculos();
    });
    grpRow.appendChild(chip);
  });

  // Botón Sin Grupo fijo
  const sinGrupoBtn = document.createElement("button");
  sinGrupoBtn.className = "chip" + (ginfo.vehActive === null ? " active" : "");
  sinGrupoBtn.textContent = "Sin grupo";
  sinGrupoBtn.addEventListener("click", () => {
    ginfo.vehActive = null;
    saveAsignacionActual();
    renderVehiculos();
  });
  grpRow.appendChild(sinGrupoBtn);
  headerBox.appendChild(grpRow);

  vehiculosLeftEl.appendChild(headerBox);

  const cellulasList = document.createElement("div");
  cellulasList.style.maxHeight = "350px";
  cellulasList.style.overflowY = "auto";

  const cellsForCET = state.asignacionCelulas[cet] || [];

  let cellsToShow = [];
  if (ginfo.vehActive) {
    const set = ginfo.map[ginfo.vehActive] || new Set();
    const arr = Array.from(set);
    cellsToShow = arr.filter(c => cellsForCET.some(p => (p.nombre ?? p) === c));
  } else {
    // Modo Sin Grupo: mostrar solo los que no están en ningún subgrupo
    cellsToShow = cellsForCET.filter(c => !getGrupoDeCelula(cet, c));
  }

  function toggleSelectedKey(value, checked) {
    const set = new Set(state.selectedCells || []);
    if (checked) set.add(value);
    else set.delete(value);
    state.selectedCells = Array.from(set);
  }

  function mkCheckRow({ labelText, valueKey, disabled = false, checked = false, onChange }) {
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "10px";
    label.style.marginBottom = "10px";
    label.style.padding = "10px";
    label.style.cursor = disabled ? "not-allowed" : "pointer";
    label.style.borderRadius = "8px";
    label.style.backgroundColor = "#f5f5f5";
    if (disabled) label.style.opacity = "0.65";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = valueKey;
    chk.checked = checked;
    chk.disabled = disabled;
    chk.addEventListener("change", (e) => onChange?.(e.target.checked));

    const textSpan = document.createElement("span");
    textSpan.style.flex = "1";
    textSpan.textContent = labelText;

    label.appendChild(chk);
    label.appendChild(textSpan);
    return label;
  }

  const cetKey = `${cet}`;

  if (!ginfo.vehActive) {
    const cetAssigned = getNombreVehiculoAsignado(cetKey);
    const cetAssignedToSelectedVehicle = keysAsignadosAlVehiculoSeleccionado.has(cetKey);
    const cetLocked = !!cetAssigned && !cetAssignedToSelectedVehicle;

    cellulasList.appendChild(
      mkCheckRow({
        labelText: cetLocked ? `CET: ${cet} (Asignado: ${cetAssigned})` : `CET: ${cet}`,
        valueKey: cetKey,
        disabled: cetLocked,
        checked: cetAssignedToSelectedVehicle || (state.selectedCells || []).includes(cetKey),
        onChange: (checked) => {
          if (!checked && cetAssignedToSelectedVehicle) {
            removerAsignacionPorKey(cetKey);
            toggleSelectedKey(cetKey, false);
            saveAsignacionActual();
            renderVehiculos();
            return;
          }
          toggleSelectedKey(cetKey, checked);
          renderVehiculos();
        }
      })
    );
  }

  if (cellsToShow.length > 0) {
    const visibleKeys = ginfo.vehActive
      ? cellsToShow.map(c => `${cet}-${c}`)
      : [cetKey, ...cellsToShow.map(c => `${cet}-${c}`)];
    const unlockedVisible = visibleKeys.filter(k => !getNombreVehiculoAsignado(k));

    const allSelectedVisible =
      unlockedVisible.length > 0 &&
      unlockedVisible.every(k => (state.selectedCells || []).includes(k));

    const someSelectedVisible =
      unlockedVisible.some(k => (state.selectedCells || []).includes(k));

    const rowAll = mkCheckRow({
      labelText: "Seleccionar todo lo visible",
      valueKey: `${cet}::allVisible`,
      disabled: unlockedVisible.length === 0,
      checked: allSelectedVisible,
      onChange: (checked) => {
        const set = new Set(state.selectedCells || []);
        if (checked) unlockedVisible.forEach(k => set.add(k));
        else unlockedVisible.forEach(k => set.delete(k));
        state.selectedCells = Array.from(set);
        renderVehiculos();
      }
    });

    rowAll.querySelector("input").indeterminate = (!allSelectedVisible && someSelectedVisible);
    cellulasList.insertBefore(rowAll, cellulasList.firstChild);
  }

  cellsToShow.forEach(cell => {
    const key = `${cet}-${cell}`;
    const assignedVehicle = getNombreVehiculoAsignado(key);
    const assignedToSelectedVehicle = keysAsignadosAlVehiculoSeleccionado.has(key);
    const isLocked = !!assignedVehicle && !assignedToSelectedVehicle;

    // Obtener etiqueta de grupo
    const gName = getGrupoDeCelula(cet, cell);
    const gLabel = gName ? `Grupo ${gName}` : "Sin grupo";

    cellulasList.appendChild(
      mkCheckRow({
        labelText: isLocked 
          ? `${cell} (Asignado: ${assignedVehicle})` 
          : cell,
        valueKey: key,
        disabled: isLocked,
        checked: assignedToSelectedVehicle || (state.selectedCells || []).includes(key),
        onChange: (checked) => {
          if (!checked && assignedToSelectedVehicle) {
            removerAsignacionPorKey(key);
            toggleSelectedKey(key, false);
            saveAsignacionActual();
            renderVehiculos();
            return;
          }
          toggleSelectedKey(key, checked);
          renderVehiculos();
        }
      })
    );
  });

  vehiculosLeftEl.appendChild(cellulasList);

  const vehiclesWrap = document.createElement("div");
  vehiclesWrap.className = "listBox";
  vehiclesWrap.style.gap = "12px";

  const vehicleGrid = document.createElement("div");
  vehicleGrid.className = "vehicleGrid";
  vehicleGrid.style.maxHeight = "300px";
  vehicleGrid.style.overflowY = "auto";
  vehicleGrid.addEventListener("scroll", () => {
    state.vehiculosGridScrollTop = vehicleGrid.scrollTop;
  });

  state.vehiclesList.forEach((vehicle) => {
    const card = document.createElement("div");
    card.className = "vehicleCard";
    card.style.cursor = "pointer";

    const used = vehCount[vehicle.name] || 0;
    const cap = Number(vehicle.capacity || 0);
    const isFull = cap > 0 && used >= cap;
    const isAssignedInCurrentOp = state.asignacionVehiculos.some(a => a.id_vehiculo === vehicle.id);
    const fueLiberadoLocalmente = state.vehiculosLiberadosLocalmente.includes(vehicle.id);
    const isEnOperacion = !isAssignedInCurrentOp && !fueLiberadoLocalmente && vehicle.status && vehicle.status !== "DISPONIBLE";
    const isDisabled = isEnOperacion;

    const isSelected = state.selectedVehicle === vehicle.name;
    if (isSelected) card.classList.add("selected");
    if (isDisabled) {
      card.classList.add("disabled");
      card.style.cursor = "not-allowed";
    }

    const img = document.createElement("img");
    img.src = vehicle.image || "";
    img.alt = vehicle.name;

    const nameP = document.createElement("p");
    nameP.textContent = vehicle.name;

    const capP = document.createElement("p");
    capP.style.margin = "6px 0 0";
    capP.style.fontWeight = "700";
    capP.style.fontSize = "12px";
    capP.style.opacity = "0.85";

    if (isEnOperacion) {
      capP.textContent = "En operación";
      capP.style.color = "#c0392b";
    } else {
      capP.textContent = `Capacidad: ${used}/${cap || 0}`;
    }

    card.appendChild(img);
    card.appendChild(nameP);
    card.appendChild(capP);

    card.addEventListener("click", () => {
      if (isDisabled) return;
      if (state.selectedVehicle === vehicle.name) {
        state.selectedVehicle = null;
      } else {
        state.selectedVehicle = vehicle.name;
      }
      renderVehiculos();
    });

    vehicleGrid.appendChild(card);
  });

  vehiclesWrap.appendChild(vehicleGrid);
  panel.appendChild(vehiclesWrap);
  restoreScrollTop(vehicleGrid, state.vehiculosGridScrollTop || 0);

  const assignBtn = document.createElement("button");
  assignBtn.className = "btnPrimary";
  assignBtn.style.marginTop = "20px";
  assignBtn.style.width = "100%";
  assignBtn.textContent = "Asignarle";

  const selectedVehicleObj = state.vehiclesList.find(v => v.name === state.selectedVehicle);
  const usedNow = state.selectedVehicle ? (vehCount[state.selectedVehicle] || 0) : 0;
  const capNow = selectedVehicleObj ? Number(selectedVehicleObj.capacity || 0) : 0;
  const remaining = capNow - usedNow;

  const selectedAssignable = (state.selectedCells || []).filter(k => {
    if (k.includes("::")) return false;
    if (state.cetSeleccionados.includes(k)) return true;
    if (k.includes("-")) return true;
    return false;
  });

  const selectedNuevos = selectedAssignable.filter(k => !keysAsignadosAlVehiculoSeleccionado.has(k));
  const lockedSelected = selectedNuevos.filter(k => !!getNombreVehiculoAsignado(k));

  const canAssign =
    !!state.selectedVehicle &&
    selectedNuevos.length > 0 &&
    lockedSelected.length === 0 &&
    remaining >= selectedNuevos.length;

  assignBtn.disabled = !canAssign;

  assignBtn.addEventListener("click", () => {
    if (!state.selectedVehicle) {
      alert("Selecciona un vehículo");
      return;
    }

    const selected = (state.selectedCells || []).filter(k => {
      if (k.includes("::")) return false;
      if (state.cetSeleccionados.includes(k)) return true;
      if (k.includes("-")) return true;
      return false;
    }).filter(k => !keysAsignadosAlVehiculoSeleccionado.has(k));

    if (selected.length === 0) {
      alert("Selecciona al menos una persona/célula o el CET");
      return;
    }

    const vehObj = state.vehiclesList.find(v => v.name === state.selectedVehicle);
    if (!vehObj) {
      alert("Vehículo inválido.");
      return;
    }

    const used = state.asignacionVehiculos.filter(a => a.id_vehiculo === vehObj.id).length;
    const cap = Number(vehObj.capacity || 0);
    const remainingNow = cap - used;

    const locked = selected.filter(k => getNombreVehiculoAsignado(k));
    if (locked.length > 0) {
      alert("Uno o más ya tienen vehículo asignado. No se puede repetir.");
      return;
    }

    if (selected.length > remainingNow) {
      alert(`Capacidad insuficiente. Disponible: ${remainingNow}/${cap}`);
      return;
    }

    // Asignar usando el service
    selected.forEach((key) => {
      const parts = key.split('-');
      const cet = parts[0];
      const celula = parts[1] || null;

      if (celula) {
        // Asignar a personal — asignacionCelulas guarda strings, buscar id en personalMap
        const idPersonal = state.personalMap[celula];
        if (idPersonal) {
          asignarVehiculo(vehObj.id, 'personal', idPersonal);
          state.vehiculosLiberadosLocalmente = state.vehiculosLiberadosLocalmente.filter(id => id !== vehObj.id);
        }
      } else {
        // CET sin grupo — asignar directamente por nombre de CET
        const idCet = state.personalMap[cet];
        if (idCet) {
          asignarVehiculo(vehObj.id, 'personal', idCet);
          state.vehiculosLiberadosLocalmente = state.vehiculosLiberadosLocalmente.filter(id => id !== vehObj.id);
        }
      }
    });

    state.selectedVehicle = null;
    state.selectedCells = [];
    renderVehiculos();
  });

  panel.appendChild(assignBtn);

  btnAccion.onclick = async () => {
    if (hasGroups && groupIndex < lastGroupIndex) {
      ginfo.vehActive = ginfo.names[groupIndex + 1];
      saveAsignacionActual();
      renderVehiculos();
      return;
    }

    if (state.cetActivoIndexVeh < state.cetSeleccionados.length - 1) {
      state.cetActivoIndexVeh += 1;

      const nextCet = state.cetSeleccionados[state.cetActivoIndexVeh];
      const ngi = state.gruposByCet[nextCet] || structuredClone(DEFAULT_GROUP_INFO);
      state.gruposByCet[nextCet] = ngi;

      const hasNextGroups = (ngi.names || []).length > 0;
      if (hasNextGroups) {
        if (!ngi.vehActive || !ngi.names.includes(ngi.vehActive)) {
          ngi.vehActive =
            (ngi.active && ngi.names.includes(ngi.active))
              ? ngi.active
              : ngi.names[0];
        }
      } else {
        ngi.vehActive = null;
      }

      saveAsignacionActual();
      renderVehiculos();
      return;
    }

    // --- BLOQUE FINALIZAR: AUTO-GUARDADO DE CABECERA ---
    // Si llegó hasta aquí, significa que ya pasó el último grupo y el último CET (isLastOverall es true)
    try {
        const opLoc = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
        const fromForm = collectOperacionActual();
        const opDB = await guardarOperacionBaseDatos(fromForm, { 
            id_operacion: opLoc.id || null, 
            estado_operacion: opLoc.estado || 'PLANIFICADA' 
        });
        
        if (opDB && opDB.id_operacion && !opLoc.id) {
           opLoc.id = opDB.id_operacion;
           if (opDB.estado) opLoc.estado = opDB.estado;
           writeStorage(STORAGE_OPERACION_ACTUAL, opLoc);
        }
    } catch (e) {
        console.error("Fallo auto-guardado de operación en BD desde Vehículos:", e);
    }

    state.categoria = "equipo";
    state.equipoCategoria = "comunicacion";
    state.equipoDestino = "personal";
    state.equipoSelectedItems = [];
    state.equipoSelectedResource = null;
    state.equipoSelectedCet = state.cetSeleccionados[0] || null;

    const primerCet = state.equipoSelectedCet;
    if (primerCet) {
      const ginfo = state.gruposByCet[primerCet] || { names: [], map: {} };
      state.equipoSelectedGrupo =
        (ginfo.names && ginfo.names.length > 0) ? ginfo.names[0] : null;
    } else {
      state.equipoSelectedGrupo = null;
    }

    saveAsignacionActual();
    renderEquipoAsignacion();
  };
}
