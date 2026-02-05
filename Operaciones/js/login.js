document.getElementById("btnLogin").addEventListener("click", () => {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value;
  const msg = document.getElementById("msg");
  msg.textContent = "";

  const OK_USER = "admin";
  const OK_PASS = "1234";

  if (u === OK_USER && p === OK_PASS) {
    localStorage.setItem("session", "ok");
    localStorage.setItem("username", u);
    window.location.href = "menu_inicial.html"; // 👈 aquí
  } else {
    msg.textContent = "Usuario o contraseña incorrectos.";
  }
});


