import express from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
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

// ── User — tickets ──────────────────────────────────────────────────────────
router.post(
  "/tickets",
  authenticate,
  supportUpload("ticket"),
  validate(createTicketSchema),
  ctrl.createTicket,
);
router.get("/tickets", authenticate, ctrl.getMyTickets);
router.get("/tickets/:id", authenticate, ctrl.getTicket);
router.post(
  "/tickets/:id/reply",
  authenticate,
  supportUpload("ticket"),
  validate(replyTicketSchema),
  ctrl.replyToTicket,
);
router.post("/tickets/:id/close", authenticate, ctrl.closeTicket);
router.post("/tickets/:id/reopen", authenticate, ctrl.reopenTicket);
router.post(
  "/tickets/:id/csat",
  authenticate,
  validate(csatSchema),
  ctrl.submitTicketCsat,
);

// ── Admin — tickets ─────────────────────────────────────────────────────────
router.get(
  "/admin/tickets",
  authenticate,
  requireRole("ADMIN"),
  ctrl.adminListTickets,
);
router.get(
  "/admin/tickets/stats",
  authenticate,
  requireRole("ADMIN"),
  ctrl.adminTicketStats,
);
router.get(
  "/admin/tickets/:id",
  authenticate,
  requireRole("ADMIN"),
  ctrl.adminGetTicket,
);
router.post(
  "/admin/tickets/:id/reply",
  authenticate,
  requireRole("ADMIN"),
  supportUpload("ticket"),
  validate(adminReplyTicketSchema),
  ctrl.adminReplyToTicket,
);
router.patch(
  "/admin/tickets/:id/assign",
  authenticate,
  requireRole("ADMIN"),
  validate(assignTicketSchema),
  ctrl.adminAssignTicket,
);
router.patch(
  "/admin/tickets/:id/status",
  authenticate,
  requireRole("ADMIN"),
  validate(updateStatusSchema),
  ctrl.adminUpdateTicketStatus,
);
router.patch(
  "/admin/tickets/:id/priority",
  authenticate,
  requireRole("ADMIN"),
  validate(updatePrioritySchema),
  ctrl.adminUpdateTicketPriority,
);

// ── Live chat REST bootstrap ────────────────────────────────────────────────
router.post(
  "/chat/start",
  authenticate,
  validate(startChatSchema),
  ctrl.startChat,
);
router.get("/chat/my", authenticate, ctrl.getMyChats);
router.get("/chat/:id", authenticate, ctrl.getChat);
router.post(
  "/chat/:id/escalate",
  authenticate,
  validate(escalateChatSchema),
  ctrl.escalateChat,
);
router.post(
  "/chat/:id/csat",
  authenticate,
  validate(csatSchema),
  ctrl.submitChatCsat,
);
router.post(
  "/chat/upload",
  authenticate,
  supportUpload("chat"),
  ctrl.uploadChatAttachments,
);

// ── Admin — live chat ───────────────────────────────────────────────────────
router.get(
  "/admin/chats",
  authenticate,
  requireRole("ADMIN"),
  ctrl.adminListChatsCtrl,
);
router.get(
  "/admin/chats/:id",
  authenticate,
  requireRole("ADMIN"),
  ctrl.adminGetChat,
);

export default router;
