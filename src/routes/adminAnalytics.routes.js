// src/routes/adminAnalytics.routes.js
import { Router } from "express";
import * as ctrl from "../controllers/adminAnalytics.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// Everything under this router requires a valid token AND role === ADMIN
router.use(protect, requireRole("ADMIN"));

router.get("/overview", ctrl.getOverview);
router.get("/users", ctrl.listUserInsights);
router.get("/user/:userId", ctrl.getUserCoverage);
router.get("/live", ctrl.getLiveEvents);
router.get("/funnel", ctrl.getFunnel);
router.get("/funnel-builder", ctrl.getFunnelBuilder);
router.get("/top-workers", ctrl.getTopWorkers);
router.get("/payment-funnel", ctrl.getPaymentFunnel);
router.get("/category-demand", ctrl.getCategoryDemand);

// ── Daily digest — fire a test send on demand ────────────────────────────
router.post("/send-test-digest", ctrl.sendTestDigest);

// ── Segments CRUD ────────────────────────────────────────────────────────
router.get("/segments", ctrl.listSegments);
router.post("/segments", ctrl.createSegment);
router.patch("/segments/:key", ctrl.updateSegment);
router.delete("/segments/:key", ctrl.deleteSegment);
router.get("/segments/:key/users", ctrl.getSegmentUsers);

export default router;
