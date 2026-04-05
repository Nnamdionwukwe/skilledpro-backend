import { Router } from "express";
import {
  getCategories,
  getCategory,
  suggestCategory,
} from "../controllers/category.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", getCategories);
router.get("/:slug", getCategory);
router.post("/suggest", protect, suggestCategory);

export default router;
