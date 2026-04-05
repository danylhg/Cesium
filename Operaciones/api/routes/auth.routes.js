import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { login, me } from "../controllers/auth.controller.js";

const router = Router();

router.post("/auth/login", login);
router.get("/me", requireAuth, me);

export default router;
