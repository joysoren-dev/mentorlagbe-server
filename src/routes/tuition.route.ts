import { Router } from "express";
import {
  createTuition,
  getPublicTuitions,
  getSingleTuition,
  getTutorMyTuitions,
  updateTuitionByTutor,
  toggleTuitionActiveStatus,
  deleteTuitionByTutor,
} from "../controllers/tuition.controller";
import { verifyToken, verifyTutor } from "../middlewares/auth.middleware";

const router = Router();

// Public routes
router.get("/", getPublicTuitions);

// Tutor protected routes (keep /my-tuitions before /:id)
router.get("/my-tuitions", verifyToken, verifyTutor, getTutorMyTuitions);
router.post("/", verifyToken, verifyTutor, createTuition);
router.patch("/:id", verifyToken, verifyTutor, updateTuitionByTutor);
router.patch(
  "/:id/toggle",
  verifyToken,
  verifyTutor,
  toggleTuitionActiveStatus,
);
router.delete("/:id", verifyToken, verifyTutor, deleteTuitionByTutor);

// Single tuition details route
router.get("/:id", getSingleTuition);

export default router;
