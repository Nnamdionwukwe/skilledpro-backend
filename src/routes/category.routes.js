// src/routes/category.routes.js
import { Router } from "express";
import {
  protect,
  requireRole,
  optionalProtect,
} from "../middleware/auth.middleware.js";
import {
  getCategories,
  getCategory,
  getCategoryWorkers,
  updateCategory,
  deleteCategory,
  suggestCategory,
} from "../controllers/category.controller.js";
import {
  validateCreateCategory,
  validateUpdateCategory,
  validateUUIDParam,
} from "../utils/validators.js";
import { categorySuggestLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

// GET  /api/categories                    — public list
router.get("/", getCategories);

// GET  /api/categories/:slug/workers      — workers linked to a category
// IMPORTANT: must come BEFORE /:slug so "workers" isn't matched as a slug
router.get("/:slug/workers", getCategoryWorkers);

// GET  /api/categories/:slug              — single category by slug
router.get("/:slug", getCategory);

// PATCH /api/categories/:id               — admin update
router.patch(
  "/:id",
  protect,
  requireRole("ADMIN"),
  validateUpdateCategory,
  updateCategory,
);

// DELETE /api/categories/:id              — admin delete
router.delete(
  "/:id",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  deleteCategory,
);

// POST /api/categories/suggest            — public suggestion (rate-limited)
router.post(
  "/suggest",
  categorySuggestLimiter,
  optionalProtect,
  suggestCategory,
);

export default router;
