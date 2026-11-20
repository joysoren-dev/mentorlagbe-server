import { Router } from "express";
import { getDashboardOverview } from "../controllers/dashboard.controller";
import { verifyToken } from "../middlewares/auth.middleware";

const router = Router();

router.get("/overview", verifyToken, getDashboardOverview);

export default router;
