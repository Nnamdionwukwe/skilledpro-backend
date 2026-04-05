import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getPackages,
  getFeaturedUsers,
  purchaseFeatured,
  getMyFeatured,
} from "../controllers/featured.controller.js";

const router = Router();

router.get("/packages", getPackages);
router.get("/", getFeaturedUsers);
router.get("/my", protect, getMyFeatured);
router.post("/purchase", protect, purchaseFeatured);

export default router;
