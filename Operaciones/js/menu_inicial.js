// ===============================
// Validación de sesión
// ===============================
const sessionOk = localStorage.getItem("session") === "ok";
const tokenGuard = localStorage.getItem("token");
const usernameGuard =
  localStorage.getItem("username") ||
  localStorage.getItem("userName") ||
  localStorage.getItem("usuario") ||
  "Invitado";

const userNameEl = document.getElementById("userName");

if (!sessionOk || !tokenGuard) {
  localStorage.removeItem("session");
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("userName");
  localStorage.removeItem("usuario");
  localStorage.removeItem("active_operation_id");
  window.location.href = "login.html";
}

// mostrar usuario que inició sesión
if (userNameEl) {
  userNameEl.textContent = usernameGuard;
}

// ===============================
// Referencias DOM
// ===============================
const btnCreate = document.getElementById("btnCreate");
const btnSelect = document.getElementById("btnSelect");
const btnPersonal = document.getElementById("btnPersonal");
const btnLogout = document.getElementById("btnLogout");

const opsList = document.getElementById("opsList");
const opsUl = document.getElementById("opsUl");

const submenuControl = document.getElementById("submenuControl");
const btnControlPersonal = document.getElementById("btnControlPersonal");
const btnControlVehiculos = document.getElementById("btnControlVehiculos");
const btnControlEquipos = document.getElementById("btnControlEquipos");

const API = `http://${window.location.hostname}:3001`;

const ESTADOS_VALIDOS = [
  "planificada",
  "activa",
  "cerrada",
  "cancelada",
  "finalizada"
];

let cargandoOps = false;

// ===============================
// Helpers UI
// ===============================
function hideOpsPanel() {
  if (opsList) opsList.classList.add("hidden");
}

function showOpsPanel() {
  if (opsList) opsList.classList.remove("hidden");
}

function hideControlPanel() {
  if (submenuControl) submenuControl.classList.add("hidden");
}

function showControlPanel() {
  if (submenuControl) submenuControl.classList.remove("hidden");
}

function toggleOpsPanelExclusive() {
  if (!opsList) return;

  const estabaOculto = opsList.classList.contains("hidden");

  hideControlPanel();

  if (estabaOculto) {
    showOpsPanel();
  } else {
    hideOpsPanel();
  }
}

function toggleControlPanelExclusive() {
  if (!submenuControl) return;

  const estabaOculto = submenuControl.classList.contains("hidden");

  hideOpsPanel();

  if (estabaOculto) {
    showControlPanel();
  } else {
    hideControlPanel();
  }
}

function limpiarSesionYRedirigir(msg) {
  localStorage.removeItem("session");
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("userName");
  localStorage.removeItem("usuario");
  localStorage.removeItem("active_operation_id");

  if (msg) {
    alert(msg);
  }

  window.location.href = "login.html";
}

function crearLiMensaje(texto, tagTexto = "") {
  const li = document.createElement("li");
  li.textContent = texto;

  if (tagTexto) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = tagTexto;
    li.appendChild(tag);
  }

  return li;
}

function normalizarEstado(estado) {
  const valor = String(estado || "").trim().toLowerCase();
  return ESTADOS_VALIDOS.includes(valor) ? valor : "desconocido";
}

// ===============================
// Backend
// ===============================
async function getOpsDB() {
  const token = localStorage.getItem("token");

  if (!token) {
    throw new Error("Sesión inválida. Inicia sesión nuevamente.");
  }

  let r;

  try {
    r = await fetch(`${API}/ops`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor.");
  }

  const data = await r.json().catch(() => null);

  if (r.status === 401 || r.status === 403) {
    limpiarSesionYRedirigir("Tu sesión expiró. Vuelve a iniciar sesión.");
    return [];
  }

  if (!r.ok || (data && data.ok === false)) {
    throw new Error(data?.mensaje || `Error ${r.status}`);
  }

  const ops = Array.isArray(data) ? data : (data?.items || data?.ops || []);

  if (!Array.isArray(ops)) {
    throw new Error("Formato de respuesta inválido.");
  }

  return ops;
}

// ===============================
// Logout
// ===============================
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    localStorage.removeItem("session");
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userName");
    localStorage.removeItem("usuario");
    localStorage.removeItem("active_operation_id");
    window.location.href = "login.html";
  });
}

// ===============================
// Crear operación
// ===============================
if (btnCreate) {
  btnCreate.addEventListener("click", () => {
    localStorage.removeItem("active_operation_id");
    window.location.href = "asignacion.html";
  });
}

// ===============================
// Seleccionar operación
// ===============================
if (btnSelect) {
  btnSelect.addEventListener("click", async () => {
    if (!opsList || !opsUl) return;
    if (cargandoOps) return;

    const panelEstabaAbierto = !opsList.classList.contains("hidden");

    if (panelEstabaAbierto) {
      hideOpsPanel();
      return;
    }

    hideControlPanel();
    showOpsPanel();

    cargandoOps = true;
    btnSelect.disabled = true;

    opsUl.innerHTML = "";
    opsUl.appendChild(crearLiMensaje("Cargando operaciones...", "espera"));

    try {
      const ops = await getOpsDB();

      opsUl.innerHTML = "";

      if (!ops.length) {
        opsUl.appendChild(crearLiMensaje("No hay operaciones creadas", "vacío"));
      } else {
        ops.forEach((op) => {
          const idOperacion = op?.id_operacion;
          const nombre = String(op?.nombre || "").trim() || "Sin nombre";
          const codigo = String(op?.codigo || "").trim() || "Sin código";
          const estado = normalizarEstado(op?.estado);

          const li = document.createElement("li");
          li.textContent = `${nombre} (${codigo})`;

          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = estado;
          li.appendChild(tag);

          if (!idOperacion) {
            tag.textContent = "inválida";
            li.style.opacity = "0.6";
            li.style.pointerEvents = "none";
            opsUl.appendChild(li);
            return;
          }

          li.addEventListener("click", () => {
            if (estado === "cancelada") {
              alert("Operación cancelada, se eliminará en 10 días.");
              return;
            }

            localStorage.setItem("active_operation_id", idOperacion);
            window.location.href = `dashboard.html?op=${encodeURIComponent(codigo)}`;
          });

          opsUl.appendChild(li);
        });
      }
    } catch (e) {
      opsUl.innerHTML = "";
      opsUl.appendChild(
        crearLiMensaje("Error cargando operaciones", e?.message || "desconocido")
      );
    } finally {
      cargandoOps = false;
      btnSelect.disabled = false;
    }
  });
}

// ===============================
// Sistema de control
// ===============================
if (btnPersonal && submenuControl) {
  btnPersonal.addEventListener("click", () => {
    toggleControlPanelExclusive();
  });
}

// ===============================
// Navegación control
// ===============================
if (btnControlPersonal) {
  btnControlPersonal.addEventListener("click", () => {
    hideControlPanel();
    window.location.href = "control_personal.html";
  });
}

if (btnControlVehiculos) {
  btnControlVehiculos.addEventListener("click", () => {
    hideControlPanel();
    window.location.href = "control_vehiculos.html";
  });
}

if (btnControlEquipos) {
  btnControlEquipos.addEventListener("click", () => {
    hideControlPanel();
    window.location.href = "control_equipos.html";
  });
}