import { Router } from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
} from "../controllers/notification.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protect);

router.get("/", getNotifications);
router.patch("/read-all", markAllAsRead);
// POST /api/notifications/request
router.post("/request", protect, async (req, res) => {
  try {
    const { type, details } = req.body;
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: `${type} Request Submitted`,
        body: `Your ${type} request has been received. Our team will follow up within 24 hours.`,
        type: `${type}_REQUEST`,
        data: details || {},
      },
    });

    // Notify all admins
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          title: `New ${type} Request`,
          body: `Worker ID: ${req.user.id} has requested ${type}.`,
          type: `${type}_REQUEST_ADMIN`,
          data: { requesterId: req.user.id, ...details },
        },
      });
    }

    return res.json({ success: true, message: "Request submitted" });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to submit request" });
  }
});
router.patch("/:id/read", markAsRead);
router.delete("/clear-all", clearAllNotifications);
router.delete("/:id", deleteNotification);

export default router;
