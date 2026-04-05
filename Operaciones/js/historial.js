// Session validation is now handled globally by js/auth_check.js

document.getElementById("backBtn").onclick = () => {
  window.location.href = "dashboard.html";
};

const HISTORY_KEY = "ops_history";
const historyOps = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");

const list = document.getElementById("historyList");

if (historyOps.length === 0) {
  list.innerHTML = "<p>No hay operaciones en el historial.</p>";
} else {
  historyOps.forEach(op => {
    const km = (op.route?.distance ?? 0) / 1000;
    const min = (op.route?.duration ?? 0) / 60;

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <strong>${escapeHtml(op.title)}</strong><br/>
      <span>${escapeHtml(op.description || "")}</span>
      <div class="meta">
        Origen: (${op.start.lat.toFixed(5)}, ${op.start.lng.toFixed(5)})<br/>
        Destino: (${op.end.lat.toFixed(5)}, ${op.end.lng.toFixed(5)})<br/>
        Ruta: ${km.toFixed(2)} km · ${min.toFixed(1)} min<br/>
        ${new Date(op.created_at).toLocaleString()}
      </div>
    `;
    list.appendChild(div);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

