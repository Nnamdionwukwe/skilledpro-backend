// src/routes/job.routes.js
import { Router } from "express";
import {
  protect,
  requireRole,
  optionalProtect,
} from "../middleware/auth.middleware.js";
import {
  createJobPost,
  getJobPosts,
  getMyJobPosts,
  getMyApplications,
  getJobPost,
  updateJobPostStatus,
  getJobApplications,
  updateApplicationStatus,
  applyToJob,
  // Saved jobs (NEW)
  getSavedJobs,
  saveJob,
  unsaveJob,
} from "../controllers/job.controller.js";
import {
  validateCreateJob,
  validateJobStatus,
  validateJobApplication,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

// ── Public — browse all open jobs ─────────────────────────────────────────────
router.get("/", optionalProtect, validatePagination, getJobPosts);

// ── Protected from here down ──────────────────────────────────────────────────
router.use(protect);

// ── NAMED routes MUST come before /:id to avoid UUID validator catching them ──

// Hirer: my job posts
router.get(
  "/hirer/me",
  requireRole("HIRER"),
  validatePagination,
  getMyJobPosts,
);

// Worker: my applications
router.get(
  "/my/applications",
  requireRole("WORKER"),
  validatePagination,
  getMyApplications,
);

// Worker: saved/bookmarked jobs  ← NEW (must be before /:id)
router.get("/saved", requireRole("WORKER"), validatePagination, getSavedJobs);

// ── Parameterised routes ──────────────────────────────────────────────────────

// Single job detail (optional auth — shows hasApplied + isSaved when logged in)
router.get("/:id", optionalProtect, ...validateUUIDParam("id"), getJobPost);

// Hirer: create job post
router.post("/", requireRole("HIRER"), validateCreateJob, createJobPost);

// Hirer: change status
router.patch(
  "/:id/status",
  requireRole("HIRER"),
  ...validateUUIDParam("id"),
  validateJobStatus,
  updateJobPostStatus,
);

// Hirer: view + action on applications
router.get(
  "/:id/applications",
  requireRole("HIRER"),
  ...validateUUIDParam("id"),
  validatePagination,
  getJobApplications,
);

router.patch(
  "/:id/applications/:appId/status",
  requireRole("HIRER"),
  ...validateUUIDParam("id"),
  updateApplicationStatus,
);

// Worker: apply to job
router.post(
  "/:id/apply",
  requireRole("WORKER"),
  ...validateUUIDParam("id"),
  validateJobApplication,
  applyToJob,
);

// Worker: save / unsave a job  ← NEW
router.post(
  "/:id/save",
  requireRole("WORKER"),
  ...validateUUIDParam("id"),
  saveJob,
);
router.delete(
  "/:id/save",
  requireRole("WORKER"),
  ...validateUUIDParam("id"),
  unsaveJob,
);

export default router;
