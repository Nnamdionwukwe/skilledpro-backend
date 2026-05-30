// src/routes/featured.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getPackages,
  getFeaturedUsers,
  getMyFeatured,
  createFeaturedCheckout,
  verifyFeaturedCheckout,
  getFeaturedInvoice,
} from "../controllers/featured.controller.js";
import {
  validateFeaturedCheckout,
  validateFeaturedVerify,
  validateUUIDParam,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

// GET  /api/featured/packages          — available boost packages + pricing
router.get("/packages", getPackages);

// GET  /api/featured/                  — all currently featured users (public feed)
router.get("/", getFeaturedUsers);

// GET  /api/featured/my                — caller's own active featured listings
router.get("/my", getMyFeatured);

// POST /api/featured/checkout          — initiate featured listing checkout
// Body: { type: "WORKER_PROFILE"|"JOB_POST", duration: 7|14|30|60|90, targetId? }
router.post("/checkout", validateFeaturedCheckout, createFeaturedCheckout);

// POST /api/featured/verify            — verify payment + activate listing
// Body: { sessionId }
router.post("/verify", validateFeaturedVerify, verifyFeaturedCheckout);

// GET  /api/featured/invoice/:sessionId
router.get("/invoice/:sessionId", getFeaturedInvoice);

export default router;
