// js/dashboard/dashboard.chat.js

import { dom } from "./dashboard.dom.js";
import { escapeHtml } from "./dashboard.storage.js";
import { formatTime } from "./dashboard.ui.js";

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

let _opId   = null;
let _socket = null;

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

// ── Build a single chat bubble ──────────────────────────────
function buildBubble(msg) {
  const mine  = isMine(msg);
  const autor = escapeHtml(msg.autor_nombre || "Sistema");
  const hora  = escapeHtml(formatTime(msg.fecha_envio));
  const texto = escapeHtml(msg.contenido || "");
  const tipo  = (msg.tipo_mensaje || "NORMAL").toUpperCase();

  const extra = tipo === "URGENTE" ? " urgente" : tipo === "SISTEMA" ? " sistema" : "";

  const header = tipo !== "SISTEMA"
    ? `<div class="chatBubbleHeader"><span>${autor}</span><span>${hora}</span></div>`
    : `<div class="chatBubbleTime">${hora}</div>`;

  return `
    <div class="chatBubble${mine ? " mine" : ""}${extra}" data-id="${msg.id_mensaje ?? ""}">
      ${header}
      <div class="chatBubbleText">${texto}</div>
    </div>
  `;
}

// ── Append a single message (no-duplicate guard) ────────────
function appendMessage(msg) {
  if (!dom.chatMessages) return;

  // Skip if already in DOM
  if (msg.id_mensaje && dom.chatMessages.querySelector(`[data-id="${msg.id_mensaje}"]`)) return;

  const atBottom =
    dom.chatMessages.scrollHeight - dom.chatMessages.scrollTop <=
    dom.chatMessages.clientHeight + 60;

  dom.chatMessages.insertAdjacentHTML("beforeend", buildBubble(msg));

  if (atBottom) dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

// ── Load history from backend ───────────────────────────────
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

    if (!dom.chatMessages) return;
    dom.chatMessages.innerHTML = "";
    data.items.forEach(appendMessage);
  } catch (err) {
    console.error("[CHAT] Error cargando mensajes:", err);
  }
}

// ── Send a message (POST only — socket brings it back) ──────
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
      if (dom.chatInput) dom.chatInput.value = text; // restore on error
    }
    // Message will arrive via socket event — do NOT add locally
  } catch (err) {
    console.error("[CHAT] Error enviando mensaje:", err);
    if (dom.chatInput) dom.chatInput.value = text;
  } finally {
    if (dom.sendChatBtn) dom.sendChatBtn.disabled = false;
    dom.chatInput?.focus();
  }
}

// ── Public: initialize chat with socket ────────────────────
export function initChat(opId, socket) {
  _opId   = opId;
  _socket = socket;

  // Real-time: server emits chat_message after every DB insert
  socket.on("chat_message", (msg) => {
    appendMessage(msg);
  });

  // Load historical messages from DB
  loadMessages();
}

// ── Public: bind UI events ──────────────────────────────────
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
      dom.chatTabCet.classList.add("active");
      dom.chatTabCells?.classList.remove("active");
    });
  }
  if (dom.chatTabCells) {
    dom.chatTabCells.addEventListener("click", () => {
      dom.chatTabCells.classList.add("active");
      dom.chatTabCet?.classList.remove("active");
    });
  }
}
