// src/routes/analytics.routes.js
import { Router } from "express";
import * as ctrl from "../controllers/analytics.controller.js";
import { optionalProtect } from "../middleware/auth.middleware.js";

const router = Router();

// optionalProtect = attach req.user if a valid token is present, else continue
// as guest. Never rejects the request, so anonymous traffic still works.
router.post("/events", optionalProtect, ctrl.ingestEvents);
router.post("/pageview", optionalProtect, ctrl.recordPageView);
router.post("/interaction", optionalProtect, ctrl.recordInteraction);
router.post("/session/start", optionalProtect, ctrl.startSession);
router.post("/session/end", optionalProtect, ctrl.endSession);

export default router;
