import { Router } from "express";
import prisma from "../config/database.js"; // ← ADD THIS
import {
  getConversations,
  getMessages,
  sendMessage,
} from "../controllers/message.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  uploadSingle,
  normaliseFile,
} from "../middleware/upload.middleware.js";

const router = Router();

router.get("/conversations", protect, getConversations);
router.get("/:conversationId", protect, getMessages);
router.post("/", protect, uploadSingle, normaliseFile, sendMessage);

// Mark conversation as read — called explicitly when user opens a chat
router.patch("/:conversationId/read", protect, async (req, res) => {
  try {
    await prisma.message.updateMany({
      where: {
        conversationId: req.params.conversationId,
        receiverId: req.user.id,
        isRead: false,
      },
      data: { isRead: true },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false });
  }
});

export default router;
