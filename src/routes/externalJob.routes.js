import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getExternalJobs,
  getExternalJobDetail,
} from "../controllers/externalJob.controller.js";
import { recordClick } from "../controllers/externalJobClick.controller.js"; // ← import
import {
  validateRecordClick,
  validatePagination,
} from "../utils/validators.js"; // ← import validator

const router = Router();

// All routes require authentication and worker role
router.use(protect, requireRole("WORKER"));

router.get("/", validatePagination, getExternalJobs);
router.get("/:id", getExternalJobDetail);

// ─── NEW: Click tracking ──────────────────────────────────────────────────
router.post("/:id/click", validateRecordClick, recordClick);

export default router;
