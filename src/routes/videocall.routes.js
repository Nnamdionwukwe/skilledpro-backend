// src/routes/videocall.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  initiateCall,
  acceptCall,
  declineCall,
  endCall,
  getCallStatus,
  getCallUrl,
  getIncomingCall, // ← NEW: global incoming-call poll
} from "../controllers/videocall.controller.js";
import {
  validateInitiateVideoCall,
  validateUUIDParam,
} from "../utils/validators.js";

const router = Router();

// All video call routes require authentication — both parties must be logged in
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/video-calls/incoming
//
// Global poll used by the app-wide IncomingCallBanner. Must be declared
// BEFORE the /:bookingId routes, otherwise Express matches "incoming" as a
// booking ID and hits validateUUIDParam (which would reject it as invalid).
//
// No explicit `protect` needed — router.use(protect) above already covers it.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/incoming", getIncomingCall);

// POST /api/video-calls/:bookingId/initiate   — caller starts the call
router.post("/:bookingId/initiate", validateInitiateVideoCall, initiateCall);

// PATCH /api/video-calls/:bookingId/accept    — receiver picks up
router.patch(
  "/:bookingId/accept",
  ...validateUUIDParam("bookingId"),
  acceptCall,
);

// PATCH /api/video-calls/:bookingId/decline   — receiver rejects
router.patch(
  "/:bookingId/decline",
  ...validateUUIDParam("bookingId"),
  declineCall,
);

// PATCH /api/video-calls/:bookingId/end       — either party ends the call
router.patch("/:bookingId/end", ...validateUUIDParam("bookingId"), endCall);

// GET  /api/video-calls/:bookingId            — poll call status
router.get("/:bookingId", ...validateUUIDParam("bookingId"), getCallStatus);

// POST /api/video-calls/:bookingId/token      — get a fresh room URL
router.post("/:bookingId/token", getCallUrl);

export default router;
