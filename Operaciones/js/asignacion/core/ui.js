import {
  panel,
  rightTitle,
  rightHint,
  btnAccion,
  btnBack,
  leftCardTitleEl,
  opInfoFormEl,
  vehiculosLeftEl,
  dashboardWrap
} from "./dom.js";
import { capFirst } from "./utils.js";

export function showOperacionInfo() {
  if (leftCardTitleEl) leftCardTitleEl.textContent = "Información de operación";
  if (opInfoFormEl) opInfoFormEl.style.display = "flex";
  if (vehiculosLeftEl) {
    vehiculosLeftEl.style.display = "none";
    vehiculosLeftEl.innerHTML = "";
  }
}

export function showVehiculosLeftPanel(title = "Asignación de personal al vehículo") {
  if (leftCardTitleEl) leftCardTitleEl.textContent = title;
  if (opInfoFormEl) opInfoFormEl.style.display = "none";
  if (vehiculosLeftEl) {
    vehiculosLeftEl.style.display = "block";
    vehiculosLeftEl.innerHTML = "";
  }
}

export function hideDashboardButton() {
  if (dashboardWrap) dashboardWrap.style.display = "none";
}

export function showDashboardButton() {
  if (dashboardWrap) dashboardWrap.style.display = "flex";
}

export function setHeader(title, hint) {
  if (rightTitle) rightTitle.textContent = capFirst(title);
  if (rightHint) rightHint.textContent = capFirst(hint);
}

export function setAccion(text, disabled = false) {
  if (btnAccion) {
    btnAccion.textContent = capFirst(text);
    btnAccion.disabled = !!disabled;
  }
}

export function showBack(show) {
  if (btnBack) btnBack.style.visibility = show ? "visible" : "hidden";
}

export function clearPanel() {
  if (panel) panel.innerHTML = "";
}

export function getScrollTopInPanel() {
  return panel?.querySelector(".listBox")?.scrollTop ?? 0;
}

export function restoreScrollTop(listBoxEl, scrollTop) {
  if (!listBoxEl) return;
  requestAnimationFrame(() => {
    listBoxEl.scrollTop = scrollTop;
  });
}

export function mkOpt(txt) {
  const b = document.createElement("button");
  b.className = "optBtn";
  b.textContent = capFirst(txt);
  return b;
}