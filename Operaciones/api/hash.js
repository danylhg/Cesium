import bcrypt from "bcryptjs";

const password = "1234"; // cambia esto por la contraseña que quieras

const hash = await bcrypt.hash(password, 10);
console.log("HASH:", hash);

// HASH: $2b$10$Ko0V8NVqB33KP9M/DazmfepTc4qpRhsmcSXNoyJ7G9x6OC3S1rTQ2
