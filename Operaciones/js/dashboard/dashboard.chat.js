// js/dashboard/dashboard.chat.js

import { dom } from "./dashboard.dom.js";
import { escapeHtml } from "./dashboard.storage.js";
import { formatTime } from "./dashboard.ui.js";
import { getVehicleOccupants } from "./dashboard.tracking.clustering.js";

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

let _opId = null;
let _socket = null;
let _activeTab = "global";
let _channelType = "global";
let _channelTarget = "";
let _allMsgs = [];             // todos los mensajes en memoria
let _chatDirectory = {
  cets: [],
  cells: [],
  flotillas: [],
  grupos: [],
  vehiculos: [],
  personalById: new Map()
};
let _mediaRecorder = null;
let _audioChunks = [];
let _isRecordingAudio = false;

const ATTACHMENT_PREFIX = "CHAT_ATTACHMENT:";


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
  if (tabla === "usuario") return String(msg.id_usuario) === String(sub);
  if (tabla === "personal") return String(msg.id_personal) === String(sub);
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

// â”€â”€ Visibilidad segÃºn tab activo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tab CET  â†’ solo mensajes de ADMIN, CUT y CET
// Tab Global â†’ todos
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
  if (_channelType === "cell_specific") {
    return destinoTipo === "CELL" && destinoId === String(_channelTarget);
  }
  if (_channelType === "flotilla") {
    return flotillaMessageMatchesTarget(msg)
      || destinoTipo === "CETS"
      || (destinoTipo === "CELL" && cellBelongsToFlotilla(destinoId, _channelTarget))
      || (destinoTipo === "CET" && personBelongsToFlotilla(destinoId, _channelTarget));
  }
  if (_channelType === "grupo") {
    return destinoTipo === "GRUPO" && destinoId === String(_channelTarget);
  }
  if (_channelType === "vehiculo") {
    return (destinoTipo === "VEHICULO" && destinoId === String(_channelTarget))
      || (destinoTipo === "CELL_LIST" && sameValue(msg.destino_label, getTargetLabel()));
  }
  if (_activeTab === "global") return destinatario === "GLOBAL";
  return destinatario === "CET" || destinatario === "CUT";
}

function normalizeRole(person) {
  return String(person?.rol_en_operacion || person?.rol || "").toUpperCase();
}

function fullName(person) {
  return person?.apodo ||
    person?.apodo_personal ||
    [person?.nombre, person?.apellido].filter(Boolean).join(" ").trim() ||
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

  const cells = personal
    .filter((p) => normalizeRole(p) === "CELL")
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
      const name = v.alias ||
        v.codigo_interno ||
        v.tipo ||
        `Vehiculo ${id}`;
      return id == null ? null : { id: String(id), label: name };
    }).filter(Boolean)
  );

  _chatDirectory = { cets, cells, flotillas, grupos, vehiculos, personalById };
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
  if (type === "cell_specific") return _chatDirectory.cells;
  if (type === "flotilla") return _chatDirectory.flotillas;
  if (type === "grupo") return _chatDirectory.grupos;
  if (type === "vehiculo") return _chatDirectory.vehiculos;
  return [];
}

function channelLabel(type = _channelType) {
  const labels = {
    global: "Todos",
    cets: "Todos los CET",
    cet_specific: "CET",
    cell_specific: "CELL",
    flotilla: "Flotilla",
    grupo: "Grupo",
    vehiculo: "Ocupantes de vehículo"
  };
  return labels[type] || "Todos";
}

function channelSubtitle(type = _channelType) {
  const labels = {
    global: "Operación completa",
    cets: "Mandos CET",
    cet_specific: "Personal específico",
    cell_specific: "Personal específico",
    flotilla: "CET e integrantes",
    grupo: "Integrantes del grupo",
    vehiculo: "Ocupantes detectados"
  };
  return labels[type] || "Operación completa";
}

function channelAvatar(type = _channelType) {
  const labels = {
    global: "T",
    cets: "C",
    cet_specific: "C",
    cell_specific: "P",
    flotilla: "F",
    grupo: "G",
    vehiculo: "V"
  };
  return labels[type] || "T";
}

function syncAudienceUi() {
  document.querySelectorAll("[data-chat-channel]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.chatChannel === _channelType);
  });

  const needsTarget = getTargetsForType().length > 0;
  if (dom.chatTargetBox) dom.chatTargetBox.classList.toggle("hidden", !needsTarget);
  if (dom.chatTargetEmpty) dom.chatTargetEmpty.classList.toggle("hidden", needsTarget);

  if (dom.chatTargetPicker) {
    dom.chatTargetPicker.innerHTML = "";
    getTargetsForType().forEach((target) => {
      const opt = document.createElement("option");
      opt.value = target.id;
      opt.textContent = target.label;
      dom.chatTargetPicker.appendChild(opt);
    });
    if (_channelTarget) dom.chatTargetPicker.value = _channelTarget;
  }

  const targetLabel = getTargetLabel();
  const title = targetLabel || channelLabel();
  if (dom.chatAudienceSummary) {
    dom.chatAudienceSummary.textContent = title;
  }
  if (dom.chatConversationTitle) dom.chatConversationTitle.textContent = title;
  if (dom.chatConversationSubtitle) dom.chatConversationSubtitle.textContent = targetLabel
    ? channelLabel()
    : channelSubtitle();
  if (dom.chatConversationAvatar) dom.chatConversationAvatar.textContent = channelAvatar();
}

function updateTargetSelect(preferredValue = "") {
  if (!dom.chatChannelTarget) return;

  const targets = getTargetsForType();
  dom.chatChannelTarget.innerHTML = "";

  if (!targets.length) {
    dom.chatChannelTarget.style.display = "none";
    _channelTarget = "";
    syncAudienceUi();
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
  syncAudienceUi();
}

function setChannel(type, target = "") {
  _channelType = type || "global";
  _activeTab = _channelType === "global" ? "global" : "cet";
  if (dom.chatChannelType) dom.chatChannelType.value = _channelType;
  updateTargetSelect(target);
  syncAudienceUi();
  renderMessages();
}

function getDestinatarioRol() {
  if (_channelType === "global") return "GLOBAL";
  if (_channelType === "cets" || _channelType === "cet_specific") return "CET";
  if (_channelType === "cell_specific") return "CELL";
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
  if (_channelType === "cell_specific") return "CELL";
  if (_channelType === "flotilla") return "FLOTILLA";
  if (_channelType === "grupo") return "GRUPO";
  if (_channelType === "vehiculo") return "VEHICULO";
  return "";
}

function getDestinoPayload() {
  const destinoTipo = getDestinoTipo();
  if (!destinoTipo) return {};

  const label = destinoTipo === "CETS" ? "Todos los CETs" : getTargetLabel();

  if (destinoTipo === "VEHICULO") {
    const occupantIds = getVehicleOccupants(`V:${_channelTarget}`)
      .map((key) => String(key).replace(/^P:/, "").trim())
      .filter(Boolean);

    if (!occupantIds.length) {
      alert("No hay personal detectado arriba de ese vehiculo.");
      return null;
    }

    return {
      destino_tipo: "CELL_LIST",
      destino_id: occupantIds.join(","),
      destino_label: label
    };
  }

  const id = destinoTipo === "CETS" ? "ALL" : _channelTarget;

  return {
    destino_tipo: destinoTipo,
    destino_id: id,
    destino_label: label
  };
}

function setAttachStatus(text = "") {
  if (!dom.chatAttachStatus) return;
  dom.chatAttachStatus.textContent = text;
  dom.chatAttachStatus.style.display = text ? "block" : "none";
}

function openChatPanels() {
  dom.chatAudiencePanel?.classList.add("open");
  dom.chatPanel?.classList.add("open");
  dom.toggleChatPanel?.classList.add("active");
}

function attachmentToContent(payload) {
  return `${ATTACHMENT_PREFIX}${JSON.stringify(payload)}`;
}

function parseAttachmentContent(content = "") {
  if (!String(content).startsWith(ATTACHMENT_PREFIX)) return null;
  try {
    return JSON.parse(String(content).slice(ATTACHMENT_PREFIX.length));
  } catch {
    return null;
  }
}

function renderMessageContent(msg) {
  const content = msg.contenido || "";
  const attachment = parseAttachmentContent(content);
  if (!attachment) return `<div class="chatBubbleText">${escapeHtml(content)}</div>`;

  const caption = attachment.caption
    ? `<div class="chatBubbleText">${escapeHtml(attachment.caption)}</div>`
    : "";

  if (attachment.kind === "image") {
    return `
      <div class="chatAttachment">
        <img class="chatAttachmentImage" src="${escapeHtml(attachment.dataUrl || "")}" alt="${escapeHtml(attachment.name || "Imagen del chat")}">
        ${caption}
      </div>
    `;
  }

  if (attachment.kind === "audio") {
    return `
      <div class="chatAttachment">
        <audio class="chatAttachmentAudio" controls src="${escapeHtml(attachment.dataUrl || "")}"></audio>
        ${caption}
      </div>
    `;
  }

  return `<div class="chatBubbleText">${escapeHtml(content)}</div>`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function imageFileToDataUrl(file) {
  const originalDataUrl = await fileToDataUrl(file);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = () => resolve(originalDataUrl);
    img.src = originalDataUrl;
  });
}

// â”€â”€ Build a single chat bubble â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  if (tipo === "CELL_LIST") return `para ocupantes de vehiculo: ${label}`;
  return `para ${label}`;
}

function buildBubble(msg) {
  const mine = isMine(msg);
  const autor = escapeHtml(msg.autor_nombre || "Sistema");
  const hora = escapeHtml(formatTime(msg.fecha_envio));
  const tipo = (msg.tipo_mensaje || "NORMAL").toUpperCase();
  const rol = (msg.autor_rol || "").toLowerCase();    // admin | cut | cet | cell
  const destinoText = formatDestino(msg);
  const destino = destinoText
    ? `${escapeHtml(destinoText)} - ${hora}`
    : hora;

  const typeExtra = tipo === "URGENTE" ? " urgente" : tipo === "SISTEMA" ? " sistema" : "";
  const rolClass = rol ? ` rol-${rol}` : "";

  const header = tipo !== "SISTEMA"
    ? `<div class="chatBubbleHeader"><span>${autor}</span><span>${destino}</span></div>`
    : `<div class="chatBubbleTime">${hora}</div>`;

  return `
    <div class="chatBubble${mine ? " mine" : ""}${typeExtra}${rolClass}" data-id="${msg.id_mensaje ?? ""}">
      ${header}
      ${renderMessageContent(msg)}
    </div>
  `;
}

// â”€â”€ Re-renderiza todos los mensajes visibles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderMessages() {
  if (!dom.chatMessages) return;
  dom.chatMessages.innerHTML = "";
  _allMsgs.filter((msg) => isVisibleInTab(msg)).forEach(msg => {
    dom.chatMessages.insertAdjacentHTML("beforeend", buildBubble(msg));
  });
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

// â”€â”€ Agrega un mensaje (guard de duplicados) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function appendMessage(msg) {
  if (!dom.chatMessages) return;

  // Dedup por id_mensaje
  if (msg.id_mensaje && _allMsgs.some(m => m.id_mensaje === msg.id_mensaje)) return;
  _allMsgs.push(msg);

  if (!isVisibleInTab(msg)) return;

  const atBottom =
    dom.chatMessages.scrollHeight - dom.chatMessages.scrollTop <=
    dom.chatMessages.clientHeight + 60;

  dom.chatMessages.insertAdjacentHTML("beforeend", buildBubble(msg));

  if (atBottom) dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

// â”€â”€ Carga historial desde backend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function loadMessages() {
  if (!_opId) return;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/ops/${_opId}/chat/messages`, {
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

// â”€â”€ EnvÃ­a un mensaje (POST â†’ socket lo devuelve) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sendChatContent(content, { clearText = false, restoreText = "" } = {}) {
  if (!_opId) return;
  const text = String(content || "").trim();
  if (!text) return;

  if (clearText && dom.chatInput) dom.chatInput.value = "";
  if (dom.sendChatBtn) dom.sendChatBtn.disabled = true;

  try {
    const destinoPayload = getDestinoPayload();
    if (destinoPayload === null) {
      if (restoreText && dom.chatInput) dom.chatInput.value = restoreText;
      return;
    }

    const token = localStorage.getItem("token");
    const res = await fetch(`${API_BASE}/ops/${_opId}/chat/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contenido: text,
        tipo_mensaje: "NORMAL",
        destinatario_rol: getDestinatarioRol(),
        ...destinoPayload
      })
    });
    if (!res.ok) {
      console.error("[CHAT] Error al enviar:", res.status);
      if (restoreText && dom.chatInput) dom.chatInput.value = restoreText;
    }
    // El mensaje llega vÃ­a socket â€” no se agrega localmente aquÃ­
  } catch (err) {
    console.error("[CHAT] Error enviando mensaje:", err);
    if (restoreText && dom.chatInput) dom.chatInput.value = restoreText;
  } finally {
    if (dom.sendChatBtn) dom.sendChatBtn.disabled = false;
    dom.chatInput?.focus();
  }
}

// â”€â”€ PÃºblico: inicializa chat con socket â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sendMessage() {
  const text = dom.chatInput?.value.trim();
  await sendChatContent(text, { clearText: true, restoreText: text });
}

async function sendAttachment(kind, dataUrl, name = "") {
  const caption = dom.chatInput?.value.trim() || "";
  if (dom.chatInput) dom.chatInput.value = "";
  await sendChatContent(attachmentToContent({ kind, dataUrl, name, caption }), {
    clearText: false,
    restoreText: caption
  });
}

async function sendImageFromInput(input) {
  const file = input?.files?.[0];
  if (!file) return;
  try {
    setAttachStatus("Preparando imagen...");
    const dataUrl = await imageFileToDataUrl(file);
    await sendAttachment("image", dataUrl, file.name || "imagen.jpg");
  } catch (err) {
    console.error("[CHAT] Error enviando imagen:", err);
    alert("No se pudo enviar la imagen.");
  } finally {
    if (input) input.value = "";
    setAttachStatus("");
  }
}

async function toggleAudioRecording() {
  if (_isRecordingAudio && _mediaRecorder) {
    _mediaRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    alert("Este navegador no permite grabar audio desde aqui.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _audioChunks = [];
    _mediaRecorder = new MediaRecorder(stream);
    _mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size) _audioChunks.push(event.data);
    };
    _mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      _isRecordingAudio = false;
      dom.chatAudioBtn?.classList.remove("recording");
      if (dom.chatAudioBtn) {
        dom.chatAudioBtn.textContent = "🎙";
        dom.chatAudioBtn.title = "Grabar audio";
        dom.chatAudioBtn.setAttribute("aria-label", "Grabar audio");
      }
      setAttachStatus("Enviando audio...");
      const blob = new Blob(_audioChunks, { type: _mediaRecorder.mimeType || "audio/webm" });
      const dataUrl = await fileToDataUrl(blob);
      await sendAttachment("audio", dataUrl, "audio.webm");
      setAttachStatus("");
    };
    _mediaRecorder.start();
    _isRecordingAudio = true;
    dom.chatAudioBtn?.classList.add("recording");
    if (dom.chatAudioBtn) {
      dom.chatAudioBtn.textContent = "■";
      dom.chatAudioBtn.title = "Detener grabación";
      dom.chatAudioBtn.setAttribute("aria-label", "Detener grabación");
    }
    setAttachStatus("Grabando audio...");
  } catch (err) {
    console.error("[CHAT] Error grabando audio:", err);
    alert("No se pudo acceder al microfono.");
    setAttachStatus("");
  }
}

export function initChat(opId, socket) {
  _opId = opId;
  _socket = socket;

  socket.on("chat_message", (msg) => {
    appendMessage(msg);
  });

  loadChatDirectory();
  loadMessages();
}

// â”€â”€ PÃºblico: enlaza eventos de UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function bindChatEvents() {
  if (dom.chatChannelType) {
    dom.chatChannelType.addEventListener("change", () => {
      setChannel(dom.chatChannelType.value || "global");
    });
  }

  document.querySelectorAll("[data-chat-channel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setChannel(btn.dataset.chatChannel || "global");
    });
  });

  if (dom.chatAudienceToggle) {
    dom.chatAudienceToggle.addEventListener("click", () => {
      dom.chatAudienceBody?.classList.toggle("collapsed");
      const collapsed = dom.chatAudienceBody?.classList.contains("collapsed");
      dom.chatAudienceToggle.textContent = collapsed ? "⌄" : "⌃";
      dom.chatAudienceToggle.setAttribute(
        "aria-label",
        collapsed ? "Expandir destinatarios" : "Minimizar destinatarios"
      );
    });
  }

  if (dom.chatChannelTarget) {
    dom.chatChannelTarget.addEventListener("change", () => {
      _channelTarget = dom.chatChannelTarget.value || "";
      if (dom.chatTargetPicker) dom.chatTargetPicker.value = _channelTarget;
      syncAudienceUi();
      renderMessages();
    });
  }

  if (dom.chatTargetPicker) {
    dom.chatTargetPicker.addEventListener("change", () => {
      _channelTarget = dom.chatTargetPicker.value || "";
      if (dom.chatChannelTarget) dom.chatChannelTarget.value = _channelTarget;
      syncAudienceUi();
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

    openChatPanels();
    dom.chatInput?.focus();
  });

  document.addEventListener("openVehicleChat", (event) => {
    const detail = event.detail || {};
    const vehicleName = detail.vehicleName || detail.entityName || "";
    const vehicle = _chatDirectory.vehiculos.find((v) =>
      sameValue(v.id, detail.id_vehiculo) ||
      sameValue(v.label, vehicleName)
    );

    if (vehicle) setChannel("vehiculo", vehicle.id);
    openChatPanels();
    dom.chatInput?.focus();
  });

  if (dom.sendChatBtn) {
    dom.sendChatBtn.addEventListener("click", sendMessage);
  }

  if (dom.chatCameraBtn) {
    dom.chatCameraBtn.addEventListener("click", () => dom.chatCameraInput?.click());
  }

  if (dom.chatAudioBtn) {
    dom.chatAudioBtn.addEventListener("click", toggleAudioRecording);
  }

  if (dom.chatCameraInput) {
    dom.chatCameraInput.addEventListener("change", () => sendImageFromInput(dom.chatCameraInput));
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
