import { dom } from "./historial.dom.js";

export function renderTopbar(replay) {
  const operation = replay?.operacion || {};
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (dom.title) {
    dom.title.textContent = operation.codigo || operation.nombre || `Operación ${operation.id_operacion || ""}`;
  }

  if (dom.statusBadge) {
    dom.statusBadge.textContent = operation.estado || "Historial";
  }

  if (dom.who) {
    dom.who.textContent = user?.nombre || user?.username || "";
  }
}

export function renderOperationInfo(replay) {
  const operation = replay?.operacion || {};
  const timeline = replay?.timeline || {};
  const events = timeline.eventos || [];
  const snapshots = replay?.snapshots || {};

  dom.infoContent.innerHTML = `
    <section class="historyOpCard">
      <h3 class="historyOpCardTitle">${escapeHtml(operation.nombre || operation.codigo || "Operación")}</h3>
      <div class="historyMetaGrid">
        ${metaRow("Código", operation.codigo)}
        ${metaRow("Estado", operation.estado)}
        ${metaRow("Inicio", formatDateTime(timeline.inicio || operation.fecha_inicio))}
        ${metaRow("Cierre", formatDateTime(timeline.fin || operation.fecha_fin))}
        ${metaRow("Eventos", events.length)}
      </div>
    </section>
    <section class="historyOpCard">
      <h3 class="historyOpCardTitle">Capas guardadas</h3>
      <div class="historyMetaGrid">
        ${metaRow("POIs", countOf(snapshots.pois))}
        ${metaRow("Áreas", countOf(snapshots.areas))}
        ${metaRow("Estructuras", countOf(snapshots.estructuras))}
        ${metaRow("Rutas tácticas", countOf(snapshots.rutas_tacticas))}
        ${metaRow("Dibujos", countOf(snapshots.dibujos))}
      </div>
    </section>
  `;
}

export function renderTimelineTime(currentMs, endMs, events = []) {
  if (dom.currentTime) {
    dom.currentTime.textContent = formatDateTime(currentMs);
  }

  if (dom.totalTime) {
    dom.totalTime.textContent = formatDateTime(endMs);
  }

  if (dom.eventCounter) {
    const visibleEvents = events.filter((event) => Date.parse(event.occurred_at) <= currentMs).length;
    dom.eventCounter.textContent = `${visibleEvents}/${events.length} eventos`;
  }
}

export function renderPlaybackState(isPlaying) {
  if (dom.playPause) {
    dom.playPause.textContent = isPlaying ? "⏸" : "▶";
  }
}

export function renderError(message) {
  if (dom.infoContent) {
    dom.infoContent.innerHTML = `<div class="historyEmpty">${escapeHtml(message)}</div>`;
  }

  if (dom.statusBadge) {
    dom.statusBadge.textContent = "Error";
  }
}

export function formatDateTime(value) {
  if (!value && value !== 0) return "--:--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleString("es-MX", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function metaRow(label, value) {
  return `
    <div class="historyMetaItem">
      <span class="historyMetaLabel">${escapeHtml(label)}</span>
      <span class="historyMetaValue">${escapeHtml(value ?? "—")}</span>
    </div>
  `;
}

function countOf(value) {
  return Array.isArray(value) ? value.length : 0;
}

export function renderChatMessages(events) {
  if (!dom.chatMessages) return;

  const chatEvents = events.filter(ev => {
    if (ev.tipo_evento !== "chat_mensaje") return false;
    const msg = ev.payload || {};
    // Descarta mensajes sin remitente identificable (mensajes de sistema)
    const sender = msg.remitente_apodo || msg.apodo || msg.nombre || msg.username || "";
    return sender.trim().length > 0;
  });

  if (!chatEvents.length) {
    dom.chatMessages.innerHTML = '<div class="historyEmpty">Sin mensajes en el historial.</div>';
    return;
  }

  dom.chatMessages.innerHTML = chatEvents.map((ev) => {
    const msg = ev.payload || {};
    const sender = msg.remitente_apodo || msg.apodo || msg.nombre || msg.username || "";
    const text = msg.contenido || msg.texto || msg.mensaje || "";
    const ms = Date.parse(ev.occurred_at);
    return `
      <div class="historyChatMessage" data-ms="${ms}" style="display:none">
        <div class="historyChatMessageHeader">
          <span>${escapeHtml(sender)}</span>
          <span>${formatDateTime(ev.occurred_at)}</span>
        </div>
        <div class="historyChatMessageBody">${escapeHtml(text)}</div>
      </div>`;
  }).join("");
}

export function updateChatToTime(currentMs) {
  if (!dom.chatMessages) return;

  let lastVisible = null;
  for (const el of dom.chatMessages.querySelectorAll(".historyChatMessage")) {
    const visible = Number(el.dataset.ms) <= currentMs;
    el.style.display = visible ? "" : "none";
    if (visible) lastVisible = el;
  }

  if (lastVisible) {
    lastVisible.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}
