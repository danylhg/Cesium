document.getElementById("btnLogin").addEventListener("click", async () => {
  const u   = document.getElementById("username").value.trim();
  const p   = document.getElementById("password").value;
  const msg = document.getElementById("msg");
  msg.textContent = "";

  if (!u || !p) {
    msg.textContent = "Ingresa usuario y contraseña.";
    return;
  }

  try {
    const API = `http://${window.location.hostname}:3001`;
    const r = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p }),
    });

    const data = await r.json();

    // Error del servidor
    if (!r.ok || !data.ok) {
      msg.textContent = data?.mensaje ?? "Usuario o contraseña incorrectos.";
      return;
    }

    const rol = data.usuario?.rol ?? "";

    // ── Control de acceso web ─────────────────────────────────────────────
    // Solo ADMIN y CUT pueden usar el panel web
    // CET y CELL solo usan la app móvil
    if (rol !== "ADMIN" && rol !== "CUT") {
      msg.textContent = "Este acceso es solo para mandos. Usa la aplicación móvil.";
      return;
    }

    // Guardar sesión
    localStorage.setItem("session", "ok");
    localStorage.setItem("token",    data.token);
    localStorage.setItem("username", data.usuario.username);
    localStorage.setItem("rol",      rol);
    localStorage.setItem("nombre",   data.usuario.nombre ?? "");

    // Ir al menú
    window.location.href = "menu_inicial.html";

  } catch (e) {
    msg.textContent = "No se pudo conectar al servidor.";
  }
});