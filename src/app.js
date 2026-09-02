import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler } from "./middleware/error.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import workerRoutes from "./routes/worker.routes.js";
import hirerRoutes from "./routes/hirer.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import messageRoutes from "./routes/message.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import verificationRoutes from "./routes/verification.routes.js";
import searchRoutes from "./routes/search.routes.js";
import disputeRoutes from "./routes/dispute.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import jobRoutes from "./routes/job.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import insuranceRoutes from "./routes/insurance.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import featuredRoutes from "./routes/featured.routes.js";
import postRoutes from "./routes/post.routes.js";
import videoCallRoutes from "./routes/videocall.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import translateRoutes from "./routes/translate.routes.js";
import referralRoutes from "./routes/referral.routes.js";
import campaignRoutes from "./routes/campaign.routes.js";
import reportRoutes from "./routes/report.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import adminJobRoutes from "./routes/adminJob.routes.js";
import externalJobRoutes from "./routes/externalJob.routes.js";
import surveyRoutes from "./routes/survey.routes.js";
import waitlistRoutes from "./routes/waitlist.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import hirerWalletRoutes from "./routes/hirerWallet.routes.js";
import refundRoutes from "./routes/refund.routes.js";

import { helmetConfig } from "./config/helmet.config.js";
import {
  securityHeaders,
  corsSecurityHeaders,
} from "./middleware/securityHeaders.middleware.js";
import {
  requestLogger,
  logger,
  securityLogger,
  performanceLogger,
} from "./utils/logger.js";

import {
  globalLimiter,
  authLimiter,
  registerLimiter,
  sensitiveLimiter,
  walletLimiter,
  adminLimiter,
  feedbackLimiter,
  emailLimiter,
  surveyLimiter,
} from "./middleware/security.middleware.js";

import healthRouter from "./routes/health.routes.js";
import "./services/expiry.service.js"; // starts the cron job

const app = express();
app.use(securityHeaders);
app.use(corsSecurityHeaders);
app.use("/health", healthRouter);

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const allowed = [
      process.env.CLIENT_URL,
      "https://skilledproz.com",
      "https://www.skilledproz.com",
      "https://api.skilledproz.com",
      "https://skilledproz.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://167.172.142.200:5000",
    ].filter(Boolean);

    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// ── Stripe webhook — raw body BEFORE express.json() ───────────────────────────
app.use(
  "/api/payments/webhook/stripe",
  express.raw({ type: "application/json" }),
);

// ── Security & logging ────────────────────────────────────────────────────────
app.use(helmet(helmetConfig));
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    performanceLogger.api(req.path, req.method, res.statusCode, duration, {
      ip: req.ip,
      userId: req.user?.id || "anonymous",
    });
  });
  next();
});

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rate Limiting ──────────────────────────────────────────────────────────
// Apply global rate limiter to all API routes
app.use("/api", globalLimiter);

// Apply stricter limits to specific routes
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/forgot-password", sensitiveLimiter);
app.use("/api/auth/reset-password", sensitiveLimiter);
app.use("/api/auth/resend-verification", sensitiveLimiter);
app.use("/api/auth/verify-email", sensitiveLimiter);

// Wallet routes
app.use("/api/wallet", walletLimiter);
app.use("/api/wallet/fund", walletLimiter);
app.use("/api/wallet/withdraw", walletLimiter);

// Admin routes
app.use("/api/admin", adminLimiter);
app.use("/api/admin/*", adminLimiter);

// Feedback routes
app.use("/api/feedback", feedbackLimiter);

// Survey routes
app.use("/api/survey", surveyLimiter);

// Email/Notification routes
app.use("/api/notifications/broadcast", emailLimiter);
app.use("/api/waitlist/admin/broadcast", emailLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.json({ message: "SkilledPro API v1.0 🚀" }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/workers", workerRoutes);
app.use("/api/hirers", hirerRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/insurance", insuranceRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/featured", featuredRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/video-calls", videoCallRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/translate", translateRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/campaign", campaignRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/admin", adminJobRoutes);
app.use("/api/external-jobs", externalJobRoutes);
app.use("/api/survey", surveyRoutes);
app.use("/api/waitlist", waitlistRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/wallet", hirerWalletRoutes);
app.use("/api/refunds", refundRoutes);

// ── Global error handler (must be last middleware) ────────────────────────────
app.use(errorHandler);

export default app;
