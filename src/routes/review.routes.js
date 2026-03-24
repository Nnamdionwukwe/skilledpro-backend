import { Router } from "express";
import { createReview, getWorkerReviews } from "../controllers/review.controller.js";
import { protect } from "../middleware/auth.middleware.js";
const router = Router();
router.post("/", protect, createReview);
router.get("/worker/:userId", getWorkerReviews);
export default router;
