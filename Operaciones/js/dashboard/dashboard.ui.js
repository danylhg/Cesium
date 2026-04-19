// js/dashboard/dashboard.ui.js

import { dom } from "./dashboard.dom.js";
import {
  escapeHtml,
  getCurrentOperation,
  getOperationDateTime,
  getJsonStorage,
  ASIGNACION_ACTUAL_KEY
} from "./dashboard.storage.js";
import { getVehicleOccupants } from "./dashboard.tracking.clustering.js";

export function setRouteInfo(text) {
  if (dom.routeInfo) dom.routeInfo.textContent = text;
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

function normalizePersonal(personal) {
  return personal.map((p) => {
    if (!p?.rol_en_operacion) return p;

    const nombre = [p.nombre, p.apellido].filter(Boolean).join(" ").trim();
    const grupoDirecto = p.grupo_nombre || "";
    const grupoPadre = p.grupo_padre_nombre || "";
    const padreEsRaiz = grupoPadre.trim().toLowerCase() === "mando operativo";
    const tieneSubgrupo = Boolean(grupoPadre && !padreEsRaiz);

    return {
      cargo: p.rol_en_operacion,
      nombre,
      grupo: tieneSubgrupo ? grupoDirecto : "",
      flotilla: tieneSubgrupo ? grupoPadre : (grupoDirecto || grupoPadre || "")
    };
  });
}

// Evita duplicar prefijos como "Flotilla Flotilla Alfa" o "Grupo Grupo Alpha"
function labelConPrefijo(prefijo, nombre) {
  if (!nombre) return prefijo;
  if (nombre.trim().toLowerCase().startsWith(prefijo.toLowerCase())) return nombre.trim();
  return `${prefijo} ${nombre.trim()}`;
}

function renderPersonalHtml(personalNorm) {
  if (!personalNorm.length) return "<p>Sin personal asignado.</p>";

  let html = "";

  const cuts = personalNorm.filter(
    (p) => ["CUT", "Comandante de Unidad de Trabajo"].includes(p.cargo || p.rol)
  );
  const cets = personalNorm.filter(
    (p) => ["CET", "Comandante de Equipo de trabajo"].includes(p.cargo || p.rol)
  );
  const cells = personalNorm.filter(
    (p) => ["CÃ©lula", "CELL", "Celulas", "CÃ©lulas"].includes(p.cargo || p.rol)
  );

  cuts.forEach((cut) => {
    html += `
      <div class="miniCard" style="border-left: 3px solid #10b981;">
        <p><strong>CUT:</strong> ${escapeHtml(cut.nombre || cut.name)}</p>
      </div>
    `;
  });

  cets.forEach((cet) => {
    const flotillaNombre = cet.flotilla || "Sin flotilla";
    const directos = [];
    const grupos = new Map();

    cells.forEach((cell) => {
      if (cell.flotilla !== flotillaNombre) return;

      if (cell.grupo) {
        if (!grupos.has(cell.grupo)) grupos.set(cell.grupo, []);
        grupos.get(cell.grupo).push(cell.nombre);
      } else {
        directos.push(cell.nombre);
      }
    });

    html += `
      <div class="miniCard" style="border-left: 3px solid #3b82f6; margin-top:8px;">
        <p><strong>${escapeHtml(cet.nombre)} (CET)</strong></p>
        <p style="margin-top:8px;"><strong>${escapeHtml(labelConPrefijo("Flotilla", flotillaNombre))}</strong></p>
    `;

    directos.forEach((nombre) => {
      html += `
        <p style="padding-left:20px; margin:2px 0;">-- ${escapeHtml(nombre)}</p>
      `;
    });

    Array.from(grupos.entries()).forEach(([grupoNombre, integrantes]) => {
      html += `
        <p style="margin-top:12px;"><strong>${escapeHtml(labelConPrefijo("Grupo", grupoNombre))}</strong></p>
      `;

      integrantes.forEach((nombre) => {
        html += `
          <p style="padding-left:20px; margin:2px 0;">-- ${escapeHtml(nombre)}</p>
        `;
      });
    });

    html += "</div>";
  });

  return html || "<p>Sin personal asignado.</p>";
}

function buildVehiculoTree(vehiculos) {
  const byVehiculo = new Map();

  for (const v of vehiculos) {
    const key = v.id_vehiculo ?? v.codigo_interno;
    if (!byVehiculo.has(key)) {
      byVehiculo.set(key, {
        codigo_interno: v.codigo_interno || "",
        alias: v.alias || "",
        tipo: v.tipo || "",
        rows: []
      });
    }
    byVehiculo.get(key).rows.push(v);
  }

  return byVehiculo;
}

function getVehiculoPersonalNombre(row) {
  const nombreCompleto = [
    row.personal_nombre || row.asignado_a_nombre || "",
    row.personal_apellido || row.asignado_a_apellido || ""
  ].filter(Boolean).join(" ").trim();

  if (nombreCompleto) {
    return row.personal_puesto
      ? `${row.personal_puesto} ${nombreCompleto}`.trim()
      : nombreCompleto;
  }

  return row.asignado_a_apodo || "";
}

function renderVehiculosHierarchyHtml(vehiculos) {
  if (!vehiculos.length) return "<p>Sin vehiculos asignados.</p>";

  const byVehiculo = buildVehiculoTree(vehiculos);
  let html = "";

  for (const [, veh] of byVehiculo) {
    const nombre = veh.codigo_interno && veh.alias
      ? `${veh.codigo_interno} - ${veh.alias}`
      : (veh.codigo_interno || veh.alias || "Vehiculo");

    html += `<div class="miniCard"><p><strong>${escapeHtml(nombre)}</strong></p>`;

    // flotilla_nombre → { directos: [], grupos: Map<string, []> }
    const cets = new Map();
    const sinContexto = [];

    for (const row of veh.rows) {
      const personal = getVehiculoPersonalNombre(row);
      const cetNombre = row.cet_nombre || row.cet_apodo || "Sin CET";

      // Campos nuevos del endpoint mapa (con fallback al endpoint vehiculos-asignados)
      const grupoDirecto = row.grupo_directo_nombre || row.grupo_nombre || "";
      const grupoPadre  = row.grupo_padre_nombre || "";
      const nivel       = (row.nivel_asignacion || "").toUpperCase();

      let flotillaNombre, grupoNombre;

      if (grupoPadre) {
        flotillaNombre = grupoPadre;
        grupoNombre    = grupoDirecto;
      } else if (grupoDirecto) {
        if (nivel === "GRUPO") {
          flotillaNombre = "";
          grupoNombre    = grupoDirecto;
        } else {
          flotillaNombre = grupoDirecto;
          grupoNombre    = "";
        }
      } else {
        if (personal) sinContexto.push(personal);
        continue;
      }

      if (!cets.has(cetNombre)) {
        cets.set(cetNombre, new Map());
      }
      const flotillas = cets.get(cetNombre);
      const fKey = flotillaNombre || "__sin_flotilla__";
      if (!flotillas.has(fKey)) {
        flotillas.set(fKey, { nombre: flotillaNombre, directos: [], grupos: new Map() });
      }
      const flt = flotillas.get(fKey);

      if (grupoNombre) {
        if (!flt.grupos.has(grupoNombre)) flt.grupos.set(grupoNombre, []);
        if (personal) flt.grupos.get(grupoNombre).push(personal);
      } else {
        if (personal) flt.directos.push(personal);
      }
    }

    for (const [cetNombre, flotillas] of cets) {
      html += `<p style="margin-top:8px;"><strong>${escapeHtml(cetNombre)} (CET)</strong></p>`;
      for (const [, flt] of flotillas) {
        if (flt.nombre) {
          html += `<p style="margin-top:8px; padding-left:12px; font-size:12px; color:#94a3b8;"><strong>${escapeHtml(labelConPrefijo("Flotilla", flt.nombre))}</strong></p>`;
        }
        flt.directos.forEach((p) => {
          html += `<p style="padding-left:24px; margin:2px 0; font-size:12px;">-- ${escapeHtml(p)}</p>`;
        });
        for (const [grupoNom, integrantes] of flt.grupos) {
          html += `<p style="padding-left:24px; margin-top:6px; font-size:12px; color:#64748b;"><strong>${escapeHtml(labelConPrefijo("Grupo", grupoNom))}</strong></p>`;
          integrantes.forEach((p) => {
            html += `<p style="padding-left:36px; margin:2px 0; font-size:12px;">-- ${escapeHtml(p)}</p>`;
          });
        }
      }
    }

    sinContexto.forEach((p) => {
      html += `<p style="padding-left:12px; margin:2px 0; font-size:12px;">-- ${escapeHtml(p)}</p>`;
    });

    html += "</div>";
  }

  return html;
}

function normalizeEquipos(equipos) {
  return equipos.map((e) => {
    if (e.numero_serie !== undefined && !e.nombre_display) {
      return {
        id_equipo: e.id_equipo,
        nombre: e.nombre,
        numero: e.numero_serie || "",
        categoria: e.categoria || "",
        tipo_equipo: e.tipo_equipo || e.tipo_tactico || [e.marca, e.modelo].filter(Boolean).join(" ") || e.categoria || "Equipo",
        tipo_destino: e.tipo_destino || null,
        asignadoA: e.asignado_a_personal || "",
        vehiculo: e.tipo_destino === "VEHICULO"
          ? [e.asignado_a_vehiculo, e.vehiculo_alias].filter(Boolean).join(" - ")
          : "",
        grupos: (() => {
          if (e.tipo_destino === "VEHICULO") {
            return String(e.grupos_vinculados || "").split(",").map(v => v.trim()).filter(Boolean);
          }
          if (e.tipo_destino === "GRUPO") {
            return [e.grupo_asignado].filter(Boolean);
          }
          return [e.personal_grupo_nombre].filter(Boolean);
        })(),
        flotillas: (() => {
          if (e.tipo_destino === "VEHICULO") {
            return String(e.flotillas_vinculadas || "").split(",").map(v => v.trim()).filter(Boolean);
          }
          if (e.tipo_destino === "GRUPO") {
            return [e.flotilla_asignada].filter(Boolean);
          }
          return [e.personal_flotilla_nombre || e.personal_grupo_nombre].filter(Boolean);
        })()
      };
    }
    return e;
  });
}

function renderEquiposGroupedHtml(equiposNorm) {
  if (!equiposNorm.length) return "<p>sin equipos asignados</p>";

  const groups = [
    {
      title: "Equipos de Comunicacion",
      items: equiposNorm.filter((e) => String(e.categoria || "").toUpperCase() === "COMUNICACION")
    },
    {
      title: "Equipos Tacticos",
      items: equiposNorm.filter((e) => String(e.categoria || "").toUpperCase() === "TACTICO")
    },
    {
      title: "Otros equipos",
      items: equiposNorm.filter((e) => !["COMUNICACION", "TACTICO"].includes(String(e.categoria || "").toUpperCase()))
    }
  ].filter(group => group.items.length);

  const renderCard = (e) => {
    const flotillas = [...new Set((e.flotillas || []).filter(Boolean))];
    const grupos = [...new Set((e.grupos || []).filter(Boolean))];
    const destinoRaw = e.vehiculo || e.asignadoA || "";
    const contexto = new Set([...flotillas, ...grupos].map((v) => String(v).trim().toLowerCase()));
    const destinoFinal = contexto.has(String(destinoRaw).trim().toLowerCase()) ? "" : destinoRaw;

    return `
      <div class="miniCard">
        <p><strong>Nombre de equipo:</strong> ${escapeHtml(e.nombre || "")}</p>
        <p><strong>Numero:</strong> ${escapeHtml(e.numero || "Sin numero")}</p>
        ${flotillas.length ? `<p style="margin-top:8px;"><strong>${escapeHtml(flotillas.join(", "))}</strong></p>` : ""}
        ${grupos.length ? `<p style="margin-top:8px;"><strong>${escapeHtml(grupos.join(", "))}</strong></p>` : ""}
        ${destinoFinal ? `<p style="padding-left:12px; margin-top:8px;">-- ${escapeHtml(destinoFinal)}</p>` : ""}
      </div>
    `;
  };

  return groups.map((group) => `
    <div style="margin-bottom:16px;">
      <h4 style="margin:0 0 8px 0; color:#a0c4ff;">${escapeHtml(group.title)}</h4>
      ${group.items.map(renderCard).join("")}
    </div>
  `).join("");
}

export function renderInfoPanel(bdData = null) {
  const container = document.getElementById("infoPanelContent");
  if (!container) return;

  const operacion = bdData?.operacion ?? getCurrentOperation();

  let personal;
  let vehiculos;
  let equipos;
  if (bdData) {
    personal = bdData.personal || [];
    vehiculos = bdData.vehiculos || [];
    equipos = bdData.equipos || [];
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

  const titulo = operacion.nombre || operacion.title || operacion.titulo || operacion.name || "Sin titulo";
  const descripcion = operacion.descripcion || operacion.description || operacion.desc || "Sin descripcion";
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
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).replace(/\//g, "-");
  }

  const fecha = formatDate(operacion.fecha_creacion || operacion.created_at);

  const personalNorm = normalizePersonal(personal);
  const personalHtml = renderPersonalHtml(personalNorm);

  const vehiculosHtml = renderVehiculosHierarchyHtml(vehiculos);

  const equiposNorm = normalizeEquipos(equipos);
  const equiposHtml = renderEquiposGroupedHtml(equiposNorm);

  container.innerHTML = `
    <div class="infoBlock">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h3 style="margin:0;">Operacion</h3>
        ${!esActiva ? `<button id="editOpInfoBtn" style="padding:4px 12px; font-size:12px; font-weight:700; border-radius:8px; border:1px solid #00ffa6; background:rgba(0,255,170,0.12); color:#00ffa6; cursor:pointer;">Editar</button>` : ""}
      </div>
      <p><strong>Titulo:</strong> ${escapeHtml(titulo)}</p>
      <p><strong>Descripcion:</strong> ${escapeHtml(descripcion)}</p>
      <p><strong>Fecha programada:</strong> ${escapeHtml(fechaP)}</p>
      <p><strong>Hora programada:</strong> ${escapeHtml(horaP)}</p>
      <p><strong>Creada:</strong> ${escapeHtml(fecha)}</p>
    </div>

    <div class="infoBlock">
      <h3>Personal asignado</h3>
      ${personalHtml}
    </div>

    <div class="infoBlock">
      <h3>Vehiculos asignados</h3>
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
  const closed = phase === "cerrada" || phase === "cancelada";

  const badge = document.getElementById("opStatusBadge");
  const title = document.getElementById("topbarTitle");
  const dot = document.getElementById("brandDot");
  const actionBtns = document.getElementById("mapActionButtons");
  const activateOpBtn = document.getElementById("activateOpBtn");
  const closeActiveBtn = document.getElementById("closeActiveOpBtn");

  if (badge) badge.style.display = active ? "inline-block" : "none";
  if (title) title.textContent = active ? (op.title || op.titulo || "Operacion") : "Panorama tactico";
  if (dot) dot.style.background = active ? "#ff4444" : "#00ffa6";
  if (actionBtns) actionBtns.style.display = active || closed ? "none" : "flex";
  if (activateOpBtn) activateOpBtn.style.display = !active && !closed ? "inline-flex" : "none";
  if (closeActiveBtn) closeActiveBtn.style.display = active ? "inline-flex" : "none";

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

  const name = selectedEntity.name || "Elemento tactico";
  let type =
    selectedEntity.properties?.tacticalType?.getValue?.() ||
    selectedEntity.properties?.tacticalType ||
    "Sin tipo";

  const trackingKey = selectedEntity.properties?.trackingKey?.getValue?.() || selectedEntity.properties?.trackingKey;
  
  if (trackingKey && trackingKey.startsWith("V:")) {
    type = "Vehículo (Rastreo)";
    const occupants = getVehicleOccupants(trackingKey);
    
    // Convertir P:1 a nombres:
    const bdData = getCurrentOperation();
    const personas = Array.isArray(bdData.personal) ? bdData.personal : [];
    const ocupantesNombres = occupants.map(occId => {
      const id = occId.split(":")[1];
      const p = personas.find(x => String(x.id_personal) === String(id));
      if (p) return [p.nombre, p.apellido].filter(Boolean).join(" ");
      return occId;
    });

    const ocupantesHtml = ocupantesNombres.length > 0
      ? ocupantesNombres.map(n => `<span style="display:inline-block; background:rgba(0,191,255,0.2); padding:2px 6px; border-radius:4px; margin:2px 4px 2px 0;">🧑‍🚀 ${escapeHtml(n)}</span>`).join("")
      : `<span style="color:#94a3b8; font-size:11px;">Sin tripulación detectada.</span>`;

    dom.selectionInfo.innerHTML = `
      <div style="font-weight:bold; color:#00ffa6; margin-bottom:4px;">${escapeHtml(name)}</div>
      <div style="font-size:11px; margin-bottom:8px;">Tipo: ${escapeHtml(type)}</div>
      <div style="font-size:11px; font-weight:bold; margin-bottom:4px;">Pasajeros a bordo:</div>
      <div style="margin-bottom:12px;">${ocupantesHtml}</div>
      <button id="btnChatVehiculo" class="btnBeige" style="width:100%; font-size:12px; padding:6px;">💬 Mensaje a Tripulación</button>
    `;

    // Asignar evento al botón dinámicamente
    const btnChat = document.getElementById("btnChatVehiculo");
    if (btnChat) {
      btnChat.addEventListener("click", () => {
        // Enviar evento para abrir chat con el tag del vehículo
        document.dispatchEvent(new CustomEvent("openVehicleChat", { detail: { vehicleName: name } }));
      });
    }
  } else {
    dom.selectionInfo.innerHTML = `
      <div style="font-weight:bold; color:#00ffa6;">${escapeHtml(name)}</div>
      <div style="font-size:11px; margin-top:2px;">Tipo: ${escapeHtml(type)}</div>
    `;
  }
}
