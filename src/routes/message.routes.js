// src/routes/message.routes.js
import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getConversations,
  getMessages,
  sendMessage,
  // NOTE: markConversationRead does NOT exist in message.controller.js
  //       The controller only exports: getConversations, getMessages, sendMessage
  //       Remove the route or add the function to the controller if needed.
} from "../controllers/message.controller.js";
import {
  validateSendMessage,
  validateUUIDParam,
  validatePagination,
} from "../utils/validators.js";

const router = Router();
router.use(protect);

router.get("/conversations", validatePagination, getConversations);
router.get(
  "/:conversationId",
  ...validateUUIDParam("conversationId"),
  validatePagination,
  getMessages,
);
router.post("/", validateSendMessage, sendMessage);
// router.patch("/:conversationId/read",  markConversationRead);  ← removed: function not in controller

export default router;
