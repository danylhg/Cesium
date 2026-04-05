import { state } from '../../core/state.js';

export function getGrupoDeCelula(cet, celula) {
  const ginfo = state.gruposByCet[cet];
  if (!ginfo || !ginfo.map) return "";

  for (const gName of Object.keys(ginfo.map)) {
    const set = ginfo.map[gName];
    if (set && set.has(celula)) return gName;
  }
  return "";
}

export function celulaRow({ name, selected = false, disabled = false, status = "Disponible", onToggle }) {
  const row = document.createElement("div");
  row.className = "item" + (selected ? " selected" : "") + (disabled ? " disabled" : "");

  const left = document.createElement("div");
  left.className = "itemName";
  left.textContent = name;

  const right = document.createElement("div");
  right.className = "badgeRight";
  right.textContent = status;

  row.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) onToggle();
  });

  row.append(left, right);
  return row;
}
