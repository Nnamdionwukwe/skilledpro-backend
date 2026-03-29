import { Router } from "express";
import {
  createJobPost,
  getJobPosts,
  getJobPost,
  getMyJobPosts,
  updateJobPostStatus,
  applyToJob,
  getJobApplications,
  updateApplicationStatus,
  getMyApplications,
  getHirerPublicProfile,
} from "../controllers/job.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/", getJobPosts);
router.get("/:id", protect, getJobPost); // protect is optional — checks hasApplied if logged in

// ── Hirer routes ──────────────────────────────────────────────────────────────
router.post("/", protect, requireRole("HIRER"), createJobPost);
router.get("/hirer/me", protect, requireRole("HIRER"), getMyJobPosts);
router.patch("/:id/status", protect, requireRole("HIRER"), updateJobPostStatus);
router.get(
  "/:id/applications",
  protect,
  requireRole("HIRER"),
  getJobApplications,
);
router.patch(
  "/:id/applications/:applicationId",
  protect,
  requireRole("HIRER"),
  updateApplicationStatus,
);

// ── Worker routes ─────────────────────────────────────────────────────────────
router.post("/:id/apply", protect, requireRole("WORKER"), applyToJob);
router.get(
  "/worker/my-applications",
  protect,
  requireRole("WORKER"),
  getMyApplications,
);

export default router;
