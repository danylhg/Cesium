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
import { initChat, bindChatEvents } from "./dashboard.chat.js";
import {
  setTacticalUI,
  bindTacticalEvents
} from "./dashboard.tactical.js";
import { initCesium } from "./dashboard.map.js";
import { bindAreaEvents } from "./dashboard.area.js";
import { restoreTacticalData } from "./dashboard.persistence.js";
import {
  populateRouteVehicleSelect,
  loadRouteForSelectedVehicle,
  initRoutes
} from "./dashboard.routes.js";

Cesium.Ion.defaultAccessToken = "TU_TOKEN_DE_CESIUM_ION";

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

async function apiFetch(path) {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok !== false ? (data.items ?? data) : null;
  } catch {
    return null;
  }
}

async function loadDashboardFromBD() {
  const opId = localStorage.getItem("active_operation_id");
  if (!opId) return null;

  const [operacion, personal, vehiculos, equipos] = await Promise.all([
    apiFetch(`/ops/${opId}`),
    apiFetch(`/ops/${opId}/personal`),
    apiFetch(`/ops/${opId}/vehiculos-asignados`),
    apiFetch(`/ops/${opId}/equipos-asignados`)
  ]);

  if (!operacion) return null;
  return { operacion, personal: personal || [], vehiculos: vehiculos || [], equipos: equipos || [] };
}

// ── User info bar ────────────────────────────────────────────
const username = localStorage.getItem("username") || "admin";
if (dom.who) dom.who.textContent = `(${username})`;

if (dom.logout) {
  dom.logout.onclick = () => {
    const op = getCurrentOperation();
    const esPlanificada = (op.phase || "planificada") === "planificada";
    if (esPlanificada) {
      const ok = confirm("¿Seguro que quieres salir? Se descartará toda la información ingresada.");
      if (!ok) return;
    }
    window.location.href = "menu_inicial.html";
  };
}

// ── Map / tactical load ──────────────────────────────────────
function loadCurrentOperationOnMap() {
  const op = getCurrentOperation();
  dashboardState.currentOperation = op;
  if (!op || !dashboardState.viewer) return;
  populateRouteVehicleSelect(op);
  loadRouteForSelectedVehicle();
  restoreTacticalData();
}

// ── Socket.io connection ─────────────────────────────────────
function connectSocket(opId) {
  // window.io is provided by /socket.io/socket.io.js (loaded in HTML)
  if (!window.io) {
    console.warn("[SOCKET] socket.io client no disponible");
    return null;
  }
  const socket = window.io(API_BASE, { transports: ["websocket", "polling"] });

  socket.on("connect", () => {
    console.log("[SOCKET] conectado:", socket.id);
    socket.emit("join_operacion", { id_operacion: Number(opId) });
  });

  socket.on("connect_error", (err) => {
    console.error("[SOCKET] error de conexión:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[SOCKET] desconectado:", reason);
  });

  return socket;
}

// ── Main init ────────────────────────────────────────────────
window.addEventListener("load", async () => {
  initCesium();
  bindChatEvents();
  bindTacticalEvents();
  bindAreaEvents();
  bindDashboardEvents();
  setTacticalUI();
  loadCurrentOperationOnMap();

  // Abrir panel de info al cargar
  if (dom.infoPanel) dom.infoPanel.classList.add("open");
  if (dom.toggleInfoPanel) dom.toggleInfoPanel.classList.add("active");

  // Cargar datos de la operación desde BD
  const bdData = await loadDashboardFromBD();
  if (bdData) {
    saveCurrentOperation({ ...bdData.operacion, id: bdData.operacion.id_operacion });
    renderInfoPanel(bdData);
  } else {
    renderInfoPanel();
  }
  updateChatAvailability();

  // Conectar Socket.io — chat y rutas en tiempo real
  const opId = localStorage.getItem("active_operation_id");
  if (opId) {
    const socket = connectSocket(opId);
    if (socket) {
      initChat(opId, socket);
      initRoutes(socket);
    }
  }

  // Poblar selector de vehículos con datos del backend
  if (bdData?.vehiculos?.length) {
    populateRouteVehicleSelect(bdData.vehiculos);
  }

  // Refresco periódico solo del panel de info (chat ya va por socket)
  setInterval(async () => {
    const fresh = await loadDashboardFromBD();
    if (fresh) {
      saveCurrentOperation({ ...fresh.operacion, id: fresh.operacion.id_operacion });
      renderInfoPanel(fresh);
    }
    updateChatAvailability();
  }, 30000);
});
