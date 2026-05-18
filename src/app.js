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

// NOTE: dotenv is NOT called here — server.js handles it via "import dotenv/config"
// before this file is imported.

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// Single cors() call — handles both regular requests AND OPTIONS preflight.
// Never call cors() a second time anywhere (no app.options + cors(), no per-router cors()).
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin: mobile apps, server-to-server, curl, Postman
    if (!origin) return callback(null, true);

    const allowed = [
      process.env.CLIENT_URL, // set in .env, e.g. https://www.skilledproz.com
      "http://localhost:3000",
      "http://localhost:5173", // Vite dev
      "http://localhost:4173", // Vite preview
      "https://www.skilledproz.com",
      "https://skilledproz.com",
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
// Stripe requires the raw, unparsed body to verify the webhook signature.
// This must come before express.json() so the body is not consumed first.
app.use(
  "/api/payments/webhook/stripe",
  express.raw({ type: "application/json" }),
);

// ── Security & logging ────────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan("dev"));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// ── Global error handler (must be last middleware) ────────────────────────────
app.use(errorHandler);

export default app;
