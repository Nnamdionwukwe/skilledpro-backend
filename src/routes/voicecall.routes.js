// src/routes/voicecall.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  initiateVoiceCall,
  acceptVoiceCall,
  declineVoiceCall,
  endVoiceCall,
  getVoiceCallStatus,
  getIncomingVoiceCall,
} from "../controllers/voicecall.controller.js";

const router = Router();

// All voice call routes require authentication
router.use(protect);

// ── Global incoming-call poll (MUST come before /:conversationId) ─────────
router.get("/incoming", getIncomingVoiceCall);

// ── Conversation-scoped routes ────────────────────────────────────────────
router.get("/:conversationId", getVoiceCallStatus);
router.post("/:conversationId/initiate", initiateVoiceCall);
router.patch("/:conversationId/accept", acceptVoiceCall);
router.patch("/:conversationId/decline", declineVoiceCall);
router.patch("/:conversationId/end", endVoiceCall);

export default router;
