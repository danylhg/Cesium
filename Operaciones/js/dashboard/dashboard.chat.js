// js/dashboard/dashboard.chat.js

import { dom } from "./dashboard.dom.js";
import { escapeHtml } from "./dashboard.storage.js";
import { formatTime } from "./dashboard.ui.js";

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

let _opId      = null;
let _socket    = null;
let _activeTab = "cet";          // "cet" | "global"
let _allMsgs   = [];             // todos los mensajes en memoria

// ── JWT helper ──────────────────────────────────────────────
function getMyInfo() {
  const token = localStorage.getItem("token");
  if (!token) return {};
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { sub: payload.sub, tabla: payload.tabla };
  } catch { return {}; }
}

function isMine(msg) {
  const { sub, tabla } = getMyInfo();
  if (!sub) return false;
  if (tabla === "usuario")   return String(msg.id_usuario)  === String(sub);
  if (tabla === "personal")  return String(msg.id_personal) === String(sub);
  return false;
}

// ── Visibilidad según tab activo ────────────────────────────
// Tab CET  → solo mensajes de ADMIN, CUT y CET
// Tab Global → todos
function isVisibleInTab(msg) {
  if (_activeTab === "global") return true;
  const rol = (msg.autor_rol || "").toUpperCase();
  return ["ADMIN", "CUT", "CET"].includes(rol);
}

// ── Build a single chat bubble ──────────────────────────────
function buildBubble(msg) {
  const mine  = isMine(msg);
  const autor = escapeHtml(msg.autor_nombre || "Sistema");
  const hora  = escapeHtml(formatTime(msg.fecha_envio));
  const texto = escapeHtml(msg.contenido || "");
  const tipo  = (msg.tipo_mensaje || "NORMAL").toUpperCase();
  const rol   = (msg.autor_rol   || "").toLowerCase();    // admin | cut | cet | cell

  const typeExtra = tipo === "URGENTE" ? " urgente" : tipo === "SISTEMA" ? " sistema" : "";
  const rolClass  = rol ? ` rol-${rol}` : "";

  const header = tipo !== "SISTEMA"
    ? `<div class="chatBubbleHeader"><span>${autor}</span><span>${hora}</span></div>`
    : `<div class="chatBubbleTime">${hora}</div>`;

  return `
    <div class="chatBubble${mine ? " mine" : ""}${typeExtra}${rolClass}" data-id="${msg.id_mensaje ?? ""}">
      ${header}
      <div class="chatBubbleText">${texto}</div>
    </div>
  `;
}

// ── Re-renderiza todos los mensajes visibles ────────────────
function renderMessages() {
  if (!dom.chatMessages) return;
  dom.chatMessages.innerHTML = "";
  _allMsgs.filter(isVisibleInTab).forEach(msg => {
    dom.chatMessages.insertAdjacentHTML("beforeend", buildBubble(msg));
  });
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

// ── Agrega un mensaje (guard de duplicados) ─────────────────
function appendMessage(msg) {
  if (!dom.chatMessages) return;

  // Dedup por id_mensaje
  if (msg.id_mensaje && _allMsgs.some(m => m.id_mensaje === msg.id_mensaje)) return;
  _allMsgs.push(msg);

  if (!isVisibleInTab(msg)) return;

  const atBottom =
    dom.chatMessages.scrollHeight - dom.chatMessages.scrollTop <=
    dom.chatMessages.clientHeight + 60;

  dom.chatMessages.insertAdjacentHTML("beforeend", buildBubble(msg));

  if (atBottom) dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

// ── Carga historial desde backend ──────────────────────────
async function loadMessages() {
  if (!_opId) return;
  try {
    const token = localStorage.getItem("token");
    const res   = await fetch(`${API_BASE}/ops/${_opId}/chat/messages`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.items)) return;

    _allMsgs = [];
    data.items.forEach(msg => _allMsgs.push(msg));
    renderMessages();
  } catch (err) {
    console.error("[CHAT] Error cargando mensajes:", err);
  }
}

// ── Envía un mensaje (POST → socket lo devuelve) ────────────
async function sendMessage() {
  if (!_opId) return;
  const text = dom.chatInput?.value.trim();
  if (!text) return;

  dom.chatInput.value = "";
  if (dom.sendChatBtn) dom.sendChatBtn.disabled = true;

  try {
    const token = localStorage.getItem("token");
    const res   = await fetch(`${API_BASE}/ops/${_opId}/chat/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ contenido: text, tipo_mensaje: "NORMAL" })
    });
    if (!res.ok) {
      console.error("[CHAT] Error al enviar:", res.status);
      if (dom.chatInput) dom.chatInput.value = text;
    }
    // El mensaje llega vía socket — no se agrega localmente aquí
  } catch (err) {
    console.error("[CHAT] Error enviando mensaje:", err);
    if (dom.chatInput) dom.chatInput.value = text;
  } finally {
    if (dom.sendChatBtn) dom.sendChatBtn.disabled = false;
    dom.chatInput?.focus();
  }
}

// ── Público: inicializa chat con socket ─────────────────────
export function initChat(opId, socket) {
  _opId   = opId;
  _socket = socket;

  socket.on("chat_message", (msg) => {
    appendMessage(msg);
  });

  loadMessages();
}

// ── Público: enlaza eventos de UI ───────────────────────────
export function bindChatEvents() {
  if (dom.sendChatBtn) {
    dom.sendChatBtn.addEventListener("click", sendMessage);
  }

  if (dom.chatInput) {
    dom.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (dom.chatTabCet) {
    dom.chatTabCet.addEventListener("click", () => {
      _activeTab = "cet";
      dom.chatTabCet.classList.add("active");
      dom.chatTabCells?.classList.remove("active");
      renderMessages();
    });
  }

  if (dom.chatTabCells) {
    dom.chatTabCells.addEventListener("click", () => {
      _activeTab = "global";
      dom.chatTabCells.classList.add("active");
      dom.chatTabCet?.classList.remove("active");
      renderMessages();
    });
  }
}
