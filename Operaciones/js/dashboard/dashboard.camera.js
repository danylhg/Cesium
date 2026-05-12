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

export function initCameraFeeds(opId = null, socket = null) {
  activeOperationId = opId || activeOperationId || localStorage.getItem("active_operation_id");
  if (socket) {
    streamSocket = socket;
    bindStreamSocket();
  }

  loadPlaceholderCameraData();
  renderFeeds();
  bindCameraEvents();
  makePanelDraggable();
  loadLiveStreams();
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
        status: "SIN SENAL",
        placeholder: true
      };
    });
    return;
  }

  cameraData = [
    { id: "placeholder-1", name: "Camara 1", image: "img/cameras/cam1.png", status: "SIN SENAL", placeholder: true },
    { id: "placeholder-2", name: "Camara 2", image: "img/cameras/cam2.png", status: "SIN SENAL", placeholder: true },
    { id: "placeholder-3", name: "Camara 3", image: "img/cameras/cam3.png", status: "SIN SENAL", placeholder: true }
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
    if (streams.length > 0) {
      cameraData = streams;
      renderFeeds();
      attachLiveFeeds();
    }
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
    name: stream.label || `Stream ${stream.id_stream}`,
    protocol,
    kind: stream.kind,
    status: stream.status || "ACTIVE",
    publisherSocketId: stream.publisher_socket_id,
    playbackUrl,
    rtmpPublishUrl: stream.rtmp_publish_url || "",
    isWebRtc: protocol === "WEBRTC" || protocol === "HYBRID",
    isPlayableUrl,
    sourceType: stream.source_type || "ANDROID",
    viewerCount: stream.viewer_count || 0
  };
}

function renderFeeds() {
  if (!dom.cameraFeeds) return;
  dom.cameraFeeds.innerHTML = "";
  cameraData.forEach((camera) => {
    dom.cameraFeeds.appendChild(createFeedElement(camera));
  });
}

function createFeedElement(camera) {
  const feed = document.createElement("div");
  feed.className = "cameraFeed";
  feed.id = camera.id;

  const displayProtocol = (camera.protocol === "HYBRID" || camera.protocol === "WEBRTC") ? "EN VIVO" : (camera.protocol || "LIVE"); const badge = camera.placeholder ? camera.status : displayProtocol;
  const media = buildMediaMarkup(camera);
  const urlHint = camera.playbackUrl && !camera.isPlayableUrl
    ? `<div class="cameraFeedHint">RTMP listo para gateway de video</div>`
    : "";

  feed.innerHTML = `
    <div class="cameraFeedBadge">${escapeHtml(badge)}</div>
    ${media}
    ${urlHint}
    <div class="cameraFeedName">${escapeHtml(camera.name)}</div>
    <div class="cameraFeedOverlay">
      <button class="cameraFeedAction" type="button" title="Maximizar">+</button>
    </div>
  `;

  feed.querySelector(".cameraFeedAction")?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFocus(feed);
  });

  feed.addEventListener("dblclick", () => toggleFocus(feed));
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

  if (camera.isWebRtc && camera.streamId) {
    return `<video data-stream-id="${camera.streamId}" autoplay muted playsinline controls></video>`;
  }

  const image = camera.image || PLACEHOLDER_IMAGES[0];
  return `<img src="${escapeHtml(image)}" alt="${escapeHtml(camera.name)}">`;
}

function attachLiveFeeds() {
  cameraData.forEach((camera) => {
    if (camera.isWebRtc && camera.streamId) {
      joinWebRtcStream(camera);
    }
  });
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

async function joinWebRtcStream(camera) {
  if (!streamSocket || streamSocket.connected !== true) return;
  if (!window.RTCPeerConnection) return;
  if (joinedStreams.has(camera.streamId)) return;

  joinedStreams.add(camera.streamId);
  ensurePeerConnection(camera.streamId);
  streamSocket.emit("stream_join", {
    id_operacion: camera.operationId || activeOperationId,
    id_stream: camera.streamId,
    role: "viewer"
  });
}

async function ensurePeerConnection(streamId) {
  if (peerConnections.has(streamId)) return peerConnections.get(streamId);

  const servers = await fetchIceServers();
  const pc = new RTCPeerConnection({ iceServers: servers });
  peerConnections.set(streamId, pc);

  pc.ontrack = (event) => {
    const video = dom.cameraFeeds?.querySelector(`video[data-stream-id="${streamId}"]`);
    if (video && event.streams?.[0]) {
      video.srcObject = event.streams[0];
      video.play?.().catch(() => {});
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

function bindStreamSocket() {
  if (!streamSocket || cameraSocketBound) return;
  cameraSocketBound = true;

  streamSocket.on("connect", () => {
    joinedStreams.clear();
    attachLiveFeeds();
  });

  streamSocket.on("media_stream_started", () => loadLiveStreams());
  streamSocket.on("media_stream_publisher_ready", () => loadLiveStreams());
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
  const pc = peerConnections.get(streamId);
  if (pc) pc.close();
  peerConnections.delete(streamId);
  joinedStreams.delete(streamId);
  peerTargets.delete(streamId);
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
