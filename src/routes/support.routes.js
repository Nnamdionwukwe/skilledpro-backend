// src/routes/support.routes.js
import express from "express";
import { protect, requireRole } from "../middleware/auth.middleware.js";
import { supportUpload } from "../middleware/supportUpload.js";
import {
  createTicketSchema,
  replyTicketSchema,
  adminReplyTicketSchema,
  csatSchema,
  assignTicketSchema,
  updateStatusSchema,
  updatePrioritySchema,
  startChatSchema,
  escalateChatSchema,
  validate,
} from "../validators/support.validators.js";
import * as ctrl from "../controllers/support.controller.js";

const router = express.Router();

// ── User-facing tickets ──────────────────────────────────────────────────────
router.post(
  "/tickets",
  protect,
  supportUpload("ticket"),
  validate(createTicketSchema),
  ctrl.createTicket,
);
router.get("/tickets", protect, ctrl.getMyTickets);
router.get("/tickets/:id", protect, ctrl.getTicket);
router.post(
  "/tickets/:id/reply",
  protect,
  supportUpload("ticket"),
  validate(replyTicketSchema),
  ctrl.replyToTicket,
);
router.post("/tickets/:id/close", protect, ctrl.closeTicket);
router.post("/tickets/:id/reopen", protect, ctrl.reopenTicket);
router.post(
  "/tickets/:id/csat",
  protect,
  validate(csatSchema),
  ctrl.submitTicketCsat,
);

// ── Admin-facing tickets ─────────────────────────────────────────────────────
router.get(
  "/admin/tickets",
  protect,
  requireRole("ADMIN"),
  ctrl.adminListTickets,
);
router.get(
  "/admin/tickets/stats",
  protect,
  requireRole("ADMIN"),
  ctrl.adminTicketStats,
);
router.get(
  "/admin/tickets/:id",
  protect,
  requireRole("ADMIN"),
  ctrl.adminGetTicket,
);
router.post(
  "/admin/tickets/:id/reply",
  protect,
  requireRole("ADMIN"),
  supportUpload("ticket"),
  validate(adminReplyTicketSchema),
  ctrl.adminReplyToTicket,
);
router.patch(
  "/admin/tickets/:id/assign",
  protect,
  requireRole("ADMIN"),
  validate(assignTicketSchema),
  ctrl.adminAssignTicket,
);
router.patch(
  "/admin/tickets/:id/status",
  protect,
  requireRole("ADMIN"),
  validate(updateStatusSchema),
  ctrl.adminUpdateTicketStatus,
);
router.patch(
  "/admin/tickets/:id/priority",
  protect,
  requireRole("ADMIN"),
  validate(updatePrioritySchema),
  ctrl.adminUpdateTicketPriority,
);

// ── Live chat REST bootstrap ─────────────────────────────────────────────────
router.post("/chat/start", protect, validate(startChatSchema), ctrl.startChat);
router.get("/chat/my", protect, ctrl.getMyChats);
router.get("/chat/:id", protect, ctrl.getChat);
router.post(
  "/chat/:id/escalate",
  protect,
  validate(escalateChatSchema),
  ctrl.escalateChat,
);
router.post(
  "/chat/:id/csat",
  protect,
  validate(csatSchema),
  ctrl.submitChatCsatCtrl,
);

router.post(
  "/chat/upload",
  protect,
  supportUpload("chat"),
  ctrl.uploadChatAttachments,
);

// ── Admin — live chat ────────────────────────────────────────────────────────
router.get(
  "/admin/chats",
  protect,
  requireRole("ADMIN"),
  ctrl.adminListChatsCtrl,
);
router.get(
  "/admin/chats/:id",
  protect,
  requireRole("ADMIN"),
  ctrl.adminGetChat,
);

export default router;
