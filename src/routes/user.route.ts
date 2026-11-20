import { Router } from "express";
import {
  getCurrentUserProfile,
  updateProfile,
  getAllUsersForAdmin,
  updateUserRoleByAdmin,
} from "../controllers/user.controller";
import { verifyToken, verifyAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Logged-in user profile routes (Student, Tutor, Admin)
router.get("/profile", verifyToken, getCurrentUserProfile);
router.patch("/profile", verifyToken, updateProfile);

// Admin user management routes
router.get("/", verifyToken, verifyAdmin, getAllUsersForAdmin);
router.patch("/:id/role", verifyToken, verifyAdmin, updateUserRoleByAdmin);

export default router;
