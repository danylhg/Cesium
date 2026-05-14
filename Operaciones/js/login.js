const API = `http://${window.location.hostname}:3001`;

const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("btnLogin");
const msg = document.getElementById("msg");

function dismissKeyboard() {
  const active = document.activeElement;
  if (active && typeof active.blur === "function") {
    active.blur();
  }

  if (!document.body.hasAttribute("tabindex")) {
    document.body.setAttribute("tabindex", "-1");
  }
  document.body.focus({ preventScroll: true });
}

async function attemptLogin() {
  dismissKeyboard();

  const u = usernameInput.value.trim();
  const p = passwordInput.value;
  msg.textContent = "";

  if (!u || !p) {
    msg.textContent = "Ingresa usuario y contraseÃ±a.";
    return;
  }

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p }),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      msg.textContent = data.mensaje ?? "Usuario o contraseÃ±a incorrectos.";
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("userData", JSON.stringify(data.usuario));
    localStorage.setItem("rol", data.usuario.rol);
    localStorage.setItem("username", data.usuario.username);

    window.location.href = "menu_inicial.html";
  } catch {
    msg.textContent = "No se pudo conectar con el servidor.";
  }
}

usernameInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  passwordInput.focus();
});

passwordInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  attemptLogin();
});

loginButton.addEventListener("pointerdown", dismissKeyboard);
loginButton.addEventListener("click", attemptLogin);
