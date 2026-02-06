import express from "express";
import cors from "cors";
import { pool } from "./db.js";

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// ruta de prueba
app.get("/health", (req, res) => {
  res.json({ ok: true, mensaje: "API funcionando" });
});

// prueba de DB
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      conectado: true,
      hora_db: result.rows[0].now,
    });
  } catch (err) {
    res.status(500).json({
      conectado: false,
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API en http://localhost:${PORT}`);
});
