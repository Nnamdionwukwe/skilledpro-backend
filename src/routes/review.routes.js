// src/routes/review.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  createReview,
  getMyGivenReviews,
  getMyReceivedReviews,
  checkReviewStatus, // was: checkReview         ← FIXED
  deleteReview,
  getWorkerReviews,
  getHirerReviewsPublic, // was: getHirerReviews     ← FIXED
} from "../controllers/review.controller.js";
import {
  validateCreateReview,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

router.post("/", validateCreateReview, createReview);
router.get("/my/given", validatePagination, getMyGivenReviews);
router.get("/my/received", validatePagination, getMyReceivedReviews);
router.get(
  "/check/:bookingId",
  ...validateUUIDParam("bookingId"),
  checkReviewStatus,
);
router.delete("/:reviewId", ...validateUUIDParam("reviewId"), deleteReview);
router.get(
  "/worker/:userId",
  ...validateUUIDParam("userId"),
  validatePagination,
  getWorkerReviews,
);
router.get(
  "/hirer/:userId",
  ...validateUUIDParam("userId"),
  validatePagination,
  getHirerReviewsPublic,
);

export default router;
