import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getPackages,
  getFeaturedUsers,
  createFeaturedCheckout,
  verifyFeaturedCheckout,
  getMyFeatured,
  getFeaturedInvoice,
} from "../controllers/featured.controller.js";

const router = Router();

router.get("/packages", getPackages);
router.get("/", getFeaturedUsers);
router.get("/my", protect, getMyFeatured);
router.post("/checkout", protect, createFeaturedCheckout);
router.post("/verify", protect, verifyFeaturedCheckout);
router.get("/invoice/:sessionId", protect, getFeaturedInvoice);

export default router;
