const API = `http://${window.location.hostname}:3001`;

function getToken() {
  return localStorage.getItem("token");
}

function apiFetch(path, options = {}) {
  const token = getToken();
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

// ── Elementos DOM ────────────────────────────────────────────
const btnCreate        = document.getElementById("btnCreate");
const btnSelect        = document.getElementById("btnSelect");
const btnEmergency     = document.getElementById("btnEmergency");
const btnPersonal      = document.getElementById("btnPersonal");
const btnLogout        = document.getElementById("btnLogout");
const userName         = document.getElementById("userName");
const opsList          = document.getElementById("opsList");
const submenuControl   = document.getElementById("submenuControl");
const btnControlPersonal = document.getElementById("btnControlPersonal");
const btnControlVehiculos = document.getElementById("btnControlVehiculos");
const btnControlEquipos  = document.getElementById("btnControlEquipos");

// ── Inicialización ───────────────────────────────────────────
async function init() {
  // Validar sesión con el servidor (GET /me)
  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  let usuario;
  try {
    const res = await apiFetch("/me");
    if (!res.ok) throw new Error("no autorizado");
    usuario = await res.json();
  } catch {
    localStorage.removeItem("token");
    window.location.href = "login.html";
    return;
  }

  // Mostrar nombre del usuario desde el servidor
  userName.textContent = usuario.nombre ?? usuario.username;
}

// ── Logout ───────────────────────────────────────────────────
btnLogout.addEventListener("click", () => {
  // No hay endpoint de logout en el servidor; solo se descarta el token local
  localStorage.removeItem("token");
  window.location.href = "login.html";
});

// ── Crear operación ──────────────────────────────────────────
btnCreate.addEventListener("click", () => {
  localStorage.removeItem("active_operation_id");
  localStorage.removeItem("operacion_actual");
  localStorage.removeItem("asignacion_actual");
  sessionStorage.setItem("asignacion_entry", "create");
  window.location.href = "asignacion.html";
});

// ── Operación de emergencia ──────────────────────────────────
btnEmergency.addEventListener("click", () => {
  localStorage.removeItem("active_operation_id");
  localStorage.removeItem("operacion_actual");
  localStorage.removeItem("asignacion_actual");
  localStorage.setItem("operation_mode", "emergency");
  sessionStorage.setItem("asignacion_entry", "create");
  window.location.href = "asignacion.html";
});

// ── Seleccionar operación ────────────────────────────────────
let allOps = [];

btnSelect.addEventListener("click", async () => {
  if (!opsList.classList.contains("hidden")) {
    opsList.classList.add("hidden");
    return;
  }

  // Cerrar submenú de sistema de control si está abierto
  submenuControl.classList.add("hidden");
  opsList.classList.remove("hidden");

  try {
    const res = await apiFetch("/ops");
    if (!res.ok) throw new Error("error al cargar operaciones");
    const data = await res.json();
    allOps = data.items ?? [];
  } catch {
    allOps = [];
  }

  renderOps(allOps);
});

// ── Filtros y Categorías ─────────────────────────────────────
const searchOpName = document.getElementById("searchOpName");
const searchOpDate = document.getElementById("searchOpDate");
const searchOpState = document.getElementById("searchOpState");

function handleFilters() {
  const text = searchOpName ? searchOpName.value.toLowerCase() : "";
  const date = searchOpDate ? searchOpDate.value : "";
  const state = searchOpState ? searchOpState.value : "todas";

  const filtered = allOps.filter(op => {
    let pClass = (op.estado ?? "PLANIFICADA").toLowerCase();
    if (pClass === "terminada" || pClass === "pasada") pClass = "cerrada";

    const matchName = op.nombre.toLowerCase().includes(text);
    let matchDate = true;
    if (date) {
      matchDate = op.fecha_inicio && op.fecha_inicio.startsWith(date);
    }
    let matchState = true;
    if (state !== "todas") {
      matchState = (pClass === state);
    }

    return matchName && matchDate && matchState;
  });

  renderOps(filtered);
}

if (searchOpName) searchOpName.addEventListener("input", handleFilters);
if (searchOpDate) searchOpDate.addEventListener("change", handleFilters);
if (searchOpState) searchOpState.addEventListener("change", handleFilters);

function renderOps(ops) {
  const opsUl = document.getElementById("opsUl");
  if (!opsUl) return;
  
  opsUl.innerHTML = "";

  if (!ops.length) {
    const li = document.createElement("li");
    li.textContent = "No hay operaciones que coincidan";
    opsUl.appendChild(li);
    return;
  }

  ops.forEach(op => {
    let pClass = (op.estado ?? "PLANIFICADA").toLowerCase();
    if (pClass === "terminada" || pClass === "pasada") pClass = "cerrada";
    
    const li = document.createElement("li");
    li.textContent = op.nombre;

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = pClass.charAt(0).toUpperCase() + pClass.slice(1);

    if (pClass === "activa") {
      tag.style.background = "#00ffa6";
      tag.style.color = "#001b1b";
      tag.style.border = "none";
    } else if (pClass === "cancelada") {
      tag.style.background = "rgba(239, 68, 68, 0.4)";
      tag.style.color = "#ffdede";
      tag.style.border = "1px solid #ef4444";
    } else if (pClass === "cerrada") {
      tag.style.background = "rgba(59, 130, 246, 0.4)";
      tag.style.color = "#dbeafe";
      tag.style.border = "1px solid #3b82f6";
    }

    // Contenedor para la parte derecha (tag + basura)
    const rightSide = document.createElement("div");
    rightSide.style.display = "flex";
    rightSide.style.alignItems = "center";
    rightSide.appendChild(tag);

    // Botón de eliminar (basura) solo para cerradas y canceladas
    if (pClass === "cerrada" || pClass === "cancelada") {
      const btnDel = document.createElement("button");
      btnDel.className = "btnDeleteOp";
      btnDel.innerHTML = "🗑️";
      btnDel.title = "Eliminar operación permanentemente";
      
      btnDel.addEventListener("click", async (e) => {
        e.stopPropagation(); // Evitar entrar al historial
        
        const confirmMsg = `¿Seguro que quieres eliminar permanentemente la operación "${op.nombre}"?\n\nEsta acción no se puede deshacer y borrará TODO el historial relacionado.`;
        if (!confirm(confirmMsg)) return;

        try {
          const res = await apiFetch(`/ops/${op.id_operacion}/remove`, { method: "DELETE" });
          if (res.ok) {
            // Eliminar de allOps y volver a filtrar/renderizar
            allOps = allOps.filter(x => x.id_operacion !== op.id_operacion);
            handleFilters();
          } else {
            const data = await res.json().catch(() => ({}));
            alert(`Error al eliminar: ${data.mensaje || res.statusText}`);
          }
        } catch (err) {
          console.error(err);
          alert("Error de conexión al intentar eliminar la operación.");
        }
      });
      
      rightSide.appendChild(btnDel);
    }

    li.appendChild(rightSide);

    li.addEventListener("click", async () => {
      try {
        const res = await apiFetch(`/ops/${op.id_operacion}`);
        if (!res.ok) throw new Error("error al cargar operación");
        const opData = await res.json();
        localStorage.setItem("active_operation_id", opData.id_operacion);
        localStorage.setItem("operacion_actual", JSON.stringify(opData));
      } catch {
        localStorage.setItem("active_operation_id", op.id_operacion);
      }

      if (pClass === "activa") {
        localStorage.setItem("force_open_chat", "true");
        window.location.href = "dashboard.html";
      } else if (pClass === "planificada") {
        window.location.href = "dashboard.html";
      } else {
        window.location.href = `historial.html?id=${op.id_operacion}`;
      }
    });

    opsUl.appendChild(li);
  });
}

// ── Submenú personal ─────────────────────────────────────────
btnPersonal.addEventListener("click", () => {
  // Cerrar lista de operaciones si está abierta
  opsList.classList.add("hidden");
  submenuControl.classList.toggle("hidden");
});

btnControlPersonal.addEventListener("click", () => {
  window.location.href = "control_personal.html";
});

btnControlVehiculos.addEventListener("click", () => {
  window.location.href = "control_vehiculos.html";
});

btnControlEquipos.addEventListener("click", () => {
  window.location.href = "control_equipos.html";
});

// ── Arrancar ─────────────────────────────────────────────────
init();
