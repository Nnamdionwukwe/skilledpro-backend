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

// ── Static routes FIRST — must all come before /:id ───────────────────────────

// Public
router.get("/", getJobPosts);

// Hirer: view own job posts
// ⚠️ Must be before /:id — otherwise "hirer" is matched as an id param
router.get("/hirer/me", protect, requireRole("HIRER"), getMyJobPosts);

// Worker: view own applications
// ⚠️ Must be before /:id — otherwise "worker" is matched as an id param
router.get(
  "/worker/my-applications",
  protect,
  requireRole("WORKER"),
  getMyApplications,
);

// ── Wildcard /:id routes — always after static routes ─────────────────────────

// Public — single job detail (protect optional: adds hasApplied if logged in)
router.get("/:id", protect, getJobPost);

// Hirer: create job post
router.post("/", protect, requireRole("HIRER"), createJobPost);

// Hirer: update job status
router.patch("/:id/status", protect, requireRole("HIRER"), updateJobPostStatus);

// Hirer: view applications for a job
router.get(
  "/:id/applications",
  protect,
  requireRole("HIRER"),
  getJobApplications,
);

// Hirer: accept or reject an application
router.patch(
  "/:id/applications/:applicationId",
  protect,
  requireRole("HIRER"),
  updateApplicationStatus,
);

// Worker: apply to a job
router.post("/:id/apply", protect, requireRole("WORKER"), applyToJob);

export default router;
