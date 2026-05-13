// js/dashboard/dashboard.camera.js

import { dom } from "./dashboard.dom.js";
import { escapeHtml, getCurrentOperation } from "./dashboard.storage.js";

const API_BASE = localStorage.getItem("API_BASE") || `http://${window.location.hostname}:3001`;

const PLACEHOLDER_IMAGES = [
  "img/cameras/cam1.png",
  "img/cameras/cam2.png",
  "img/cameras/cam3.png",
  "https://images.unsplash.com/photo-1508614589041-895b88991e3e?q=80&w=1000&auto=format&fit=crop"
];

let cameraData = [];
let activeOperationId = null;
let streamSocket = null;
let cameraEventsBound = false;
let cameraSocketBound = false;
let cameraDragBound = false;
let iceServers = null;
const peerConnections = new Map();
const joinedStreams = new Set();
const peerTargets = new Map();
const remoteStreams = new Map();
const reconnectTimers = new Map();
const cameraArchiveMetadata = new Map();
const playbackGroups = new Map();
let activePersonnelCamera = null;

const RECORDING_SLICE_MS = 1000;
const RECORDING_SEGMENT_MS = 10000;
const MAX_LOCAL_ARCHIVE_SECONDS = 15 * 60;
const LIVE_EDGE_THRESHOLD_SECONDS = 1.2;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SIDE_RATIO = 0.38;
const VIDEO_BUFFER_DB = "operaciones-video-buffer";
const VIDEO_BUFFER_STORE = "segments";
const playbackArchives = new Map();
let playbackUiTimer = null;
let videoBufferDbPromise = null;
let operationArchiveLoadPromise = null;
let operationArchiveLoadKey = "";
let uploadRetryBound = false;

export function initCameraFeeds(opId = null, socket = null) {
  activeOperationId = opId || activeOperationId || localStorage.getItem("active_operation_id");
  const nextArchiveKey = getOperationStorageKey();
  if (operationArchiveLoadKey !== nextArchiveKey) {
    operationArchiveLoadKey = nextArchiveKey;
    operationArchiveLoadPromise = null;
  }
  if (socket) {
    streamSocket = socket;
    bindStreamSocket();
  }

  if (cameraData.length === 0) {
    loadPlaceholderCameraData();
    renderFeeds();
  }
  bindCameraEvents();
  makePanelDraggable();
  ensurePlaybackUiTimer();
  void openVideoBufferDb();
  bindUploadRetryEvents();
  void retryPendingRecordingUploads();
  const localCleanup = shouldClearVideoBufferFromUrl()
    ? clearLocalVideoBufferForOperation({ render: false }).then(clearVideoBufferUrlFlag)
    : Promise.resolve();
  void localCleanup
    .then(() => pruneDeletedRemoteSegmentsForOperation())
    .then(() => loadPersistedSegmentsForOperation())
    .then(() => {
      renderFeeds();
      attachLiveFeeds();
      renderActivePersonnelCamera();
    });
  loadLiveStreams();
}

function bindUploadRetryEvents() {
  if (uploadRetryBound) return;
  uploadRetryBound = true;
  window.addEventListener("online", () => {
    void retryPendingRecordingUploads();
  });
}

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function absoluteUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || /^rtmp:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function loadPlaceholderCameraData() {
  const op = getCurrentOperation();
  const personal = Array.isArray(op?.personal) ? op.personal : [];

  if (personal.length > 0) {
    cameraData = personal.map((person, index) => {
      const name = [person.nombre, person.apellido].filter(Boolean).join(" ").trim();
      const role = person.rol_en_operacion || person.rol || "Personal";

      return {
        id: `placeholder-${person.id_personal || person.id || index}`,
        name: `${name || "Agente"} (${role})`,
        image: PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length],
        status: "SIN SEÑAL",
        placeholder: true
      };
    });
    return;
  }

  cameraData = [
    { id: "placeholder-1", name: "Cámara 1", image: "img/cameras/cam1.png", status: "SIN SEÑAL", placeholder: true },
    { id: "placeholder-2", name: "Cámara 2", image: "img/cameras/cam2.png", status: "SIN SEÑAL", placeholder: true },
    { id: "placeholder-3", name: "Cámara 3", image: "img/cameras/cam3.png", status: "SIN SEÑAL", placeholder: true }
  ];
}

async function loadLiveStreams() {
  if (!activeOperationId) return;

  try {
    const res = await fetch(`${API_BASE}/ops/${activeOperationId}/streams?status=ACTIVE`, {
      headers: authHeaders()
    });
    if (!res.ok) return;

    const data = await res.json();
    if (!data.ok || !Array.isArray(data.items)) return;

    const streams = data.items.map(streamToCamera);
    streams.forEach(rememberCameraMetadata);
    if (streams.length > 0) {
      cameraData = streams;
    } else {
      loadPlaceholderCameraData();
    }
    renderFeeds();
    attachLiveFeeds();
    renderActivePersonnelCamera();
  } catch (err) {
    console.warn("[CAMERAS] No se pudieron cargar streams:", err.message);
  }
}

function streamToCamera(stream) {
  const protocol = String(stream.protocol || "WEBRTC").toUpperCase();
  const playbackUrl = stream.playback_url || stream.rtmp_playback_url || "";
  const isPlayableUrl = playbackUrl && !/^rtmp:\/\//i.test(playbackUrl);

  return {
    id: `stream-${stream.id_stream}`,
    streamId: Number(stream.id_stream),
    operationId: Number(stream.id_operacion),
    personnelId: stream.id_personal != null ? Number(stream.id_personal) : null,
    userId: stream.id_usuario != null ? Number(stream.id_usuario) : null,
    name: stream.label || `Stream ${stream.id_stream}`,
    protocol,
    kind: stream.kind,
    status: stream.status || "ACTIVE",
    publisherSocketId: stream.publisher_socket_id,
    hasPublisher: Boolean(stream.publisher_socket_id),
    playbackUrl,
    rtmpPublishUrl: stream.rtmp_publish_url || "",
    isWebRtc: protocol === "WEBRTC" || protocol === "HYBRID",
    isPlayableUrl,
    sourceType: stream.source_type || "ANDROID",
    externalDeviceId: stream.external_device_id || "",
    streamKey: stream.stream_key || "",
    viewerCount: stream.viewer_count || 0
  };
}

function getCameraBadge(camera) {
  if (camera.localArchiveOnly) return "LOCAL";
  if (camera.placeholder) return camera.status || "SIN SEÑAL";
  if (camera.isWebRtc && !camera.hasPublisher) return "ESPERANDO";
  if (camera.protocol === "HYBRID" || camera.protocol === "WEBRTC") return "EN VIVO";
  return camera.protocol || "LIVE";
}

function getOperationStorageKey() {
  return String(activeOperationId || localStorage.getItem("active_operation_id") || "default");
}

function buildSegmentKey(streamId, startedAt) {
  return `${getOperationStorageKey()}:${Number(streamId)}:${Math.round(startedAt)}`;
}

function normalizeCameraNameForKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(grabacion local\)/gi, "")
    .replace(/\(grabación local\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isStreamPlaybackKey(value) {
  return /^stream:\d+$/i.test(String(value || ""));
}

function getCameraNameKey(data = {}) {
  return normalizeCameraNameForKey(data.name || data.label || data.cameraName);
}

function getCameraPlaybackKey(camera = {}) {
  const personnelId = camera.personnelId ?? camera.id_personal;
  if (personnelId != null && personnelId !== "") return `person:${personnelId}`;

  const userId = camera.userId ?? camera.id_usuario;
  if (userId != null && userId !== "") return `user:${userId}`;

  const deviceId = camera.externalDeviceId ?? camera.external_device_id;
  if (deviceId) return `device:${deviceId}`;

  const nameKey = normalizeCameraNameForKey(camera.name || camera.label || camera.cameraName);
  if (nameKey && !/^stream\s+\d+$/i.test(nameKey)) return `name:${nameKey}`;

  const streamId = Number(camera.streamId ?? camera.id_stream);
  return streamId ? `stream:${streamId}` : "unknown";
}

function getStreamPlaybackKey(streamId) {
  const id = Number(streamId);
  const metadata = cameraArchiveMetadata.get(id);
  if (metadata?.playbackKey) return metadata.playbackKey;

  const archive = getPlaybackArchive(id, false);
  if (archive?.playbackKey) return archive.playbackKey;

  return getCameraPlaybackKey({ streamId: id, ...(metadata || {}) });
}

function getPlaybackGroup(playbackKey, create = true) {
  const key = String(playbackKey || "unknown");
  if (!key || key === "unknown") return null;
  if (!playbackGroups.has(key) && create) {
    playbackGroups.set(key, {
      playbackKey: key,
      isPlaybackGroup: true,
      segments: [],
      streamIds: new Set(),
      activeStreamId: null,
      cameraName: "Cámara",
      operationId: activeOperationId || null,
      operationKey: getOperationStorageKey(),
      personnelId: null,
      userId: null,
      externalDeviceId: "",
      sourceType: "ANDROID",
      reviewMode: false,
      forcedLocalReview: false,
      localReviewInitialized: false,
      reviewPosition: 0,
      activeSegmentIndex: 0,
      connectionLost: false
    });
  }
  return playbackGroups.get(key) || null;
}

function sameCameraIdentity(group, data = {}) {
  if (!group) return false;

  const personnelId = data.personnelId ?? data.id_personal;
  if (personnelId != null && group.personnelId != null && String(personnelId) === String(group.personnelId)) {
    return true;
  }

  const userId = data.userId ?? data.id_usuario;
  if (userId != null && group.userId != null && String(userId) === String(group.userId)) {
    return true;
  }

  const deviceId = data.externalDeviceId ?? data.external_device_id;
  if (deviceId && group.externalDeviceId && String(deviceId) === String(group.externalDeviceId)) {
    return true;
  }

  const groupName = normalizeCameraNameForKey(group.cameraName);
  const dataName = getCameraNameKey(data);
  return Boolean(groupName && dataName && groupName === dataName);
}

function mergePlaybackGroups(sourceKey, targetKey) {
  if (!sourceKey || !targetKey || sourceKey === targetKey) return;
  const source = playbackGroups.get(sourceKey);
  const target = getPlaybackGroup(targetKey);
  if (!source || !target) return;

  const existingSegmentKeys = new Set(target.segments.map((segment) => segment.key));
  source.segments.forEach((segment) => {
    if (!existingSegmentKeys.has(segment.key)) {
      target.segments.push(segment);
      existingSegmentKeys.add(segment.key);
    }
  });
  target.segments.sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));

  source.streamIds.forEach((streamId) => target.streamIds.add(streamId));
  target.activeStreamId = target.activeStreamId || source.activeStreamId;
  target.operationId = target.operationId || source.operationId;
  target.operationKey = target.operationKey || source.operationKey;
  target.personnelId = target.personnelId ?? source.personnelId;
  target.userId = target.userId ?? source.userId;
  target.externalDeviceId = target.externalDeviceId || source.externalDeviceId;
  target.sourceType = target.sourceType || source.sourceType;
  target.cameraName = normalizeCameraNameForKey(target.cameraName) === "camara" ? source.cameraName : target.cameraName;
  target.connectionLost = target.connectionLost || source.connectionLost;

  playbackArchives.forEach((archive) => {
    if (archive.playbackKey === sourceKey) archive.playbackKey = targetKey;
  });
  cameraArchiveMetadata.forEach((metadata) => {
    if (metadata.playbackKey === sourceKey) metadata.playbackKey = targetKey;
  });
  playbackGroups.delete(sourceKey);
}

function mergeSimilarPlaybackGroups(targetKey, data = {}) {
  const target = getPlaybackGroup(targetKey, false);
  if (!target) return;

  [...playbackGroups.entries()].forEach(([sourceKey, group]) => {
    if (sourceKey === targetKey) return;
    if (group.operationKey && target.operationKey && group.operationKey !== target.operationKey) return;
    if (sameCameraIdentity(group, data) || sameCameraIdentity(target, group)) {
      mergePlaybackGroups(sourceKey, targetKey);
    }
  });
}

function rememberGroupMetadata(playbackKey, data = {}) {
  const group = getPlaybackGroup(playbackKey);
  if (!group) return null;

  const streamId = Number(data.streamId ?? data.id_stream);
  if (streamId) group.streamIds.add(streamId);

  group.operationId = Number(data.operationId ?? data.id_operacion ?? group.operationId ?? activeOperationId) || null;
  group.operationKey = data.operationKey || group.operationKey || getOperationStorageKey();
  group.personnelId = data.personnelId ?? data.id_personal ?? group.personnelId ?? null;
  group.userId = data.userId ?? data.id_usuario ?? group.userId ?? null;
  group.externalDeviceId = data.externalDeviceId ?? data.external_device_id ?? group.externalDeviceId ?? "";
  group.sourceType = data.sourceType || data.source_type || group.sourceType || "ANDROID";
  group.cameraName = data.name || data.label || data.cameraName || group.cameraName || (streamId ? `Stream ${streamId}` : "Cámara");
  if (streamId && remoteStreams.has(streamId)) group.activeStreamId = streamId;

  return group;
}

function addSegmentToPlaybackGroup(playbackKey, segment, metadata = {}) {
  const group = rememberGroupMetadata(playbackKey, metadata);
  if (!group || !segment?.blob?.size) return false;

  const key = segment.key || `${playbackKey}:${Math.round(segment.startedAt || Date.now())}`;
  if (group.segments.some((item) => item.key === key)) return false;

  group.segments.push({
    key,
    blob: segment.blob,
    url: URL.createObjectURL(segment.blob),
    startedAt: Number(segment.startedAt || 0),
    endedAt: Number(segment.endedAt || 0),
    duration: Number(segment.duration || 0),
    sourceStreamId: Number(metadata.streamId ?? metadata.id_stream ?? segment.sourceStreamId) || null,
    remoteRecordingId: segment.remoteRecordingId || null
  });
  group.segments.sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
  return true;
}

function rememberCameraMetadata(camera = {}) {
  const streamId = Number(camera.streamId ?? camera.id_stream);
  if (!streamId) return;

  const previous = cameraArchiveMetadata.get(streamId) || {};
  const next = {
    ...previous,
    streamId,
    operationId: Number(camera.operationId ?? camera.id_operacion ?? previous.operationId ?? activeOperationId) || null,
    personnelId: camera.personnelId ?? camera.id_personal ?? previous.personnelId ?? null,
    userId: camera.userId ?? camera.id_usuario ?? previous.userId ?? null,
    externalDeviceId: camera.externalDeviceId ?? camera.external_device_id ?? previous.externalDeviceId ?? "",
    name: camera.name || camera.label || previous.name || `Stream ${streamId}`,
    protocol: camera.protocol || previous.protocol || "WEBRTC",
    sourceType: camera.sourceType || camera.source_type || previous.sourceType || "ANDROID"
  };
  next.playbackKey = getCameraPlaybackKey(next);

  cameraArchiveMetadata.set(streamId, next);
  rememberGroupMetadata(next.playbackKey, next);
  mergeSimilarPlaybackGroups(next.playbackKey, next);

  const archive = getPlaybackArchive(streamId, false);
  if (archive) {
    archive.cameraName = next.name;
    archive.operationId = next.operationId;
    archive.personnelId = next.personnelId;
    archive.userId = next.userId;
    archive.externalDeviceId = next.externalDeviceId;
    archive.sourceType = next.sourceType;
    archive.playbackKey = next.playbackKey;
  }
}

function rememberArchiveItemMetadata(archive, item = {}) {
  if (!archive) return;

  const streamId = Number(item.streamId ?? archive.streamId);
  archive.cameraName = item.cameraName || archive.cameraName || `Stream ${streamId}`;
  archive.operationId = Number(item.operationId ?? archive.operationId ?? activeOperationId) || null;
  archive.operationKey = item.operationKey || archive.operationKey || getOperationStorageKey();
  archive.personnelId = item.personnelId ?? archive.personnelId ?? null;
  archive.userId = item.userId ?? archive.userId ?? null;
  archive.externalDeviceId = item.externalDeviceId ?? archive.externalDeviceId ?? "";
  archive.sourceType = item.sourceType || archive.sourceType || "ANDROID";
  const metadataPlaybackKey = getCameraPlaybackKey({
    streamId,
    personnelId: archive.personnelId,
    userId: archive.userId,
    externalDeviceId: archive.externalDeviceId,
    cameraName: archive.cameraName
  });
  archive.playbackKey = item.playbackKey && !isStreamPlaybackKey(item.playbackKey)
    ? item.playbackKey
    : archive.playbackKey && !isStreamPlaybackKey(archive.playbackKey)
      ? archive.playbackKey
      : metadataPlaybackKey;

  cameraArchiveMetadata.set(streamId, {
    ...(cameraArchiveMetadata.get(streamId) || {}),
    streamId,
    operationId: archive.operationId,
    personnelId: archive.personnelId,
    userId: archive.userId,
    externalDeviceId: archive.externalDeviceId,
    name: archive.cameraName,
    sourceType: archive.sourceType,
    protocol: "WEBRTC",
    playbackKey: archive.playbackKey
  });
  rememberGroupMetadata(archive.playbackKey, archive);
  mergeSimilarPlaybackGroups(archive.playbackKey, archive);
}

function openVideoBufferDb() {
  if (!window.indexedDB) return Promise.resolve(null);
  if (videoBufferDbPromise) return videoBufferDbPromise;

  videoBufferDbPromise = new Promise((resolve) => {
    let request = null;
    try {
      request = indexedDB.open(VIDEO_BUFFER_DB, 1);
    } catch (err) {
      console.warn("[CAMERAS] IndexedDB bloqueado para buffer local:", err.message);
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(VIDEO_BUFFER_STORE)
        ? request.transaction.objectStore(VIDEO_BUFFER_STORE)
        : db.createObjectStore(VIDEO_BUFFER_STORE, { keyPath: "key" });

      if (!store.indexNames.contains("operationStream")) {
        store.createIndex("operationStream", ["operationKey", "streamId"], { unique: false });
      }
      if (!store.indexNames.contains("startedAt")) {
        store.createIndex("startedAt", "startedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn("[CAMERAS] IndexedDB no disponible para buffer local:", request.error?.message || request.error);
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });

  return videoBufferDbPromise;
}

async function saveSegmentToLocalDb(streamId, segment) {
  const db = await openVideoBufferDb();
  if (!segment?.blob?.size) return;
  if (!db) {
    void uploadSegmentToBackend(streamId, segment);
    return;
  }

  const operationKey = getOperationStorageKey();
  const key = segment.key || buildSegmentKey(streamId, segment.startedAt);
  const archive = getPlaybackArchive(streamId, false);
  const metadata = cameraArchiveMetadata.get(Number(streamId)) || {};
  const playbackKey = metadata.playbackKey || archive?.playbackKey || getStreamPlaybackKey(streamId);
  segment.key = key;

  await new Promise((resolve) => {
    const tx = db.transaction(VIDEO_BUFFER_STORE, "readwrite");
    tx.objectStore(VIDEO_BUFFER_STORE).put({
      key,
      operationKey,
      streamId: Number(streamId),
      operationId: metadata.operationId ?? archive?.operationId ?? activeOperationId ?? null,
      personnelId: metadata.personnelId ?? archive?.personnelId ?? null,
      userId: metadata.userId ?? archive?.userId ?? null,
      externalDeviceId: metadata.externalDeviceId ?? archive?.externalDeviceId ?? "",
      playbackKey,
      cameraName: metadata.name || archive?.cameraName || `Stream ${streamId}`,
      sourceType: metadata.sourceType || archive?.sourceType || "ANDROID",
      startedAt: segment.startedAt,
      endedAt: segment.endedAt,
      duration: segment.duration,
      mimeType: segment.blob.type || "video/webm",
      blob: segment.blob
    });
    tx.oncomplete = resolve;
    tx.onerror = () => {
      console.warn("[CAMERAS] No se pudo guardar segmento local:", tx.error?.message || tx.error);
      resolve();
    };
  });

  void uploadSegmentToBackend(streamId, segment);
}

async function markLocalSegmentUploaded(key, recording) {
  if (!key || !recording) return;
  const db = await openVideoBufferDb();
  if (!db) return;

  await new Promise((resolve) => {
    const tx = db.transaction(VIDEO_BUFFER_STORE, "readwrite");
    const store = tx.objectStore(VIDEO_BUFFER_STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      const item = request.result;
      if (item) {
        item.remoteRecordingId = recording.id_recording;
        item.remoteDownloadUrl = recording.download_url;
        item.uploadedAt = new Date().toISOString();
        store.put(item);
      }
    };
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

async function uploadSegmentToBackend(streamId, segment) {
  const operationId = activeOperationId || localStorage.getItem("active_operation_id");
  if (!operationId || !streamId || !segment?.blob?.size) return;

  try {
    const durationMs = Math.max(0, Math.round((segment.duration || 0) * 1000));
    const params = new URLSearchParams({ duration_ms: String(durationMs) });
    if (segment.startedAt) params.set("started_at", new Date(segment.startedAt).toISOString());
    if (segment.endedAt) params.set("ended_at", new Date(segment.endedAt).toISOString());
    const response = await fetch(
      `${API_BASE}/ops/${encodeURIComponent(operationId)}/streams/${encodeURIComponent(streamId)}/recordings?${params.toString()}`,
      {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": segment.blob.type || "video/webm"
        },
        body: segment.blob
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.mensaje || `HTTP ${response.status}`);
    }
    segment.remoteRecordingId = data.recording?.id_recording || null;
    void markLocalSegmentUploaded(segment.key, data.recording);
  } catch (err) {
    console.warn("[CAMERAS] Grabación local pendiente de subir a BD:", err.message);
  }
}

async function retryPendingRecordingUploads() {
  const db = await openVideoBufferDb();
  if (!db) return;

  const operationKey = getOperationStorageKey();
  const items = await new Promise((resolve) => {
    const tx = db.transaction(VIDEO_BUFFER_STORE, "readonly");
    const request = tx.objectStore(VIDEO_BUFFER_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });

  for (const item of items) {
    if (item?.operationKey !== operationKey || item.remoteRecordingId || !item.blob?.size || !item.streamId) continue;
    await uploadSegmentToBackend(item.streamId, {
      key: item.key,
      blob: item.blob,
      duration: Number(item.duration || 0),
      startedAt: Number(item.startedAt || 0),
      endedAt: Number(item.endedAt || 0)
    });
  }
}

function removeSegmentFromMemory(key) {
  if (!key) return;

  const removeFromArchive = (archive) => {
    const nextSegments = [];
    (archive.segments || []).forEach((segment) => {
      if (segment.key === key) {
        if (segment.url) URL.revokeObjectURL(segment.url);
        return;
      }
      nextSegments.push(segment);
    });
    archive.segments = nextSegments;
    archive.activeSegmentIndex = Math.min(archive.activeSegmentIndex || 0, Math.max(0, nextSegments.length - 1));
  };

  playbackArchives.forEach(removeFromArchive);
  playbackGroups.forEach(removeFromArchive);
}

async function getBackendRecordingIdsForOperation() {
  const recordings = await fetchBackendRecordingsForOperation();
  if (!recordings) return null;

  return new Set(
    recordings
      .map((recording) => Number(recording.id_recording))
      .filter((id) => Number.isFinite(id) && id > 0)
  );
}

async function fetchBackendRecordingsForOperation() {
  const operationId = activeOperationId || localStorage.getItem("active_operation_id");
  if (!operationId) return null;
  try {
    const res = await fetch(`${API_BASE}/ops/${encodeURIComponent(operationId)}/streams/recordings`, {
      headers: authHeaders()
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.ok || !Array.isArray(data.items)) return null;

    return data.items;
  } catch (err) {
    console.warn("[CAMERAS] No se pudieron validar grabaciones remotas:", err.message);
    return null;
  }
}

function uniqueBackendRecordings(recordings = []) {
  const seen = new Set();
  return recordings.filter((recording) => {
    const idStream = Number(recording.id_stream);
    const createdBucket = Math.round((Date.parse(recording.created_at) || 0) / 1000);
    const key = [
      idStream,
      Number(recording.size_bytes || 0),
      Number(recording.duration_ms || 0),
      createdBucket
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getRecordingDurationSeconds(recording) {
  const durationMs = Number(recording.duration_ms || 0);
  return Math.max(0.25, durationMs > 0 ? durationMs / 1000 : 1);
}

function buildBackendRecordingTimeline(recordings = []) {
  const groups = new Map();
  uniqueBackendRecordings(recordings)
    .filter((recording) => Number(recording.id_stream) && recording.download_url)
    .forEach((recording) => {
      const streamId = Number(recording.id_stream);
      if (!groups.has(streamId)) groups.set(streamId, []);
      groups.get(streamId).push(recording);
    });

  const items = [];
  groups.forEach((streamRecordings, streamId) => {
    const sorted = streamRecordings.sort((a, b) => {
      const aStart = Date.parse(a.recorded_started_at || "") || Date.parse(a.created_at || "") || Number(a.id_recording || 0);
      const bStart = Date.parse(b.recorded_started_at || "") || Date.parse(b.created_at || "") || Number(b.id_recording || 0);
      if (aStart !== bStart) return aStart - bStart;
      return Number(a.id_recording || 0) - Number(b.id_recording || 0);
    });

    const fallbackTotalMs = sorted.reduce((sum, recording) => sum + getRecordingDurationSeconds(recording) * 1000, 0);
    let fallbackCursor = (Date.parse(sorted[0]?.created_at || "") || Date.now()) - fallbackTotalMs;

    sorted.forEach((recording) => {
      const duration = getRecordingDurationSeconds(recording);
      const explicitStartedAt = Date.parse(recording.recorded_started_at || "");
      const explicitEndedAt = Date.parse(recording.recorded_ended_at || "");
      const startedAt = Number.isFinite(explicitStartedAt)
        ? explicitStartedAt
        : fallbackCursor;
      const endedAt = Number.isFinite(explicitEndedAt)
        ? explicitEndedAt
        : startedAt + duration * 1000;
      fallbackCursor = endedAt;

      items.push({
        recording,
        streamId,
        startedAt,
        endedAt,
        duration
      });
    });
  });

  return items.sort((a, b) => a.startedAt - b.startedAt);
}

function backendRecordingToArchiveItem(recording, blob, timelineItem) {
  const streamId = Number(recording.id_stream);
  const cameraName = recording.stream_label || `Stream ${streamId}`;
  const metadata = {
    key: `remote:${recording.id_recording}`,
    operationKey: getOperationStorageKey(),
    streamId,
    operationId: Number(recording.id_operacion || activeOperationId) || null,
    personnelId: recording.id_personal != null ? Number(recording.id_personal) : null,
    userId: recording.id_usuario != null ? Number(recording.id_usuario) : null,
    externalDeviceId: recording.external_device_id || "",
    playbackKey: getCameraPlaybackKey({
      streamId,
      id_personal: recording.id_personal,
      id_usuario: recording.id_usuario,
      external_device_id: recording.external_device_id,
      name: cameraName
    }),
    cameraName,
    sourceType: recording.source_type || "REMOTE",
    startedAt: timelineItem.startedAt,
    endedAt: timelineItem.endedAt,
    duration: timelineItem.duration,
    mimeType: blob.type || recording.mime_type || "video/webm",
    blob,
    remoteRecordingId: Number(recording.id_recording) || null,
    remoteDownloadUrl: recording.download_url
  };

  return metadata;
}

async function loadBackendRecordingsForOperation() {
  const recordings = await fetchBackendRecordingsForOperation();
  if (!recordings?.length) return false;

  let addedAny = false;
  for (const timelineItem of buildBackendRecordingTimeline(recordings)) {
    const { recording, streamId } = timelineItem;
    const archive = getPlaybackArchive(streamId);
    const key = `remote:${recording.id_recording}`;
    const remoteRecordingId = Number(recording.id_recording);
    if (archive.segments.some((segment) => segment.key === key || Number(segment.remoteRecordingId) === remoteRecordingId)) {
      continue;
    }

    try {
      const res = await fetch(absoluteUrl(recording.download_url), { headers: authHeaders() });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.size) continue;

      const item = backendRecordingToArchiveItem(recording, blob, timelineItem);
      const existingKeys = new Set(archive.segments.map((segment) => segment.key).filter(Boolean));
      addedAny = addPersistedSegmentToArchive(archive, item, existingKeys) || addedAny;
      archive.segments.sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
      archive.persistedLoaded = true;
      updatePlaybackControls(streamId);
      updatePlaybackControls(archive.playbackKey);
    } catch (err) {
      console.warn("[CAMERAS] No se pudo descargar grabacion remota:", err.message);
    }
  }

  return addedAny;
}

async function pruneDeletedRemoteSegmentsForOperation() {
  const remoteRecordingIds = await getBackendRecordingIdsForOperation();
  if (!remoteRecordingIds) return;

  const db = await openVideoBufferDb();
  if (!db) return;

  const operationKey = getOperationStorageKey();
  const items = await new Promise((resolve) => {
    const tx = db.transaction(VIDEO_BUFFER_STORE, "readonly");
    const request = tx.objectStore(VIDEO_BUFFER_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });

  const staleKeys = items
    .filter((item) => item?.operationKey === operationKey)
    .filter((item) => item.remoteRecordingId && !remoteRecordingIds.has(Number(item.remoteRecordingId)))
    .map((item) => item.key)
    .filter(Boolean);

  if (staleKeys.length === 0) return;

  await new Promise((resolve) => {
    const tx = db.transaction(VIDEO_BUFFER_STORE, "readwrite");
    const store = tx.objectStore(VIDEO_BUFFER_STORE);
    staleKeys.forEach((key) => store.delete(key));
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });

  staleKeys.forEach(removeSegmentFromMemory);
}

function shouldClearVideoBufferFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return ["1", "true", "yes"].includes(String(params.get("clearVideoBuffer") || "").toLowerCase());
}

function clearVideoBufferUrlFlag() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("clearVideoBuffer")) return;
  url.searchParams.delete("clearVideoBuffer");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

async function clearLocalVideoBufferForOperation({ render = true } = {}) {
  const db = await openVideoBufferDb();
  if (!db) return 0;

  const operationKey = getOperationStorageKey();
  const items = await new Promise((resolve) => {
    const tx = db.transaction(VIDEO_BUFFER_STORE, "readonly");
    const request = tx.objectStore(VIDEO_BUFFER_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });

  const keys = items
    .filter((item) => item?.operationKey === operationKey)
    .map((item) => item.key)
    .filter(Boolean);

  if (keys.length === 0) return 0;

  await new Promise((resolve) => {
    const tx = db.transaction(VIDEO_BUFFER_STORE, "readwrite");
    const store = tx.objectStore(VIDEO_BUFFER_STORE);
    keys.forEach((key) => store.delete(key));
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });

  keys.forEach(removeSegmentFromMemory);
  if (render) {
    renderFeeds();
    attachLiveFeeds();
    renderActivePersonnelCamera();
  }
  return keys.length;
}

window.clearOperacionesVideoBuffer = () => clearLocalVideoBufferForOperation();

function addPersistedSegmentToArchive(archive, item, existingKeys = null) {
  if (!archive || !item?.blob?.size) return false;
  if (existingKeys?.has(item.key)) return false;

  const segment = {
    key: item.key,
    blob: item.blob,
    url: URL.createObjectURL(item.blob),
    startedAt: Number(item.startedAt || 0),
    endedAt: Number(item.endedAt || 0),
    duration: Number(item.duration || 0),
    sourceStreamId: Number(item.streamId || archive.streamId) || null,
    remoteRecordingId: item.remoteRecordingId || null
  };
  archive.segments.push(segment);
  rememberArchiveItemMetadata(archive, item);
  addSegmentToPlaybackGroup(archive.playbackKey || item.playbackKey, segment, {
    ...item,
    streamId: Number(item.streamId || archive.streamId) || null,
    name: item.cameraName || archive.cameraName
  });
  existingKeys?.add(item.key);
  return true;
}

async function deleteLocalSegmentByKey(key) {
  if (!key) return;
  const db = await openVideoBufferDb();
  if (!db) return;

  await new Promise((resolve) => {
    const tx = db.transaction(VIDEO_BUFFER_STORE, "readwrite");
    tx.objectStore(VIDEO_BUFFER_STORE).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
}

async function loadPersistedSegmentsForStream(streamId) {
  const archive = getPlaybackArchive(streamId);
  if (!archive || archive.persistedLoaded) return;
  if (archive.persistedLoading) return archive.persistedLoading;

  archive.persistedLoading = (async () => {
    const db = await openVideoBufferDb();
    if (!db) {
      archive.persistedLoaded = true;
      return;
    }

    const operationKey = getOperationStorageKey();
    const items = await new Promise((resolve) => {
      const tx = db.transaction(VIDEO_BUFFER_STORE, "readonly");
      const index = tx.objectStore(VIDEO_BUFFER_STORE).index("operationStream");
      const request = index.getAll([operationKey, Number(streamId)]);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });

    const existingKeys = new Set(archive.segments.map((segment) => segment.key).filter(Boolean));
    let addedAny = false;
    items
      .sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0))
      .forEach((item) => {
        addedAny = addPersistedSegmentToArchive(archive, item, existingKeys) || addedAny;
      });

    archive.segments.sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
    trimArchive(archive);
    archive.persistedLoaded = true;
    updatePlaybackControls(streamId);
    updatePlaybackControls(archive.playbackKey);
    if (addedAny) {
      renderFeeds();
      attachLiveFeeds();
      renderActivePersonnelCamera();
    }
  })().finally(() => {
    archive.persistedLoading = null;
  });

  return archive.persistedLoading;
}

async function loadPersistedSegmentsForOperation() {
  const operationKey = getOperationStorageKey();
  if (operationArchiveLoadPromise && operationArchiveLoadKey === operationKey) {
    return operationArchiveLoadPromise;
  }

  operationArchiveLoadKey = operationKey;
  operationArchiveLoadPromise = (async () => {
    const db = await openVideoBufferDb();
    const items = db
      ? await new Promise((resolve) => {
          const tx = db.transaction(VIDEO_BUFFER_STORE, "readonly");
          const request = tx.objectStore(VIDEO_BUFFER_STORE).getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => resolve([]);
        })
      : [];

    let addedAny = false;
    const byStream = new Map();
    items
      .filter((item) => item?.operationKey === operationKey && Number(item.streamId))
      .sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0))
      .forEach((item) => {
        const streamId = Number(item.streamId);
        if (!byStream.has(streamId)) byStream.set(streamId, []);
        byStream.get(streamId).push(item);
      });

    byStream.forEach((streamItems, streamId) => {
      const archive = getPlaybackArchive(streamId);
      const existingKeys = new Set(archive.segments.map((segment) => segment.key).filter(Boolean));
      streamItems.forEach((item) => {
        addedAny = addPersistedSegmentToArchive(archive, item, existingKeys) || addedAny;
      });
      archive.segments.sort((a, b) => Number(a.startedAt || 0) - Number(b.startedAt || 0));
      archive.persistedLoaded = true;
      trimArchive(archive);
      updatePlaybackControls(streamId);
      updatePlaybackControls(archive.playbackKey);
    });

    addedAny = await loadBackendRecordingsForOperation() || addedAny;

    if (addedAny) {
      renderFeeds();
    }
  })();

  return operationArchiveLoadPromise;
}

function getSupportedRecorderMimeType() {
  if (!window.MediaRecorder) return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function getPlaybackArchive(streamId, create = true) {
  const id = Number(streamId);
  if (!id) return null;
  if (!playbackArchives.has(id) && create) {
    playbackArchives.set(id, {
      streamId: id,
      segments: [],
      recorder: null,
      recorderStream: null,
      mimeType: "",
      currentChunks: [],
      currentStartedAt: 0,
      rollTimer: null,
      resumeAfterStop: false,
      connectionLost: false,
      reviewMode: false,
      forcedLocalReview: false,
      localReviewInitialized: false,
      reviewPosition: 0,
      activeSegmentIndex: 0,
      persistedLoaded: false,
      persistedLoading: null,
      cameraName: cameraArchiveMetadata.get(id)?.name || `Stream ${id}`,
      operationId: cameraArchiveMetadata.get(id)?.operationId || activeOperationId || null,
      operationKey: getOperationStorageKey(),
      personnelId: cameraArchiveMetadata.get(id)?.personnelId ?? null,
      userId: cameraArchiveMetadata.get(id)?.userId ?? null,
      externalDeviceId: cameraArchiveMetadata.get(id)?.externalDeviceId || "",
      sourceType: cameraArchiveMetadata.get(id)?.sourceType || "ANDROID",
      playbackKey: cameraArchiveMetadata.get(id)?.playbackKey || getCameraPlaybackKey({
        streamId: id,
        ...(cameraArchiveMetadata.get(id) || {})
      })
    });
    rememberGroupMetadata(playbackArchives.get(id).playbackKey, playbackArchives.get(id));
  }
  return playbackArchives.get(id) || null;
}

function getArchiveDuration(archive) {
  return (archive?.segments || []).reduce((sum, segment) => sum + segment.duration, 0);
}

function getCurrentRecordingDuration(archive) {
  if (!archive?.recorder || archive.recorder.state === "inactive" || !archive.currentStartedAt) return 0;
  return Math.max(0, (Date.now() - archive.currentStartedAt) / 1000);
}

function getGroupCurrentRecordingDuration(group) {
  if (!group?.isPlaybackGroup) return 0;
  let duration = 0;
  group.streamIds.forEach((streamId) => {
    const archive = getPlaybackArchive(streamId, false);
    duration = Math.max(duration, getCurrentRecordingDuration(archive));
  });
  return duration;
}

function getPlaybackMax(archive) {
  return getArchiveDuration(archive) + (archive?.isPlaybackGroup ? getGroupCurrentRecordingDuration(archive) : getCurrentRecordingDuration(archive));
}

function formatPlaybackTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remaining = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function getSegmentStart(archive, index) {
  let start = 0;
  for (let i = 0; i < index; i += 1) {
    start += archive.segments[i]?.duration || 0;
  }
  return start;
}

function locateSegmentAt(archive, seconds) {
  if (!archive?.segments?.length) return null;
  let cursor = 0;
  const target = Math.max(0, Number(seconds) || 0);

  for (let index = 0; index < archive.segments.length; index += 1) {
    const segment = archive.segments[index];
    const next = cursor + segment.duration;
    if (target <= next || index === archive.segments.length - 1) {
      return {
        index,
        segment,
        offset: Math.max(0, Math.min(segment.duration - 0.1, target - cursor)),
        start: cursor
      };
    }
    cursor = next;
  }

  return null;
}

function trimArchive(archive) {
  while (archive.segments.length > 1 && getArchiveDuration(archive) > MAX_LOCAL_ARCHIVE_SECONDS) {
    const removed = archive.segments.shift();
    if (removed?.url) URL.revokeObjectURL(removed.url);
    if (removed?.key) void deleteLocalSegmentByKey(removed.key);
    archive.activeSegmentIndex = Math.max(0, archive.activeSegmentIndex - 1);
  }
}

function getTimelineArchive(playbackKeyOrStreamId, create = false) {
  if (typeof playbackKeyOrStreamId === "string" && playbackKeyOrStreamId.includes(":")) {
    return getPlaybackGroup(playbackKeyOrStreamId, create);
  }
  const streamId = Number(playbackKeyOrStreamId);
  const playbackKey = getStreamPlaybackKey(streamId);
  return getPlaybackGroup(playbackKey, create) || getPlaybackArchive(streamId, create);
}

function enterLocalReview(playbackKeyOrStreamId, { secondsFromEnd = 5 } = {}) {
  const archive = getTimelineArchive(playbackKeyOrStreamId, false);
  if (!archive?.segments?.length) return false;

  archive.connectionLost = true;
  archive.reviewMode = true;
  archive.forcedLocalReview = true;
  archive.localReviewInitialized = true;
  archive.reviewPosition = Math.max(0, getArchiveDuration(archive) - Math.max(0, Number(secondsFromEnd) || 0));
  attachMediaStateForPlaybackKey(archive.playbackKey || getStreamPlaybackKey(playbackKeyOrStreamId));
  updatePlaybackControls(archive.playbackKey || playbackKeyOrStreamId);
  return true;
}

function finalizeCurrentSegment(streamId) {
  const archive = getPlaybackArchive(streamId, false);
  if (!archive || archive.currentChunks.length === 0 || !archive.currentStartedAt) {
    if (archive) {
      archive.currentChunks = [];
      archive.currentStartedAt = 0;
    }
    return;
  }

  const endedAt = Date.now();
  const duration = Math.max(0.25, (endedAt - archive.currentStartedAt) / 1000);
  const blob = new Blob(archive.currentChunks, {
    type: archive.mimeType || archive.currentChunks[0]?.type || "video/webm"
  });

  archive.currentChunks = [];
  archive.currentStartedAt = 0;

  if (!blob.size) return;

  const segment = {
    key: buildSegmentKey(streamId, endedAt - duration * 1000),
    blob,
    url: URL.createObjectURL(blob),
    startedAt: endedAt - duration * 1000,
    endedAt,
    duration
  };
  archive.segments.push(segment);
  addSegmentToPlaybackGroup(archive.playbackKey, segment, {
    streamId,
    operationId: archive.operationId,
    operationKey: archive.operationKey,
    personnelId: archive.personnelId,
    userId: archive.userId,
    externalDeviceId: archive.externalDeviceId,
    name: archive.cameraName,
    sourceType: archive.sourceType
  });
  trimArchive(archive);
  void saveSegmentToLocalDb(streamId, segment);

  if (archive.connectionLost && !remoteStreams.has(Number(streamId)) && !archive.reviewMode) {
    enterLocalReview(archive.playbackKey, { secondsFromEnd: Math.min(5, segment.duration) });
    renderFeeds();
    renderActivePersonnelCamera();
  }

  updatePlaybackControls(streamId);
  updatePlaybackControls(archive.playbackKey);
}

function stopLocalRecorder(streamId, { resume = false, markLost = false } = {}) {
  const archive = getPlaybackArchive(streamId, false);
  if (!archive) return;

  archive.resumeAfterStop = Boolean(resume);
  if (markLost) archive.connectionLost = true;

  if (archive.rollTimer) {
    window.clearTimeout(archive.rollTimer);
    archive.rollTimer = null;
  }

  const recorder = archive.recorder;
  if (!recorder || recorder.state === "inactive") {
    finalizeCurrentSegment(streamId);
    return;
  }

  try {
    recorder.requestData?.();
    recorder.stop();
  } catch {
    finalizeCurrentSegment(streamId);
  }
}

function scheduleRecorderRoll(streamId) {
  const archive = getPlaybackArchive(streamId, false);
  if (!archive) return;
  if (archive.rollTimer) window.clearTimeout(archive.rollTimer);
  archive.rollTimer = window.setTimeout(() => {
    stopLocalRecorder(streamId, { resume: true });
  }, RECORDING_SEGMENT_MS);
}

function startLocalRecorder(streamId, mediaStream) {
  const id = Number(streamId);
  if (!id || !mediaStream || !window.MediaRecorder) return;

  const archive = getPlaybackArchive(id);
  if (!archive) return;
  if (archive.recorder && archive.recorder.state !== "inactive") return;

  const mimeType = getSupportedRecorderMimeType();
  const options = mimeType ? { mimeType } : undefined;

  try {
    const recorder = new MediaRecorder(mediaStream, options);
    archive.recorder = recorder;
    archive.recorderStream = mediaStream;
    archive.mimeType = mimeType || recorder.mimeType || "";
    archive.currentChunks = [];
    archive.currentStartedAt = Date.now();
    archive.connectionLost = false;

    recorder.ondataavailable = (event) => {
      if (event.data?.size) archive.currentChunks.push(event.data);
    };

    recorder.onstop = () => {
      const shouldResume = archive.resumeAfterStop;
      const sourceStream = archive.recorderStream;
      archive.resumeAfterStop = false;
      archive.recorder = null;
      archive.recorderStream = null;
      finalizeCurrentSegment(id);

      if (shouldResume && remoteStreams.get(id) === sourceStream) {
        startLocalRecorder(id, sourceStream);
      }
    };

    recorder.start(RECORDING_SLICE_MS);
    scheduleRecorderRoll(id);
  } catch (err) {
    console.warn("[CAMERAS] No se pudo iniciar buffer local:", err.message);
  }
}

function handleStreamConnectionLost(streamId) {
  const archive = getPlaybackArchive(streamId, false);
  if (!archive) return;
  archive.connectionLost = true;
  const group = getPlaybackGroup(archive.playbackKey, false);
  if (group) group.connectionLost = true;
  stopLocalRecorder(streamId, { markLost: true });
  enterLocalReview(archive.playbackKey);
  updatePlaybackControls(streamId);
  updatePlaybackControls(archive.playbackKey);
}

function handleStreamConnectionRestored(streamId, mediaStream) {
  const archive = getPlaybackArchive(streamId);
  if (archive) archive.connectionLost = false;
  const group = getPlaybackGroup(archive?.playbackKey || getStreamPlaybackKey(streamId));
  if (group) {
    group.connectionLost = false;
    group.activeStreamId = Number(streamId);
    group.streamIds.add(Number(streamId));
  }
  startLocalRecorder(streamId, mediaStream);
  if (group?.forcedLocalReview || archive?.forcedLocalReview) {
    if (archive) archive.forcedLocalReview = false;
    group.forcedLocalReview = false;
    returnToLive(group.playbackKey);
  }
  updatePlaybackControls(streamId);
  updatePlaybackControls(group?.playbackKey || archive?.playbackKey || getStreamPlaybackKey(streamId));
}

function renderFeeds() {
  if (!dom.cameraFeeds) return;
  dom.cameraFeeds.innerHTML = "";
  getRenderableCameraData().forEach((camera) => {
    dom.cameraFeeds.appendChild(createFeedElement(camera));
  });
  attachKnownMediaStreams();
}

function hasPlayableArchive(archive) {
  return Boolean(archive?.segments?.length);
}

function safeDomId(value) {
  return String(value || "camera").replace(/[^a-z0-9_-]+/gi, "-");
}

function buildLocalArchiveCameraForGroup(group) {
  const streamId = group.activeStreamId || [...group.streamIds][0] || null;
  return {
    id: `archive-${safeDomId(group.playbackKey)}`,
    streamId,
    playbackKey: group.playbackKey,
    operationId: group.operationId || activeOperationId,
    personnelId: group.personnelId ?? null,
    userId: group.userId ?? null,
    externalDeviceId: group.externalDeviceId || "",
    name: `${group.cameraName || "Cámara"} (grabación local)`,
    protocol: "WEBRTC",
    kind: "archive",
    status: "LOCAL",
    publisherSocketId: "",
    hasPublisher: false,
    playbackUrl: "",
    rtmpPublishUrl: "",
    isWebRtc: true,
    isPlayableUrl: false,
    sourceType: group.sourceType || "LOCAL",
    viewerCount: 0,
    localArchiveOnly: true,
    hasLocalArchive: true
  };
}

function getRenderableCameraData() {
  const slots = new Map();
  const slotNameKeys = new Map();

  cameraData
    .filter((camera) => !camera.placeholder)
    .forEach((camera) => {
      rememberCameraMetadata(camera);
      const playbackKey = getCameraPlaybackKey(camera);
      const group = rememberGroupMetadata(playbackKey, camera);
      if (group) {
        group.streamIds.add(Number(camera.streamId));
        group.activeStreamId = Number(camera.streamId);
      }
      const next = {
        ...camera,
        id: `camera-${safeDomId(playbackKey)}`,
        playbackKey,
        hasLocalArchive: hasPlayableArchive(group)
      };

      const current = slots.get(playbackKey);
      const nextHasRemote = remoteStreams.has(Number(next.streamId));
      const currentHasRemote = current ? remoteStreams.has(Number(current.streamId)) : false;
      if (!current || (nextHasRemote && !currentHasRemote)) {
        slots.set(playbackKey, next);
        const nameKey = getCameraNameKey(next);
        if (nameKey) slotNameKeys.set(nameKey, playbackKey);
      }
    });

  playbackGroups.forEach((group, playbackKey) => {
    if (group.operationKey && group.operationKey !== getOperationStorageKey()) return;
    if (!hasPlayableArchive(group) || slots.has(playbackKey)) return;
    const nameKey = normalizeCameraNameForKey(group.cameraName);
    const matchingSlotKey = nameKey ? slotNameKeys.get(nameKey) : "";
    if (matchingSlotKey) {
      mergePlaybackGroups(playbackKey, matchingSlotKey);
      const slot = slots.get(matchingSlotKey);
      if (slot) slot.hasLocalArchive = true;
      return;
    }
    slots.set(playbackKey, buildLocalArchiveCameraForGroup(group));
  });

  const groupedCameras = [...slots.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  if (groupedCameras.length) {
    return groupedCameras;
  }

  return cameraData;
}

function createFeedElement(camera) {
  const feed = document.createElement("div");
  feed.className = "cameraFeed";
  feed.id = camera.id;
  if (camera.localArchiveOnly) feed.classList.add("localArchive");
  if (camera.hasLocalArchive) feed.classList.add("hasLocalArchive");

  const displayProtocol = getCameraBadge(camera);
  const badge = camera.placeholder ? camera.status : displayProtocol;
  const media = buildMediaMarkup(camera);
  const playback = buildPlaybackMarkup(camera);
  const urlHint = camera.playbackUrl && !camera.isPlayableUrl
    ? `<div class="cameraFeedHint">RTMP listo para gateway de video</div>`
    : "";

  feed.innerHTML = `
    <div class="cameraFeedBadge">${escapeHtml(badge)}</div>
    ${media}
    ${urlHint}
    ${playback}
    <div class="cameraFeedName">${escapeHtml(camera.name)}</div>
    <div class="cameraFeedOverlay">
      <button class="cameraFeedAction" type="button" title="Maximizar">+</button>
    </div>
  `;

  feed.querySelector(".cameraFeedAction")?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFocus(feed);
  });

  bindPlaybackControls(feed, camera);
  bindCameraSurfaceInteractions(feed, camera);
  return feed;
}

function buildMediaMarkup(camera) {
  if (camera.isPlayableUrl) {
    return `
      <video
        src="${escapeHtml(absoluteUrl(camera.playbackUrl))}"
        autoplay
        muted
        playsinline
        controls></video>
    `;
  }

  if (camera.isWebRtc && (camera.streamId || camera.playbackKey)) {
    const playbackKey = camera.playbackKey || getCameraPlaybackKey(camera);
    const streamAttr = camera.streamId ? ` data-stream-id="${escapeHtml(String(camera.streamId))}"` : "";
    return `
      <video${streamAttr} data-playback-key="${escapeHtml(playbackKey)}" autoplay muted playsinline></video>
      <div class="cameraConnectionLostScreen" data-playback-key="${escapeHtml(playbackKey)}" aria-hidden="true">
        <div class="cameraConnectionLostText">se perdió la conexión</div>
      </div>
    `;
  }

  const image = camera.image || PLACEHOLDER_IMAGES[0];
  return `<img src="${escapeHtml(image)}" alt="${escapeHtml(camera.name)}">`;
}

function buildPlaybackMarkup(camera) {
  if (!camera.isWebRtc || (!camera.streamId && !camera.playbackKey)) return "";
  const playbackKey = camera.playbackKey || getCameraPlaybackKey(camera);

  return `
    <div class="cameraPlayback camScrubberWrap" data-playback-key="${escapeHtml(playbackKey)}" data-stream-id="${escapeHtml(String(camera.streamId || ""))}">
      <button class="cameraPlaybackBtn" data-skip="-10" type="button" title="Retroceder 10 segundos">-10</button>
      <div class="camProgressTrack">
        <div class="camProgressFill" style="width:0%"></div>
        <div class="camScrubHandle" style="left:0%"></div>
        <input class="cameraPlaybackRange" type="range" min="0" max="0" step="0.1" value="0" aria-label="Barra de reproducción">
      </div>
      <button class="cameraPlaybackBtn" data-skip="10" type="button" title="Adelantar 10 segundos">+10</button>
      <button class="cameraLiveBtn" type="button" title="Volver a vivo">LIVE</button>
      <div class="camTimeRow">
        <span class="cameraPlaybackTime camElapsed">00:00</span>
        <span class="cameraPlaybackStatus camLiveBadge">LIVE</span>
      </div>
    </div>
  `;
}

function attachKnownMediaStreams() {
  const playbackKeys = new Set(playbackGroups.keys());
  remoteStreams.forEach((_, streamId) => playbackKeys.add(getStreamPlaybackKey(streamId)));
  playbackArchives.forEach((archive, streamId) => playbackKeys.add(archive.playbackKey || getStreamPlaybackKey(streamId)));
  playbackKeys.forEach((playbackKey) => attachMediaStateForPlaybackKey(playbackKey));
}

function attachMediaStateForStream(streamId) {
  attachMediaStateForPlaybackKey(getStreamPlaybackKey(streamId));
}

function queryVideosForPlaybackKey(playbackKey) {
  return [...document.querySelectorAll("video[data-playback-key]")]
    .filter((video) => video.dataset.playbackKey === String(playbackKey));
}

function queryConnectionLostScreens(playbackKey) {
  return [...document.querySelectorAll(".cameraConnectionLostScreen[data-playback-key]")]
    .filter((screen) => screen.dataset.playbackKey === String(playbackKey));
}

function setConnectionLostScreen(playbackKey, visible) {
  queryConnectionLostScreens(playbackKey).forEach((screen) => {
    screen.classList.toggle("visible", Boolean(visible));
    screen.setAttribute("aria-hidden", visible ? "false" : "true");
    screen.closest(".cameraFeed")?.classList.toggle("connectionLostFinal", Boolean(visible));
  });
}

function getActiveRemoteStreamForGroup(group) {
  if (!group) return { streamId: null, mediaStream: null };
  if (group.activeStreamId && remoteStreams.has(Number(group.activeStreamId))) {
    const streamId = Number(group.activeStreamId);
    return { streamId, mediaStream: remoteStreams.get(streamId) };
  }
  for (const streamId of group.streamIds) {
    if (remoteStreams.has(Number(streamId))) {
      group.activeStreamId = Number(streamId);
      return { streamId: Number(streamId), mediaStream: remoteStreams.get(Number(streamId)) };
    }
  }
  return { streamId: null, mediaStream: null };
}

function attachMediaStateForPlaybackKey(playbackKey) {
  const archive = getPlaybackGroup(playbackKey, false);
  const { streamId, mediaStream } = getActiveRemoteStreamForGroup(archive);

  queryVideosForPlaybackKey(playbackKey).forEach((video) => {
    if (archive?.reviewMode) {
      setConnectionLostScreen(playbackKey, false);
      attachReviewVideo(video, playbackKey);
      return;
    }

    if (mediaStream) {
      setConnectionLostScreen(playbackKey, false);
      if (video.srcObject !== mediaStream) {
        video.pause?.();
        video.removeAttribute("src");
        video.srcObject = mediaStream;
        video.dataset.reviewUrl = "";
        if (streamId) video.dataset.streamId = String(streamId);
      }
      video.play?.().catch(() => {});
      return;
    }

    if (archive?.segments?.length) {
      setConnectionLostScreen(playbackKey, false);
      archive.reviewMode = true;
      archive.forcedLocalReview = true;
      if (!archive.localReviewInitialized) {
        archive.reviewPosition = Math.max(0, getArchiveDuration(archive) - 5);
        archive.localReviewInitialized = true;
      }
      attachReviewVideo(video, playbackKey);
      return;
    }

    video.srcObject = null;
    setConnectionLostScreen(playbackKey, Boolean(archive?.connectionLost));
  });
}

function attachReviewVideo(video, playbackKey) {
  const archive = getPlaybackGroup(playbackKey, false);
  if (!archive?.segments?.length) return;
  setConnectionLostScreen(playbackKey, false);

  const located = locateSegmentAt(archive, archive.reviewPosition);
  if (!located) return;

  archive.activeSegmentIndex = located.index;
  const { segment, offset } = located;
  if (video.dataset.reviewUrl !== segment.url) {
    video.pause?.();
    video.srcObject = null;
    video.src = segment.url;
    video.dataset.reviewUrl = segment.url;
  }

  if (!video.dataset.reviewEventsBound) {
    video.dataset.reviewEventsBound = "1";
    video.addEventListener("ended", () => {
      advanceReviewPlayback(video.dataset.playbackKey);
    });
    video.addEventListener("timeupdate", () => {
      const currentPlaybackKey = video.dataset.playbackKey;
      const currentArchive = getPlaybackGroup(currentPlaybackKey, false);
      if (!currentArchive?.reviewMode) return;
      const index = currentArchive.activeSegmentIndex || 0;
      currentArchive.reviewPosition = getSegmentStart(currentArchive, index) + (video.currentTime || 0);
      updatePlaybackControls(currentPlaybackKey);
    });
  }

  if (Math.abs((video.currentTime || 0) - offset) > 0.35) {
    try { video.currentTime = offset; } catch {}
  }
  video.play?.().catch(() => {});
}

function advanceReviewPlayback(playbackKey) {
  const archive = getPlaybackGroup(playbackKey, false);
  if (!archive?.reviewMode) return;
  const nextIndex = (archive.activeSegmentIndex || 0) + 1;

  if (nextIndex < archive.segments.length) {
    archive.activeSegmentIndex = nextIndex;
    archive.reviewPosition = getSegmentStart(archive, nextIndex);
    attachMediaStateForPlaybackKey(playbackKey);
    updatePlaybackControls(playbackKey);
    return;
  }

  if (getActiveRemoteStreamForGroup(archive).mediaStream) {
    returnToLive(playbackKey);
    return;
  }

  archive.reviewPosition = getArchiveDuration(archive);
  updatePlaybackControls(playbackKey);
  setConnectionLostScreen(playbackKey, true);
}

function seekStreamPlayback(playbackKey, seconds) {
  const archive = getPlaybackGroup(playbackKey, false);
  if (!archive?.segments?.length) return;
  setConnectionLostScreen(playbackKey, false);

  const max = getPlaybackMax(archive);
  const finalizedDuration = getArchiveDuration(archive);
  const target = Math.max(0, Math.min(Number(seconds) || 0, max));

  if (getActiveRemoteStreamForGroup(archive).mediaStream && target >= Math.max(0, max - LIVE_EDGE_THRESHOLD_SECONDS)) {
    returnToLive(playbackKey);
    return;
  }

  const seekTarget = Math.min(target, Math.max(0, finalizedDuration - 0.1));
  const located = locateSegmentAt(archive, seekTarget);
  if (!located) return;

  archive.reviewMode = true;
  archive.forcedLocalReview = false;
  archive.localReviewInitialized = true;
  archive.activeSegmentIndex = located.index;
  archive.reviewPosition = located.start + located.offset;
  attachMediaStateForPlaybackKey(playbackKey);
  updatePlaybackControls(playbackKey);
}

function skipStreamPlayback(playbackKey, deltaSeconds) {
  const archive = getPlaybackGroup(playbackKey, false);
  if (!archive) return;
  const max = getPlaybackMax(archive);
  const current = archive.reviewMode ? archive.reviewPosition : max;
  seekStreamPlayback(playbackKey, current + Number(deltaSeconds || 0));
}

function returnToLive(playbackKey) {
  const archive = getPlaybackGroup(playbackKey, false);
  setConnectionLostScreen(playbackKey, false);
  if (archive) {
    archive.reviewMode = false;
    archive.activeSegmentIndex = 0;
    archive.reviewPosition = getPlaybackMax(archive);
    archive.localReviewInitialized = false;
  }
  attachMediaStateForPlaybackKey(playbackKey);
  updatePlaybackControls(playbackKey);
}

function queryPlaybackControls(playbackKey) {
  return [...document.querySelectorAll(".cameraPlayback")]
    .filter((control) => control.dataset.playbackKey === String(playbackKey));
}

function updatePlaybackControls(playbackKey = null) {
  const keys = playbackKey == null
    ? [...playbackGroups.keys()]
    : [String(playbackKey).includes(":") ? String(playbackKey) : getStreamPlaybackKey(playbackKey)];

  keys.forEach((key) => {
    const archive = getPlaybackGroup(key, false);
    const max = archive ? getPlaybackMax(archive) : 0;
    const value = archive?.reviewMode ? archive.reviewPosition : max;
    const hasRemote = Boolean(getActiveRemoteStreamForGroup(archive).mediaStream);
    const status = archive?.segments?.length && !hasRemote
      ? "LOCAL"
      : archive?.reviewMode
        ? "REV"
        : archive?.segments?.length
          ? "BUFFER"
          : "LIVE";

    queryPlaybackControls(key).forEach((control) => {
      const range = control.querySelector(".cameraPlaybackRange");
      const time = control.querySelector(".cameraPlaybackTime");
      const liveBtn = control.querySelector(".cameraLiveBtn");
      const statusEl = control.querySelector(".cameraPlaybackStatus");
      const fill = control.querySelector(".camProgressFill");
      const handle = control.querySelector(".camScrubHandle");
      const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

      if (range) {
        range.max = String(Math.max(0, max));
        range.value = String(Math.max(0, value));
        range.disabled = !archive || max <= 0;
      }
      if (fill) fill.style.width = `${pct}%`;
      if (handle) handle.style.left = `${pct}%`;
      if (time) {
        time.textContent = `${formatPlaybackTime(value)} / ${formatPlaybackTime(max)}`;
      }
      if (liveBtn) {
        liveBtn.classList.toggle("active", !archive?.reviewMode && hasRemote);
        liveBtn.disabled = !hasRemote;
      }
      if (statusEl) {
        statusEl.textContent = status;
        statusEl.dataset.status = status.toLowerCase();
        statusEl.classList.toggle("camLive", status === "LIVE" || status === "BUFFER");
        statusEl.classList.toggle("camBehind", status === "LOCAL" || status === "REV");
      }
    });
  });
}

function ensurePlaybackUiTimer() {
  if (playbackUiTimer) return;
  playbackUiTimer = window.setInterval(() => updatePlaybackControls(), 1000);
}

function bindPlaybackControls(container, camera) {
  if (!camera?.isWebRtc || (!camera.streamId && !camera.playbackKey)) return;
  const playbackKey = camera.playbackKey || getCameraPlaybackKey(camera);
  const streamId = Number(camera.streamId || 0);
  if (streamId) void loadPersistedSegmentsForStream(streamId);
  container.classList.add("hasPlayback");

  container.querySelectorAll(".cameraPlaybackRange").forEach((range) => {
    range.addEventListener("input", (event) => {
      event.stopPropagation();
      seekStreamPlayback(playbackKey, Number(event.target.value || 0));
    });
  });

  container.querySelectorAll(".cameraPlaybackBtn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      skipStreamPlayback(playbackKey, Number(button.dataset.skip || 0));
    });
  });

  container.querySelectorAll(".cameraLiveBtn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      returnToLive(playbackKey);
    });
  });

  updatePlaybackControls(playbackKey);
}

function getTapSide(feed, clientX) {
  const rect = feed.getBoundingClientRect();
  const x = clientX - rect.left;
  if (x < rect.width * DOUBLE_TAP_SIDE_RATIO) return "left";
  if (x > rect.width * (1 - DOUBLE_TAP_SIDE_RATIO)) return "right";
  return "center";
}

function bindCameraSurfaceInteractions(feed, camera) {
  feed.dataset.activeStreamId = camera?.streamId ? String(camera.streamId) : "";
  feed.dataset.playbackKey = camera?.playbackKey || getCameraPlaybackKey(camera || {});
  if (feed.dataset.cameraSurfaceBound === "1") return;
  feed.dataset.cameraSurfaceBound = "1";

  let lastTapAt = 0;
  let lastTapSide = "";

  feed.addEventListener("pointerup", (event) => {
    if (event.target.closest(".cameraPlayback, .cameraFeedAction")) return;
    const side = getTapSide(feed, event.clientX);
    const now = Date.now();
    const isDoubleTap = side !== "center" && lastTapSide === side && now - lastTapAt <= DOUBLE_TAP_MS;
    lastTapAt = now;
    lastTapSide = side;

    const playbackKey = feed.dataset.playbackKey;
    if (isDoubleTap && playbackKey) {
      event.preventDefault();
      skipStreamPlayback(playbackKey, side === "left" ? -10 : 10);
    }
  });

  feed.addEventListener("dblclick", (event) => {
    if (event.target.closest(".cameraPlayback, .cameraFeedAction")) return;
    const side = getTapSide(feed, event.clientX);
    const playbackKey = feed.dataset.playbackKey;
    if (side !== "center" && playbackKey) {
      event.preventDefault();
      skipStreamPlayback(playbackKey, side === "left" ? -10 : 10);
      return;
    }
    toggleFocus(feed);
  });
}

function attachLiveFeeds() {
  cameraData.forEach((camera) => {
    if (camera.isWebRtc && camera.streamId) {
      joinWebRtcStream(camera);
    }
  });
  attachKnownMediaStreams();
}

export async function showPersonnelLiveCamera(personId, displayName = "") {
  if (!dom.personnelDetailCamera || personId == null) return;

  activeOperationId = activeOperationId || localStorage.getItem("active_operation_id");
  activePersonnelCamera = {
    personId: String(personId),
    displayName: String(displayName || "").trim()
  };

  renderActivePersonnelCamera();
  await loadLiveStreams();
}

export function clearPersonnelLiveCamera() {
  activePersonnelCamera = null;
  if (dom.personnelDetailCamera) {
    dom.personnelDetailCamera.innerHTML = "";
  }
}

function renderActivePersonnelCamera() {
  if (!activePersonnelCamera || !dom.personnelDetailCamera) return;

  const camera = findCameraForPerson(activePersonnelCamera.personId, activePersonnelCamera.displayName);
  const name = camera?.name || activePersonnelCamera.displayName || `Agente ${activePersonnelCamera.personId}`;
  const badge = camera ? getCameraBadge(camera) : "SIN SEÑAL";
  const media = camera
    ? buildMediaMarkup(camera)
    : `<img src="${escapeHtml(getPlaceholderCameraImage(activePersonnelCamera.personId))}" alt="${escapeHtml(name)}">`;
  const playback = camera ? buildPlaybackMarkup(camera) : "";

  dom.personnelDetailCamera.innerHTML = `
    <div class="cameraFeedBadge">${escapeHtml(badge)}</div>
    ${media}
    ${playback}
    <div class="cameraFeedName">${escapeHtml(name)}</div>
  `;

  if (camera?.isWebRtc && camera.streamId) {
    joinWebRtcStream(camera);
    bindPlaybackControls(dom.personnelDetailCamera, camera);
    bindCameraSurfaceInteractions(dom.personnelDetailCamera, camera);
  }
  attachKnownMediaStreams();
}

function findCameraForPerson(personId, displayName = "") {
  const personKey = String(personId || "");
  const cameras = getRenderableCameraData();
  const byId = cameras.find((camera) =>
    !camera.placeholder && camera.personnelId != null && String(camera.personnelId) === personKey
  );
  if (byId) return byId;

  const nameKey = normalizeName(displayName);
  if (!nameKey) return null;

  return cameras.find((camera) =>
    !camera.placeholder && normalizeName(camera.name).includes(nameKey)
  ) || null;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getPlaceholderCameraImage(personId) {
  const source = String(personId || "");
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return PLACEHOLDER_IMAGES[Math.abs(hash) % PLACEHOLDER_IMAGES.length];
}

async function fetchIceServers() {
  if (iceServers) return iceServers;
  if (!activeOperationId) return [{ urls: "stun:stun.l.google.com:19302" }];

  try {
    const res = await fetch(`${API_BASE}/ops/${activeOperationId}/streams/webrtc-config`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    iceServers = data?.config?.iceServers || [{ urls: "stun:stun.l.google.com:19302" }];
  } catch {
    iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
  }
  return iceServers;
}

async function joinWebRtcStream(camera, options = {}) {
  if (!streamSocket || streamSocket.connected !== true) return;
  if (!window.RTCPeerConnection) return;
  if (joinedStreams.has(camera.streamId) && !options.refresh) {
    attachKnownMediaStreams();
    return;
  }

  joinedStreams.add(camera.streamId);
  ensurePeerConnection(camera.streamId);
  streamSocket.emit("stream_join", {
    id_operacion: camera.operationId || activeOperationId,
    id_stream: camera.streamId,
    role: "viewer",
    refresh: Boolean(options.refresh)
  }, (ack = {}) => {
    if (!ack.ok) {
      joinedStreams.delete(camera.streamId);
      console.warn("[CAMERAS] No se pudo unir al stream:", ack.mensaje || "sin detalle");
      return;
    }
    if (ack.stream) updateCameraFromStream(ack.stream);
  });
}

async function ensurePeerConnection(streamId) {
  if (peerConnections.has(streamId)) return peerConnections.get(streamId);

  const servers = await fetchIceServers();
  const pc = new RTCPeerConnection({ iceServers: servers });
  peerConnections.set(streamId, pc);

  pc.ontrack = (event) => {
    if (event.streams?.[0]) {
      const id = Number(streamId);
      remoteStreams.set(id, event.streams[0]);
      handleStreamConnectionRestored(id, event.streams[0]);
      attachKnownMediaStreams();
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      const archive = getPlaybackArchive(streamId, false);
      const hasRemote = remoteStreams.has(Number(streamId));
      if (archive && hasRemote) archive.connectionLost = false;
      if (hasRemote) {
        const timer = reconnectTimers.get(streamId);
        if (timer) {
          window.clearTimeout(timer);
          reconnectTimers.delete(streamId);
        }
      }
      updatePlaybackControls(streamId);
    }
    if (["failed", "closed"].includes(pc.connectionState)) {
      remoteStreams.delete(Number(streamId));
      handleStreamConnectionLost(streamId);
      attachMediaStateForStream(streamId);
      reconnectWebRtcStream(streamId, 1000);
    }
    if (pc.connectionState === "disconnected") {
      remoteStreams.delete(Number(streamId));
      handleStreamConnectionLost(streamId);
      attachMediaStateForStream(streamId);
      reconnectWebRtcStream(streamId, 3500);
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.iceConnectionState)) {
      remoteStreams.delete(Number(streamId));
      handleStreamConnectionLost(streamId);
      attachMediaStateForStream(streamId);
      reconnectWebRtcStream(streamId, 1000);
    }
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate || !streamSocket) return;
    streamSocket.emit("webrtc_ice_candidate", {
      id_operacion: activeOperationId,
      id_stream: streamId,
      to: peerTargets.get(streamId) || getPublisherSocketId(streamId),
      candidate: event.candidate
    });
  };

  return pc;
}

function getPublisherSocketId(streamId) {
  return cameraData.find((camera) => Number(camera.streamId) === Number(streamId))?.publisherSocketId || "";
}

function updateCameraFromStream(stream) {
  const streamId = Number(stream?.id_stream);
  if (!streamId) return null;

  const nextCamera = streamToCamera(stream);
  rememberCameraMetadata(nextCamera);
  const index = cameraData.findIndex((camera) => Number(camera.streamId) === streamId);
  if (index >= 0) {
    cameraData[index] = { ...cameraData[index], ...nextCamera };
  } else {
    cameraData = cameraData.filter((camera) => !camera.placeholder);
    cameraData.unshift(nextCamera);
  }
  return cameraData.find((camera) => Number(camera.streamId) === streamId) || nextCamera;
}

function findCameraByStreamId(streamId) {
  return cameraData.find((camera) => Number(camera.streamId) === Number(streamId)) || null;
}

function reconnectWebRtcStream(streamId, delay = 250) {
  const id = Number(streamId);
  if (!id || reconnectTimers.has(id)) return;

  reconnectTimers.set(id, window.setTimeout(() => {
    reconnectTimers.delete(id);
    const camera = findCameraByStreamId(id);
    if (!camera?.isWebRtc) return;

    closePeer(id);
    joinWebRtcStream(camera, { refresh: true });
  }, delay));
}

function bindStreamSocket() {
  if (!streamSocket || cameraSocketBound) return;
  cameraSocketBound = true;

  streamSocket.on("connect", () => {
    joinedStreams.clear();
    attachLiveFeeds();
  });

  streamSocket.on("media_stream_started", () => loadLiveStreams());
  streamSocket.on("media_stream_publisher_ready", (stream) => {
    const camera = updateCameraFromStream(stream);
    if (camera) {
      renderFeeds();
      renderActivePersonnelCamera();
      reconnectWebRtcStream(camera.streamId, 250);
    } else {
      loadLiveStreams();
    }
  });
  streamSocket.on("webrtc_publisher_joined", (payload = {}) => {
    reconnectWebRtcStream(Number(payload.id_stream), 250);
  });
  streamSocket.on("media_stream_publisher_offline", (stream) => {
    const camera = updateCameraFromStream(stream);
    closePeer(Number(stream?.id_stream));
    if (camera) {
      renderFeeds();
      renderActivePersonnelCamera();
    } else {
      loadLiveStreams();
    }
  });
  streamSocket.on("media_stream_stopped", (stream) => {
    closePeer(Number(stream?.id_stream));
    loadLiveStreams();
  });

  streamSocket.on("webrtc_offer", async (payload) => {
    const streamId = Number(payload?.id_stream);
    const sdp = payload?.sdp;
    if (!streamId || !sdp) return;

    const pc = await ensurePeerConnection(streamId);
    peerTargets.set(streamId, payload.from_socket_id || payload.from || "");
    await pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    streamSocket.emit("webrtc_answer", {
      id_operacion: payload.id_operacion || activeOperationId,
      id_stream: streamId,
      to: payload.from_socket_id || payload.from,
      type: answer.type,
      sdp: answer.sdp
    });
  });

  streamSocket.on("webrtc_ice_candidate", async (payload) => {
    const streamId = Number(payload?.id_stream);
    const candidate = payload?.candidate;
    if (!streamId || !candidate) return;

    const pc = await ensurePeerConnection(streamId);
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("[CAMERAS] ICE candidate rechazado:", err.message);
    }
  });
}

function closePeer(streamId) {
  const id = Number(streamId);
  remoteStreams.delete(id);
  handleStreamConnectionLost(streamId);

  const timer = reconnectTimers.get(streamId);
  if (timer) {
    window.clearTimeout(timer);
    reconnectTimers.delete(streamId);
  }

  const pc = peerConnections.get(streamId);
  if (pc) {
    pc.onconnectionstatechange = null;
    pc.oniceconnectionstatechange = null;
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.close();
  }
  peerConnections.delete(streamId);
  joinedStreams.delete(streamId);
  peerTargets.delete(streamId);

  const archive = getPlaybackArchive(streamId, false);
  const playbackKey = archive?.playbackKey || getStreamPlaybackKey(streamId);
  queryVideosForPlaybackKey(playbackKey).forEach((video) => {
    if (getPlaybackGroup(playbackKey, false)?.segments?.length) {
      enterLocalReview(playbackKey);
      attachReviewVideo(video, playbackKey);
      return;
    }
    video.srcObject = null;
    setConnectionLostScreen(playbackKey, true);
  });
  updatePlaybackControls(playbackKey);
}

function toggleFocus(feed) {
  const wasFocused = feed.classList.contains("focused");
  document.querySelectorAll(".cameraFeed").forEach((item) => item.classList.remove("focused"));
  if (!wasFocused) feed.classList.add("focused");
}

function bindCameraEvents() {
  if (cameraEventsBound) return;
  cameraEventsBound = true;

  if (dom.cameraLayoutGrid && dom.cameraFeeds) {
    dom.cameraLayoutGrid.onclick = () => {
      dom.cameraFeeds.className = "cameraFeeds grid-layout";
      dom.cameraLayoutGrid.classList.add("active");
      dom.cameraLayoutSpeaker?.classList.remove("active");
      document.querySelectorAll(".cameraFeed").forEach((feed) => feed.classList.remove("focused"));
    };
  }

  if (dom.cameraLayoutSpeaker && dom.cameraFeeds) {
    dom.cameraLayoutSpeaker.onclick = () => {
      dom.cameraFeeds.className = "cameraFeeds speaker-layout";
      dom.cameraLayoutSpeaker.classList.add("active");
      dom.cameraLayoutGrid?.classList.remove("active");

      if (!document.querySelector(".cameraFeed.focused")) {
        document.querySelector(".cameraFeed")?.classList.add("focused");
      }
    };
  }
}

function makePanelDraggable() {
  const panel = dom.cameraPanel;
  const header = panel?.querySelector(".panelHeader");
  if (!panel || !header || cameraDragBound) return;
  cameraDragBound = true;

  let previousX = 0;
  let previousY = 0;

  header.onmousedown = (event) => {
    if (event.target.closest(".cameraControls") || event.target.closest(".layoutBtn")) return;
    event.preventDefault();

    previousX = event.clientX;
    previousY = event.clientY;

    const rect = panel.getBoundingClientRect();
    panel.style.top = `${rect.top}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.right = "auto";
    panel.style.margin = "0";
    panel.style.zIndex = "3100";
    panel.classList.add("is-dragging");

    document.onmouseup = stopDragging;
    document.onmousemove = dragPanel;
  };

  function dragPanel(event) {
    event.preventDefault();

    const deltaX = previousX - event.clientX;
    const deltaY = previousY - event.clientY;
    previousX = event.clientX;
    previousY = event.clientY;

    panel.style.top = `${panel.offsetTop - deltaY}px`;
    panel.style.left = `${panel.offsetLeft - deltaX}px`;
  }

  function stopDragging() {
    document.onmouseup = null;
    document.onmousemove = null;
    panel.style.zIndex = "3000";
    panel.classList.remove("is-dragging");
  }
}
