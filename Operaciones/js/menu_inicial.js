if (localStorage.getItem("session") !== "ok") {
  window.location.href = "login.html";
}

const btnCreate = document.getElementById("btnCreate");
const btnSelect = document.getElementById("btnSelect");
const btnPersonal = document.getElementById("btnPersonal"); // ✅ NUEVO
const btnLogout = document.getElementById("btnLogout");

const opsList = document.getElementById("opsList");
const opsUl = document.getElementById("opsUl");

const STORAGE_OPS = "operations";

function getOps() {
  const raw = localStorage.getItem(STORAGE_OPS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
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
btnSelect.addEventListener("click", () => {
  opsUl.innerHTML = "";
  const ops = getOps();

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
      li.textContent = op.name;

      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "abrir";
      li.appendChild(tag);

      li.addEventListener("click", () => {
        localStorage.setItem("active_operation_id", op.id);
        window.location.href = "asignacion.html";
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
