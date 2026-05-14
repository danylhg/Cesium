// js/dashboard/dashboard.chat.js

import { dom } from "./dashboard.dom.js";
import { escapeHtml } from "./dashboard.storage.js";
import { formatTime, openPanel } from "./dashboard.ui.js";

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

let _opId      = null;
let _socket    = null;
let _activeTab = "global";
let _channelType = "global";
let _channelTarget = "";
let _allMsgs   = [];             // todos los mensajes en memoria
let _dismissedEmergencyMsgs = new Set();
let _chatDirectory = {
  cets: [],
  flotillas: [],
  grupos: [],
  vehiculos: [],
  personalById: new Map()
};

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

function comparable(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sameValue(a, b) {
  const left = comparable(a);
  const right = comparable(b);
  return !!left && !!right && left === right;
}

function flotillaAliasesForTarget(flotillaId = _channelTarget) {
  const aliases = new Set();
  const add = (value) => {
    const text = String(value || "").trim();
    if (text) aliases.add(text);
  };

  const selected = _chatDirectory.flotillas.find((flotilla) =>
    sameValue(flotilla.id, flotillaId) || sameValue(flotilla.label, flotillaId)
  );

  add(flotillaId);
  add(selected?.id);
  add(selected?.label);

  _chatDirectory.personalById.forEach((person) => {
    const flotilla = getFlotillaForPerson(person);
    const belongsToSelected =
      sameValue(flotilla?.id, flotillaId) ||
      sameValue(flotilla?.label, flotillaId) ||
      sameValue(flotilla?.id, selected?.id) ||
      sameValue(flotilla?.label, selected?.label);

    if (belongsToSelected) {
      add(flotilla?.id);
      add(flotilla?.label);
      add(person?.grupo_padre_nombre);
      add(person?.grupo_padre_apodo);
      add(person?.grupo_nombre);
      add(person?.grupo_apodo);
      add(person?.cet_flotilla);
    }
  });

  return [...aliases];
}

function flotillaMessageMatchesTarget(msg, flotillaId = _channelTarget) {
  const tipo = String(msg.destino_tipo || "").toUpperCase();
  if (tipo !== "FLOTILLA") return false;

  const aliases = flotillaAliasesForTarget(flotillaId);
  return aliases.some((alias) =>
    sameValue(msg.destino_id, alias) || sameValue(msg.destino_label, alias)
  );
}

function cellBelongsToFlotilla(cellId, flotillaId) {
  const person = _chatDirectory.personalById.get(String(cellId));
  if (!person) return false;
  const flotilla = getFlotillaForPerson(person);
  return flotillaAliasesForTarget(flotillaId).some((alias) =>
    sameValue(flotilla?.id, alias) || sameValue(flotilla?.label, alias)
  );
}

function personBelongsToFlotilla(personId, flotillaId) {
  const person = _chatDirectory.personalById.get(String(personId));
  if (!person) return false;
  const flotilla = getFlotillaForPerson(person);
  return flotillaAliasesForTarget(flotillaId).some((alias) =>
    sameValue(flotilla?.id, alias) || sameValue(flotilla?.label, alias)
  );
}

// ── Visibilidad según tab activo ────────────────────────────
// Tab CET  → solo mensajes de ADMIN, CUT y CET
// Tab Global → todos
function isVisibleInTab(msg) {
  const destinatario = (msg.destinatario_rol || "GLOBAL").toUpperCase();
  const destinoTipo = String(msg.destino_tipo || "").toUpperCase();
  const destinoId = String(msg.destino_id || "");

  if (_channelType === "global") return destinatario === "GLOBAL" && !destinoTipo;
  if (_channelType === "cets") {
    return (destinatario === "CET" && (!destinoTipo || destinoTipo === "CETS"))
      || destinoTipo === "CUTS";
  }
  if (_channelType === "cet_specific") {
    return (destinoTipo === "CET" && destinoId === String(_channelTarget))
      || (destinoTipo === "CUT" && String(msg.id_personal || "") === String(_channelTarget));
  }
  if (_channelType === "flotilla") {
    return flotillaMessageMatchesTarget(msg)
      || (destinoTipo === "CELL" && cellBelongsToFlotilla(destinoId, _channelTarget));
  }
  if (_channelType === "grupo") {
    return destinoTipo === "GRUPO" && destinoId === String(_channelTarget);
  }
  if (_channelType === "vehiculo") {
    return destinoTipo === "VEHICULO" && destinoId === String(_channelTarget);
  }
  if (_activeTab === "global") return destinatario === "GLOBAL";
  return destinatario === "CET" || destinatario === "CUT";
}

function normalizeRole(person) {
  return String(person?.rol_en_operacion || person?.rol || "").toUpperCase();
}

function fullName(person) {
  return [person?.nombre, person?.apellido].filter(Boolean).join(" ").trim() ||
    person?.apodo ||
    `Personal ${person?.id_personal || ""}`.trim();
}

function isRootGroupName(name) {
  return String(name || "").trim().toLowerCase() === "mando operativo";
}

function getFlotillaForPerson(person) {
  const cetFlotilla = person?.cet_flotilla || "";
  const parentName = person?.grupo_padre_nombre || person?.grupo_padre_apodo || "";
  const groupName = person?.grupo_nombre || person?.grupo_apodo || "";

  if (cetFlotilla) {
    return {
      id: String(person?.grupo_padre_id || cetFlotilla),
      label: cetFlotilla
    };
  }

  if (parentName && !isRootGroupName(parentName)) {
    return {
      id: String(person?.grupo_padre_id || parentName),
      label: parentName
    };
  }

  if (groupName) {
    return {
      id: String(person?.id_grupo_operacion || groupName),
      label: groupName
    };
  }

  return null;
}

function getGrupoForPerson(person) {
  const parentName = person?.grupo_padre_nombre || person?.grupo_padre_apodo || "";
  const groupName = person?.grupo_nombre || person?.grupo_apodo || "";
  if (!groupName || !parentName || isRootGroupName(parentName)) return null;

  return {
    id: String(person?.id_grupo_operacion || groupName),
    label: groupName,
    flotilla: parentName
  };
}

function uniqueById(items, keyFn = (item) => item?.id) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(keyFn(item) || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildChatDirectory(mapaData = {}) {
  const personal = Array.isArray(mapaData.personal) ? mapaData.personal : [];
  const vehiculosRaw = Array.isArray(mapaData.vehiculos) ? mapaData.vehiculos : [];

  const personalById = new Map();
  personal.forEach((p) => {
    if (p.id_personal != null) personalById.set(String(p.id_personal), p);
  });

  const cets = personal
    .filter((p) => normalizeRole(p) === "CET")
    .map((p) => ({ id: String(p.id_personal), label: fullName(p) }));

  const flotillas = uniqueById(
    personal
      .map(getFlotillaForPerson)
      .filter(Boolean),
    (item) => item.label
  );

  const grupos = uniqueById(
    personal
      .map(getGrupoForPerson)
      .filter(Boolean)
  ).map((g) => ({
    ...g,
    label: g.flotilla ? `${g.label} (${g.flotilla})` : g.label
  }));

  const vehiculos = uniqueById(
    vehiculosRaw.map((v) => {
      const id = v.id_vehiculo ?? v.id ?? v.codigo_interno ?? v.alias;
      const name = [v.codigo_interno, v.alias].filter(Boolean).join(" - ") ||
        v.alias ||
        v.tipo ||
        `Vehiculo ${id}`;
      return id == null ? null : { id: String(id), label: name };
    }).filter(Boolean)
  );

  _chatDirectory = { cets, flotillas, grupos, vehiculos, personalById };
}

async function loadChatDirectory() {
  if (!_opId) return;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/ops/${_opId}/mapa`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;
    buildChatDirectory(data);
    updateTargetSelect();
    renderMessages();
  } catch (err) {
    console.error("[CHAT] Error cargando directorio:", err);
  }
}

function getTargetsForType(type = _channelType) {
  if (type === "cet_specific") return _chatDirectory.cets;
  if (type === "flotilla") return _chatDirectory.flotillas;
  if (type === "grupo") return _chatDirectory.grupos;
  if (type === "vehiculo") return _chatDirectory.vehiculos;
  return [];
}

function updateTargetSelect(preferredValue = "") {
  if (!dom.chatChannelTarget) return;

  const targets = getTargetsForType();
  dom.chatChannelTarget.innerHTML = "";

  if (!targets.length) {
    dom.chatChannelTarget.style.display = "none";
    _channelTarget = "";
    return;
  }

  targets.forEach((target) => {
    const opt = document.createElement("option");
    opt.value = target.id;
    opt.textContent = target.label;
    dom.chatChannelTarget.appendChild(opt);
  });

  dom.chatChannelTarget.style.display = "block";
  const value = preferredValue && targets.some((t) => t.id === String(preferredValue))
    ? String(preferredValue)
    : targets[0].id;
  dom.chatChannelTarget.value = value;
  _channelTarget = value;
}

function setChannel(type, target = "") {
  _channelType = type || "global";
  _activeTab = _channelType === "global" ? "global" : "cet";
  if (dom.chatChannelType) dom.chatChannelType.value = _channelType;
  updateTargetSelect(target);
  renderMessages();
}

function getDestinatarioRol() {
  if (_channelType === "global") return "GLOBAL";
  if (_channelType === "cets" || _channelType === "cet_specific") return "CET";
  if (_channelType === "flotilla" || _channelType === "grupo" || _channelType === "vehiculo") return "CELL,CET";
  return "GLOBAL";
}

function getTargetLabel() {
  const targets = getTargetsForType();
  const found = targets.find((target) => target.id === String(_channelTarget));
  return found?.label || "";
}

function getDestinoTipo() {
  if (_channelType === "cets") return "CETS";
  if (_channelType === "cet_specific") return "CET";
  if (_channelType === "flotilla") return "FLOTILLA";
  if (_channelType === "grupo") return "GRUPO";
  if (_channelType === "vehiculo") return "VEHICULO";
  return "";
}

function getDestinoPayload() {
  const destinoTipo = getDestinoTipo();
  if (!destinoTipo) return {};

  const label = destinoTipo === "CETS" ? "Todos los CETs" : getTargetLabel();
  const id = destinoTipo === "CETS" ? "ALL" : _channelTarget;

  return {
    destino_tipo: destinoTipo,
    destino_id: id,
    destino_label: label
  };
}

// ── Build a single chat bubble ──────────────────────────────
function isEmergencyMessage(msg) {
  const tipo = String(msg?.tipo_mensaje || "").toUpperCase();
  const contenido = String(msg?.contenido || "").trim().toUpperCase();
  return tipo === "URGENTE" || contenido.startsWith("EMERGENCIA:");
}

function emergencyMessageKey(msg) {
  return String(msg?.id_mensaje ?? msg?.fecha_envio ?? msg?.contenido ?? "");
}

function buildEmergencyAlert(msg) {
  const autor = escapeHtml(msg.autor_nombre || "Sistema");
  const hora = escapeHtml(formatTime(msg.fecha_envio));
  const texto = escapeHtml(msg.contenido || "");
  const key = escapeHtml(emergencyMessageKey(msg));

  return `
    <div class="emergencyAlertItem" data-id="${escapeHtml(msg.id_mensaje ?? "")}">
      <button class="emergencyAlertClose" type="button" data-alert-close="${key}" aria-label="Cerrar alerta">x</button>
      <div class="emergencyAlertItemHeader">
        <span class="emergencyAlertLabel">
          <span class="emergencyAlertDot"></span>
          <span>Alerta</span>
        </span>
      </div>
      <div class="emergencyAlertMeta">
        <span>${autor}</span>
        <span>${hora}</span>
      </div>
      <div class="emergencyAlertText">${texto}</div>
    </div>
  `;
}

function renderEmergencyAlerts() {
  if (!dom.emergencyAlertPanel || !dom.emergencyAlertList) return;

  const alerts = _allMsgs.filter((msg) =>
    isEmergencyMessage(msg) && !_dismissedEmergencyMsgs.has(emergencyMessageKey(msg))
  );
  dom.emergencyAlertPanel.classList.toggle("open", alerts.length > 0);
  dom.emergencyAlertList.innerHTML = alerts.map(buildEmergencyAlert).join("");
  dom.emergencyAlertList.scrollTop = dom.emergencyAlertList.scrollHeight;
}

function formatDestino(msg) {
  const tipo = String(msg.destino_tipo || "").toUpperCase();
  const label = String(msg.destino_label || "").trim();
  if (!label) return "";

  if (tipo === "CETS") return "para todos los CETs";
  if (tipo === "CET") return `para CET: ${label}`;
  if (tipo === "CUTS") return "para todos los CUT";
  if (tipo === "CUT") return `para CUT: ${label}`;
  if (tipo === "CELL") return `para CELL: ${label}`;
  if (tipo === "FLOTILLA") return `para flotilla: ${label}`;
  if (tipo === "GRUPO") return `para grupo: ${label}`;
  if (tipo === "VEHICULO") return `para vehiculo: ${label}`;
  return `para ${label}`;
}

function shouldHideChatMessage(msg) {
  const tipo = String(msg?.tipo_mensaje || "").toUpperCase();
  const contenido = String(msg?.contenido || "").toLowerCase();
  if (tipo !== "SISTEMA") return false;
  return (
    contenido.includes("trigger de bd") ||
    contenido.includes("operacion activada autom") ||
    contenido.includes("operación activada autom")
  );
}

function buildBubble(msg) {
  if (shouldHideChatMessage(msg)) return "";
  const mine  = isMine(msg);
  const autor = escapeHtml(msg.autor_nombre || "Sistema");
  const hora  = escapeHtml(formatTime(msg.fecha_envio));
  const texto = escapeHtml(msg.contenido || "");
  const tipo  = (msg.tipo_mensaje || "NORMAL").toUpperCase();
  const rol   = (msg.autor_rol   || "").toLowerCase();    // admin | cut | cet | cell
  const destinoText = formatDestino(msg);
  const destino = destinoText
    ? `${escapeHtml(destinoText)} - ${hora}`
    : hora;

  const typeExtra = tipo === "URGENTE" ? " urgente" : tipo === "SISTEMA" ? " sistema" : "";
  const rolClass  = rol ? ` rol-${rol}` : "";

  const header = tipo !== "SISTEMA"
    ? `<div class="chatBubbleHeader"><span>${autor}</span><span>${destino}</span></div>`
    : `<div class="chatBubbleTime">${hora}</div>`;
  const attachment = buildAttachmentMarkup(msg);

  return `
    <div class="chatBubble${mine ? " mine" : ""}${typeExtra}${rolClass}" data-id="${msg.id_mensaje ?? ""}">
      ${header}
      <div class="chatBubbleText">${texto}</div>
      ${attachment}
    </div>
  `;
}

function buildAttachmentMarkup(msg) {
  const url = msg.attachment_url;
  if (!url) return "";

  const absolute = /^https?:\/\//i.test(url) ? url : `${API_BASE}${String(url).startsWith("/") ? "" : "/"}${url}`;
  const kind = String(msg.attachment_kind || "").toUpperCase();
  const name = escapeHtml(msg.attachment_name || "Adjunto");
  const safeUrl = escapeHtml(absolute);

  if (kind === "IMAGE") {
    return `<a class="chatAttachment" href="${safeUrl}" target="_blank" rel="noopener"><img src="${safeUrl}" alt="${name}"></a>`;
  }

  if (kind === "VIDEO") {
    return `<video class="chatAttachmentMedia" src="${safeUrl}" controls playsinline></video>`;
  }

  if (kind === "AUDIO") {
    return `<audio class="chatAttachmentMedia" src="${safeUrl}" controls></audio>`;
  }

  return `<a class="chatAttachmentFile" href="${safeUrl}" target="_blank" rel="noopener">${name}</a>`;
}

// ── Re-renderiza todos los mensajes visibles ────────────────
function renderMessages() {
  if (!dom.chatMessages) return;
  dom.chatMessages.innerHTML = "";
  _allMsgs.filter(msg => !shouldHideChatMessage(msg) && !isEmergencyMessage(msg) && isVisibleInTab(msg)).forEach(msg => {
    dom.chatMessages.insertAdjacentHTML("beforeend", buildBubble(msg));
  });
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  renderEmergencyAlerts();
}

// ── Agrega un mensaje (guard de duplicados) ─────────────────
function appendMessage(msg) {
  if (!dom.chatMessages) return;

  // Dedup por id_mensaje
  if (msg.id_mensaje && _allMsgs.some(m => m.id_mensaje === msg.id_mensaje)) return;
  _allMsgs.push(msg);

  if (shouldHideChatMessage(msg)) return;
  if (isEmergencyMessage(msg)) {
    renderEmergencyAlerts();
    return;
  }
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
      body: JSON.stringify({
        contenido: text,
        tipo_mensaje: "NORMAL",
        destinatario_rol: getDestinatarioRol(),
        ...getDestinoPayload()
      })
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

  loadChatDirectory();
  loadMessages();
}

// ── Público: enlaza eventos de UI ───────────────────────────
export function bindChatEvents() {
  if (dom.emergencyAlertList) {
    dom.emergencyAlertList.addEventListener("click", (event) => {
      const closeBtn = event.target.closest("[data-alert-close]");
      if (!closeBtn) return;
      _dismissedEmergencyMsgs.add(String(closeBtn.dataset.alertClose || ""));
      closeBtn.closest(".emergencyAlertItem")?.remove();
      if (!dom.emergencyAlertList.querySelector(".emergencyAlertItem")) {
        dom.emergencyAlertPanel?.classList.remove("open");
      }
    });
  }

  if (dom.chatChannelType) {
    dom.chatChannelType.addEventListener("change", () => {
      setChannel(dom.chatChannelType.value || "global");
    });
  }

  if (dom.chatChannelTarget) {
    dom.chatChannelTarget.addEventListener("change", () => {
      _channelTarget = dom.chatChannelTarget.value || "";
      renderMessages();
    });
  }

  document.addEventListener("openEntityChat", (event) => {
    const detail = event.detail || {};
    const trackingKey = String(detail.trackingKey || "");
    const id = trackingKey.split(":")[1] || "";
    const person = trackingKey.startsWith("P:") ? _chatDirectory.personalById.get(String(id)) : null;

    if (detail.target === "cet") {
      setChannel("cet_specific", id);
    } else if (detail.target === "flotilla") {
      const flotilla = getFlotillaForPerson(person);
      setChannel("flotilla", flotilla?.id || "");
    } else if (detail.target === "grupo") {
      const grupo = getGrupoForPerson(person);
      setChannel("grupo", grupo?.id || "");
    } else if (detail.target === "vehiculo") {
      setChannel("vehiculo", id);
    }

    openPanel(dom.chatPanel, dom.toggleChatPanel);
    dom.chatInput?.focus();
  });

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
      setChannel("cets");
      dom.chatTabCet.classList.add("active");
      dom.chatTabCells?.classList.remove("active");
    });
  }

  if (dom.chatTabCells) {
    dom.chatTabCells.addEventListener("click", () => {
      setChannel("global");
      dom.chatTabCells.classList.add("active");
      dom.chatTabCet?.classList.remove("active");
    });
  }
}
