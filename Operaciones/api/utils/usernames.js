export function slug(s = "") {
  return s
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 30);
}

export async function generateUniqueUsername(base, client, ignoreId = null) {
  let username = base;
  let counter = 1;

  while (true) {
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

export async function generateUniqueApodo(baseApodo, client) {
  let attempt = 0;
  const cleanBase = (baseApodo || "").toString().trim().slice(0, 40) || "SinApodo";

  while (attempt < 20) {
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
