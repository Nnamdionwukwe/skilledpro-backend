// src/routes/externalJobs.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getExternalJobs,
  getExternalJobDetail,
} from "../controllers/externalJob.controller.js";
import { recordClick } from "../controllers/externalJobClick.controller.js";
import {
  validateRecordClick,
  validatePagination,
} from "../utils/validators.js";

const router = Router();

router.use(protect, requireRole("WORKER"));

router.get("/", validatePagination, getExternalJobs);
router.get("/:id", getExternalJobDetail);
router.post("/:id/click", validateRecordClick, recordClick);

export default router;
