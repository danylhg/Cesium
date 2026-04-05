import {
  lblOperacion,
  lblUsuario,
  btnHoy,
  opNombreEl,
  opDescEl,
  opInicioEl,
  opHoraInicioEl,
  opPrioridadEl
} from "./core/dom.js";

import { state } from "./core/state.js";
import { readObjectStorage } from "./core/storage.js";
import {
  STORAGE_OPERACION_ACTUAL,
  STORAGE_ASIGNACION_ACTUAL
} from "./core/constants.js";

import { validateDateTime } from "./core/utils.js";
import { showDashboardButton } from "./core/ui.js";

import {
  saveOperacionActual,
  loadOperacionActualIntoForm
} from "./modules/operacion/operacion.service.js";

import { hydrateCatalogsFromControl } from "./modules/catalogos/catalogos.service.js";
import { bindNavigation } from "./modules/navigation/asignacion.navigation.js";
import { renderHome } from "./views/home.view.js";

function bindFormEvents() {
  if (btnHoy && opInicioEl) {
    btnHoy.addEventListener("click", () => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      opInicioEl.value = `${yyyy}-${mm}-${dd}`;
      saveOperacionActual(); // BACKEND: saveOperacionActual() se vuelve async y llama PUT /ops/:id con debounce
    });
  }

  if (opHoraInicioEl) {
    opHoraInicioEl.addEventListener("input", function (e) {
      let v = e.target.value.replace(/\D/g, "");
      if (v.length > 2) {
        v = v.substring(0, 2) + ":" + v.substring(2, 4);
      }
      e.target.value = v;
      saveOperacionActual(); // BACKEND: saveOperacionActual() se vuelve async y llama PUT /ops/:id con debounce
    });

    opHoraInicioEl.addEventListener("blur", function (e) {
      let v = e.target.value;
      if (/^\d{2}:\d{2}$/.test(v)) {
        let [h, m] = v.split(":");
        h = Math.min(23, parseInt(h) || 0);
        m = Math.min(59, parseInt(m) || 0);
        e.target.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
        validateDateTime(opInicioEl, opHoraInicioEl);
        saveOperacionActual(); // BACKEND: saveOperacionActual() se vuelve async y llama PUT /ops/:id con debounce
      }
    });
  }

  const inputFields = [opNombreEl, opDescEl, opInicioEl, opPrioridadEl];
  inputFields.forEach((field) => {
    if (!field) return;

    const eventType = field.tagName === "SELECT" ? "change" : "input";
    field.addEventListener(eventType, () => {
      if (field === opInicioEl) validateDateTime(opInicioEl, opHoraInicioEl);
      saveOperacionActual(); // BACKEND: saveOperacionActual() se vuelve async y llama PUT /ops/:id con debounce
      if (field === opNombreEl && lblOperacion) {
        lblOperacion.textContent = opNombreEl.value || "—";
      }
    });
  });
}

function restoreSavedState() {
  // BACKEND: Esta función desaparece. La asignación se carga del servidor vía GET /ops/:id/personal, GET /ops/:id/vehiculos, GET /ops/:id/equipos, GET /ops/:id/grupos
  const storedOp = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
  const asigKey = storedOp.id ? `asignacion_op_${storedOp.id}` : STORAGE_ASIGNACION_ACTUAL;
  const savedAsig =
    readObjectStorage(asigKey, null) ||
    readObjectStorage(STORAGE_ASIGNACION_ACTUAL, {});

  if (savedAsig?.cut) {
    state.cutSeleccionado = savedAsig.cut;
  }

  if (Array.isArray(savedAsig?.cets)) {
    state.cetSeleccionados = savedAsig.cets;
  }

  if (savedAsig?.flotillaByCet && typeof savedAsig.flotillaByCet === 'object' && !Array.isArray(savedAsig.flotillaByCet)) {
    state.flotillaByCet = savedAsig.flotillaByCet;
  }

  if (savedAsig?.asignacionCelulas && typeof savedAsig.asignacionCelulas === 'object' && !Array.isArray(savedAsig.asignacionCelulas)) {
    state.asignacionCelulas = savedAsig.asignacionCelulas;
  }

  if (Array.isArray(savedAsig?.asignacionVehiculos)) {
    state.asignacionVehiculos = savedAsig.asignacionVehiculos;
  }

  if (Array.isArray(savedAsig?.asignacionEquipos)) {
    state.asignacionEquipos = savedAsig.asignacionEquipos;
  }

  return storedOp;
}

function init() {
  const qs = new URLSearchParams(window.location.search);
  const op = qs.get("op");
  if (op) lblOperacion.textContent = op;

  if (lblUsuario) {
    const user = localStorage.getItem("username"); // BACKEND: Reemplazar por GET /me con Bearer token → { nombre, apellido, username, rol }
    lblUsuario.textContent = user ? `Usuario: ${user}` : "Usuario no identificado";
  }

  hydrateCatalogsFromControl(); // BACKEND: Se vuelve async → await Promise.all([GET /catalog/personal?rol=CUT, GET /catalog/personal?rol=CET, GET /catalog/personal?rol=CELL, GET /catalog/vehiculos, GET /catalog/equipos])
  const storedOp = restoreSavedState();
  loadOperacionActualIntoForm(); // BACKEND: Se vuelve async → GET /ops/:id si hay active_operation_id

  renderHome();
  bindNavigation();
  bindFormEvents();

  const tieneNombre = !!(storedOp.title || storedOp.titulo);
  const tieneId = !!storedOp.id;

  if (tieneId && tieneNombre) {
    showDashboardButton();
  }
}

init();
