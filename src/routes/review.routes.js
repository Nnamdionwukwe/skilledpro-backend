import { Router } from "express";
import {
  createReview,
  getWorkerReviews,
  getHirerReviewsPublic,
  getMyGivenReviews,
  getMyReceivedReviews,
  checkReviewStatus,
  deleteReview,
} from "../controllers/review.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// ── Protected — logged-in users ───────────────────────────────────────────────
router.post("/", protect, createReview);
router.get("/my/given", protect, getMyGivenReviews);
router.get("/my/received", protect, getMyReceivedReviews);
router.get("/check/:bookingId", protect, checkReviewStatus);

// ── Admin only ────────────────────────────────────────────────────────────────
router.delete("/:reviewId", protect, requireRole("ADMIN"), deleteReview);

// ── Public — anyone can view ──────────────────────────────────────────────────
router.get("/worker/:userId", getWorkerReviews);
router.get("/hirer/:userId", getHirerReviewsPublic);

export default router;
