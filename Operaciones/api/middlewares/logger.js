// Middleware simple de bitacora para ver en consola cada peticion entrante.
export function requestLogger(req, res, next) {
  // Registra metodo y URL antes de pasar al siguiente middleware/ruta.
  console.log("➡️", req.method, req.url);
  next();
}
