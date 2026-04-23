// js/dashboard/dashboard.events.js

import { dom } from "./dashboard.dom.js";
import {
  getCurrentOperation,
  saveCurrentOperation,
  isOperationActive
} from "./dashboard.storage.js";
import { togglePanel, closeAllPanels } from "./dashboard.ui.js";
import { saveTacticalData } from "./dashboard.persistence.js";

const logAlert = (message) => {
  if (message) console.warn(message);
};

/**
 * Vincula los eventos de clic de los paneles laterales (Info, Ruta, Táctico, Chat).
 */
function bindPanelEvents() {
  if (dom.toggleInfoPanel) {
    dom.toggleInfoPanel.addEventListener("click", () => {
      togglePanel(dom.infoPanel, dom.toggleInfoPanel);
    });
  }

  if (dom.toggleRoutePanel) {
    dom.toggleRoutePanel.addEventListener("click", () => {
      togglePanel(dom.routePanel, dom.toggleRoutePanel);
    });
  }

  if (dom.toggleTacticalPanel) {
    dom.toggleTacticalPanel.addEventListener("click", () => {
      togglePanel(dom.tacticalPanel, dom.toggleTacticalPanel);
    });
  }

  if (dom.toggleChatPanel) {
    dom.toggleChatPanel.addEventListener("click", () => {
      if (!isOperationActive()) {
        logAlert("El chat táctico solo está disponible cuando la operación está activa automáticamente por fecha y hora.");
        return;
      }
      togglePanel(dom.chatPanel, dom.toggleChatPanel);
    });
  }
}

/**
 * Vincula el evento de clic global para cerrar paneles al hacer clic fuera de ellos.
 * Comportamiento transversal de la interfaz (Shell UI).
 */
function bindGlobalClickEvents() {
  document.addEventListener("click", (e) => {
    const clickedInsidePanel = e.target.closest(".glassPanel");
    const clickedToolButton = e.target.closest(".toolFab");
    const clickedCesium = e.target.closest(".cesium-viewer");
    const clickedActionBtn = e.target.closest(".actionBtn");

    if (!clickedInsidePanel && !clickedToolButton && !clickedCesium && !clickedActionBtn) {
      closeAllPanels();
    }
  });
}

// Helper local para llamadas autenticadas al backend
async function apiFetchEstado(opId, nuevoEstado) {
  const token = localStorage.getItem("token");
  const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
  const res = await fetch(`${API_BASE}/ops/${opId}/estado`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ estado: nuevoEstado })
  });
  return res;
}

/**
 * Vincula los eventos de los botones de acción global (Guardar/Cancelar operación).
 *
 * Cuando la operación está en PLANIFICADA (los botones solo son visibles en ese estado):
 *   - Guardar  → PATCH /ops/:id/estado { estado: "ACTIVA" }    → activa la operación
 *   - Cancelar → PATCH /ops/:id/estado { estado: "CANCELADA" } → libera todo lo asignado
 */
function bindOperationActionEvents() {
  if (dom.saveOpMapBtn) {
    dom.saveOpMapBtn.addEventListener("click", async () => {
      const op = getCurrentOperation();
      const opId = localStorage.getItem("active_operation_id") || op?.id;
      const opName = op.nombre || op.title || op.titulo || "Operación";

      if (!opId) {
        logAlert("No se encontró la operación activa.");
        return;
      }

      const confirmMsg = `¿Guardar la operación "${opName}"?\nSe guardará todo lo planificado en el mapa y la operación se activará automáticamente al llegar su fecha y hora programadas.`;

      try {
        saveTacticalData();
        saveCurrentOperation(op);
        logAlert(`¡Operación "${opName}" guardada exitosamente!\nSe activará sola en la fecha designada.`);
        window.location.href = "menu_inicial.html";
      } catch (e) {
        console.error(e);
        logAlert("Error al guardar la operación.");
      }
    });
  }

  if (dom.cancelOpMapBtn) {
    dom.cancelOpMapBtn.addEventListener("click", async () => {
      const op = getCurrentOperation();
      const opId = localStorage.getItem("active_operation_id") || op?.id;
      const opName = op.nombre || op.title || op.titulo || "Operación";

      if (!opId) {
        logAlert("No se encontró la operación activa.");
        return;
      }

      if (!confirm(`¿Cancelar la operación "${opName}"?\nTodo el personal, vehículos y equipos asignados quedarán liberados.`)) return;

      try {
        const res = await apiFetchEstado(opId, "CANCELADA");
        if (res.ok) {
          window.location.href = "menu_inicial.html";
        } else {
          const data = await res.json().catch(() => ({}));
          logAlert(`Error al cancelar: ${data.mensaje || res.statusText}`);
        }
      } catch {
        logAlert("Error de conexión al intentar cancelar la operación.");
      }
    });
  }

  const activateOpBtn = document.getElementById("activateOpBtn");
  if (activateOpBtn) {
    activateOpBtn.addEventListener("click", async () => {
      const op = getCurrentOperation();
      const opId = localStorage.getItem("active_operation_id") || op?.id_operacion || op?.id;
      const opName = op.nombre || op.title || op.titulo || "Operacion";

      if (!opId) {
        logAlert("No se encontro la operacion activa.");
        return;
      }

      if (!confirm(`Activar la operacion "${opName}"?\nSe iniciara la operacion y se habilitara el chat tactico.`)) return;

      try {
        saveTacticalData();
        const res = await apiFetchEstado(opId, "ACTIVA");
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          const updatedOp = data.operacion || { ...op, estado: "ACTIVA", phase: "activa" };
          updatedOp.phase = "activa";
          localStorage.setItem("operacion_actual", JSON.stringify(updatedOp));
          localStorage.setItem("active_operation_id", updatedOp.id_operacion || opId);
          localStorage.setItem("force_open_chat", "true");
          window.location.reload();
        } else {
          logAlert(`Error al activar: ${data.mensaje || res.statusText}`);
        }
      } catch (e) {
        console.error(e);
        logAlert("Error de conexion al intentar activar la operacion.");
      }
    });
  }

  const closeActiveBtn = document.getElementById("closeActiveOpBtn");
  if (closeActiveBtn) {
    closeActiveBtn.addEventListener("click", async () => {
      const op = getCurrentOperation();
      const opId = localStorage.getItem("active_operation_id") || op?.id;
      const opName = op.nombre || op.title || op.titulo || "OperaciÃ³n";

      if (!opId) {
        logAlert("No se encontrÃ³ la operaciÃ³n activa.");
        return;
      }

      if (!confirm(`Â¿Cerrar la operaciÃ³n "${opName}"?\nEsta acciÃ³n finalizarÃ¡ la operaciÃ³n activa.`)) return;

      try {
        const res = await apiFetchEstado(opId, "CERRADA");
        if (res.ok) {
          window.location.href = "menu_inicial.html";
        } else {
          const data = await res.json().catch(() => ({}));
          logAlert(`Error al cerrar: ${data.mensaje || res.statusText}`);
        }
      } catch {
        logAlert("Error de conexiÃ³n al intentar cerrar la operaciÃ³n.");
      }
    });
  }
}

/**
 * Orquestador principal para vincular todos los eventos de la Shell UI del dashboard.
 * (Eventos que NO pertenecen a ningún dominio específico como mapa, chat o táctico).
 */
export function bindDashboardEvents() {
  bindPanelEvents();
  bindGlobalClickEvents();
  bindOperationActionEvents();
}
