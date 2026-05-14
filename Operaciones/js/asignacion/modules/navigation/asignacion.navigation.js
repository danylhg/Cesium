import { btnBack, btnVolver, btnDashboardGo } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { 
  saveOperacionActual, 
  collectOperacionActual, 
  guardarOperacionBaseDatos, 
  syncOperacionCompleta 
} from "../operacion/operacion.service.js";
import { saveOperacionYAsignacion } from "../asignacion/asignacion.service.js";
import { removeStorage, readObjectStorage } from "../../core/storage.js";
import { STORAGE_OPERACION_ACTUAL, STORAGE_ASIGNACION_ACTUAL } from "../../core/constants.js";
import { renderHome } from "../../views/home.view.js";
import { renderCUT, renderCET, renderCelulas } from "../personal/personal.views.js";

export function bindNavigation() {
  btnBack.addEventListener("click", () => {
    if (state.categoria === "personal") {
      if (state.pasoPersonal === "vehiculos") {
        state.pasoPersonal = "celulas";
        renderCelulas();
        return;
      }

      if (state.pasoPersonal === "celulas") {
        state.pasoPersonal = "cet";
        renderCET();
        return;
      }

      if (state.pasoPersonal === "cet") {
        state.pasoPersonal = "cut";
        renderCUT();
        return;
      }

      if (state.pasoPersonal === "cut") {
        renderHome();
        return;
      }
    }

    if (state.categoria !== "personal") {
      renderHome();
      return;
    }
  });

  btnVolver.addEventListener("click", () => {
    removeStorage(STORAGE_OPERACION_ACTUAL);
    removeStorage(STORAGE_ASIGNACION_ACTUAL);
    window.location.href = "menu_inicial.html";
  });

  btnDashboardGo?.addEventListener("click", async () => {
    // 1. Guardar cambios en local
    saveOperacionActual();
    
    // 2. Sincronizar con el backend
    const fromForm = collectOperacionActual();
    const storedOp = readObjectStorage(STORAGE_OPERACION_ACTUAL, {});
    const estadoActual = {
      id_operacion: storedOp.id,
      estado_operacion: storedOp.estado
    };

    try {
      if (storedOp.id) {
        await guardarOperacionBaseDatos(fromForm, estadoActual);
        await syncOperacionCompleta(storedOp.id);
      }
      await saveOperacionYAsignacion();
    } catch (err) {
      console.error("Error al sincronizar cambios antes de ir al dashboard:", err);
    }

    window.location.href = "dashboard.html";
  });
}
