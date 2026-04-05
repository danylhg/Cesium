// js/dashboard/dashboard.js

import { dashboardState } from "./dashboard.state.js";
import { dom } from "./dashboard.dom.js";
import {
  getCurrentOperation,
  saveCurrentOperation
} from "./dashboard.storage.js";
import {
  renderInfoPanel,
  updateChatAvailability
} from "./dashboard.ui.js";
import { bindDashboardEvents } from "./dashboard.events.js";

import {
  switchChatChannel,
  pushChatMessage,
  bindChatEvents
} from "./dashboard.chat.js";
import {
  setTacticalUI,
  bindTacticalEvents
} from "./dashboard.tactical.js";
import { initCesium } from "./dashboard.map.js";
import { bindAreaEvents } from "./dashboard.area.js";
import { restoreTacticalData } from "./dashboard.persistence.js";
import {
  populateRouteVehicleSelect,
  loadRouteForSelectedVehicle
} from "./dashboard.routes.js";

Cesium.Ion.defaultAccessToken = "TU_TOKEN_DE_CESIUM_ION";

// Session validation is now handled globally by js/auth_check.js

const username = localStorage.getItem("username") || "admin";
if (dom.who) {
  dom.who.textContent = `(${username})`;
}

if (dom.logout) {
  dom.logout.onclick = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("rol");
    localStorage.removeItem("userData");
    localStorage.removeItem("username");
    localStorage.removeItem("session");
    window.location.href = "login.html";
  };
}

// Event listeners for panels are now managed in dashboard.events.js via bindDashboardEvents()


// ============================================================
// BACKEND: loadCurrentOperationOnMap() carga todo de
// localStorage hoy. Con backend se convierte en:
//   const data = await apiFetch(`/ops/${id}/mapa`).then(r=>r.json())
// Luego:
//   - populateRouteVehicleSelect(data.vehiculos)
//   - cargar data.rutas_navegacion en el mapa
//   - cargar data.capas (POIs, áreas, edificios)
//   - posicionar personal y vehículos con sus lat/lon
// ============================================================
function loadCurrentOperationOnMap() {
  const op = getCurrentOperation();
  dashboardState.currentOperation = op;

  if (!op || !dashboardState.viewer) return;

  populateRouteVehicleSelect(op);
  loadRouteForSelectedVehicle();
  restoreTacticalData();
}

// BACKEND: refreshAutomaticPhase() recalcula la fase en cliente y guarda en localStorage.
// Con backend el estado viene del servidor — no se recalcula localmente.
// El setInterval(refreshAutomaticPhase, 30000) se reemplaza por eventos Socket.IO:
//   socket.on("op_estado_cambio", ({ estado }) => updateChatAvailability())
function refreshAutomaticPhase() {
  const op = getCurrentOperation();
  saveCurrentOperation(op);
  renderInfoPanel();
  updateChatAvailability(pushChatMessage);
}


// ============================================================
// BACKEND: window load — secuencia de inicialización.
// Con backend se vuelve async:
//   1. GET /me → validar token, obtener username
//   2. GET /ops/:id/mapa → toda la data de la operación
//   3. Conectar Socket.IO a la sala "op_<id_operacion>"
//   4. setInterval se reemplaza por socket.on("op_estado_cambio")
// ============================================================
window.addEventListener("load", () => {
  initCesium();
  bindChatEvents();
  bindTacticalEvents();
  bindAreaEvents();
  bindDashboardEvents();
  setTacticalUI();
  refreshAutomaticPhase();
  loadCurrentOperationOnMap();
  switchChatChannel("cet");

  if (dom.infoPanel) dom.infoPanel.classList.add("open");
  if (dom.toggleInfoPanel) dom.toggleInfoPanel.classList.add("active");

  // BACKEND: force_open_chat es una bandera localStorage para abrir el chat
  // al llegar desde menu_inicial con una operación activa.
  // Con backend esto puede resolverse pasando un query param en la URL (?chat=1)
  // o detectando directamente que el estado es ACTIVA en la respuesta de GET /ops/:id.
  if (localStorage.getItem("force_open_chat") === "true") {
    localStorage.removeItem("force_open_chat");
    if (dom.chatPanel) dom.chatPanel.classList.add("open");
    if (dom.toggleChatPanel) dom.toggleChatPanel.classList.add("active");
  }

  setInterval(refreshAutomaticPhase, 30000);
});


// Event listeners for global action click (closing panels) moved to dashboard.events.js
// Operation action events (Save/Cancel) and their backend comments moved to dashboard.events.js
