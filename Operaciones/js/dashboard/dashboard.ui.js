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

let _lastPersonalData = [];

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
  dom.chatAudiencePanel?.classList.remove("open");
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

function labelConPrefijo(prefijo, nombre) {
  if (!nombre || nombre === "Sin flotilla" || nombre === "Sin grupo") return nombre;
  const nLower = nombre.toLowerCase();
  const pLower = prefijo.toLowerCase();
  if (nLower.startsWith(pLower)) return nombre;
  return `${prefijo} ${nombre}`;
}

function normalizePersonal(personal) {
  return personal.map((p) => {
    const id = getPersonId(p);
    if (!p?.rol_en_operacion) {
      return {
        ...p,
        id,
        nombre: (p.apodo || p.apodo_personal || "").trim()
      };
    }

    const nombre = (p.apodo || p.apodo_personal || "").trim();
    const grupoDirecto = p.grupo_nombre || "";
    const grupoPadre = p.grupo_padre_nombre || "";
    const padreEsRaiz = grupoPadre.trim().toLowerCase() === "mando operativo";
    const tieneSubgrupo = Boolean(grupoPadre && !padreEsRaiz);

    return {
      id,
      cargo: p.rol_en_operacion,
      nombre,
      grupo: tieneSubgrupo ? grupoDirecto : "",
      flotilla: tieneSubgrupo ? grupoPadre : (grupoDirecto || grupoPadre || "")
    };
  });
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
  return person.apodo ||
    person.apodo_personal ||
    person.name ||
    person.nombre_completo ||
    "";
}

function getPersonFullName(person = {}) {
  return [
    person.nombre,
    person.apellido
  ].filter(Boolean).join(" ").trim();
}

// ...

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
    (p) => ["CÃƒÂ©lula", "CELL", "Celulas", "CÃƒÂ©lulas"].includes(p.cargo || p.rol)
  );

  const nameLink = (p) => {
    const nombre = p.nombre || p.apodo || p.apodo_personal || "Sin apodo";
    return `<span class="person-link" data-person-id="${escapeHtml(p.id)}" data-person-name="${escapeHtml(nombre)}" style="cursor:pointer; color:#00ffa6; text-decoration:underline;">${escapeHtml(nombre)}</span>`;
  };

  cuts.forEach((cut) => {
    html += `
      <div class="miniCard" style="border-left: 3px solid #10b981;">
        <p><strong>CUT:</strong> ${nameLink(cut)}</p>
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
        grupos.get(cell.grupo).push(cell);
      } else {
        directos.push(cell);
      }
    });

    html += `
      <div class="miniCard" style="border-left: 3px solid #3b82f6; margin-top:8px;">
        <p><strong>${nameLink(cet)} (CET)</strong></p>
        <p style="margin-top:8px;"><strong>${escapeHtml(labelConPrefijo("Flotilla", flotillaNombre))}</strong></p>
    `;

    directos.forEach((p) => {
      html += `
        <p style="padding-left:20px; margin:2px 0;">-- ${nameLink(p)}</p>
      `;
    });

    Array.from(grupos.entries()).forEach(([grupoNombre, integrantes]) => {
      html += `
        <p style="margin-top:12px;"><strong>${escapeHtml(labelConPrefijo("Grupo", grupoNombre))}</strong></p>
      `;

      integrantes.forEach((p) => {
        html += `
          <p style="padding-left:20px; margin:2px 0;">-- ${nameLink(p)}</p>
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
  return row.asignado_a_apodo || row.personal_apodo || row.apodo_personal || "";
}

function renderVehiculosHierarchyHtml(vehiculos) {
  if (!vehiculos.length) return "<p>Sin vehiculos asignados.</p>";

  const byVehiculo = buildVehiculoTree(vehiculos);
  let html = "";

  for (const [, veh] of byVehiculo) {
    const nombre = veh.alias || "Vehiculo";

    html += `<div class="miniCard"><p><strong>${escapeHtml(nombre)}</strong></p>`;

    // flotilla_nombre â†’ { directos: [], grupos: Map<string, []> }
    const cets = new Map();
    const sinContexto = [];

    for (const row of veh.rows) {
      const personal = getVehiculoPersonalNombre(row);
      const cetNombre = row.cet_apodo || "Sin CET";

      // Campos nuevos del endpoint mapa (con fallback al endpoint vehiculos-asignados)
      const grupoDirecto = row.grupo_directo_nombre || row.grupo_nombre || "";
      const grupoPadre = row.grupo_padre_nombre || "";
      const nivel = (row.nivel_asignacion || "").toUpperCase();

      let flotillaNombre, grupoNombre;

      if (grupoPadre) {
        flotillaNombre = grupoPadre;
        grupoNombre = grupoDirecto;
      } else if (grupoDirecto) {
        if (nivel === "GRUPO") {
          flotillaNombre = "";
          grupoNombre = grupoDirecto;
        } else {
          flotillaNombre = grupoDirecto;
          grupoNombre = "";
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
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      fechaP = `${dd}-${mm}-${yyyy}`;
      if (horaP === "No definida") {
        const hh = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");
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
  _lastPersonalData = Array.isArray(personal) ? personal : [];
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
  const phase = (op.phase || op.estado || "").toLowerCase();
  const active = phase === "activa";
  const closed = phase === "cerrada" || phase === "cancelada";

  const badge = document.getElementById("opStatusBadge");
  const title = document.getElementById("topbarTitle");
  const dot = document.getElementById("brandDot");
  const actionBtns = document.getElementById("mapActionButtons");
  const activateOpBtn = document.getElementById("activateOpBtn");
  const closeActiveBtn = document.getElementById("closeActiveOpBtn");

  const operationName = op.nombre || op.title || op.titulo || op.name || "Operacion";

  if (badge) badge.style.display = "none";
  if (title) title.textContent = op?.id ? operationName : "Panorama tactico";
  if (dot) dot.style.background = active ? "#ff4444" : "#00ffa6";
  if (actionBtns) actionBtns.style.display = active || closed ? "none" : "flex";
  if (activateOpBtn) activateOpBtn.style.display = !active && !closed ? "inline-flex" : "none";
  if (closeActiveBtn) closeActiveBtn.style.display = active ? "inline-flex" : "none";

  if (dom.toggleChatPanel) {
    dom.toggleChatPanel.style.display = active ? "flex" : "none";
  }
  if (dom.toggleCameraPanel) {
    dom.toggleCameraPanel.style.display = active ? "flex" : "none";
  }

  if (!active) {
    dom.chatPanel?.classList.remove("open");
    dom.chatAudiencePanel?.classList.remove("open");
    dom.toggleChatPanel?.classList.remove("active");
    // We don't force close the camera panel here if it was open, 
    // but the button will be hidden by the previous lines.
  }

  if (dom.chatInput) dom.chatInput.disabled = !active;
  if (dom.sendChatBtn) dom.sendChatBtn.disabled = !active;
  if (dom.chatCameraBtn) dom.chatCameraBtn.disabled = !active;
  if (dom.chatAudioBtn) dom.chatAudioBtn.disabled = !active;
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
    type = "VehÃ­culo (Rastreo)";
    const occupants = getVehicleOccupants(trackingKey);

    // Convertir P:1 a nombres:
    const bdData = getCurrentOperation();
    const personas = Array.isArray(bdData.personal) ? bdData.personal : [];
    const ocupantesNombres = occupants.map(occId => {
      const id = occId.split(":")[1];
      const p = personas.find(x => String(x.id_personal) === String(id));
      if (p) return getPersonName(p);
      return occId;
    });

    const ocupantesHtml = ocupantesNombres.length > 0
      ? ocupantesNombres.map(n => `<span style="display:inline-block; background:rgba(0,191,255,0.2); padding:2px 6px; border-radius:4px; margin:2px 4px 2px 0;">ðŸ§‘â€ðŸš€ ${escapeHtml(n)}</span>`).join("")
      : `<span style="color:#94a3b8; font-size:11px;">Sin tripulaciÃ³n detectada.</span>`;

    dom.selectionInfo.innerHTML = `
      <div style="font-weight:bold; color:#00ffa6; margin-bottom:4px;">${escapeHtml(name)}</div>
      <div style="font-size:11px; margin-bottom:8px;">Tipo: ${escapeHtml(type)}</div>
      <div style="font-size:11px; font-weight:bold; margin-bottom:4px;">Pasajeros a bordo:</div>
      <div style="margin-bottom:12px;">${ocupantesHtml}</div>
      <button id="btnChatVehiculo" class="btnBeige" style="width:100%; font-size:12px; padding:6px;">ðŸ’¬ Mensaje a TripulaciÃ³n</button>
    `;

    // Asignar evento al botÃ³n dinÃ¡micamente
    const btnChat = document.getElementById("btnChatVehiculo");
    if (btnChat) {
      btnChat.addEventListener("click", () => {
        // Enviar evento para abrir chat con el tag del vehÃ­culo
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

function formatOxygen(value) {
  const oxygen = firstValue(value);
  if (oxygen == null) return "-";
  const text = String(oxygen).trim();
  return text.endsWith("%") ? text : `${text}%`;
}

function sameText(a, b) {
  const clean = (value) => String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return clean(a) && clean(a) === clean(b);
}

function getAvailablePersonal() {
  const op = getCurrentOperation();
  const asignacion = getJsonStorage(ASIGNACION_ACTUAL_KEY, {}) || {};
  return [
    ..._lastPersonalData,
    ...(Array.isArray(asignacion.personal) ? asignacion.personal : []),
    ...(Array.isArray(op.personal) ? op.personal : [])
  ];
}

function findPerson(personId, fallbackName = "") {
  const people = getAvailablePersonal();
  const id = String(personId || "").trim();
  const byId = people.find((p) => String(getPersonId(p) || "").trim() === id);
  if (byId) return byId;
  return people.find((p) => sameText(getPersonName(p), fallbackName));
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
    ...(Array.isArray(op.asignacionDispositivos) ? op.asignacionDispositivos : [])
  ];
  const id = String(personId || getPersonId(person) || "").trim();
  const name = personName || getPersonName(person);
  const directAssignment = assignments.find((a) => String(a.id_personal || "").trim() === id);
  if (directAssignment) {
    const assignedId = String(directAssignment.id_dispositivo || "").trim();
    const byId = devices.find((d) => String(d.id_dispositivo || d.id || "").trim() === assignedId);
    if (byId) return byId;
  }
  return devices.find((d) => sameText(d.responsable || d.asignado_a_personal || d.personal_nombre, name));
}

function getPersonCameraImage(personId) {
  const images = [
    "img/cameras/cam1.png",
    "img/cameras/cam2.png",
    "img/cameras/cam3.png",
    "https://images.unsplash.com/photo-1508614589041-895b88991e3e?q=80&w=1000&auto=format&fit=crop"
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
  if (!dom.personInfoPopup || !dom.personInfoPopupContent) return;

  const person = findPerson(personId, anchor.name);
  
  if (!person) {
    console.warn("[PERSONAL] No se encontro informacion para:", personId, anchor.name);
    return;
  }

  const nombre = getPersonName(person) || anchor.name || `Personal ${personId}`;
  const nombreCompleto = getPersonFullName(person);
  const lat = firstValue(anchor.lat, person.latitud, person.lat);
  const lng = firstValue(anchor.lng, person.longitud, person.lng, person.lon);
  const curso = firstValue(anchor.curso, person.curso, person.heading, person.rumbo, "-");
  const estado = firstValue(person.estado, person.estatus, person.activo === false ? "INACTIVO" : "ACTIVO");
  const assignedDevice = getAssignedDevice(person, personId, nombre) || {};
  const fc = firstValue(person.pulso, person.frecuencia_cardiaca, person.fc, person.heart_rate, assignedDevice.pulso, assignedDevice.frecuencia_cardiaca, assignedDevice.heart_rate, "-");
  const oxigenacion = formatOxygen(firstValue(person.oxigenacion, person.oxigeno, person.saturacion_oxigeno, person.spo2, person.spO2, person.blood_oxygen, assignedDevice.oxigenacion, assignedDevice.oxigeno, assignedDevice.saturacion_oxigeno, assignedDevice.spo2, assignedDevice.spO2, assignedDevice.blood_oxygen));
  const bateria = formatBattery(firstValue(assignedDevice.bateria, assignedDevice.battery, assignedDevice.battery_level, assignedDevice.nivel_bateria, person.dispositivo_bateria, person.device_battery, person.bateria_dispositivo, person.bateria, person.battery, person.battery_level));
  const actualizado = firstValue(person.updated_at, person.fecha_actualizacion, person.ultima_actualizacion, person.timestamp);
  const cameraImage = firstValue(person.camera_url, person.camara_url, person.video_thumbnail) || getPersonCameraImage(personId);

  dom.personInfoPopupContent.innerHTML = `
    <h3 class="personInfoTitle">${escapeHtml(nombre)}</h3>
    ${nombreCompleto && !sameText(nombreCompleto, nombre)
      ? `<div class="personInfoSubtitle">${escapeHtml(nombreCompleto)}</div>`
      : ""}
    <div class="personInfoGrid">
      <div class="personInfoLabel">Lat:</div><div class="personInfoValue">${escapeHtml(formatCoord(lat))}</div>
      <div class="personInfoLabel">Lng:</div><div class="personInfoValue">${escapeHtml(formatCoord(lng))}</div>
      <div class="personInfoLabel">Curso:</div><div class="personInfoValue">${escapeHtml(String(curso))}${String(curso) !== "-" ? "°" : ""}</div>
    </div>
    <div class="personInfoStatus">Estado <strong>${escapeHtml(String(estado).toUpperCase())}</strong></div>
    <div class="personInfoBio">
      <div class="personInfoGrid">
        <div class="personInfoLabel">Pulso:</div><div class="personInfoValue">${escapeHtml(String(fc))}</div>
        <div class="personInfoLabel">Oxigenaci&oacute;n:</div><div class="personInfoValue">${escapeHtml(oxigenacion)}</div>
        <div class="personInfoLabel">Bater&iacute;a:</div><div class="personInfoValue">${escapeHtml(bateria)}</div>
      </div>
      <div class="personInfoUpdated">Actualizado ${escapeHtml(actualizado ? formatTime(actualizado) : formatTime(new Date().toISOString()))}</div>
    </div>
    <div class="personInfoCamera">
      <img src="${escapeHtml(cameraImage)}" alt="Camara de ${escapeHtml(nombre)}">
    </div>
  `;

  dom.personInfoPopup.classList.remove("hidden");
  placePersonInfoPopup(anchor);
}



