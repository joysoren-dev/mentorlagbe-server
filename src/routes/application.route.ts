import { Router } from "express";
import {
  createApplication,
  getMyApplications,
  getTutorApplications,
  updateApplicationStatus,
  deleteApplication,
} from "../controllers/application.controller";
import {
  verifyToken,
  verifyStudent,
  verifyTutor,
} from "../middlewares/auth.middleware";

const router = Router();

router.post("/", verifyToken, verifyStudent, createApplication);
router.get("/my-applications", verifyToken, verifyStudent, getMyApplications);
router.delete("/:id", verifyToken, verifyStudent, deleteApplication);

router.get("/tutor", verifyToken, verifyTutor, getTutorApplications);
router.patch("/:id/status", verifyToken, verifyTutor, updateApplicationStatus);

export default router;
