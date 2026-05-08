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
    <section class="historyOpCard">
      <h3 class="historyOpCardTitle">Grabaciones</h3>
      ${renderRecordingList(replay?.recordings || [], replay?.recordingsError)}
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

function renderRecordingList(recordings, error) {
  if (error) {
    return `<div class="historyEmpty">No se pudieron cargar las grabaciones: ${escapeHtml(error)}</div>`;
  }

  if (!recordings.length) {
    return '<div class="historyEmpty">Sin grabaciones guardadas.</div>';
  }

  return `
    <div class="historyRecordingList">
      ${recordings.map(recording => `
        <article class="historyRecordingItem">
          <div class="historyRecordingInfo">
            <strong>Stream #${escapeHtml(recording.id_stream)}</strong>
            <span>${escapeHtml(recording.stream_label || recording.stream_kind || "Grabacion")}</span>
            <small>${escapeHtml(formatDateTime(recording.created_at))} | ${escapeHtml(formatBytes(recording.size_bytes))} | ${escapeHtml(formatDuration(recording.duration_ms))}</small>
          </div>
          <button class="historyRecordingDownload" type="button" data-recording-id="${escapeHtml(recording.id_recording)}">Descargar</button>
        </article>
      `).join("")}
    </div>
  `;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(value) {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "--:--";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function renderChatMessages(events) {
  if (!dom.chatMessages) return;

  const chatEvents = events.filter(ev => {
    if (ev.tipo_evento !== "chat_mensaje") return false;
    const contenido = ev.payload?.contenido || "";
    if (contenido.includes("automáticamente por trigger de BD.")) return false;
    return true;
  });

  if (!chatEvents.length) {
    dom.chatMessages.innerHTML = '<div class="historyEmpty">Sin mensajes en el historial.</div>';
    return;
  }

  dom.chatMessages.innerHTML = chatEvents.map(ev => buildBubble(ev)).join("");
}

export function updateChatToTime(currentMs) {
  if (!dom.chatMessages) return;

  let lastVisible = null;
  for (const el of dom.chatMessages.querySelectorAll(".chatBubble[data-ms]")) {
    const visible = Number(el.dataset.ms) <= currentMs;
    el.style.display = visible ? "" : "none";
    if (visible) lastVisible = el;
  }

  if (lastVisible) {
    lastVisible.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function buildBubble(ev) {
  const msg = ev.payload || {};
  const tipo = (msg.tipo_mensaje || "NORMAL").toUpperCase();
  const rol = (msg.autor_rol || "").toLowerCase();
  const autor = escapeHtml(msg.autor_nombre || "");
  const hora = formatDateTime(ev.occurred_at);
  const texto = escapeHtml(msg.contenido || "");
  const ms = Date.parse(ev.occurred_at);

  const typeExtra = tipo === "URGENTE" ? " urgente" : tipo === "SISTEMA" ? " sistema" : "";
  const rolClass = rol ? ` rol-${rol}` : "";

  const header = tipo !== "SISTEMA"
    ? `<div class="chatBubbleHeader"><span>${autor}</span><span>${hora}</span></div>`
    : `<div class="chatBubbleTime">${hora}</div>`;

  return `<div class="chatBubble${typeExtra}${rolClass}" data-ms="${ms}" style="display:none">${header}<div class="chatBubbleText">${texto}</div></div>`;
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
