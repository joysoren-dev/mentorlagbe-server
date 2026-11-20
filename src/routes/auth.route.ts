import { Router } from "express";
import { syncAndIssueToken } from "../controllers/auth.controller";
import { verifyToken } from "../middlewares/auth.middleware";

const router = Router();

router.post("/sync", syncAndIssueToken);

router.get("/me", verifyToken, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

export default router;
