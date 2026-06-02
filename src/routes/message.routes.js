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

// Named routes FIRST — before /:conversationId or Express swallows them
router.get("/conversations", getConversations);
router.post("/", validateSendMessage, sendMessage);

// Param routes after
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
