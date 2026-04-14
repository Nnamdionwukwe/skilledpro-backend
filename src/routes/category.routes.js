import { Router } from "express";
import {
  getCategories,
  getCategory,
  suggestCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller.js";
import {
  protect,
  optionalProtect,
  requireRole,
} from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", getCategories);
router.get("/:slug", getCategory);

// Admin only
router.delete("/:id", protect, requireRole("ADMIN"), deleteCategory);
router.patch("/:id", protect, requireRole("ADMIN"), updateCategory);

// ← was protect (hard require), now optionalProtect (attach user if token exists, else continue as guest)
router.post("/suggest", optionalProtect, suggestCategory);

export default router;
