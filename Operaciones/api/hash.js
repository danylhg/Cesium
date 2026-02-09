import bcrypt from "bcryptjs";

const password = "1234"; // cambia esto por la contraseña que quieras

const hash = await bcrypt.hash(password, 10);
console.log("HASH:", hash);

// HASH: 
// desde la carpeta api ejecuta el comando: node hash.js
// INSERT INTO usuario (rol, nombre, apellido, puesto, username, password_hash, activo) VALUES ('CUT', 'Admin', 'Principal', 'Sistema', 'admin', 'HASH', TRUE);