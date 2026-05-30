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
import {
  validateCreatePost,
  validateUpdatePost,
  validateCreateComment,
  validateReactToPost,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

// ── Feed & browsing ───────────────────────────────────────────────────────────
router.get("/feed", validatePagination, getFeed);
router.get("/my", validatePagination, getMyPosts);
router.get(
  "/user/:userId",
  ...validateUUIDParam("userId"),
  validatePagination,
  getUserPosts,
);
router.get("/:id", ...validateUUIDParam("id"), getPost);

// ── Post CRUD ─────────────────────────────────────────────────────────────────
router.post("/", validateCreatePost, createPost);
router.put("/:id", ...validateUUIDParam("id"), validateUpdatePost, updatePost);
router.delete("/:id", ...validateUUIDParam("id"), deletePost);

// ── Repost ────────────────────────────────────────────────────────────────────
router.post("/:id/repost", ...validateUUIDParam("id"), repost);

// ── Reactions ─────────────────────────────────────────────────────────────────
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

// ── Comments ──────────────────────────────────────────────────────────────────
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
