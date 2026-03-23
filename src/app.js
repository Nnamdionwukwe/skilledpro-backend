import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
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

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => res.json({ message: "SkilledPro API v1.0 🚀" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/workers", workerRoutes);
app.use("/api/hirers", hirerRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/categories", categoryRoutes);

app.use(errorHandler);

export default app;
