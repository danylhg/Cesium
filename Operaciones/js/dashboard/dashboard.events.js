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

/**
 * Vincula los eventos de los botones de acción global (Guardar/Cancelar operación).
 */
function bindOperationActionEvents() {
  // ============================================================
  // BACKEND: "Guardar operación" hoy solo escribe localStorage.
  // Con backend:
  //   PUT /ops/:id  { nombre, descripcion, prioridad, fecha_inicio }
  // Si la operación está ACTIVA, el botón puede cambiar a
  //   PATCH /ops/:id/estado  { estado: "TERMINADA" }
  // para cerrarla formalmente en la BD.
  // ============================================================
  if (dom.saveOpMapBtn) {
    dom.saveOpMapBtn.addEventListener("click", () => {
      const op = getCurrentOperation();
      saveCurrentOperation(op);
      const opName = op.title || op.titulo || "Operación";
      alert(`¡Operación "${opName}" guardada con éxito en el sistema!`);
      window.location.href = "menu_inicial.html";
    });
  }

  if (dom.cancelOpMapBtn) {
    dom.cancelOpMapBtn.addEventListener("click", () => {
      if (confirm("¿Estás seguro que deseas cancelar y salir de la operación?")) {
        window.location.href = "menu_inicial.html";
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
