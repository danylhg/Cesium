if (localStorage.getItem("session") !== "ok") {
  window.location.href = "login.html";
}

const btnCreate = document.getElementById("btnCreate");
const btnSelect = document.getElementById("btnSelect");
const btnPersonal = document.getElementById("btnPersonal"); // ✅ NUEVO
const btnLogout = document.getElementById("btnLogout");

const opsList = document.getElementById("opsList");
const opsUl = document.getElementById("opsUl");

const API = "http://localhost:3001";

async function getOpsDB() {
  const token = localStorage.getItem("token");
  const r = await fetch(`${API}/ops`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await r.json().catch(() => null);

  if (!r.ok || (data && data.ok === false)) {
    throw new Error(data?.mensaje || `Error ${r.status}`);
  }

  return Array.isArray(data) ? data : (data.items || data.ops || []);
}

// logout
btnLogout.addEventListener("click", () => {
  localStorage.removeItem("session");
  window.location.href = "login.html";
});

// crear
btnCreate.addEventListener("click", () => {
  localStorage.removeItem("active_operation_id");
  window.location.href = "asignacion.html";
});

// seleccionar
btnSelect.addEventListener("click", async () => {
  opsUl.innerHTML = "";

  let ops = [];
  try {
    ops = await getOpsDB();
  } catch (e) {
    const li = document.createElement("li");
    li.textContent = "Error cargando operaciones";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = e.message;
    li.appendChild(tag);
    opsUl.appendChild(li);

    opsList.classList.remove("hidden");
    return;
  }

  if (!ops.length) {
    const li = document.createElement("li");
    li.textContent = "No hay operaciones creadas";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "vacío";
    li.appendChild(tag);
    opsUl.appendChild(li);
  } else {
    ops.forEach(op => {
      const li = document.createElement("li");
      li.textContent = `${op.nombre} (${op.codigo})`;

      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = op.estado || "abrir";
      li.appendChild(tag);

      li.addEventListener("click", () => {
        localStorage.setItem("active_operation_id", op.id_operacion);
        window.location.href = `asignacion.html?op=${encodeURIComponent(op.codigo)}`;
      });

      opsUl.appendChild(li);
    });
  }

  opsList.classList.remove("hidden");
});

// ✅ Control de personal
btnPersonal.addEventListener("click", () => {
  // Cambia esta ruta al nombre real de tu archivo si es diferente
  window.location.href = "control_personal.html";
});