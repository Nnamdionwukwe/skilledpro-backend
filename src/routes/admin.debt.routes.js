// src/routes/admin.debt.routes.js
import { Router } from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import {
  getAllWorkerDebts,
  getWorkerDebtStats,
  getWorkerDebtDetail,
  forgiveWorkerDebt,
  markDebtForCollection,
  getDebtsByWorker,
} from "../controllers/admin.debt.controller.js";

const router = Router();

// All routes require ADMIN
router.use(protect);
router.use(requireRole("ADMIN"));

// List and stats (order matters — specific paths BEFORE /:id)
router.get("/stats", getWorkerDebtStats);
router.get("/by-worker/:workerId", getDebtsByWorker);
router.get("/", getAllWorkerDebts);

// Single debt
router.get("/:id", getWorkerDebtDetail);
router.patch("/:id/forgive", forgiveWorkerDebt);
router.patch("/:id/mark-collection", markDebtForCollection);

export default router;
