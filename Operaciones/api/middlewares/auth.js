import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : null;

  if (!tok) {
    return res.status(401).json({ ok: false, mensaje: "Falta token" });
  }

  try {
    const payload = jwt.verify(tok, JWT_SECRET);
    req.user = payload; // { sub, username, rol }
    next();
  } catch {
    return res.status(401).json({ ok: false, mensaje: "Token inválido" });
  }
}
