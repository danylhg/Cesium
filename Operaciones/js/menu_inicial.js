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
const opsUl            = document.getElementById("opsUl");
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
btnSelect.addEventListener("click", async () => {
  if (!opsList.classList.contains("hidden")) {
    opsList.classList.add("hidden");
    return;
  }

  // Cerrar submenú de sistema de control si está abierto
  submenuControl.classList.add("hidden");

  opsUl.innerHTML = "<li>Cargando...</li>";
  opsList.classList.remove("hidden");

  // GET /ops → { ok, items: [{ id_operacion, nombre, estado, fecha_inicio, ... }] }
  let ops = [];
  try {
    const res = await apiFetch("/ops");
    if (!res.ok) throw new Error("error al cargar operaciones");
    const data = await res.json();
    ops = data.items ?? [];
  } catch {
    opsUl.innerHTML = "<li>Error al cargar operaciones</li>";
    return;
  }

  opsUl.innerHTML = "";

  if (!ops.length) {
    const li = document.createElement("li");
    li.textContent = "No hay operaciones creadas";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "vacío";
    li.appendChild(tag);
    opsUl.appendChild(li);
    return;
  }

  ops.forEach(op => {
    // El backend devuelve estado en MAYÚSCULAS; normalizamos a minúsculas para los estilos
    const pClass = (op.estado ?? "PLANIFICADA").toLowerCase();

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
    } else if (pClass === "terminada") {
      tag.style.background = "rgba(59, 130, 246, 0.4)";
      tag.style.color = "#dbeafe";
      tag.style.border = "1px solid #3b82f6";
    }

    li.appendChild(tag);

    li.addEventListener("click", async () => {
      // Cargar datos frescos de la operación desde el servidor (GET /ops/:id)
      try {
        const res = await apiFetch(`/ops/${op.id_operacion}`);
        if (!res.ok) throw new Error("error al cargar operación");
        const opData = await res.json();
        localStorage.setItem("active_operation_id", opData.id_operacion);
        localStorage.setItem("operacion_actual", JSON.stringify(opData));
      } catch {
        // Si falla la carga, igual navegar con el id disponible
        localStorage.setItem("active_operation_id", op.id_operacion);
      }

      if (pClass === "activa") {
        localStorage.setItem("force_open_chat", "true");
        window.location.href = "dashboard.html";
      } else if (pClass === "planificada") {
        window.location.href = "dashboard.html";
      } else {
        window.location.href = "asignacion.html";
      }
    });

    opsUl.appendChild(li);
  });
});

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
