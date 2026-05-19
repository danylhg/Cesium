// js/dashboard/dashboard.events.js

import { dom } from "./dashboard.dom.js";
import {
  getCurrentOperation,
  saveCurrentOperation,
  isOperationActive
} from "./dashboard.storage.js";
import { togglePanel, closeAllPanels, showPersonnelDetail } from "./dashboard.ui.js";
import { saveTacticalData } from "./dashboard.persistence.js";

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

  if (dom.toggleCameraPanel) {
    dom.toggleCameraPanel.addEventListener("click", () => {




      // Independent toggle: doesn't close others, and others don't close it
      const isOpen = dom.cameraPanel.classList.contains("open");
      if (isOpen) {
        dom.cameraPanel.classList.remove("open");
        dom.toggleCameraPanel.classList.remove("active");
      } else {
        dom.cameraPanel.classList.add("open");
        dom.toggleCameraPanel.classList.add("active");
      }
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
 * Muestra un modal de confirmación premium.
 */
function showConfirmationModal({ title, message, confirmText = "Confirmar", onConfirm }) {
  if (!dom.confirmationModal) return;

  dom.confirmationTitle.textContent = title;
  dom.confirmationMessage.textContent = message;
  dom.confirmationConfirmBtn.textContent = confirmText;

  dom.confirmationModal.classList.remove("hidden");

  const close = () => {
    dom.confirmationModal.classList.add("hidden");
    dom.confirmationConfirmBtn.removeEventListener("click", handleConfirm);
    dom.confirmationCancelBtn.removeEventListener("click", close);
  };

  const handleConfirm = () => {
    onConfirm();
    close();
  };

  dom.confirmationConfirmBtn.addEventListener("click", handleConfirm);
  dom.confirmationCancelBtn.addEventListener("click", close);
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



      try {
        saveTacticalData();
        saveCurrentOperation(op);
        window.location.href = "menu_inicial.html";
      } catch (e) {
        console.error(e);
        alert("Error al guardar la operación.");
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

      showConfirmationModal({
        title: "¿Cancelar operación?",
        message: `¿Estás seguro de que quieres cancelar la operación "${opName}"? Se perderán todos los datos planificados.`,
        confirmText: "Cancelar Operación",
        onConfirm: async () => {
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
        }
      });
    });
  }

  const activateOpBtn = document.getElementById("activateOpBtn");
  if (activateOpBtn) {
    activateOpBtn.addEventListener("click", async () => {
      const op = getCurrentOperation();
      const opId = localStorage.getItem("active_operation_id") || op?.id_operacion || op?.id;
      const opName = op.nombre || op.title || op.titulo || "Operacion";

      if (!opId) {
        alert("No se encontro la operacion activa.");
        return;
      }



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
          alert(`Error al activar: ${data.mensaje || res.statusText}`);
        }
      } catch (e) {
        console.error(e);
        alert("Error de conexion al intentar activar la operacion.");
      }
    });
  }

  const closeActiveBtn = document.getElementById("closeActiveOpBtn");
  if (closeActiveBtn) {
    closeActiveBtn.addEventListener("click", async () => {
      const op = getCurrentOperation();
      const opId = localStorage.getItem("active_operation_id") || op?.id;
      const opName = op.nombre || op.title || op.titulo || "Operación";

      if (!opId) {
        alert("No se encontró la operación activa.");
        return;
      }

      showConfirmationModal({
        title: "¿Terminar operación?",
        message: `¿Estás seguro de que quieres terminar la operación "${opName}"?`,
        confirmText: "Terminar",
        onConfirm: async () => {
          try {
            const res = await apiFetchEstado(opId, "CERRADA");
            if (res.ok) {
              window.location.href = "menu_inicial.html";
            } else {
              const data = await res.json().catch(() => ({}));
              alert(`Error al cerrar: ${data.mensaje || res.statusText}`);
            }
          } catch {
            alert("Error de conexión al intentar cerrar la operación.");
          }
        }
      });
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
  bindPersonnelDetailEvents();
}

function bindPersonnelDetailEvents() {
  // Delegate clicks on .person-link inside infoPanel
  if (dom.infoPanel) {
    dom.infoPanel.addEventListener('click', (e) => {
      const link = e.target.closest('.person-link');
      if (link) {
        const personId = link.getAttribute('data-person-id');
        showPersonnelDetail(personId, {
          x: e.clientX,
          y: e.clientY,
          name: link.getAttribute('data-person-name') || link.textContent || ""
        });
      }
    });
  }

  // Close modal
  if (dom.btnClosePersonnelDetail) {
    dom.btnClosePersonnelDetail.onclick = () => {
      dom.personnelDetailModal.classList.add('hidden');
    };
  }

  if (dom.personnelDetailBackdrop) {
    dom.personnelDetailBackdrop.onclick = () => {
      dom.personnelDetailModal.classList.add('hidden');
    };
  }

  if (dom.personInfoPopup) {
    dom.personInfoPopup.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  if (dom.btnClosePersonInfoPopup) {
    dom.btnClosePersonInfoPopup.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.personInfoPopup?.classList.add('hidden');
    };
  }
}
