(function() {
  const session = localStorage.getItem("session");
  const token = localStorage.getItem("token");

  // Si no hay sesión u falta el token, expulsar al login inmediatamente
  if (session !== "ok" || !token) {
    console.warn("Acceso denegado: No hay sesión activa. Redirigiendo al login...");
    window.location.href = "login.html";
  }
})();
