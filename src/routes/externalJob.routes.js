// src/routes/externalJob.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getExternalJobs,
  getExternalJobDetail,
} from "../controllers/externalJob.controller.js";
import { validatePagination } from "../utils/validators.js";

const router = Router();

// All routes require authentication and worker role
router.use(protect, requireRole("WORKER"));

router.get("/", validatePagination, getExternalJobs);
router.get("/:id", getExternalJobDetail);

export default router;
