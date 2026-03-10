document.getElementById("btnLogin").addEventListener("click", async () => {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value;
  const msg = document.getElementById("msg");
  msg.textContent = "";

  try {
    const API = `http://${window.location.hostname}:3001`;
    const r = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p }),
    });

    const data = await r.json();

    if (!r.ok || !data.ok) {
      msg.textContent = data?.mensaje ?? "Usuario o contraseña incorrectos.";
      return;
    }

    // Guardar sesión
    localStorage.setItem("session", "ok");
    localStorage.setItem("token", data.token);
    localStorage.setItem("username", u);

    // Ir al menú
    window.location.href = "menu_inicial.html";
  } catch (e) {
    msg.textContent = "No se pudo conectar al servidor.";
  }
});
