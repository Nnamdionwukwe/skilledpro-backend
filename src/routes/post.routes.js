import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  uploadMultiple,
  normaliseFile,
} from "../middleware/upload.middleware.js";
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

const router = Router();

// Feed — optionally authenticated (shows myReaction if logged in)
router.get("/feed", protect, getFeed);

// My posts
router.get("/my", protect, getMyPosts);

// User posts
router.get("/user/:userId", protect, getUserPosts);

// Single post
router.get("/:id", protect, getPost);

// Create / Update / Delete post
router.post("/", protect, uploadMultiple, normaliseFile, createPost);
router.put("/:id", protect, updatePost);
router.delete("/:id", protect, deletePost);

// Repost
router.post("/:id/repost", protect, repost);

// Reactions
router.post("/:id/react", protect, reactToPost);
router.get("/:id/reactions", protect, getReactions);

// Comments
router.post("/:id/comments", protect, addComment);
router.get("/:id/comments", protect, getComments);
router.delete("/comments/:commentId", protect, deleteComment);

export default router;
