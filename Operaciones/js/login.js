const API = `http://${window.location.hostname}:3001`;

document.getElementById("btnLogin").addEventListener("click", async () => {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value;
  const msg = document.getElementById("msg");
  msg.textContent = "";

  if (!u || !p) {
    msg.textContent = "Ingresa usuario y contraseña.";
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
      msg.textContent = data.mensaje ?? "Usuario o contraseña incorrectos.";
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
});
