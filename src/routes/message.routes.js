// src/routes/message.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getConversations,
  getMessages,
  sendMessage,
  markConversationRead,
} from "../controllers/message.controller.js";
import {
  validateSendMessage,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

// ── Named routes FIRST ──
router.get("/conversations", validatePagination, getConversations);
router.post("/", validateSendMessage, sendMessage);

// ── Param routes after ──
router.patch(
  "/:conversationId/read",
  ...validateUUIDParam("conversationId"),
  markConversationRead,
);
router.get(
  "/:conversationId",
  ...validateUUIDParam("conversationId"),
  validatePagination,
  getMessages,
);

export default router;
