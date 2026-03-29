import { Router } from "express";
import {
  getProfile,
  updateProfile,
  updateAvatar,
  deleteAccount,
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { uploadSingle } from "../middleware/upload.middleware.js";
const router = Router();
// ✅ /me routes MUST come before /:id
router.put("/me", protect, updateProfile);
router.put("/me/avatar", protect, uploadSingle, updateAvatar);
router.delete("/me", protect, deleteAccount);

// /:id MUST come last
router.get("/:id", getProfile);
export default router;
