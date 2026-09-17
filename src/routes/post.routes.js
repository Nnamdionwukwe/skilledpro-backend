// src/routes/post.routes.js
import { Router } from "express";
import { protect, optionalProtect } from "../middleware/auth.middleware.js";
import {
  getFeed,
  getMyPosts,
  getUserPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  repost,
  reactToPost,
  getReactions,
  addComment,
  getComments,
  deleteComment,
} from "../controllers/post.controller.js";
import { uploadMultiple } from "../middleware/upload.middleware.js";
import {
  validateCreatePost,
  validateUpdatePost,
  validateCreateComment,
  validateReactToPost,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// ═════════════════════════════════════════════════════════════════════════════
// ROUTE ORDERING IS CRITICAL
// ─────────────────────────────────────────────────────────────────────────────
// Express matches routes in source order. `/my` MUST come before `/:id`,
// otherwise `/my` is parsed as `id = "my"` and the UUID validator rejects it.
//
// Public routes use `optionalProtect` (populates req.user if token present,
// otherwise continues as guest). Authenticated routes use `protect`.
// ═════════════════════════════════════════════════════════════════════════════

// ── Public routes (optional auth) ─────────────────────────────────────────────
router.get("/feed", optionalProtect, validatePagination, getFeed);

router.get(
  "/user/:userId",
  optionalProtect,
  ...validateUUIDParam("userId"),
  validatePagination,
  getUserPosts,
);

// ── Authenticated routes — MUST go BEFORE /:id ────────────────────────────────
router.get("/my", protect, validatePagination, getMyPosts);

// ── Public single-post route (optional auth) — MUST be LAST ───────────────────
// This is a catch-all for any single-segment path. Everything above this line
// wins if it matches first.
router.get("/:id", optionalProtect, ...validateUUIDParam("id"), getPost);

// ═════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ROUTES (protect from here down)
// ═════════════════════════════════════════════════════════════════════════════
router.use(protect);

router.post("/", uploadMultiple, validateCreatePost, createPost);
router.put("/:id", ...validateUUIDParam("id"), validateUpdatePost, updatePost);
router.delete("/:id", ...validateUUIDParam("id"), deletePost);

router.post("/:id/repost", ...validateUUIDParam("id"), repost);

router.post(
  "/:id/react",
  ...validateUUIDParam("id"),
  validateReactToPost,
  reactToPost,
);
router.get(
  "/:id/reactions",
  ...validateUUIDParam("id"),
  validatePagination,
  getReactions,
);

router.post(
  "/:id/comments",
  ...validateUUIDParam("id"),
  validateCreateComment,
  addComment,
);
router.get(
  "/:id/comments",
  ...validateUUIDParam("id"),
  validatePagination,
  getComments,
);
router.delete(
  "/comments/:commentId",
  ...validateUUIDParam("commentId"),
  deleteComment,
);

export default router;
