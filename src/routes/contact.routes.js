// src/routes/contact.routes.js
import express from "express";
import rateLimit from "express-rate-limit";
import {
  submitContactForm,
  getAllContactMessages,
} from "../controllers/contact.controller.js";
import { protect, requireRole } from "../middleware/auth.middleware.js";

const router = express.Router();

// Rate limiter: 5 contact submissions per hour per IP to prevent spam
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many messages sent. Please try again later.",
  },
});

// Public route
router.post("/", contactLimiter, submitContactForm);

// Admin route (optional: to view messages in admin dashboard)
router.get("/admin", protect, requireRole("ADMIN"), getAllContactMessages);

export default router;
