import { loadReplay } from "./historial/historial.api.js";
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
    renderTopbar(replay);
    renderOperationInfo(replay);
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

main();
