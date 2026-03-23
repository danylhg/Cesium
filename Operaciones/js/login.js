const btnLogin = document.getElementById("btnLogin");
const inputUsername = document.getElementById("username");
const inputPassword = document.getElementById("password");
const msg = document.getElementById("msg");

function limpiarSesion() {
  localStorage.removeItem("session");
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("rol");
  localStorage.removeItem("nombre");
  localStorage.removeItem("active_operation_id");
}

async function hacerLogin() {
  if (!inputUsername || !inputPassword || !msg) return;

  const u = inputUsername.value.trim();
  const p = inputPassword.value;

  msg.textContent = "";

  // Validaciones básicas
  if (!u || !p) {
    msg.textContent = "Ingresa usuario y contraseña.";
    return;
  }

  btnLogin.disabled = true;
  msg.textContent = "Validando acceso...";

  try {
    const API = `http://${window.location.hostname}:3001`;

    let r;
    try {
      r = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
    } catch {
      throw new Error("NETWORK");
    }

    const data = await r.json().catch(() => null);

    if (!r.ok || !data?.ok) {
      msg.textContent = data?.mensaje || "Usuario o contraseña incorrectos.";
      return;
    }

    const token = data?.token;
    const usuario = data?.usuario;
    const rol = usuario?.rol ?? "";
    const username = usuario?.username ?? "";
    const nombre = usuario?.nombre ?? "";

    // Validar estructura de respuesta
    if (!token || !usuario || !username || !rol) {
      msg.textContent = "Respuesta inválida del servidor.";
      return;
    }

    // Control de acceso web
    if (rol !== "ADMIN" && rol !== "CUT") {
      limpiarSesion();
      msg.textContent = "Este acceso es solo para mandos. Usa la aplicación móvil.";
      return;
    }

    // Limpiar sesión previa antes de guardar nueva
    limpiarSesion();

    localStorage.setItem("session", "ok");
    localStorage.setItem("token", token);
    localStorage.setItem("username", username);
    localStorage.setItem("rol", rol);
    localStorage.setItem("nombre", nombre);

    msg.textContent = "Acceso correcto...";
    window.location.href = "menu_inicial.html";

  } catch (e) {
    if (e.message === "NETWORK") {
      msg.textContent = "No se pudo conectar al servidor.";
    } else {
      msg.textContent = "Ocurrió un error al iniciar sesión.";
    }
  } finally {
    btnLogin.disabled = false;
  }
}

if (btnLogin) {
  btnLogin.addEventListener("click", hacerLogin);
}

// Permitir Enter
if (inputUsername) {
  inputUsername.addEventListener("keydown", (e) => {
    if (e.key === "Enter") hacerLogin();
  });
}

if (inputPassword) {
  inputPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") hacerLogin();
  });
}