(function() {
  const session = localStorage.getItem("session");
  const token = localStorage.getItem("token");
  const opId = localStorage.getItem("active_operation_id");

  // 1. Validar sesión global
  if (session !== "ok" || !token) {
    console.warn("Acceso denegado: No hay sesión activa. Redirigiendo al login...");
    window.location.href = "login.html";
    return;
  }

  // 2. Validar operación activa (solo para dashboard)
  if (!opId) {
    console.warn("Acceso denegado: No hay operación seleccionada. Redirigiendo al menú...");
    window.location.href = "menu_inicial.html";
  }
})();
