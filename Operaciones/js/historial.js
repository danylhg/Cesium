import { downloadRecording, loadCesiumToken, loadReplay, loadStreamRecordings } from "./historial/historial.api.js";
import { dom, readHistoryDom } from "./historial/historial.dom.js";
import { initHistoryMap, buildMapEntities, resizeHistoryMap } from "./historial/historial.map.js?v=20260520-nozoom";
import { initTimeline, setReplayData } from "./historial/historial.timeline.js";
import { renderError, renderEventLog, renderOperationInfo, renderTopbar, renderChatMessages, updateChatToTime, updateEventLogToTime } from "./historial/historial.ui.js";
import { replayState } from "./historial/historial.state.js";

readHistoryDom();

dom.backBtn?.addEventListener("click", () => {
  window.location.href = "menu_inicial.html";
});

bindTabs();
bindPanelToggle();

async function main() {
  const operationId = getOperationId();

  if (!operationId) {
    renderError("No se encontró el id de operación. Abre historial.html?id=3 o selecciona una operación cerrada.");
    return;
  }

  try {
    await loadCesiumToken();
  } catch (tokenError) {
    console.warn("No se pudo cargar token Cesium para historial", tokenError);
  }

  initHistoryMap();
  initTimeline();

  try {
    const replay = await loadReplay(operationId);
    try {
      const recordings = await loadStreamRecordings(operationId);
      replay.recordings = recordings.items || [];
    } catch (recordingsError) {
      replay.recordings = [];
      replay.recordingsError = recordingsError.message || "No se pudieron cargar";
    }
    setReplayData(replay);
    renderTopbar(replay);
    renderOperationInfo(replay);
    attachRecordingDownloads(replay.recordings || []);
    renderChatMessages(replay.timeline?.eventos || []);
    updateChatToTime(replayState.currentTimeMs);
    renderEventLog(replay.timeline?.eventos || []);
    updateEventLogToTime(replayState.currentTimeMs);
    buildMapEntities(replay);
  } catch (error) {
    console.error("Error cargando replay", error);
    renderError(error.message || "No se pudo cargar el historial de la operación.");
  }
}

function bindTabs() {
  document.querySelectorAll(".tabBtn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tabBtn").forEach(btn => btn.classList.remove("active"));
      document.querySelectorAll(".tabContent").forEach(content => content.classList.add("hidden"));
      button.classList.add("active");
      document.getElementById(`${button.dataset.tab}Tab`)?.classList.remove("hidden");
    });
  });
}

function bindPanelToggle() {
  if (!dom.panelToggle || !dom.stage) return;

  const landscapeQuery = window.matchMedia("(orientation: landscape) and (max-height: 620px)");
  const saved = localStorage.getItem("history_panel_hidden") === "true";
  setPanelHidden(saved || landscapeQuery.matches);

  dom.panelToggle.addEventListener("click", () => {
    setPanelHidden(!dom.stage.classList.contains("panelHidden"), true);
  });

  landscapeQuery.addEventListener?.("change", (event) => {
    if (event.matches) setPanelHidden(true, true);
  });
}

function setPanelHidden(hidden, persist = false) {
  dom.stage?.classList.toggle("panelHidden", hidden);
  if (dom.panelToggle) {
    dom.panelToggle.title = hidden ? "Mostrar panel" : "Ocultar panel";
    dom.panelToggle.setAttribute("aria-label", hidden ? "Mostrar panel" : "Ocultar panel");
    dom.panelToggle.textContent = hidden ? "☰" : "×";
  }
  if (persist) localStorage.setItem("history_panel_hidden", String(hidden));
  resizeHistoryMap();
}

function getOperationId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("op") || localStorage.getItem("active_operation_id");
}

function attachRecordingDownloads(recordings) {
  const byId = new Map(recordings.map(recording => [String(recording.id_recording), recording]));

  document.querySelectorAll(".historyRecordingDownload[data-recording-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const recording = byId.get(button.dataset.recordingId);
      if (!recording) return;

      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Descargando";

      try {
        const { blob, filename } = await downloadRecording(recording);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Error descargando grabacion", error);
        button.textContent = "Error";
        window.setTimeout(() => {
          button.textContent = originalText;
        }, 1800);
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          if (button.textContent !== originalText) button.textContent = originalText;
        }, 300);
      }
    });
  });
}

main();
