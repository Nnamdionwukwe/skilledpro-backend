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
} from "../utils/validators.js";

const router = Router();
router.use(protect, requireRole("ADMIN"));

// Admin Job management
router.post("/jobs", validateAdminCreateJob, adminCreateJobPost);
router.get("/jobs", validatePagination, adminGetAllJobPosts);
router.get("/jobs/:id", ...validateUUIDParam("id"), adminGetJobPost);
router.put("/jobs/:id", validateAdminUpdateJob, adminUpdateJobPost);
router.patch("/jobs/:id", validateAdminUpdateJob, adminUpdateJobPost);
router.patch(
  "/jobs/:id/status",
  ...validateUUIDParam("id"),
  adminToggleJobStatus,
);
router.delete("/jobs/:id", ...validateUUIDParam("id"), adminDeleteJobPost);
router.patch("/jobs/bulk/status", adminBulkUpdateStatus);
router.delete("/jobs/bulk", adminBulkDelete);

export default router;
