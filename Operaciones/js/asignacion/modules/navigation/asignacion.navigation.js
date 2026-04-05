import { btnBack, btnVolver, btnDashboardGo } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { saveOperacionActual } from "../operacion/operacion.service.js";
import { saveOperacionYAsignacion } from "../asignacion/asignacion.service.js";
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

  // BACKEND: btnVolver y btnDashboardGo se vuelven async. Se hace await saveOperacionYAsignacion() (5 endpoints en secuencia) antes de navegar.
  // Solo si todas las llamadas responden ok se navega; si falla se muestra error.
  btnVolver.addEventListener("click", () => {
    saveOperacionYAsignacion(saveOperacionActual);
    window.location.href = "menu_inicial.html";
  });

  btnDashboardGo?.addEventListener("click", () => {
    saveOperacionYAsignacion(saveOperacionActual);
    window.location.href = "dashboard.html";
  });
}
