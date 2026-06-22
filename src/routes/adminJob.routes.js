import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  adminCreateJobPost,
  adminGetAllJobPosts,
  adminGetJobPost,
  adminUpdateJobPost,
  adminDeleteJobPost,
  adminToggleJobStatus,
  adminBulkUpdateStatus,
  adminBulkDelete,
} from "../controllers/adminJob.controller.js";
import {
  validateAdminCreateJob,
  validateAdminUpdateJob,
  validatePagination,
  validateUUIDParam,
  validateGetJobStats,
} from "../utils/validators.js";
import { getJobStats } from "../controllers/externalJobClick.controller.js"; //

const router = Router();
router.use(protect, requireRole("ADMIN"));

// Admin External Job management (previously /jobs)
router.post("/external/jobs", validateAdminCreateJob, adminCreateJobPost);
router.get("/external/jobs", validatePagination, adminGetAllJobPosts);
router.get("/external/jobs/:id", ...validateUUIDParam("id"), adminGetJobPost);
router.put("/external/jobs/:id", validateAdminUpdateJob, adminUpdateJobPost);
router.patch("/external/jobs/:id", validateAdminUpdateJob, adminUpdateJobPost);
router.patch(
  "/external/jobs/:id/status",
  ...validateUUIDParam("id"),
  adminToggleJobStatus,
);
router.delete(
  "/external/jobs/:id",
  ...validateUUIDParam("id"),
  adminDeleteJobPost,
);
router.patch("/external/jobs/bulk/status", adminBulkUpdateStatus);
router.delete("/external/jobs/bulk", adminBulkDelete);

// ─── NEW: Stats route ─────────────────────────────────────────────────────
router.get("/external/jobs/:id/stats", validateGetJobStats, getJobStats);

export default router;
