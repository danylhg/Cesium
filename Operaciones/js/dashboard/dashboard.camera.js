// js/dashboard/dashboard.camera.js

import { dom } from "./dashboard.dom.js";
import { getCurrentOperation } from "./dashboard.storage.js";

const PLACEHOLDER_IMAGES = [
  "img/cameras/cam1.png",
  "img/cameras/cam2.png",
  "img/cameras/cam3.png",
  "https://images.unsplash.com/photo-1508614589041-895b88991e3e?q=80&w=1000&auto=format&fit=crop"
];

let cameraData = [];

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function initCameraFeeds() {
  loadCameraData();
  renderFeeds();
  bindCameraEvents();
  makePanelDraggable();
}

function loadCameraData() {
  const op = getCurrentOperation();
  const personal = op?.personal || [];
  
  if (personal.length > 0) {
    cameraData = personal.map((p, idx) => {
      const name = [p.nombre, p.apellido].filter(Boolean).join(" ");
      return {
        id: `cam-${p.id_personal || idx}`,
        name: `${name} (${p.rol_en_operacion || "Personal"})`,
        image: PLACEHOLDER_IMAGES[idx % PLACEHOLDER_IMAGES.length]
      };
    });
  } else {
    cameraData = [
      { id: "cam-1", name: "OF. RODRIGUEZ (Líder)", image: "img/cameras/cam1.png" },
      { id: "cam-2", name: "OF. RAMIREZ (Apoyo)", image: "img/cameras/cam2.png" },
      { id: "cam-3", name: "OF. MORALES (Vanguardia)", image: "img/cameras/cam3.png" }
    ];
  }
}

function renderFeeds() {
  if (!dom.cameraFeeds) return;
  dom.cameraFeeds.innerHTML = "";
  cameraData.forEach(cam => {
    const feed = createFeedElement(cam);
    dom.cameraFeeds.appendChild(feed);
  });
}

function createFeedElement(cam) {
  const div = document.createElement("div");
  div.className = "cameraFeed";
  div.id = cam.id;
  
  div.innerHTML = `
    <div class="cameraFeedLabel">${cam.name}</div>
    <img src="${cam.image}" alt="${cam.name}">
    <div class="camScrubberWrap">
      <div class="camProgressTrack">
        <div class="camProgressFill" style="width:100%"></div>
        <div class="camScrubHandle" style="left:100%"></div>
      </div>
      <div class="camTimeRow">
        <span class="camElapsed">00:00</span>
        <span class="camLiveBadge">● EN VIVO</span>
      </div>
    </div>
  `;

  bindScrubber(div);
  return div;
}

function bindScrubber(feedEl) {
  const track = feedEl.querySelector('.camProgressTrack');
  const fill = feedEl.querySelector('.camProgressFill');
  const handle = feedEl.querySelector('.camScrubHandle');
  const elapsed = feedEl.querySelector('.camElapsed');
  const badge = feedEl.querySelector('.camLiveBadge');
  if (!track) return;

  const TOTAL_SECONDS = 3600; // 1hr simulated buffer
  let currentSec = TOTAL_SECONDS; // starts at live
  let dragging = false;

  function updateUI(sec) {
    const pct = Math.max(0, Math.min(100, (sec / TOTAL_SECONDS) * 100));
    fill.style.width = pct + '%';
    handle.style.left = pct + '%';

    const isLive = sec >= TOTAL_SECONDS - 1;
    if (isLive) {
      badge.textContent = '● EN VIVO';
      badge.classList.remove('camBehind');
      badge.classList.add('camLive');
      elapsed.textContent = formatTime(TOTAL_SECONDS);
    } else {
      const behind = TOTAL_SECONDS - sec;
      badge.textContent = `-${formatTime(behind)}`;
      badge.classList.add('camBehind');
      badge.classList.remove('camLive');
      elapsed.textContent = formatTime(sec);
    }
  }

  function pctFromEvent(e) {
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  track.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    dragging = true;
    currentSec = Math.round(pctFromEvent(e) * TOTAL_SECONDS);
    updateUI(currentSec);

    const onMove = (ev) => {
      ev.preventDefault();
      currentSec = Math.round(pctFromEvent(ev) * TOTAL_SECONDS);
      updateUI(currentSec);
    };
    const onUp = () => {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Double-click on feed: left half rewinds 10s, right half goes live
  feedEl.addEventListener('dblclick', (e) => {
    if (e.target.closest('.camScrubberWrap')) return;
    const rect = feedEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    if (clickX < rect.width / 2) {
      currentSec = Math.max(0, currentSec - 10);
    } else {
      currentSec = TOTAL_SECONDS; // go live
    }
    updateUI(currentSec);
  });

  // Click badge to go live
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    currentSec = TOTAL_SECONDS;
    updateUI(currentSec);
  });

  updateUI(currentSec);
}

function toggleFocus(feedEl) {
  const wasFocused = feedEl.classList.contains("focused");
  document.querySelectorAll(".cameraFeed").forEach(f => f.classList.remove("focused"));
  if (!wasFocused) {
    feedEl.classList.add("focused");
  }
}

function makePanelDraggable() {
  const panel = dom.cameraPanel;
  if (!panel) return;

  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  panel.style.cursor = "grab";
  panel.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    // Don't drag if clicking buttons, inputs, or scrubber
    if (e.target.closest("button")) return;
    if (e.target.closest(".camScrubberWrap")) return;

    const rect = panel.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    // Detect if clicking near the bottom-right corner (typical resize area)
    // We leave a 20px zone where dragging is disabled so resize works
    if (offsetX > rect.width - 25 && offsetY > rect.height - 25) {
      return; 
    }
    
    e = e || window.event;
    e.preventDefault();
    
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    panel.style.top = rect.top + "px";
    panel.style.left = rect.left + "px";
    panel.style.right = "auto";
    panel.style.margin = "0";
    panel.style.transform = "none";

    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
    panel.style.zIndex = 3100;
    panel.style.cursor = "grabbing";
    panel.classList.add("is-dragging");
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    panel.style.top = (panel.offsetTop - pos2) + "px";
    panel.style.left = (panel.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    panel.style.zIndex = 3000;
    panel.style.cursor = "grab";
    panel.classList.remove("is-dragging");
  }
}

function bindCameraEvents() {
  if (dom.cameraLayoutGrid) {
    dom.cameraLayoutGrid.onclick = () => {
      dom.cameraFeeds.className = "cameraFeeds grid-layout";
      dom.cameraLayoutGrid.classList.add("active");
      dom.cameraLayoutSpeaker.classList.remove("active");
      document.querySelectorAll(".cameraFeed").forEach(f => f.classList.remove("focused"));
    };
  }
  
  if (dom.cameraLayoutSpeaker) {
    dom.cameraLayoutSpeaker.onclick = () => {
      dom.cameraFeeds.className = "cameraFeeds speaker-layout";
      dom.cameraLayoutSpeaker.classList.add("active");
      dom.cameraLayoutGrid.classList.remove("active");
      
      if (!document.querySelector(".cameraFeed.focused")) {
        document.querySelector(".cameraFeed")?.classList.add("focused");
      }
    };
  }
}
