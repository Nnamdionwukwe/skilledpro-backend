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
  updateCategory,
  deleteCategory,
  suggestCategory,
} from "../controllers/category.controller.js";
import {
  validateCreateCategory,
  validateUpdateCategory, // ← §25 from validators-additions.js
  validateUUIDParam,
} from "../utils/validators.js";

const router = Router();

// GET  /api/categories            — public list
router.get("/", getCategories);
// GET  /api/categories/:slug      — single category by slug
router.get("/:slug", getCategory);

// PATCH /api/categories/:id       — admin update
router.patch(
  "/:id",
  protect,
  requireRole("ADMIN"),
  validateUpdateCategory,
  updateCategory,
);

// DELETE /api/categories/:id      — admin delete
router.delete(
  "/:id",
  protect,
  requireRole("ADMIN"),
  ...validateUUIDParam("id"),
  deleteCategory,
);

// POST /api/categories/suggest    — authenticated users suggest a category
router.post("/suggest", optionalProtect, suggestCategory);

export default router;
