import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resuelve el archivo .env ubicado en la raiz de Operaciones/api,
// sin depender del directorio desde donde se arranque Node.
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");

// Carga las variables de entorno antes de exportar la configuracion.
config({ path: envPath });

// Lee una variable obligatoria y falla temprano si no existe o esta vacia.
function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta configurar la variable de entorno ${name}`);
  }

  return value;
}

// Clave usada para firmar y verificar tokens JWT.
export const JWT_SECRET = requireEnv("JWT_SECRET");

// Puerto HTTP del API. Si no se define PORT, usa 3001 para desarrollo local.
export const PORT = Number(process.env.PORT || 3001);

// Token de Cesium usado por los clientes que consumen mapas/visualizacion.
export const CESIUM_TOKEN = requireEnv("CESIUM_TOKEN");
