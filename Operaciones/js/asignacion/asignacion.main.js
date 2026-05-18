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
import { readObjectStorage, writeStorage } from "./core/storage.js";
import {
  STORAGE_OPERACION_ACTUAL,
  STORAGE_ASIGNACION_ACTUAL
} from "./core/constants.js";

import { validateDateTime } from "./core/utils.js";
import { showDashboardButton } from "./core/ui.js";

import {
  schedulePersistOperacionActualEnBackend,
  loadOperacionActualIntoForm,
  cargarOperacionRemota
} from "./modules/operacion/operacion.service.js";
import { startAsignacionPresenceHeartbeat } from "./modules/operacion/operacion.presence.js";

import { hydrateCatalogsFromControl, hydrateAsignacionFromBD } from "./modules/catalogos/catalogos.service.js";
import { bindNavigation } from "./modules/navigation/asignacion.navigation.js";
import { renderHome } from "./views/home.view.js";

function bindFormEvents() {
  const saveOperacionChange = () => schedulePersistOperacionActualEnBackend();

  if (btnHoy && opInicioEl) {
    btnHoy.addEventListener("click", () => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      opInicioEl.value = `${yyyy}-${mm}-${dd}`;
      saveOperacionChange();
    });
  }

  if (opHoraInicioEl) {
    opHoraInicioEl.addEventListener("input", function (e) {
      let v = e.target.value.replace(/\D/g, "");
      if (v.length > 2) {
        v = v.substring(0, 2) + ":" + v.substring(2, 4);
      }
      e.target.value = v;
      saveOperacionChange();
    });

    opHoraInicioEl.addEventListener("blur", function (e) {
      let v = e.target.value;
      if (/^\d{2}:\d{2}$/.test(v)) {
        let [h, m] = v.split(":");
        h = Math.min(23, parseInt(h) || 0);
        m = Math.min(59, parseInt(m) || 0);
        e.target.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
        validateDateTime(opInicioEl, opHoraInicioEl);
        saveOperacionChange();
      }
    });
  }

  const inputFields = [opNombreEl, opDescEl, opInicioEl, opPrioridadEl];
  inputFields.forEach((field) => {
    if (!field) return;

    const eventType = field.tagName === "SELECT" ? "change" : "input";
    field.addEventListener(eventType, () => {
      if (field === opInicioEl) validateDateTime(opInicioEl, opHoraInicioEl);
      
      // Limpiar error visual si el usuario escribe
      if (field.value.trim()) {
        field.style.borderColor = "";
        const errDiv = field.nextElementSibling;
        if (errDiv && errDiv.classList.contains('op-inline-error')) {
          errDiv.style.display = 'none';
        }
      }

      saveOperacionChange();
      if (field === opNombreEl && lblOperacion) {
        lblOperacion.textContent = opNombreEl.value || "—";
      }
    });
  });
}

function restoreSavedState() {
  // BACKEND: Esta funcion desaparece. La asignacion se carga del servidor via GET /ops/:id/personal, GET /ops/:id/vehiculos-asignados y GET /ops/:id/equipos-asignados.
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

async function init() {
  // ── Validación de entrada ────────────────────────────────────
  // Entradas válidas:
  //   "create"  → viene del botón "Crear operación" o "Emergencia" del menú inicial
  //   "edit"    → viene del botón "Editar" del dashboard
  // Cualquier otra entrada es inválida y se redirige.
  const entry = sessionStorage.getItem("asignacion_entry");
  sessionStorage.removeItem("asignacion_entry");

  if (!entry) {
    const hasActiveOp = !!localStorage.getItem("active_operation_id");
    window.location.href = hasActiveOp ? "dashboard.html" : "menu_inicial.html";
    return;
  }

  if (entry === "edit" && !localStorage.getItem("active_operation_id")) {
    window.location.href = "menu_inicial.html";
    return;
  }
  // ─────────────────────────────────────────────────────────────

  const qs = new URLSearchParams(window.location.search);
  const op = qs.get("op");
  if (op) lblOperacion.textContent = op;

  if (lblUsuario) {
    const user = localStorage.getItem("username"); // BACKEND: Reemplazar por GET /me con Bearer token → { nombre, apellido, username, rol }
    lblUsuario.textContent = user ? `Usuario: ${user}` : "Usuario no identificado";
  }

  // En modo edición se excluye la operación actual del chequeo de ocupación
  const excludeOpId = entry === "edit" ? localStorage.getItem("active_operation_id") : null;
  await hydrateCatalogsFromControl(excludeOpId); // BACKEND: await Promise.all([GET /catalog/personal?rol=CUT, GET /catalog/personal?rol=CET, GET /catalog/personal?rol=CELL, GET /catalog/vehiculos, GET /catalog/equipos])

  let storedOp = {};
  if (entry === "edit") {
    const opId = localStorage.getItem("active_operation_id");
    storedOp = { id: opId };

    if (opId) {
      // Cargar operación desde BD y normalizar keys para el formulario
      const opData = await cargarOperacionRemota(opId);
      if (opData) {
        let fExtracted = "";
        let hExtracted = "";
        if (opData.fecha_inicio) {
          const d = new Date(opData.fecha_inicio);
          if (!isNaN(d)) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            fExtracted = `${yyyy}-${mm}-${dd}`;

            const hh = String(d.getHours()).padStart(2, "0");
            const min = String(d.getMinutes()).padStart(2, "0");
            hExtracted = `${hh}:${min}`;
          }
        }

        const opNorm = {
          id: opData.id_operacion,
          title: opData.nombre,
          titulo: opData.nombre,
          description: opData.descripcion,
          descripcion: opData.descripcion,
          fecha_inicio: fExtracted,
          hora_inicio: hExtracted,
          prioridad: opData.prioridad,
          estado: opData.estado
        };
        writeStorage(STORAGE_OPERACION_ACTUAL, opNorm);
        storedOp = opNorm;
      }
      loadOperacionActualIntoForm();
      await hydrateAsignacionFromBD(Number(opId));
    } else {
      loadOperacionActualIntoForm();
    }
  } else {
    storedOp = restoreSavedState();
    loadOperacionActualIntoForm();
  }

  renderHome();
  bindNavigation();
  bindFormEvents();
  startAsignacionPresenceHeartbeat();

  const tieneNombre = !!(storedOp.title || storedOp.titulo);
  const tieneId = !!storedOp.id;

  if (tieneId && tieneNombre) {
    showDashboardButton();
  }
}

init();
