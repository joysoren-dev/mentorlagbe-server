import { Router } from "express";
import {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  getAllUsersForAdmin,
  updateUserRoleByAdmin,
  upgradeToPro,
} from "../controllers/user.controller";
import { verifyToken, verifyAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.get("/me", verifyToken, getCurrentUserProfile);
router.patch("/me", verifyToken, updateCurrentUserProfile);
router.post("/upgrade-pro", verifyToken, upgradeToPro);

router.get("/", verifyToken, verifyAdmin, getAllUsersForAdmin);
router.patch("/:id/role", verifyToken, verifyAdmin, updateUserRoleByAdmin);

export default router;
