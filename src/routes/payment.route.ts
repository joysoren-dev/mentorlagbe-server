import { Router } from "express";
import {
  createCheckoutSession,
  verifyCheckoutSession,
  getAllPaymentsForAdmin,
} from "../controllers/payment.controller";
import { verifyToken, verifyAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.post("/create-checkout-session", verifyToken, createCheckoutSession);
router.post("/verify-session", verifyToken, verifyCheckoutSession);
router.get("/", verifyToken, verifyAdmin, getAllPaymentsForAdmin);

export default router;
