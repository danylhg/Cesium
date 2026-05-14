/**
 * js/historial.js - Playback Engine for Operation History
 */

const API_BASE = `http://${window.location.hostname}:3001`;

// ── State ───────────────────────────────────────────────────
let operationData = null;
let timelineEvents = [];
let timelineStart = null;
let timelineEnd = null;
let currentTime = 0; // ms relative to timelineStart
let duration = 0;
let isPlaying = false;
let playbackSpeed = 1;
let lastTick = 0;
let lastEventIdx = -1;

let viewer = null;
let trackingEntities = new Map(); // key -> Cesium.Entity
let tacticalEntities = new Map(); // key -> Cesium.Entity
let chatMessagesRendered = new Set();

// ── DOM Elements ─────────────────────────────────────────────
const dom = {
  opName: document.getElementById('opName'),
  currentTimeLabel: document.getElementById('currentTimeLabel'),
  totalTimeLabel: document.getElementById('totalTimeLabel'),
  timelineSlider: document.getElementById('timelineSlider'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  btnReset: document.getElementById('btnReset'),
  btnBack: document.getElementById('btnBack'),
  btnRewind: document.getElementById('btnRewind'),
  btnForward: document.getElementById('btnForward'),
  playbackSpeed: document.getElementById('playbackSpeed'),
  currentDateDisplay: document.getElementById('currentDateDisplay'),
  chatMessages: document.getElementById('chatMessages'),
  eventLog: document.getElementById('eventLog'),
};

// ── Initialization ───────────────────────────────────────────
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const opId = urlParams.get('id');

  if (!opId) {
    alert("No se especificó una operación.");
    window.location.href = "menu_inicial.html";
    return;
  }

  // Back button
  dom.btnBack.onclick = () => (window.location.href = "menu_inicial.html");

  try {
    const res = await fetch(`${API_BASE}/ops/${opId}/replay`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.mensaje);

    operationData = data;
    // Ensure events are sorted
    timelineEvents = (data.timeline.eventos || []).sort((a, b) => 
      new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    );
    
    timelineStart = new Date(data.timeline.inicio).getTime();
    timelineEnd = new Date(data.timeline.fin).getTime();
    duration = Math.max(0, timelineEnd - timelineStart);

    dom.opName.textContent = data.operacion.nombre;
    dom.totalTimeLabel.textContent = formatDuration(duration);
    dom.timelineSlider.max = duration;

    // Fetch extra details for the info tab
    const [personalRes, vehiculosRes] = await Promise.all([
      fetch(`${API_BASE}/ops/${opId}/personal`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
      fetch(`${API_BASE}/ops/${opId}/vehiculos-asignados`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    ]);
    const personalData = await personalRes.json();
    const vehiculosData = await vehiculosRes.json();

    renderOpInfo(data.operacion, personalData.items || [], vehiculosData.items || []);

    const success = await initMap();
    if (!success) return;

    if (data.zona_operacion) {
      centerMap(data.zona_operacion);
    }

    bindEvents();
    requestAnimationFrame(playbackTick);
  } catch (err) {
    console.error(err);
    alert("Error al cargar el historial: " + err.message);
  }
}

function initMap() {
  return new Promise((resolve) => {
    if (viewer) {
      try { viewer.destroy(); } catch(e) {}
      viewer = null;
    }
    
    try {
      viewer = new Cesium.Viewer("map", {
        timeline: false,
        animation: false,
        baseLayerPicker: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        homeButton: false,
        fullscreenButton: false,
        selectionIndicator: false,
        infoBox: false,
        geocoder: false
      });

      setupLayers();
      resolve(true);
    } catch (err) {
      console.error("Cesium Init Error:", err);
      resolve(false);
    }
  });
}

function setupLayers() {
  if (!viewer) return;
  viewer.imageryLayers.removeAll();
  const satelliteLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  }));
  satelliteLayer.brightness = 0.8;
  
  const osmOverlay = viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({
    url: "https://a.tile.openstreetmap.org/"
  }));
  osmOverlay.alpha = 0.3;
}

function centerMap(zona) {
  const lat = Number(zona.centroide_lat);
  const lng = Number(zona.centroide_lon);
  const zoom = Number(zona.zoom_inicial) || 15000;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, zoom)
    });
  }
}

// ── Playback Engine ──────────────────────────────────────────
function bindEvents() {
  dom.btnPlayPause.onclick = () => {
    isPlaying = !isPlaying;
    dom.btnPlayPause.textContent = isPlaying ? "⏸" : "▶";
  };

  dom.btnReset.onclick = () => {
    seek(0);
  };
  
  dom.btnRewind.onclick = () => {
    seek(currentTime - 10000); // -10 segundos
  };

  dom.btnForward.onclick = () => {
    seek(currentTime + 10000); // +10 segundos
  };

  dom.timelineSlider.oninput = (e) => {
    seek(Number(e.target.value));
  };

  dom.playbackSpeed.onchange = (e) => {
    playbackSpeed = Number(e.target.value);
  };

  // Tabs
  document.querySelectorAll('.tabBtn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tabBtn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tabContent').forEach(c => c.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}Tab`).classList.remove('hidden');
    };
  });
}

function seek(ms) {
  currentTime = Math.max(0, Math.min(ms, duration));
  dom.timelineSlider.value = currentTime;
  resetWorldToCurrentTime();
  updateUI();
}

function playbackTick(now) {
  if (isPlaying) {
    const delta = now - (lastTick || now);
    currentTime += delta * playbackSpeed;

    if (currentTime >= duration) {
      currentTime = duration;
      isPlaying = false;
      dom.btnPlayPause.textContent = "▶";
    }

    dom.timelineSlider.value = currentTime;
    updateUI();
    updateWorld();
  }
  lastTick = now;
  requestAnimationFrame(playbackTick);
}

function updateUI() {
  dom.currentTimeLabel.textContent = formatDuration(currentTime);
  const absTime = new Date(timelineStart + currentTime);
  dom.currentDateDisplay.textContent = absTime.toLocaleString();

  // Update slider progress track
  if (duration > 0) {
    const percent = (currentTime / duration) * 100;
    dom.timelineSlider.style.backgroundSize = `${percent}% 100%`;
  }
}

/**
 * Incrementally processes events as time moves forward.
 */
function updateWorld() {
  const currentAbsTime = timelineStart + currentTime;

  // Forward process events
  while (lastEventIdx + 1 < timelineEvents.length) {
    const nextEvt = timelineEvents[lastEventIdx + 1];
    const evtTime = new Date(nextEvt.occurred_at).getTime();
    
    if (evtTime <= currentAbsTime) {
      processEvent(nextEvt);
      lastEventIdx++;
    } else {
      break;
    }
  }
}

function resetWorldToCurrentTime() {
  // Reset all state
  viewer.entities.removeAll();
  trackingEntities.clear();
  tacticalEntities.clear();
  chatMessagesRendered.clear();
  dom.chatMessages.innerHTML = '';
  dom.eventLog.innerHTML = '';
  lastEventIdx = -1;
  
  // Reprocess from beginning to current point
  updateWorld();
}

function processEvent(evt) {
  const type = evt.tipo_evento;
  const data = evt.payload;

  // 1. Chat
  if (type === 'chat_mensaje') {
    if (!chatMessagesRendered.has(data.id_mensaje)) {
      renderChatMessage(data);
      chatMessagesRendered.add(data.id_mensaje);
    }
  }

  // 2. Tracking
  else if (type === 'tracking_personal' || type === 'tracking_vehiculo') {
    const id = type === 'tracking_personal' ? data.id_personal : data.id_vehiculo;
    const key = `${type}:${id}`;
    updateTrackingEntity(key, data);
  }

  // 3. Tactical Elements
  else if (type.endsWith('_creado') || type.endsWith('_creada')) {
    ensureTacticalEntity(evt);
    logEvent(evt);
  } 
  else if (type.endsWith('_eliminado') || type.endsWith('_eliminada')) {
    removeTacticalEntity(evt);
    logEvent(evt);
  }
}

// ── Entity Rendering ─────────────────────────────────────────

function updateTrackingEntity(key, payload) {
  let ent = trackingEntities.get(key);
  const lat = Number(payload.latitud || payload.lat);
  const lon = Number(payload.longitud || payload.lon);
  const isVeh = key.startsWith('tracking_vehiculo');

  if (!ent) {
    const name = isVeh ? (payload.alias || payload.codigo_interno) : (payload.apodo || payload.nombre);
    ent = viewer.entities.add({
      name: name,
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 10,
        color: isVeh ? Cesium.Color.CYAN : Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      },
      label: {
        text: name,
        font: 'bold 12px Inter',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
      }
    });
    trackingEntities.set(key, ent);
  } else {
    // Interpolate or just update. For simple playback, direct update is fine.
    // For smooth movement at high speeds, interpolation would be better.
    ent.position = Cesium.Cartesian3.fromDegrees(lon, lat);
  }
}

function ensureTacticalEntity(evt) {
  const key = `${evt.entidad_tipo}:${evt.entidad_id}`;
  if (tacticalEntities.has(key)) return;

  const type = evt.entidad_tipo;
  const data = evt.payload;
  let ent = null;

  try {
    if (type === 'poi') {
      const sidc = data.sidc;
      const label = data.nombre || 'POI';
      const lat = Number(data.latitud);
      const lon = Number(data.longitud);

      if (sidc && typeof ms !== 'undefined') {
        const symbol = new ms.Symbol(sidc, { size: 30 }).asCanvas();
        ent = viewer.entities.add({
          name: label,
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          billboard: {
            image: symbol,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            width: 30,
            height: 30
          },
          label: {
            text: label,
            font: '12px Inter',
            pixelOffset: new Cesium.Cartesian2(0, 5),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2
          }
        });
      } else {
        ent = viewer.entities.add({
          name: label,
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          point: { pixelSize: 8, color: Cesium.Color.fromCssColorString(data.color || '#FFD700'), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND }
        });
      }
    } 
    else if (type === 'area' || type === 'zona' || type === 'zona_operacion') {
      const coords = data.geometria?.coordinates?.[0];
      if (coords && Array.isArray(coords)) {
        const flat = coords.flat();
        if (flat.length >= 6) {
          ent = viewer.entities.add({
            name: data.nombre || 'Área',
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
              material: Cesium.Color.fromCssColorString(data.color || '#00ffa6').withAlpha(0.2),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString(data.color || '#00ffa6'),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
            }
          });
        }
      }
    } 
    else if (type === 'ruta_operacion' || type === 'ruta_navegacion') {
       const coords = data.geometria?.coordinates;
       if (coords && Array.isArray(coords)) {
         ent = viewer.entities.add({
           name: data.nombre || 'Ruta',
           polyline: {
             positions: Cesium.Cartesian3.fromDegreesArray(coords.flat()),
             width: 4,
             material: Cesium.Color.fromCssColorString(data.color || '#3b82f6'),
             clampToGround: true
           }
         });
       }
    }
    else if (type === 'dibujo' || type === 'dibujo_libre_operacion') {
       const coords = data.geometria?.coordinates;
       if (coords && Array.isArray(coords)) {
         ent = viewer.entities.add({
           polyline: {
             positions: Cesium.Cartesian3.fromDegreesArray(coords.flat()),
             width: data.geometria?.meta?.width || 3,
             material: Cesium.Color.fromCssColorString(data.color || '#ffffff'),
             clampToGround: true
           }
         });
       }
    }
    
    if (ent) {
      tacticalEntities.set(key, ent);
    }
  } catch (err) {
    console.warn("Error rendering tactical entity:", err, evt);
  }
}

function removeTacticalEntity(evt) {
  const key = `${evt.entidad_tipo}:${evt.entidad_id}`;
  const ent = tacticalEntities.get(key);
  if (ent) {
    viewer.entities.remove(ent);
    tacticalEntities.delete(key);
  }
}

function renderChatMessage(msg) {
  const div = document.createElement('div');
  div.className = 'msg';
  const name = msg.nombre_usuario || msg.apodo_personal || msg.nombre_personal || 'Tripulación';
  div.innerHTML = `
    <div class="msgHeader">
      <span class="msgAuthor">${name}</span>
      <span class="msgTime">${new Date(msg.fecha_envio).toLocaleTimeString()}</span>
    </div>
    <div class="msgText">${msg.contenido}</div>
  `;
  dom.chatMessages.appendChild(div);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

function logEvent(evt) {
  const div = document.createElement('div');
  div.className = 'eventItem';
  
  const time = new Date(evt.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isCreated = evt.tipo_evento.includes('creado') || evt.tipo_evento.includes('creada');
  
  let rawName = evt.payload.nombre || evt.entidad_tipo;
  // Intento de limpiar caracteres extraños
  const cleanName = rawName.replace(/PolÃ\-\-gono/g, 'Polígono').replace(/Ã³/g, 'ó').replace(/Ã¡/g, 'á').replace(/Ã©/g, 'é').replace(/Ã/g, 'í');
  
  const typeIcons = {
    poi: '📍',
    area: '⬢',
    zona: '🛡️',
    zona_operacion: '🛡️',
    ruta_operacion: '🛣️',
    ruta_navegacion: '🛣️',
    dibujo: '✏️',
    dibujo_libre_operacion: '✏️'
  };
  const icon = typeIcons[evt.entidad_tipo] || '🔹';
  
  div.innerHTML = `
    <div class="eventHeader">
      <span class="eventTime">${time}</span>
      <span class="eventAction ${isCreated ? 'created' : 'deleted'}">
        ${isCreated ? 'REGISTRO' : 'ELIMINACIÓN'}
      </span>
    </div>
    <div class="eventBody">
      <span class="eventIcon">${icon}</span>
      <div class="eventInfo">
        <div class="eventName">${cleanName}</div>
        <div class="eventType">${evt.entidad_tipo.replace(/_/g, ' ')}</div>
      </div>
    </div>
  `;
  dom.eventLog.appendChild(div);
  dom.eventLog.scrollTop = dom.eventLog.scrollHeight;
}

// ── Utilities ────────────────────────────────────────────────
function formatDuration(ms) {
  if (isNaN(ms)) return "00:00:00";
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)));

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
}

function renderOpInfo(op, personal, vehiculos) {
  const container = document.getElementById('opInfoDetails');
  if (!container) return;

  const desc = op.descripcion || "Sin descripción disponible.";
  const fecha = new Date(op.fecha_creacion).toLocaleDateString();

  const personalHtml = personal.length > 0 
    ? personal.map(p => `<span class="memberTag">${p.nombre} ${p.apellido || ''}</span>`).join('')
    : '<p style="font-size:12px; color:var(--text-dim);">Sin personal asignado</p>';

  const vehiculosHtml = vehiculos.length > 0
    ? vehiculos.map(v => `<span class="memberTag">🚜 ${v.alias || v.codigo_interno}</span>`).join('')
    : '<p style="font-size:12px; color:var(--text-dim);">Sin vehículos asignados</p>';

  container.innerHTML = `
    <div class="infoSection">
      <h4>General</h4>
      <p><strong>Descripción:</strong> ${desc}</p>
      <p><strong>Fecha:</strong> ${fecha}</p>
      <p><strong>Estado:</strong> <span style="color:var(--accent)">FINALIZADA</span></p>
    </div>

    <div class="infoSection">
      <h4>Personal Asignado</h4>
      <div class="memberList">${personalHtml}</div>
    </div>

    <div class="infoSection">
      <h4>Vehículos</h4>
      <div class="memberList">${vehiculosHtml}</div>
    </div>
  `;
}

// ── Start ────────────────────────────────────────────────────
init();
