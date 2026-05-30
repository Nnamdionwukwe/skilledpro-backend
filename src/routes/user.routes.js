// src/routes/user.routes.js
import { Router } from "express";
import { protect, optionalProtect } from "../middleware/auth.middleware.js";
import {
  updateProfile,
  updateAvatar,
  deleteAccount,
  getProfile,
} from "../controllers/user.controller.js";
import {
  uploadSingle, // was: upload.single("avatar")  ← FIXED
  normaliseFile,
} from "../middleware/upload.middleware.js";
import {
  validateUpdateProfile,
  validateUUIDParam,
} from "../utils/validators.js";

const router = Router();

router.put("/me", protect, validateUpdateProfile, updateProfile);
router.put("/me/avatar", protect, uploadSingle, normaliseFile, updateAvatar);
router.delete("/me", protect, deleteAccount);
router.get("/:id", optionalProtect, ...validateUUIDParam("id"), getProfile);

export default router;
