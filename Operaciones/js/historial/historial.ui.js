import { dom } from "./historial.dom.js";

export function renderTopbar(replay) {
  const operation = replay?.operacion || {};
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (dom.title) {
    dom.title.textContent = operation.codigo || operation.nombre || `Operacion ${operation.id_operacion || ""}`;
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
  const assignment = replay?.asignacion || {};
  const personal = assignment.personal || replay?.personal || [];
  const vehiculos = assignment.vehiculos || replay?.vehiculos || [];
  const equipos = assignment.equipos || replay?.equipos || [];

  dom.infoContent.innerHTML = `
    <section class="historyOpCard">
      <h3 class="historyOpCardTitle">${escapeHtml(operation.nombre || operation.codigo || "Operacion")}</h3>
      <div class="historyMetaGrid">
        ${metaRow("Codigo", operation.codigo)}
        ${metaRow("Estado", operation.estado)}
        ${metaRow("Prioridad", operation.prioridad)}
        ${metaRow("Descripcion", operation.descripcion)}
        ${metaRow("Inicio", formatDateTime(timeline.inicio || operation.fecha_inicio))}
        ${metaRow("Cierre", formatDateTime(timeline.fin || operation.fecha_fin))}
        ${metaRow("Eventos", events.length)}
      </div>
    </section>
    <section class="historyOpCard">
      <h3 class="historyOpCardTitle">Personal asignado</h3>
      ${renderPersonalList(personal)}
    </section>
    <section class="historyOpCard">
      <h3 class="historyOpCardTitle">Vehiculos asignados</h3>
      ${renderVehicleList(vehiculos)}
    </section>
    <section class="historyOpCard">
      <h3 class="historyOpCardTitle">Equipos asignados</h3>
      ${renderEquipmentList(equipos)}
    </section>
    <section class="historyOpCard">
      <h3 class="historyOpCardTitle">Capas guardadas</h3>
      <div class="historyMetaGrid">
        ${metaRow("POIs", countOf(snapshots.pois))}
        ${metaRow("Areas", countOf(snapshots.areas))}
        ${metaRow("Estructuras", countOf(snapshots.estructuras))}
        ${metaRow("Rutas tacticas", countOf(snapshots.rutas_tacticas))}
        ${metaRow("Rutas navegacion", countOf(snapshots.rutas_navegacion))}
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
      <span class="historyMetaValue">${escapeHtml(value ?? "-")}</span>
    </div>
  `;
}

function countOf(value) {
  return Array.isArray(value) ? value.length : 0;
}

function renderPersonalList(items = []) {
  if (!items.length) {
    return '<div class="historyEmpty">Sin personal registrado para esta operacion.</div>';
  }

  return `
    <div class="historyAssignmentList">
      ${items.map((person) => {
        const name = fullPersonName(person) || person.apodo || `Personal #${person.id_personal || ""}`;
        const role = person.rol_en_operacion || person.rol || "";
        const group = groupPath(person.grupo_padre_nombre, person.grupo_nombre);

        return `
          <article class="historyAssignmentItem">
            <div class="historyAssignmentHead">
              <strong>${escapeHtml(name)}</strong>
              ${statusPill(person.estado_asignacion)}
            </div>
            <div class="historyAssignmentMeta">
              ${inlineMeta("Rol", role)}
              ${inlineMeta("Grupo", group)}
              ${inlineMeta("Ultima posicion", coordinatesText(person.latitud, person.longitud))}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderVehicleList(items = []) {
  if (!items.length) {
    return '<div class="historyEmpty">Sin vehiculos registrados para esta operacion.</div>';
  }

  return `
    <div class="historyAssignmentList">
      ${items.map((vehicle) => {
        const name = [vehicle.tipo, vehicle.codigo_interno, vehicle.alias].filter(Boolean).join(" - ")
          || `Vehiculo #${vehicle.id_vehiculo || ""}`;
        const assigned = vehiclePersonName(vehicle);
        const group = groupPath(vehicle.grupo_padre_nombre, vehicle.grupo_directo_nombre || vehicle.grupo_nombre);

        return `
          <article class="historyAssignmentItem">
            <div class="historyAssignmentHead">
              <strong>${escapeHtml(name)}</strong>
              ${statusPill(vehicle.estado_asignacion)}
            </div>
            <div class="historyAssignmentMeta">
              ${inlineMeta("Custodio", assigned)}
              ${inlineMeta("Nivel", vehicle.nivel_asignacion || vehicle.tipo_destino)}
              ${inlineMeta("Grupo", group)}
              ${inlineMeta("Ultima posicion", coordinatesText(vehicle.latitud, vehicle.longitud))}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderEquipmentList(items = []) {
  if (!items.length) {
    return '<div class="historyEmpty">Sin equipos registrados para esta operacion.</div>';
  }

  return `
    <div class="historyAssignmentList">
      ${items.map((equipment) => {
        const name = equipment.nombre || equipment.tipo_equipo || `Equipo #${equipment.id_equipo || ""}`;
        const identifier = equipment.numero_serie || "Sin identificador";
        const destination = equipmentDestination(equipment);

        return `
          <article class="historyAssignmentItem">
            <div class="historyAssignmentHead">
              <strong>${escapeHtml(name)}</strong>
              ${statusPill(equipment.estado_asignacion)}
            </div>
            <div class="historyAssignmentMeta">
              ${inlineMeta("Identificador", identifier)}
              ${inlineMeta("Categoria", equipment.categoria)}
              ${inlineMeta("Tipo", equipment.tipo_equipo)}
              ${inlineMeta("Destino", destination)}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function fullPersonName(person) {
  return [person.puesto, person.nombre, person.apellido].filter(Boolean).join(" ").trim();
}

function vehiclePersonName(vehicle) {
  const name = [
    vehicle.personal_puesto,
    vehicle.personal_nombre || vehicle.asignado_a_nombre,
    vehicle.personal_apellido || vehicle.asignado_a_apellido
  ].filter(Boolean).join(" ").trim();

  return [formatRole(vehicle.personal_rol), name || vehicle.asignado_a_apodo].filter(Boolean).join(" ").trim();
}

function equipmentDestination(equipment) {
  if (equipment.tipo_destino === "VEHICULO") {
    return [equipment.asignado_a_vehiculo, equipment.vehiculo_alias].filter(Boolean).join(" - ");
  }

  if (equipment.tipo_destino === "GRUPO") {
    return groupPath(equipment.flotilla_asignada, equipment.grupo_asignado);
  }

  const personDestination = [formatRole(equipment.personal_rol), equipment.asignado_a_personal].filter(Boolean).join(" ").trim();
  return personDestination || groupPath(equipment.personal_flotilla_nombre, equipment.personal_grupo_nombre);
}

function groupPath(parent, child) {
  const parts = [parent, child]
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);

  return parts.join(" / ");
}

function formatRole(value) {
  const role = String(value || "").trim().toUpperCase();
  return role ? `(${role})` : "";
}

function coordinatesText(lat, lon) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return "";
  return `${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`;
}

function inlineMeta(label, value) {
  if (value == null || value === "") return "";
  return `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`;
}

function statusPill(value) {
  if (!value) return "";
  return `<span class="historyAssignmentStatus">${escapeHtml(value)}</span>`;
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
