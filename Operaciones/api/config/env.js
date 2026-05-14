import "dotenv/config";

export const JWT_SECRET = process.env.JWT_SECRET || "cambia_esto";
export const PORT = process.env.PORT || 3001;
export const CESIUM_TOKEN = process.env.CESIUM_TOKEN || "";
