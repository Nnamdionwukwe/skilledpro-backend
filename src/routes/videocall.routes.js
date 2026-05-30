// src/routes/videocall.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  initiateCall,
  acceptCall,
  declineCall,
  endCall,
  getCallStatus,
} from "../controllers/videocall.controller.js";
import {
  validateInitiateVideoCall,
  validateUUIDParam,
} from "../utils/validators.js";

const router = Router();

// All video call routes require authentication — both parties must be logged in
router.use(protect);

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

export default router;
