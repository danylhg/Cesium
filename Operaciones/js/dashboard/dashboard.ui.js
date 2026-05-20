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
import { dashboardState } from "./dashboard.state.js";

const PERSONAL_CONNECTION_STALE_MS = 30000;
const personalLiveData = new Map();
let activePersonInfoPopup = null;
let personInfoRefreshTimer = null;

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

export function openPanel(panel, button) {
  if (!panel) return;

  closeAllPanels();
  panel.classList.add("open");
  button?.classList.add("active");
}

export function togglePanel(panel, button) {
  if (!panel || !button) return;

  const wasOpen = panel.classList.contains("open");

  if (!wasOpen) {
    openPanel(panel, button);
    return;
  }

  closeAllPanels();
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
      flotilla: tieneSubgrupo ? grupoPadre : (grupoDirecto || grupoPadre || ""),
      id_personal: p.id_personal ?? null,
      lat: p.latitud ?? p.lat ?? null,
      lon: p.longitud ?? p.lon ?? p.lng ?? null
    };
  });
}

function isRootGroupName(value) {
  return String(value || "").trim().toLowerCase() === "mando operativo";
}

function formatRoleLabel(value) {
  const role = String(value || "").trim().toUpperCase();
  return role ? `(${role})` : "";
}

function formatPersonWithRole(nombre, rol) {
  const roleLabel = formatRoleLabel(rol);
  return [roleLabel, String(nombre || "").trim()].filter(Boolean).join(" ");
}

// Evita duplicar prefijos como "Flotilla Flotilla Alfa" o "Grupo Grupo Alpha"
function labelConPrefijo(prefijo, nombre) {
  if (!nombre) return prefijo;
  if (nombre.trim().toLowerCase().startsWith(prefijo.toLowerCase())) return nombre.trim();
  return `${prefijo} ${nombre.trim()}`;
}

function personSpan(nombre, id, lat, lon) {
  const safe = escapeHtml(nombre);
  if (id == null) return safe;
  const personAttrs = `data-pid="${id}" data-person-id="${id}"`;
  if (lat != null && lon != null) {
    return `<span class="personal-locatable person-link" ${personAttrs} data-lat="${lat}" data-lon="${lon}" style="cursor:pointer;color:#00BFFF;border-bottom:1px dotted #00BFFF;" title="Ver detalle">${safe}</span>`;
  }
  return `<span class="person-link" ${personAttrs} style="cursor:pointer;color:#00ffa6;border-bottom:1px dotted #00ffa6;" title="Ver detalle">${safe}</span>`;
}

export function activatePersonalLocation(id, lat, lon) {
  document.querySelectorAll(`[data-pid="${id}"]`).forEach(span => {
    span.dataset.lat = lat;
    span.dataset.lon = lon;
    if (!span.classList.contains("personal-locatable")) {
      span.classList.add("personal-locatable");
      span.style.cursor = "pointer";
      span.style.color = "#00BFFF";
      span.style.borderBottom = "1px dotted #00BFFF";
      span.title = "Ir a ubicacion";
    }
  });
}

function getPersonalEntityCoordinates(id) {
  const viewer = dashboardState.viewer;
  const entity = dashboardState.trackingEntities?.get(`P:${id}`);
  const position = entity?.position?.getValue?.(viewer?.clock?.currentTime) ?? entity?.position;
  if (!position) return null;

  const carto = Cesium.Cartographic.fromCartesian(position);
  return {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude)
  };
}

function setFollowedPersonalStyle(id) {
  document.querySelectorAll(".personal-locatable").forEach(span => {
    const selected = String(span.dataset.pid || "") === String(id || "");
    span.style.color = selected ? "#38bdf8" : "#00BFFF";
    span.style.borderBottom = selected ? "1px solid #38bdf8" : "1px dotted #00BFFF";
    span.title = selected ? "Siguiendo ubicacion" : "Seguir ubicacion";
  });
}

export function followPersonalLocation(id, lat, lon) {
  const viewer = dashboardState.viewer;
  if (!viewer || id == null) return;

  dashboardState.followedPersonalId = String(id);
  setFollowedPersonalStyle(id);

  const liveCoords = getPersonalEntityCoordinates(id);
  const destLat = liveCoords?.lat ?? lat;
  const destLon = liveCoords?.lon ?? lon;
  updateFollowedPersonalLocation(id, destLat, destLon, 0.45);
}

export function updateFollowedPersonalLocation(id, lat, lon, duration = 0.28) {
  const viewer = dashboardState.viewer;
  if (!viewer || String(dashboardState.followedPersonalId || "") !== String(id || "")) return;
  const destLat = Number(lat);
  const destLon = Number(lon);
  if (!Number.isFinite(destLat) || !Number.isFinite(destLon)) return;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      destLon,
      destLat,
      dashboardState.followedPersonalZoom || 800
    ),
    orientation: {
      heading: viewer.camera.heading,
      pitch: viewer.camera.pitch,
      roll: viewer.camera.roll
    },
    duration
  });
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
    (p) => ["Célula", "CELL", "Celulas", "Células"].includes(p.cargo || p.rol)
  );

  cuts.forEach((cut) => {
    html += `
      <div class="miniCard" style="border-left: 3px solid #10b981;">
        <p><strong>CUT:</strong> ${personSpan(cut.nombre || cut.name, cut.id_personal, cut.lat, cut.lon)}</p>
      </div>
    `;
  });

  cets.forEach((cet) => {
    const flotillaNombre = cet.flotilla || "Sin flotilla";
    const directos = [];
    const grupos = new Map();

    cells.forEach((cell) => {
      if (cell.flotilla !== flotillaNombre) return;

      const nameHtml = personSpan(formatPersonWithRole(cell.nombre, cell.cargo), cell.id_personal, cell.lat, cell.lon);
      if (cell.grupo) {
        if (!grupos.has(cell.grupo)) grupos.set(cell.grupo, []);
        grupos.get(cell.grupo).push(nameHtml);
      } else {
        directos.push(nameHtml);
      }
    });

    html += `
      <div class="miniCard" style="border-left: 3px solid #3b82f6; margin-top:8px;">
        <p><strong>(CET) ${personSpan(cet.nombre, cet.id_personal, cet.lat, cet.lon)}</strong></p>
        <p style="margin-top:8px;"><strong>${escapeHtml(labelConPrefijo("Flotilla", flotillaNombre))}</strong></p>
    `;

    directos.forEach((nameHtml) => {
      html += `
        <p style="padding-left:20px; margin:2px 0;">-- ${nameHtml}</p>
      `;
    });

    Array.from(grupos.entries()).forEach(([grupoNombre, integrantes]) => {
      html += `
        <p style="margin-top:12px;"><strong>${escapeHtml(labelConPrefijo("Grupo", grupoNombre))}</strong></p>
      `;

      integrantes.forEach((nameHtml) => {
        html += `
          <p style="padding-left:20px; margin:2px 0;">-- ${nameHtml}</p>
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
    const baseName = row.personal_puesto
      ? `${row.personal_puesto} ${nombreCompleto}`.trim()
      : nombreCompleto;
    return formatPersonWithRole(baseName, row.personal_rol);
  }

  return formatPersonWithRole(row.asignado_a_apodo || "", row.personal_rol);
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
      const padreUtil = isRootGroupName(grupoPadre) ? "" : grupoPadre;

      let flotillaNombre, grupoNombre;

      if (padreUtil) {
        flotillaNombre = padreUtil;
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
      const tipoDestino = e.tipo_destino || null;
      const grupoAsignado = String(e.grupo_asignado || "").trim();
      const flotillaAsignada = String(e.flotilla_asignada || "").trim();
      const personalGrupo = String(e.personal_grupo_nombre || "").trim();
      const personalFlotilla = String(e.personal_flotilla_nombre || "").trim();
      const gruposVehiculo = String(e.grupos_vinculados || "").split(",").map(v => v.trim()).filter(Boolean);
      const flotillasVehiculo = String(e.flotillas_vinculadas || "").split(",").map(v => v.trim()).filter(Boolean);

      let grupos = [];
      let flotillas = [];

      if (tipoDestino === "VEHICULO") {
        grupos = gruposVehiculo;
        flotillas = flotillasVehiculo.filter(v => !isRootGroupName(v));

        if (!flotillas.length && grupos.length === 1) {
          flotillas = grupos;
          grupos = [];
        }
      } else if (tipoDestino === "GRUPO") {
        const flotillaUtil = !isRootGroupName(flotillaAsignada) ? flotillaAsignada : "";
        if (flotillaUtil) {
          flotillas = [flotillaUtil];
          grupos = grupoAsignado ? [grupoAsignado] : [];
        } else if (grupoAsignado && !isRootGroupName(grupoAsignado)) {
          flotillas = [grupoAsignado];
          grupos = [];
        }
      } else {
        const flotillaUtil = !isRootGroupName(personalFlotilla) ? personalFlotilla : "";
        if (flotillaUtil) {
          flotillas = [flotillaUtil];
          grupos = personalGrupo ? [personalGrupo] : [];
        } else if (personalGrupo && !isRootGroupName(personalGrupo)) {
          flotillas = [personalGrupo];
          grupos = [];
        }
      }

      const flotillasNorm = [...new Set(flotillas.map(v => v.trim()).filter(v => v && !isRootGroupName(v)))];
      const gruposNorm = [...new Set(
        grupos
          .map(v => v.trim())
          .filter(v => v && !isRootGroupName(v))
          .filter(v => !flotillasNorm.some(f => f.toLowerCase() === v.toLowerCase()))
      )];

      return {
        id_equipo: e.id_equipo,
        nombre: e.nombre,
        numero: e.numero_serie || "",
        categoria: e.categoria || "",
        tipo_equipo: e.tipo_equipo || e.tipo_tactico || [e.marca, e.modelo].filter(Boolean).join(" ") || e.categoria || "Equipo",
        tipo_destino: tipoDestino,
        asignadoA: e.asignado_a_personal || "",
        personalRol: e.personal_rol || "",
        vehiculo: tipoDestino === "VEHICULO"
          ? [e.asignado_a_vehiculo, e.vehiculo_alias].filter(Boolean).join(" - ")
          : "",
        grupos: gruposNorm,
        flotillas: flotillasNorm
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
    const destinoBase = e.vehiculo || e.asignadoA || "";
    const destinoRaw = e.vehiculo
      ? destinoBase
      : [e.personalRol ? `(${String(e.personalRol).toUpperCase()})` : "", destinoBase].filter(Boolean).join(" ");
    const contexto = new Set([...flotillas, ...grupos].map((v) => String(v).trim().toLowerCase()));
    const destinoFinal = contexto.has(String(destinoBase).trim().toLowerCase()) ? "" : destinoRaw;

    return `
      <div class="miniCard">
        <p><strong>Nombre de equipo:</strong> ${escapeHtml(e.nombre || "")}</p>
        <p><strong>Identificador:</strong> ${escapeHtml(e.numero || "Sin numero")}</p>
        ${flotillas.length ? `<p style="margin-top:8px;"><strong>Flotilla:</strong> ${escapeHtml(flotillas.join(", "))}</p>` : ""}
        ${grupos.length ? `<p style="margin-top:8px;"><strong>Grupo:</strong> ${escapeHtml(grupos.join(", "))}</p>` : ""}
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

  container.addEventListener("click", (e) => {
    if (e.target.closest(".person-link")) return;
    const el = e.target.closest(".personal-locatable");
    if (!el) return;
    const id = el.dataset.pid;
    const lat = parseFloat(el.dataset.lat);
    const lon = parseFloat(el.dataset.lon);
    if (isNaN(lat) || isNaN(lon)) return;
    followPersonalLocation(id, lat, lon);
  });
}

export function updateChatAvailability() {
  const op = getCurrentOperation();
  const phase = String(op.phase || op.estado || "").toLowerCase();
  const active = phase === "activa";
  const closed = phase === "cerrada" || phase === "cancelada";
  const planned = phase === "planificada" || !phase;

  const badge = document.getElementById("opStatusBadge");
  const title = document.getElementById("topbarTitle");
  const dot = document.getElementById("brandDot");
  const actionBtns = document.getElementById("mapActionButtons");
  const activateOpBtn = document.getElementById("activateOpBtn");
  const closeActiveBtn = document.getElementById("closeActiveOpBtn");
  const saveOpMapBtn = document.getElementById("saveOpMapBtn");
  const cancelOpMapBtn = document.getElementById("cancelOpMapBtn");
  const operationZoneControls = document.getElementById("operationZoneControls");

  if (badge) badge.style.display = active ? "inline-block" : "none";
  if (title) title.textContent = active ? (op.title || op.titulo || "Operacion") : "Panorama tactico";
  if (dot) dot.style.background = active ? "#ff4444" : "#00ffa6";
  if (actionBtns) actionBtns.style.display = planned ? "flex" : "none";
  if (operationZoneControls) operationZoneControls.style.display = planned ? "" : "none";
  if (saveOpMapBtn) {
    saveOpMapBtn.style.display = planned ? "" : "none";
    saveOpMapBtn.disabled = !planned || closed;
  }
  if (cancelOpMapBtn) {
    cancelOpMapBtn.style.display = planned ? "" : "none";
    cancelOpMapBtn.disabled = !planned || closed;
  }
  if (activateOpBtn) {
    activateOpBtn.style.display = planned ? "inline-flex" : "none";
    activateOpBtn.disabled = !planned || closed;
  }
  if (closeActiveBtn) {
    closeActiveBtn.style.display = active ? "inline-flex" : "none";
    closeActiveBtn.disabled = !active;
  }

  if (dom.toggleChatPanel) {
    dom.toggleChatPanel.style.display = "flex";
    dom.toggleChatPanel.disabled = !active;
  }
  if (dom.toggleCameraPanel) {
    dom.toggleCameraPanel.style.display = "flex";
    dom.toggleCameraPanel.disabled = !active;
  }

  if (!active) {
    dom.chatPanel?.classList.remove("open");
    dom.toggleChatPanel?.classList.remove("active");
    dom.cameraPanel?.classList.remove("open");
    dom.toggleCameraPanel?.classList.remove("active");
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

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function formatCoord(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(6) : "-";
}

function formatBattery(value) {
  const battery = firstValue(value);
  if (battery == null) return "-";
  const text = String(battery).trim();
  return text.endsWith("%") ? text : `${text}%`;
}

function parseTimestamp(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatStatusTime(timestamp) {
  return timestamp ? formatTime(new Date(timestamp).toISOString()) : "";
}

function getPersonalLiveRecord(personId, anchor = {}) {
  const id = String(personId || "").trim();
  const stored = personalLiveData.get(id) || {};
  const history = dashboardState.trackingHistory?.get(`P:${id}`) || {};
  const liveData = history.liveData || {};
  return {
    ...stored,
    ...liveData,
    ...anchor,
    lat: firstValue(anchor.lat, liveData.lat, liveData.latitud, stored.lat, stored.latitud, history.lat),
    lng: firstValue(anchor.lng, anchor.lon, liveData.lng, liveData.lon, liveData.longitud, stored.lng, stored.lon, stored.longitud, history.lng),
    timestamp: firstValue(
      anchor.timestamp,
      anchor.updated_at,
      liveData.timestamp,
      liveData.updated_at,
      liveData.fecha_actualizacion,
      liveData.ultima_actualizacion,
      stored.timestamp,
      stored.updated_at,
      history.time
    )
  };
}

function getConnectionStatus(personId, person = {}, live = {}) {
  const timestamp = parseTimestamp(live.timestamp);
  if (!timestamp) {
    return {
      online: false,
      text: "SIN CONEXIÓN",
      detail: "Sin ubicación reciente",
      timestamp: null
    };
  }

  const ageMs = Date.now() - timestamp;
  if (ageMs <= PERSONAL_CONNECTION_STALE_MS) {
    return {
      online: true,
      text: "EN LÍNEA",
      detail: `Actualizado ${formatStatusTime(timestamp)}`,
      timestamp
    };
  }

  return {
    online: false,
    text: "SIN CONEXIÓN",
    detail: `Última vez ${formatStatusTime(timestamp)}`,
    timestamp
  };
}

function sameText(a, b) {
  const clean = (value) => String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return clean(a) && clean(a) === clean(b);
}

function getPersonId(person = {}) {
  return firstValue(
    person.id_personal,
    person.id,
    person.id_usuario,
    person.id_persona,
    person.personal_id,
    person.usuario_id
  );
}

function getPersonName(person = {}) {
  return [person.nombre, person.apellido].filter(Boolean).join(" ").trim() ||
    person.apodo ||
    person.name ||
    person.nombre_completo ||
    "";
}

function getAvailablePersonal() {
  const op = getCurrentOperation();
  const asignacion = getJsonStorage(ASIGNACION_ACTUAL_KEY, {}) || {};
  return [
    ...(Array.isArray(asignacion.personal) ? asignacion.personal : []),
    ...(Array.isArray(op.personal) ? op.personal : [])
  ];
}

function findPerson(personId, fallbackName = "") {
  const people = getAvailablePersonal();
  const id = String(personId || "").trim();
  const byId = people.find((person) => String(getPersonId(person) || "").trim() === id);
  if (byId) return byId;
  return people.find((person) => sameText(getPersonName(person), fallbackName));
}

function getAssignedDevice(person = {}, personId, personName) {
  const op = getCurrentOperation();
  const asignacion = getJsonStorage(ASIGNACION_ACTUAL_KEY, {}) || {};
  const devices = [
    ...(Array.isArray(asignacion.dispositivos) ? asignacion.dispositivos : []),
    ...(Array.isArray(op.dispositivos) ? op.dispositivos : []),
    ...(Array.isArray(person.dispositivos) ? person.dispositivos : []),
    ...(Array.isArray(person.devices) ? person.devices : [])
  ];
  const assignments = [
    ...(Array.isArray(asignacion.asignacionDispositivos) ? asignacion.asignacionDispositivos : []),
    ...(Array.isArray(op.asignacionDispositivos) ? op.asignacionDispositivos : []),
    ...(Array.isArray(op.asignacion_dispositivos) ? op.asignacion_dispositivos : [])
  ];
  const id = String(personId || getPersonId(person) || "").trim();
  const name = personName || getPersonName(person);
  const directAssignment = assignments.find((a) => String(a.id_personal || "").trim() === id);
  if (directAssignment) {
    const assignedId = String(directAssignment.id_dispositivo || directAssignment.id || "").trim();
    if (assignedId) {
      const byId = devices.find((device) =>
        String(device.id_dispositivo || device.id || "").trim() === assignedId
      );
      if (byId) return byId;
    }
  }
  return devices.find((device) =>
    sameText(device.responsable || device.asignado_a_personal || device.personal_nombre, name)
  );
}

function getPersonCameraImage(personId) {
  const images = [
    "img/cameras/cam1.png",
    "img/cameras/cam2.png",
    "img/cameras/cam3.png"
  ];
  const text = String(personId || "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return images[Math.abs(hash) % images.length];
}

function placePersonInfoPopup(anchor = {}) {
  if (!dom.personInfoPopup) return;

  const width = 260;
  const x = Number(anchor.x);
  const y = Number(anchor.y);

  if (Number.isFinite(x) && Number.isFinite(y)) {
    const leftPanelEdge = Math.max(
      dom.infoPanel?.getBoundingClientRect?.().right || 0,
      dom.chatPanel?.getBoundingClientRect?.().right || 0,
      dom.routePanel?.getBoundingClientRect?.().right || 0,
      dom.tacticalPanel?.getBoundingClientRect?.().right || 0,
      88
    );
    const preferredLeft = x < leftPanelEdge + 40
      ? leftPanelEdge + 14
      : x - width / 2;

    dom.personInfoPopup.style.right = "auto";
    dom.personInfoPopup.style.left = `${Math.max(12, Math.min(preferredLeft, window.innerWidth - width - 12))}px`;
    dom.personInfoPopup.style.top = `${Math.max(80, Math.min(y - 235, window.innerHeight - 300))}px`;
    return;
  }

  dom.personInfoPopup.style.right = "22px";
  dom.personInfoPopup.style.top = "132px";
  dom.personInfoPopup.style.left = "auto";
}

export function showPersonnelDetail(personId, anchor = {}) {
  if (!dom.personInfoPopup || !dom.personInfoPopupContent || personId == null) return;

  const person = findPerson(personId, anchor.name);
  if (!person) {
    console.warn("[PERSONAL] No se encontro informacion para:", personId, anchor.name);
    return;
  }

  const id = String(personId);
  const live = getPersonalLiveRecord(id, anchor);
  const nombre = getPersonName(person) || anchor.name || `Personal ${personId}`;
  const assignedDevice = getAssignedDevice(person, personId, nombre) || {};
  const liveCoords = getPersonalEntityCoordinates(personId);
  const lat = firstValue(live.lat, liveCoords?.lat, person.latitud, person.lat);
  const lng = firstValue(live.lng, liveCoords?.lon, person.longitud, person.lng, person.lon);
  const velocidad = firstValue(live.velocidad, live.speed, live.velocidad_kmh, person.velocidad, person.speed, person.velocidad_kmh, "0.00");
  const curso = firstValue(live.curso, live.heading, live.rumbo, person.curso, person.heading, person.rumbo, "-");
  const connectionStatus = getConnectionStatus(id, person, live);
  const sidc = firstValue(person.sidc, person.codigo_sidc, "-");
  const fc = firstValue(live.frecuencia_cardiaca_bpm, live.frecuencia_cardiaca, live.fc, live.heart_rate_bpm, live.heart_rate, person.frecuencia_cardiaca_bpm, person.frecuencia_cardiaca, person.fc, person.heart_rate_bpm, person.heart_rate, assignedDevice.frecuencia_cardiaca_bpm, assignedDevice.frecuencia_cardiaca, assignedDevice.fc, assignedDevice.heart_rate_bpm, assignedDevice.heart_rate, "-");
  const spo2 = firstValue(live.oxigenacion_spo2, live.spo2, live.oxigenacion, person.oxigenacion_spo2, person.spo2, person.oxigenacion, assignedDevice.oxigenacion_spo2, assignedDevice.spo2, assignedDevice.oxigenacion, "-");
  const temp = firstValue(live.temperatura_c, live.temperatura, live.temperature_c, person.temperatura_c, person.temperatura, person.temperature_c, "-");
  const resp = firstValue(live.frecuencia_respiratoria_rpm, live.respiracion, live.respiratory_rate, person.frecuencia_respiratoria_rpm, person.respiracion, person.respiratory_rate, "-");
  const baro = firstValue(live.presion_barometrica_hpa, live.barometro, live.baro, live.presion, live.pressure, person.presion_barometrica_hpa, person.barometro, person.baro, person.presion, person.pressure, "-");
  const bateria = formatBattery(firstValue(live.bateria_pct, live.bateria, live.battery, live.battery_level, person.bateria_pct, person.bateria, person.battery, person.battery_level, assignedDevice.bateria_pct, assignedDevice.bateria, assignedDevice.battery, assignedDevice.battery_level, assignedDevice.nivel_bateria));
  const actualizado = firstValue(live.signos_actualizacion, live.timestamp, person.signos_actualizacion, person.updated_at, person.fecha_actualizacion, person.ultima_actualizacion, person.timestamp);
  const cameraImage = firstValue(person.camera_url, person.camara_url, person.video_thumbnail) || getPersonCameraImage(personId);
  const deviceName = [
    assignedDevice.tipo,
    assignedDevice.marca,
    assignedDevice.modelo
  ].filter(Boolean).join(" ") || assignedDevice.nombre || assignedDevice.name || "-";
  const deviceCode = firstValue(
    assignedDevice.numeroTelefono,
    assignedDevice.numero_telefono,
    assignedDevice.telefono,
    assignedDevice.imei,
    assignedDevice.numeroSerie,
    assignedDevice.numero_serie,
    "-"
  );

  dom.personInfoPopupContent.innerHTML = `
    <h3 class="personInfoTitle">${escapeHtml(nombre)}</h3>
    <div class="personInfoGrid">
      <div class="personInfoLabel">Lat:</div><div class="personInfoValue">${escapeHtml(formatCoord(lat))}</div>
      <div class="personInfoLabel">Lng:</div><div class="personInfoValue">${escapeHtml(formatCoord(lng))}</div>
      <div class="personInfoLabel">Vel:</div><div class="personInfoValue">${escapeHtml(String(velocidad))} km/h</div>
      <div class="personInfoLabel">Curso:</div><div class="personInfoValue">${escapeHtml(String(curso))}${String(curso) !== "-" ? "&deg;" : ""}</div>
      <div class="personInfoLabel">SIDC:</div><div class="personInfoValue">${escapeHtml(String(sidc))}</div>
      <div class="personInfoLabel">Dispositivo:</div><div class="personInfoValue">${escapeHtml(String(deviceName))}</div>
      <div class="personInfoLabel">ID disp.:</div><div class="personInfoValue">${escapeHtml(String(deviceCode))}</div>
    </div>
    <div class="personInfoStatus ${connectionStatus.online ? "online" : "offline"}">
      Estado <strong>${escapeHtml(connectionStatus.text)}</strong>
      <span>${escapeHtml(connectionStatus.detail)}</span>
    </div>
    <div class="personInfoBio">
      <div class="personInfoBioTitle">Biometricos (Galaxy Watch)</div>
      <div class="personInfoGrid">
        <div class="personInfoLabel">FC:</div><div class="personInfoValue">${escapeHtml(String(fc))}${String(fc) !== "-" ? " bpm" : ""}</div>
        <div class="personInfoLabel">SpO2:</div><div class="personInfoValue">${escapeHtml(String(spo2))}${String(spo2) !== "-" ? "%" : ""}</div>
        <div class="personInfoLabel">Temp:</div><div class="personInfoValue">${escapeHtml(String(temp))}${String(temp) !== "-" ? " C" : ""}</div>
        <div class="personInfoLabel">Resp:</div><div class="personInfoValue">${escapeHtml(String(resp))}${String(resp) !== "-" ? " rpm" : ""}</div>
        <div class="personInfoLabel">Baro:</div><div class="personInfoValue">${escapeHtml(String(baro))}${String(baro) !== "-" ? " hPa" : ""}</div>
        <div class="personInfoLabel">Bateria:</div><div class="personInfoValue">${escapeHtml(bateria)}</div>
      </div>
      <div class="personInfoUpdated">${escapeHtml(actualizado ? `Actualizado ${formatTime(actualizado)}` : "Sin datos recientes")}</div>
    </div>
    <div class="personInfoCamera">
      <img src="${escapeHtml(cameraImage)}" alt="Camara de ${escapeHtml(nombre)}">
    </div>
  `;

  if (dom.btnClosePersonInfoPopup) {
    dom.btnClosePersonInfoPopup.onclick = () => {
      dom.personInfoPopup?.classList.add("hidden");
      activePersonInfoPopup = null;
      stopPersonInfoRefreshTimer();
    };
  }

  activePersonInfoPopup = { personId: id, anchor };
  startPersonInfoRefreshTimer();
  dom.personInfoPopup.classList.remove("hidden");
  placePersonInfoPopup(anchor);
}

function startPersonInfoRefreshTimer() {
  if (personInfoRefreshTimer) return;
  personInfoRefreshTimer = window.setInterval(() => {
    if (!activePersonInfoPopup || dom.personInfoPopup?.classList.contains("hidden")) {
      stopPersonInfoRefreshTimer();
      return;
    }
    showPersonnelDetail(activePersonInfoPopup.personId, activePersonInfoPopup.anchor);
  }, 5000);
}

function stopPersonInfoRefreshTimer() {
  if (!personInfoRefreshTimer) return;
  window.clearInterval(personInfoRefreshTimer);
  personInfoRefreshTimer = null;
}

export function refreshPersonnelInfoPopup(personId, data = {}) {
  const id = String(personId || data?.id_personal || "").trim();
  if (!id) return;

  personalLiveData.set(id, {
    ...(personalLiveData.get(id) || {}),
    ...data,
    timestamp: firstValue(
      data.timestamp,
      data.updated_at,
      data.fecha_actualizacion,
      data.ultima_actualizacion,
      Date.now()
    )
  });

  if (!activePersonInfoPopup || activePersonInfoPopup.personId !== id || dom.personInfoPopup?.classList.contains("hidden")) {
    return;
  }

  showPersonnelDetail(id, {
    ...activePersonInfoPopup.anchor,
    ...data
  });
}
