import {
  validateRecordClick,
  validateGetJobStats,
} from "../utils/validators.js";

// POST /api/external-jobs/:id/click
router.post("/:id/click", protect, validateRecordClick, recordClick);

// GET /api/external-jobs/admin/:id/stats
router.get(
  "/admin/:id/stats",
  protect,
  isAdmin,
  validateGetJobStats,
  getJobStats,
);
