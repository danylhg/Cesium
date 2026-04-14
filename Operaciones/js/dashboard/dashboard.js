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
  bindTacticalEvents,
  initPoiSocket,
  loadPoisFromBackend,
  loadAreasFromBackend,
  loadStructuresFromBackend,
  loadOperationZoneFromBackend
} from "./dashboard.tactical.js";
import { initCesium, centerMapOnOperationZone } from "./dashboard.map.js";
import { bindAreaEvents } from "./dashboard.area.js";
import { restoreTacticalData } from "./dashboard.persistence.js";
import {
  populateRouteVehicleSelect,
  loadRouteForSelectedVehicle,
  initRoutes
} from "./dashboard.routes.js";
import { loadTrackingFromBackend, loadTrackingFromMapaData, initTrackingSocket } from "./dashboard.tracking.js";

Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmMjQ3NDAzYi1mNDYyLTQzYTgtOTNiOC02MGE1YmJhOGYwYjQiLCJpZCI6NDAwOTM3LCJpYXQiOjE3NzQ1NDYwNjZ9.Phla8axJI8tGCSQwfvmvykzxW2tHXcuc0q1D5n01BmU";

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;
const CONNECTION_LOST_MESSAGE = "Se perdio la conexion con el servidor.";
let connectionBanner = null;
let operationClosedHandled = false;

function ensureConnectionBanner() {
  if (connectionBanner) return connectionBanner;

  connectionBanner = document.createElement("div");
  connectionBanner.id = "serverConnectionBanner";
  connectionBanner.textContent = CONNECTION_LOST_MESSAGE;
  Object.assign(connectionBanner.style, {
    position: "fixed",
    top: "18px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "99999",
    display: "none",
    padding: "10px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(127,29,29,0.94)",
    color: "#fff",
    fontWeight: "700",
    fontSize: "14px",
    boxShadow: "0 10px 28px rgba(0,0,0,0.28)"
  });

  document.body.appendChild(connectionBanner);
  return connectionBanner;
}

function setServerConnectionState(isConnected, message = CONNECTION_LOST_MESSAGE) {
  const banner = ensureConnectionBanner();
  banner.textContent = message;
  banner.style.display = isConnected ? "none" : "block";
}

async function apiFetchEstado(opId, nuevoEstado) {
  const token = localStorage.getItem("token");
  try {
    return await fetch(`${API_BASE}/ops/${opId}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ estado: nuevoEstado })
    });
  } catch {
    return null;
  }
}

function showPlanningExitModal() {
  const modal = document.getElementById("planningExitModal");
  const backdrop = document.getElementById("planningExitBackdrop");
  const saveBtn = document.getElementById("planningExitSaveBtn");
  const discardBtn = document.getElementById("planningExitDiscardBtn");
  const cancelBtn = document.getElementById("planningExitCancelBtn");

  if (!modal || !saveBtn || !discardBtn || !cancelBtn) {
    return Promise.resolve("save");
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
      saveBtn.removeEventListener("click", onSave);
      discardBtn.removeEventListener("click", onDiscard);
      cancelBtn.removeEventListener("click", onCancel);
      backdrop?.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKeyDown);
      resolve(value);
    };

    const onSave = () => finish("save");
    const onDiscard = () => finish("discard");
    const onCancel = () => finish("cancel");
    const onKeyDown = (event) => {
      if (event.key === "Escape") finish("cancel");
    };

    saveBtn.addEventListener("click", onSave);
    discardBtn.addEventListener("click", onDiscard);
    cancelBtn.addEventListener("click", onCancel);
    backdrop?.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKeyDown);
  });
}

function handleClosedOperation(operacion) {
  if (operationClosedHandled || !operacion) return;

  const estado = String(operacion.estado || operacion.phase || "").toLowerCase();
  if (!["cerrada", "cancelada"].includes(estado)) return;

  operationClosedHandled = true;
  alert(`La operacion "${operacion.nombre || operacion.titulo || "actual"}" ya fue ${estado}.`);
  window.location.href = "menu_inicial.html";
}

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

  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/mapa`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok) return null;
    return {
      operacion: data.operacion,
      zona_operacion: data.zona_operacion || null,
      personal: data.personal || [],
      vehiculos: data.vehiculos || [],
      equipos: data.equipos || [],
      _mapaData: data   // para tracking
    };
  } catch {
    return null;
  }
}

async function checkServerHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const ok = data?.ok !== false;
    setServerConnectionState(ok);
    return ok;
  } catch {
    setServerConnectionState(false);
    return false;
  }
}

// ── User info bar ────────────────────────────────────────────
const username = localStorage.getItem("username") || "admin";
if (dom.who) dom.who.textContent = `(${username})`;

if (dom.logout) {
  dom.logout.onclick = async () => {
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
  populateRouteVehicleSelect(op?.vehiculos || []);
  loadRouteForSelectedVehicle();
  restoreTacticalData();
}

// ── Socket.io connection ─────────────────────────────────────
function loadSocketIOScript() {
  return new Promise((resolve, reject) => {
    if (window.io) return resolve();
    const script = document.createElement("script");
    script.src = `${API_BASE}/socket.io/socket.io.js`;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`No se pudo cargar socket.io desde ${API_BASE}`));
    document.head.appendChild(script);
  });
}

async function connectSocket(opId) {
  try {
    await loadSocketIOScript();
  } catch (err) {
    console.warn("[SOCKET] socket.io client no disponible:", err.message);
    return null;
  }
  const socket = window.io(API_BASE, { transports: ["websocket", "polling"] });

  socket.on("connect", () => {
    console.log("[SOCKET] conectado:", socket.id);
    setServerConnectionState(true);
    socket.emit("join_operacion", { id_operacion: Number(opId) });
  });

  socket.on("connect_error", (err) => {
    setServerConnectionState(false);
    console.error("[SOCKET] error de conexión:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[SOCKET] desconectado:", reason);
    setServerConnectionState(false);
  });

  return socket;
}

// ── Main init ────────────────────────────────────────────────
function bindPlanningLogoutChoice() {
  if (!dom.logout) return;

  dom.logout.onclick = async () => {
    const op = getCurrentOperation();
    const esPlanificada = (op.phase || "planificada") === "planificada";

    if (esPlanificada) {
      const decision = await showPlanningExitModal();
      if (decision === "cancel") return;

      if (decision === "discard") {
        const opId = localStorage.getItem("active_operation_id") || op?.id;
        if (!opId) {
          alert("No se encontro la operacion planificada.");
          return;
        }

        const res = await apiFetchEstado(opId, "CANCELADA");
        if (!res) {
          alert("Error de conexion al intentar salir sin guardar.");
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(`Error al salir sin guardar: ${data.mensaje || res.statusText}`);
          return;
        }
      }
    }

    window.location.href = "menu_inicial.html";
  };
}

window.addEventListener("load", async () => {
  ensureConnectionBanner();
  bindPlanningLogoutChoice();
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
    handleClosedOperation(bdData.operacion);
    saveCurrentOperation({
      ...bdData.operacion,
      id: bdData.operacion.id_operacion,
      zona_operacion: bdData.zona_operacion || null
    });
    renderInfoPanel(bdData);
    setTacticalUI();
    if (bdData.zona_operacion) {
      centerMapOnOperationZone(bdData.zona_operacion);
    }
  } else {
    renderInfoPanel();
  }
  updateChatAvailability();

  // Cargar POIs existentes desde la BD
  await loadPoisFromBackend();
  await loadAreasFromBackend();
  await loadStructuresFromBackend();
  await loadOperationZoneFromBackend();

  // Cargar posiciones de tracking usando datos ya obtenidos (evita segunda llamada a /mapa)
  if (bdData?._mapaData) {
    loadTrackingFromMapaData(bdData._mapaData);
  } else {
    await loadTrackingFromBackend();
  }

  // Conectar Socket.io — chat y rutas en tiempo real
  const opId = localStorage.getItem("active_operation_id");
  if (opId) {
    const socket = await connectSocket(opId);
    if (socket) {
      initChat(opId, socket);
      initRoutes(socket);
      initPoiSocket(socket);
      initTrackingSocket(socket);
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
      handleClosedOperation(fresh.operacion);
      saveCurrentOperation({
        ...fresh.operacion,
        id: fresh.operacion.id_operacion,
        zona_operacion: fresh.zona_operacion || null
      });
      renderInfoPanel(fresh);
      setTacticalUI();
    }
    updateChatAvailability();
  }, 30000);

  checkServerHealth();
  setInterval(checkServerHealth, 10000);
});
