// js/dashboard/dashboard.ui.js

import { dom } from "./dashboard.dom.js";
import {
  escapeHtml,
  getCurrentOperation,
  getOperationDateTime,
  getJsonStorage,
  isOperationActive,
  getChatMessages,
  saveChatMessages,
  ASIGNACION_ACTUAL_KEY
} from "./dashboard.storage.js";

export function setRouteInfo(text) {
  if (dom.routeInfo) {
    dom.routeInfo.textContent = text;
  }
}

export function formatDate(value) {
  if (!value) return "No disponible";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "No disponible";
  }
}

export function formatTime(dateIso) {
  try {
    return new Date(dateIso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

export function closeAllPanels() {
  dom.infoPanel?.classList.remove("open");
  dom.routePanel?.classList.remove("open");
  dom.tacticalPanel?.classList.remove("open");
  dom.chatPanel?.classList.remove("open");

  dom.toggleInfoPanel?.classList.remove("active");
  dom.toggleRoutePanel?.classList.remove("active");
  dom.toggleTacticalPanel?.classList.remove("active");
  dom.toggleChatPanel?.classList.remove("active");
}

export function togglePanel(panel, button) {
  if (!panel || !button) return;

  const wasOpen = panel.classList.contains("open");
  closeAllPanels();

  if (!wasOpen) {
    panel.classList.add("open");
    button.classList.add("active");
  }
}

export function renderInfoPanel() {
  const container = document.getElementById("infoPanelContent");
  if (!container) return;

  const operacion = getCurrentOperation();
  const asignacion = getJsonStorage(ASIGNACION_ACTUAL_KEY, {}) || {};

  const personal = Array.isArray(asignacion.personal) && asignacion.personal.length
    ? asignacion.personal
    : (Array.isArray(operacion.personal) ? operacion.personal : []);

  const vehiculos = Array.isArray(asignacion.vehiculos) && asignacion.vehiculos.length
    ? asignacion.vehiculos
    : (Array.isArray(operacion.vehiculos) ? operacion.vehiculos : []);

  const equipos = Array.isArray(asignacion.equipos) && asignacion.equipos.length
    ? asignacion.equipos
    : (Array.isArray(operacion.equipos) ? operacion.equipos : []);

  const esActiva = (operacion.phase || operacion.estado?.toLowerCase()) === "activa";

  const titulo = operacion.title || operacion.titulo || operacion.name || "Sin título";
  const descripcion = operacion.description || operacion.descripcion || "Sin descripción";
  const programada = getOperationDateTime(operacion);

  let fechaP = "No definida";
  if (operacion.fecha_inicio) {
    const parts = operacion.fecha_inicio.split("-");
    if (parts.length === 3) {
      fechaP = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else {
      fechaP = operacion.fecha_inicio;
    }
  } else if (programada) {
    fechaP = programada
      .toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      })
      .replace(/\//g, "-");
  }

  const horaP = operacion.hora_inicio || (programada ? programada.toLocaleTimeString() : "No definida");
  const fecha = formatDate(operacion.created_at);

  let personalHtml = "<p>Sin personal asignado.</p>";
  if (personal.length) {
    personalHtml = "";

    const cuts = personal.filter(
      p => ["CUT", "Comandante de Unidad de Trabajo"].includes(p.cargo || p.rol)
    );

    cuts.forEach(c => {
      personalHtml += `
        <div class="miniCard" style="border-left: 3px solid #10b981;">
          <p><strong>CUT:</strong> ${escapeHtml(c.nombre || c.name)}</p>
        </div>
      `;
    });

    const cets = personal.filter(
      p => ["CET", "Comandante de Equipo de trabajo"].includes(p.cargo || p.rol)
    );

    cets.forEach(cet => {
      const miembros = personal.filter(
        p =>
          ["Célula", "Celulas", "Células"].includes(p.cargo || p.rol) &&
          (p.cet === cet.nombre || p.cet === cet.name)
      );

      const flotExt = cet.flotilla && cet.flotilla !== "—"
        ? ` | <strong>Flotilla:</strong> ${escapeHtml(cet.flotilla)}`
        : "";

      personalHtml += `
        <div class="miniCard" style="border-left: 3px solid #3b82f6; margin-top:8px;">
          <p><strong>CET:</strong> ${escapeHtml(cet.nombre || cet.name)}${flotExt}</p>
      `;

      const groups = {};
      miembros.forEach(m => {
        const gName = m.grupo || "Sin grupo";
        if (!groups[gName]) groups[gName] = [];
        groups[gName].push(m);
      });

      Object.entries(groups).forEach(([gName, persons]) => {
        if (gName !== "Sin grupo") {
          personalHtml += `
            <p style="margin-top:6px; font-weight:bold; font-size:12px; color:#d7e3ff;">
              Grupo: ${escapeHtml(gName)}
            </p>
          `;
        } else if (Object.keys(groups).length > 1) {
          personalHtml += `
            <p style="margin-top:6px; font-weight:bold; font-size:12px; color:#d7e3ff;">
              Sin grupo
            </p>
          `;
        }

        persons.forEach(p => {
          personalHtml += `
            <p style="padding-left:10px; margin:2px 0;">
              • ${escapeHtml(p.nombre || p.name)}
            </p>
          `;
        });
      });

      personalHtml += `</div>`;
    });
  }

  let vehiculosHtml = "<p>Sin vehículos asignados.</p>";
  if (vehiculos.length) {
    vehiculosHtml = vehiculos.map(v => {
      const uName = v.unidad || v.nombre || v.alias || "";
      const lines = [];

      if (v.cet && v.cet !== "—") lines.push(`CET: ${v.cet}`);
      if (v.flotilla && v.flotilla !== "—") lines.push(`Flotilla: ${v.flotilla}`);
      if (v.grupo && v.grupo !== "—") lines.push(`Grupo: ${v.grupo}`);

      const subInfo = lines.length
        ? `<p>${escapeHtml(lines.join(" | "))}</p>`
        : "";

      return `
        <div class="miniCard">
          <p><strong>Unidad:</strong> ${escapeHtml(uName)}</p>
          ${subInfo}
        </div>
      `;
    }).join("");
  }

  let equiposHtml = "<p>Sin equipos asignados.</p>";
  if (equipos.length) {
    equiposHtml = equipos.map(e => {
      const target = e.vehiculo || e.asignadoA || e.destino || "";
      const isVehiculo = vehiculos.some(v =>
        [v.unidad, v.nombre, v.alias].includes(target)
      );

      const destinoText = target
        ? (isVehiculo ? `Asignado a: ${target}` : `Personal: ${target}`)
        : "Sin asignación";

      return `
        <div class="miniCard">
          <p><strong>Nombre:</strong> ${escapeHtml(e.nombre || e.name || "")}</p>
          <p>${escapeHtml(destinoText)}</p>
        </div>
      `;
    }).join("");
  }

  container.innerHTML = `
    <div class="infoBlock">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h3 style="margin:0;">Operación</h3>
        ${!esActiva ? `<button id="editOpInfoBtn" style="padding:4px 12px; font-size:12px; font-weight:700; border-radius:8px; border:1px solid #00ffa6; background:rgba(0,255,170,0.12); color:#00ffa6; cursor:pointer;">Editar ✏️</button>` : ""}
      </div>
      <p><strong>Título:</strong> ${escapeHtml(titulo)}</p>
      <p><strong>Descripción:</strong> ${escapeHtml(descripcion)}</p>
      <p><strong>Fecha programada:</strong> ${escapeHtml(fechaP)}</p>
      <p><strong>Hora programada:</strong> ${escapeHtml(horaP)}</p>
      <p><strong>Creada:</strong> ${escapeHtml(fecha)}</p>
    </div>

    <div class="infoBlock">
      <h3>Personal asignado</h3>
      ${personalHtml}
    </div>

    <div class="infoBlock">
      <h3>Vehículos asignados</h3>
      ${vehiculosHtml}
    </div>

    <div class="infoBlock">
      <h3>Equipos asignados</h3>
      ${equiposHtml}
    </div>
  `;

  const editBtn = document.getElementById("editOpInfoBtn");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      sessionStorage.setItem("asignacion_entry", "edit");
      window.location.href = "asignacion.html";
    });
  }
}

export function updateChatAvailability(pushChatMessage) {
  const op = getCurrentOperation();
  const phase = op.phase;
  const active = phase === "activa";

  const badge = document.getElementById("opStatusBadge");
  const title = document.getElementById("topbarTitle");
  const dot = document.getElementById("brandDot");
  const actionBtns = document.getElementById("mapActionButtons");

  if (badge) badge.style.display = active ? "inline-block" : "none";
  if (title) title.textContent = active ? (op.title || op.titulo || "Operación") : "Panorama táctico";
  if (dot) dot.style.background = active ? "#ff4444" : "#00ffa6";
  if (actionBtns) actionBtns.style.display = active ? "none" : "flex";

  if (dom.toggleChatPanel) {
    dom.toggleChatPanel.style.display = active ? "flex" : "none";
  }

  if (!active) {
    dom.chatPanel?.classList.remove("open");
    dom.toggleChatPanel?.classList.remove("active");
  } else {
    const chatKey = `chat_started_${op.id || "op"}`;
    if (!localStorage.getItem(chatKey)) {
      localStorage.setItem(chatKey, "true");
      dom.chatPanel?.classList.add("open");
      dom.toggleChatPanel?.classList.add("active");

      if (typeof pushChatMessage === "function") {
        const opNombre = op.title || op.titulo || "Operación";
        const hora = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        });

        pushChatMessage({
          text: `🟢 OPERACIÓN "${opNombre}" INICIADA a las ${hora}. Todo el personal en posición.`
        });
      }
    }
  }

  if (dom.chatInput) dom.chatInput.disabled = !active;
  if (dom.sendChatBtn) dom.sendChatBtn.disabled = !active;
  if (dom.chatTabCet) dom.chatTabCet.disabled = !active;
  if (dom.chatTabCells) dom.chatTabCells.disabled = !active;
}

export function updateSelectionInfo(selectedEntity) {
  if (!dom.selectionInfo) return;

  if (!selectedEntity) {
    dom.selectionInfo.textContent = "No hay elemento seleccionado.";
    return;
  }

  const name = selectedEntity.name || "Elemento táctico";
  const type =
    selectedEntity.properties?.tacticalType?.getValue?.() ||
    selectedEntity.properties?.tacticalType ||
    "Sin tipo";

  dom.selectionInfo.textContent = `Seleccionado: ${name} · Tipo: ${type}`;
}
