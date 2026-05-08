import { downloadRecording, loadReplay, loadStreamRecordings } from "./historial/historial.api.js";
import { dom, readHistoryDom } from "./historial/historial.dom.js";
import { initHistoryMap, buildMapEntities, focusOnReplay } from "./historial/historial.map.js";
import { initTimeline, setReplayData } from "./historial/historial.timeline.js";
import { renderError, renderOperationInfo, renderTopbar, renderChatMessages } from "./historial/historial.ui.js";

readHistoryDom();

dom.backBtn?.addEventListener("click", () => {
  window.location.href = "menu_inicial.html";
});

async function main() {
  const operationId = getOperationId();

  if (!operationId) {
    renderError("No se encontró el id de operación. Abre historial.html?id=3 o selecciona una operación cerrada.");
    return;
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
    renderTopbar(replay);
    renderOperationInfo(replay);
    attachRecordingDownloads(replay.recordings || []);
    setReplayData(replay);
    buildMapEntities(replay);
    renderChatMessages(replay.timeline?.eventos || []);
    focusOnReplay(replay);
  } catch (error) {
    console.error("Error cargando replay", error);
    renderError(error.message || "No se pudo cargar el historial de la operación.");
  }
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
