import { Router, Request, Response } from "express";
import {
  loginUser,
  registerUser,
  syncAndIssueToken,
} from "../controllers/auth.controller";
import { verifyToken } from "../middlewares/auth.middleware";

const router = Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/sync", syncAndIssueToken);

router.get("/me", verifyToken, (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    user: (req as Request & { user?: unknown }).user,
  });
});

export default router;
