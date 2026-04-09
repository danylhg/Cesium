// js/dashboard/dashboard.events.js

import { dom } from "./dashboard.dom.js";
import {
  getCurrentOperation,
  saveCurrentOperation,
  isOperationActive
} from "./dashboard.storage.js";
import { togglePanel, closeAllPanels } from "./dashboard.ui.js";

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
        alert("El chat táctico solo está disponible cuando la operación está activa automáticamente por fecha y hora.");
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
        alert("No se encontró la operación activa.");
        return;
      }

      if (!confirm(`¿Activar la operación "${opName}"?\nEsta acción iniciará la operación oficialmente.`)) return;

      try {
        const res = await apiFetchEstado(opId, "ACTIVA");
        if (res.ok) {
          alert(`¡Operación "${opName}" activada con éxito!`);
          window.location.href = "menu_inicial.html";
        } else {
          const data = await res.json().catch(() => ({}));
          alert(`Error al activar: ${data.mensaje || res.statusText}`);
        }
      } catch {
        alert("Error de conexión al intentar activar la operación.");
      }
    });
  }

  if (dom.cancelOpMapBtn) {
    dom.cancelOpMapBtn.addEventListener("click", async () => {
      const op = getCurrentOperation();
      const opId = localStorage.getItem("active_operation_id") || op?.id;
      const opName = op.nombre || op.title || op.titulo || "Operación";

      if (!opId) {
        alert("No se encontró la operación activa.");
        return;
      }

      if (!confirm(`¿Cancelar la operación "${opName}"?\nTodo el personal, vehículos y equipos asignados quedarán liberados.`)) return;

      try {
        const res = await apiFetchEstado(opId, "CANCELADA");
        if (res.ok) {
          window.location.href = "menu_inicial.html";
        } else {
          const data = await res.json().catch(() => ({}));
          alert(`Error al cancelar: ${data.mensaje || res.statusText}`);
        }
      } catch {
        alert("Error de conexión al intentar cancelar la operación.");
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
