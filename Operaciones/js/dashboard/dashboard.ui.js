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

// bdData puede venir del backend: { operacion, personal, vehiculos, equipos }
export function renderInfoPanel(bdData = null) {
  const container = document.getElementById("infoPanelContent");
  if (!container) return;

  const operacion = bdData?.operacion ?? getCurrentOperation();

  // Si hay datos del backend los usamos directamente, sino fallback a localStorage
  let personal, vehiculos, equipos;
  if (bdData) {
    personal = bdData.personal || [];
    vehiculos = bdData.vehiculos || [];
    equipos   = bdData.equipos  || [];
  } else {
    const asignacion = getJsonStorage(ASIGNACION_ACTUAL_KEY, {}) || {};
    personal = Array.isArray(asignacion.personal) && asignacion.personal.length
      ? asignacion.personal
      : (Array.isArray(operacion.personal) ? operacion.personal : []);
    vehiculos = Array.isArray(asignacion.vehiculos) && asignacion.vehiculos.length
      ? asignacion.vehiculos
      : (Array.isArray(operacion.vehiculos) ? operacion.vehiculos : []);
    equipos = Array.isArray(asignacion.equipos) && asignacion.equipos.length
      ? asignacion.equipos
      : (Array.isArray(operacion.equipos) ? operacion.equipos : []);
  }

  const esActiva = (operacion.phase || operacion.estado?.toLowerCase()) === "activa";

  const titulo = operacion.nombre || operacion.title || operacion.titulo || operacion.name || "Sin título";
  const descripcion = operacion.descripcion || operacion.description || operacion.desc || "Sin descripción";
  const programada = getOperationDateTime(operacion);

  let fechaP = "No definida";
  let horaP = operacion.hora_inicio || "No definida";

  if (operacion.fecha_inicio) {
    const d = new Date(operacion.fecha_inicio);
    if (!isNaN(d)) {
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const yyyy = d.getUTCFullYear();
      fechaP = `${dd}-${mm}-${yyyy}`;
      // Extraer hora del ISO si no viene separada
      if (horaP === "No definida") {
        const hh = String(d.getUTCHours()).padStart(2, "0");
        const min = String(d.getUTCMinutes()).padStart(2, "0");
        if (hh !== "00" || min !== "00") horaP = `${hh}:${min}`;
      }
    } else {
      fechaP = operacion.fecha_inicio;
    }
  } else if (programada) {
    fechaP = programada.toLocaleDateString("es-ES", {
      day: "2-digit", month: "2-digit", year: "numeric"
    }).replace(/\//g, "-");
  }

  const fecha = formatDate(operacion.fecha_creacion || operacion.created_at);

  // Normalizar personal: el backend devuelve rol_en_operacion, nombre, apellido, etc.
  // El localStorage devuelve cargo, nombre (ya formateado), cet, grupo, flotilla.
  const personalNorm = personal.map(p => {
    if (p.rol_en_operacion) {
      // Viene del backend — cet_nombre ya es string "Nombre Apellido"
      const nombre = [p.nombre, p.apellido].filter(Boolean).join(" ");
      return {
        cargo: p.rol_en_operacion,
        nombre,
        cet: p.cet_nombre || "",   // string directo, no objeto
        grupo: p.grupo_hijo_nombre || "",
        flotilla: p.cet_flotilla || ""
      };
    }
    return p; // Ya está normalizado (localStorage)
  });

  // Normalizar vehiculos del backend
  const vehiculosNorm = vehiculos.map(v => {
    if (v.codigo_interno !== undefined && !v.unidad) {
      // Viene del backend — agrupar por vehículo
      return {
        unidad: [v.tipo, v.alias].filter(Boolean).join(" ") || v.codigo_interno,
        nombre: [v.tipo, v.alias].filter(Boolean).join(" ") || v.codigo_interno,
        cet: v.personal_rol === "CET" ? [v.personal_nombre, v.personal_apellido].filter(Boolean).join(" ") : "",
        flotilla: "",
        grupo: v.grupo_nombre || ""
      };
    }
    return v;
  });

  // Deduplicar vehículos (múltiples custodios → un solo card por vehículo)
  const vehiculosDedup = [];
  const vehSeen = new Set();
  for (const v of vehiculosNorm) {
    const key = v.unidad || v.nombre;
    if (!vehSeen.has(key)) {
      vehSeen.add(key);
      vehiculosDedup.push(v);
    }
  }

  // Normalizar equipos del backend
  const equiposNorm = equipos.map(e => {
    if (e.numero_serie !== undefined && !e.nombre_display) {
      let destino = "";
      if (e.tipo_destino === "VEHICULO") {
        destino = [e.vehiculo_alias, e.asignado_a_vehiculo].filter(Boolean).join(" ") || "";
      } else if (e.tipo_destino === "PERSONAL" && e.asignado_a_personal) {
        destino = e.asignado_a_personal;
      } else if (e.tipo_destino === "GRUPO" && e.grupo_asignado) {
        destino = e.grupo_asignado;
      }
      // tipo_destino NULL → sin registro de uso, sin asignación
      return {
        nombre: e.nombre,
        asignadoA: destino,
        vehiculo: e.tipo_destino === "VEHICULO" ? destino : ""
      };
    }
    return e;
  });

  let personalHtml = "<p>Sin personal asignado.</p>";
  if (personalNorm.length) {
    personalHtml = "";

    const cuts = personalNorm.filter(
      p => ["CUT", "Comandante de Unidad de Trabajo"].includes(p.cargo || p.rol)
    );

    cuts.forEach(c => {
      personalHtml += `
        <div class="miniCard" style="border-left: 3px solid #10b981;">
          <p><strong>CUT:</strong> ${escapeHtml(c.nombre || c.name)}</p>
        </div>
      `;
    });

    const cets = personalNorm.filter(
      p => ["CET", "Comandante de Equipo de trabajo"].includes(p.cargo || p.rol)
    );

    cets.forEach(cet => {
      const miembros = personalNorm.filter(
        p =>
          ["Célula", "CELL", "Celulas", "Células"].includes(p.cargo || p.rol) &&
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
  if (vehiculosDedup.length) {
    vehiculosHtml = vehiculosDedup.map(v => {
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
  if (equiposNorm.length) {
    equiposHtml = equiposNorm.map(e => {
      const target = e.vehiculo || e.asignadoA || e.destino || "";
      const isVehiculo = !!e.vehiculo;

      const destinoText = target
        ? (isVehiculo ? `Vehículo: ${target}` : `Personal: ${target}`)
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
      const op = getCurrentOperation();
      if (op?.id) localStorage.setItem("active_operation_id", op.id);
      sessionStorage.setItem("asignacion_entry", "edit");
      window.location.href = "asignacion.html";
    });
  }
}

export function updateChatAvailability() {
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
