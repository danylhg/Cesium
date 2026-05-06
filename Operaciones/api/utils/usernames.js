// Convierte un texto libre en una base segura para username:
// minusculas, sin acentos, separadores con punto y longitud acotada.
export function slug(s = "") {
  return s
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 30);
}

// Genera un username unico en la tabla personal.
// Si existe, agrega un contador incremental al final de la base.
export async function generateUniqueUsername(base, client, ignoreId = null) {
  let username = base;
  let counter = 1;

  while (true) {
    // ignoreId permite editar un registro sin chocar contra su propio username.
    const { rowCount } = await client.query(
      `SELECT 1 FROM personal
       WHERE username = $1
       ${ignoreId ? "AND id_personal <> $2" : ""}`,
      ignoreId ? [username, ignoreId] : [username]
    );

    if (rowCount === 0) break;

    username = `${base}${counter}`;
    counter++;
  }

  return username;
}

// Genera un apodo unico para personal.
// Intenta variantes cortas y, como ultimo recurso, usa timestamp.
export async function generateUniqueApodo(baseApodo, client) {
  let attempt = 0;
  // Mantiene el apodo dentro del limite esperado por la interfaz/base.
  const cleanBase = (baseApodo || "").toString().trim().slice(0, 40) || "SinApodo";

  while (attempt < 20) {
    // Primer intento: apodo limpio. Siguientes: agrega un numero corto.
    const suffix = attempt === 0 ? "" : ` ${Math.floor(10 + Math.random() * 90)}`;
    const apodo = `${cleanBase}${suffix}`.slice(0, 40);

    const { rows } = await client.query(
      `SELECT 1 FROM personal WHERE apodo = $1 LIMIT 1`,
      [apodo]
    );

    if (rows.length === 0) return apodo;
    attempt++;
  }

  return `${cleanBase}-${Date.now()}`.slice(0, 40);
}
