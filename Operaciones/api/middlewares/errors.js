import { sendError } from "../utils/http.js";
import { sendDbError } from "../utils/dbErrors.js";

// 413 - Payload demasiado grande
export function payloadTooLarge(err, _req, res, next) {
  if (err.type === "entity.too.large") {
    return sendError(res, 413, "El cuerpo de la petición supera el límite permitido (10 MB).");
  }
  next(err);
}

// JSON mal formado
export function malformedJson(err, _req, res, next) {
  if (err.type === "entity.parse.failed") {
    return sendError(res, 400, "JSON inválido. Revisa la sintaxis del cuerpo enviado.", {
      detalle: err.message,
    });
  }
  next(err);
}

// Catch-all: cualquier error no manejado antes
export function unhandledError(err, _req, res, _next) {
  console.error("[UNHANDLED ERROR]", err);
  return sendDbError(res, err, "Error interno no controlado");
}
