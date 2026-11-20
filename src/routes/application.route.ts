import { Router } from "express";
import {
  applyForTuition,
  getStudentMyApplications,
  getTutorReceivedApplications,
  updateApplicationStatusByTutor,
} from "../controllers/application.controller";
import {
  verifyToken,
  verifyStudent,
  verifyTutor,
} from "../middlewares/auth.middleware";

const router = Router();

// Student routes
router.post("/", verifyToken, verifyStudent, applyForTuition);
router.get(
  "/my-applications",
  verifyToken,
  verifyStudent,
  getStudentMyApplications,
);

// Tutor routes
router.get("/tutor", verifyToken, verifyTutor, getTutorReceivedApplications);
router.patch(
  "/:id/status",
  verifyToken,
  verifyTutor,
  updateApplicationStatusByTutor,
);

export default router;
