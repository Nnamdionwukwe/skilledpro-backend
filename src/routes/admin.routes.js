import { Router } from "express";
import {
  getPlatformStats,
  getAllUsers,
  getUserDetail,
  banUser,
  unbanUser,
  deleteUser,
  verifyWorker,
  getAllBookings,
  getDisputes,
  resolveDispute,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllReviews,
  deleteReview,
  broadcastNotification,
} from "../controllers/admin.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// All admin routes require auth + ADMIN role
router.use(protect, requireRole("ADMIN"));

router.get("/stats", getPlatformStats);
router.get("/users", getAllUsers);
router.get("/users/:userId", getUserDetail);
router.patch("/users/:userId/ban", banUser);
router.patch("/users/:userId/unban", unbanUser);
router.delete("/users/:userId", deleteUser);
router.patch("/users/:userId/verify", verifyWorker);
router.get("/bookings", getAllBookings);
router.get("/disputes", getDisputes);
router.patch("/disputes/:bookingId/resolve", resolveDispute);
router.post("/categories", createCategory);
router.patch("/categories/:categoryId", updateCategory);
router.delete("/categories/:categoryId", deleteCategory);
router.get("/reviews", getAllReviews);
router.delete("/reviews/:reviewId", deleteReview);
router.post("/broadcast", broadcastNotification);

export default router;
