import { state } from "../../core/state.js";
import { saveAsignacionActual } from "../asignacion/asignacion.service.js";
import { renderCelulas } from "./personal.views.js";

const logAlert = (message) => {
  if (message) console.warn(message);
};

export function abrirModalCrearGrupo(cetActivo) {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(15,23,42,.35)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const modal = document.createElement("div");
  modal.style.width = "520px";
  modal.style.maxWidth = "92vw";
  modal.style.background = "#fff";
  modal.style.borderRadius = "16px";
  modal.style.border = "1px solid #d7e3ff";
  modal.style.boxShadow = "0 24px 60px rgba(15,23,42,.20)";
  modal.style.padding = "16px";

  const title = document.createElement("div");
  title.style.fontWeight = "900";
  title.style.fontSize = "18px";
  title.style.textAlign = "center";
  title.style.marginBottom = "12px";
  title.textContent = "Crear Grupos";

  const row1 = document.createElement("div");
  row1.style.display = "flex";
  row1.style.gap = "10px";
  row1.style.alignItems = "center";
  row1.style.marginBottom = "10px";

  const lbl = document.createElement("div");
  lbl.style.fontWeight = "800";
  lbl.textContent = "Cuantos";

  const inpNum = document.createElement("input");
  inpNum.type = "number";
  inpNum.min = "1";
  inpNum.className = "inp";
  inpNum.style.width = "120px";

  row1.append(lbl, inpNum);

  const formWrap = document.createElement("div");
  formWrap.style.display = "flex";
  formWrap.style.flexDirection = "column";
  formWrap.style.gap = "10px";
  formWrap.style.marginTop = "6px";

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "8px";
  btnRow.style.justifyContent = "flex-end";
  btnRow.style.marginTop = "14px";

  const btnCancel = document.createElement("button");
  btnCancel.className = "btnGhost";
  btnCancel.textContent = "Cancelar";
  btnCancel.addEventListener("click", () => overlay.remove());

  const btnCreate = document.createElement("button");
  btnCreate.className = "btnPrimary";
  btnCreate.textContent = "Crear grupos";
  btnCreate.style.width = "180px";

  let nameInputs = [];

  function buildFields() {
    formWrap.innerHTML = "";
    nameInputs = [];

    const n = Number(inpNum.value || 0);
    if (!n || n < 1) return;

    for (let i = 0; i < n; i++) {
      const line = document.createElement("div");
      line.style.display = "flex";
      line.style.gap = "10px";
      line.style.alignItems = "center";

      const l = document.createElement("div");
      l.style.fontWeight = "800";
      l.style.width = "140px";
      l.textContent = "Nombre del grupo";

      const inp = document.createElement("input");
      inp.className = "inp";
      inp.value = "";
      nameInputs.push(inp);

      line.append(l, inp);
      formWrap.appendChild(line);
    }
  }

  inpNum.addEventListener("input", buildFields);

  btnCreate.addEventListener("click", () => {
    const names = nameInputs.map(i => i.value.trim()).filter(Boolean);
    const nExpected = Number(inpNum.value || 0);

    if (!nExpected || nExpected < 1) {
      logAlert("Pon un número válido en 'Cuantos'.");
      return;
    }

    if (names.length !== nExpected) {
      logAlert("Completa todos los nombres de grupo.");
      return;
    }

    const normalizedNewNames = names.map(name => name.toLowerCase());
    const hasDuplicateInModal = normalizedNewNames.some((name, index) => normalizedNewNames.indexOf(name) !== index);
    if (hasDuplicateInModal) {
      logAlert("No puede haber más de un grupo con el mismo nombre.");
      return;
    }

    const existingGroupNames = Object.values(state.gruposByCet || {})
      .flatMap(groupInfo => Array.isArray(groupInfo?.names) ? groupInfo.names : [])
      .map(name => String(name).trim().toLowerCase());

    const alreadyExists = normalizedNewNames.some(name => existingGroupNames.includes(name));
    if (alreadyExists) {
      logAlert("No puede haber más de un grupo con el mismo nombre.");
      return;
    }

    const reservedNames = new Set(["mando operativo"]);
    const matchesReservedName = normalizedNewNames.some(name => reservedNames.has(name));
    if (matchesReservedName) {
      logAlert("Ese nombre esta reservado para la operacion.");
      return;
    }

    const flotillaNames = Object.values(state.flotillaByCet || {})
      .map(name => String(name || "").trim().toLowerCase())
      .filter(Boolean);

    const matchesFlotilla = normalizedNewNames.some(name => flotillaNames.includes(name));
    if (matchesFlotilla) {
      logAlert("Un grupo no puede llamarse igual que una flotilla.");
      return;
    }

    const info = state.gruposByCet[cetActivo] || {
      names: [],
      active: null,
      map: {},
      idx: 0,
      vehActive: null
    };

    if (info.idx === undefined) info.idx = 0;
    if (info.vehActive === undefined) info.vehActive = null;

    names.forEach(g => {
      if (!info.names.includes(g)) {
        info.names.push(g);
        info.map[g] = info.map[g] || new Set();
      }
    });

    if (info.names.length > 0 && (!info.active || !info.names.includes(info.active))) {
      info.idx = Math.max(0, Math.min(info.idx, info.names.length - 1));
      info.active = info.names[info.idx];
    }

    if (!info.vehActive && info.names.length > 0) {
      info.vehActive = info.active || info.names[0];
    }

    state.gruposByCet[cetActivo] = info;
    saveAsignacionActual();
    overlay.remove();
    renderCelulas();
  });

  btnRow.append(btnCancel, btnCreate);
  modal.append(title, row1, formWrap, btnRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  inpNum.focus();
}
