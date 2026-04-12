import { Router } from "express";
import {
  getCategories,
  getCategory,
  suggestCategory,
} from "../controllers/category.controller.js";
import { protect, optionalProtect } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", getCategories);
router.get("/:slug", getCategory);

// ← was protect (hard require), now optionalProtect (attach user if token exists, else continue as guest)
router.post("/suggest", optionalProtect, suggestCategory);

export default router;
