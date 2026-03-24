import { Router } from "express";
import { getConversations, getMessages, sendMessage } from "../controllers/message.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { uploadSingle } from "../middleware/upload.middleware.js";
const router = Router();
router.get("/conversations", protect, getConversations);
router.get("/:conversationId", protect, getMessages);
router.post("/", protect, uploadSingle, sendMessage);
export default router;
