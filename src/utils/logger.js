// src/utils/logger.js
import winston from "winston";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.join(__dirname, "../../logs");

// Create logs directory if it doesn't exist
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ─── Winston Logger Configuration ──────────────────────────────────────────

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.metadata(),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? `\n${JSON.stringify(meta, null, 2)}`
      : "";
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);

// Create the logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: {
    service: "skilledproz-api",
    environment: process.env.NODE_ENV || "development",
    hostname: os.hostname(),
  },
  transports: [
    // Console logging (always on)
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // File logging - all logs
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true,
    }),
    // File logging - errors only
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 10485760,
      maxFiles: 10,
      tailable: true,
    }),
    // File logging - warnings only
    new winston.transports.File({
      filename: path.join(logDir, "warn.log"),
      level: "warn",
      maxsize: 10485760,
      maxFiles: 5,
      tailable: true,
    }),
    // File logging - info and above
    new winston.transports.File({
      filename: path.join(logDir, "info.log"),
      level: "info",
      maxsize: 10485760,
      maxFiles: 5,
      tailable: true,
    }),
    // File logging - security events
    new winston.transports.File({
      filename: path.join(logDir, "security.log"),
      level: "warn",
      maxsize: 10485760,
      maxFiles: 10,
      tailable: true,
    }),
    // File logging - wallet transactions
    new winston.transports.File({
      filename: path.join(logDir, "wallet.log"),
      level: "info",
      maxsize: 10485760,
      maxFiles: 10,
      tailable: true,
    }),
    // File logging - database queries (debug only)
    ...(process.env.LOG_DB_QUERIES === "true"
      ? [
          new winston.transports.File({
            filename: path.join(logDir, "database.log"),
            level: "debug",
            maxsize: 10485760,
            maxFiles: 5,
            tailable: true,
          }),
        ]
      : []),
  ],
});

// ─── Request Logging Middleware ────────────────────────────────────────────

// Morgan token for logging response body (optional)
morgan.token("body", (req) => {
  if (req.body && Object.keys(req.body).length > 0) {
    // Don't log passwords or tokens
    const sanitized = { ...req.body };
    if (sanitized.password) sanitized.password = "***";
    if (sanitized.token) sanitized.token = "***";
    if (sanitized.refreshToken) sanitized.refreshToken = "***";
    return JSON.stringify(sanitized);
  }
  return "-";
});

// Morgan token for user ID
morgan.token("userId", (req) => {
  return req.user?.id || "anonymous";
});

// Morgan token for IP address
morgan.token("real-ip", (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.headers["x-real-ip"] ||
    req.ip ||
    req.connection?.remoteAddress ||
    "unknown"
  );
});

// Morgan token for response time in ms
morgan.token("response-time-ms", (req, res) => {
  if (!req._startAt || !res._startAt) return "-";
  const ms =
    (res._startAt[0] - req._startAt[0]) * 1000 +
    (res._startAt[1] - req._startAt[1]) / 1e6;
  return ms.toFixed(2);
});

// Custom morgan format
const morganFormat =
  ":real-ip :userId :method :url :status :response-time-msms - :res[content-length] - :body";

// Request logging middleware
export const requestLogger = morgan(morganFormat, {
  stream: {
    write: (message) => {
      logger.info(message.trim());
    },
  },
  skip: (req) => {
    // Skip health checks and static files
    return req.path === "/health" || req.path === "/";
  },
});

// ─── Security Event Logger ──────────────────────────────────────────────────

export const securityLogger = {
  warn: (message, meta = {}) => {
    logger.warn(message, { ...meta, securityEvent: true });
  },
  error: (message, meta = {}) => {
    logger.error(message, { ...meta, securityEvent: true });
  },
  info: (message, meta = {}) => {
    logger.info(message, { ...meta, securityEvent: true });
  },
  auth: (userId, action, ip, meta = {}) => {
    logger.info(`Auth: ${action} - User ${userId}`, {
      securityEvent: true,
      authEvent: true,
      userId,
      action,
      ip,
      ...meta,
    });
  },
  rateLimit: (ip, path, meta = {}) => {
    logger.warn(`Rate limit exceeded: ${ip} - ${path}`, {
      securityEvent: true,
      rateLimitEvent: true,
      ip,
      path,
      ...meta,
    });
  },
};

// ─── Wallet Event Logger ────────────────────────────────────────────────────

export const walletLogger = {
  deposit: (userId, amount, currency, reference, meta = {}) => {
    logger.info(`Wallet deposit: ${amount} ${currency} - User ${userId}`, {
      walletEvent: true,
      eventType: "deposit",
      userId,
      amount,
      currency,
      reference,
      ...meta,
    });
  },
  withdrawal: (userId, amount, currency, reference, meta = {}) => {
    logger.info(`Wallet withdrawal: ${amount} ${currency} - User ${userId}`, {
      walletEvent: true,
      eventType: "withdrawal",
      userId,
      amount,
      currency,
      reference,
      ...meta,
    });
  },
  payment: (userId, amount, currency, bookingId, meta = {}) => {
    logger.info(`Wallet payment: ${amount} ${currency} - User ${userId}`, {
      walletEvent: true,
      eventType: "payment",
      userId,
      amount,
      currency,
      bookingId,
      ...meta,
    });
  },
  error: (message, meta = {}) => {
    logger.error(`Wallet error: ${message}`, {
      walletEvent: true,
      ...meta,
    });
  },
};

// ─── Database Logger ───────────────────────────────────────────────────────

export const dbLogger = {
  query: (query, params, duration, meta = {}) => {
    if (process.env.LOG_DB_QUERIES === "true") {
      logger.debug("Database query", {
        dbEvent: true,
        query: query.substring(0, 500),
        params: params?.length ? params : undefined,
        duration,
        ...meta,
      });
    }
  },
  error: (message, meta = {}) => {
    logger.error(`Database error: ${message}`, {
      dbEvent: true,
      ...meta,
    });
  },
  connection: (status, meta = {}) => {
    logger.info(`Database connection: ${status}`, {
      dbEvent: true,
      ...meta,
    });
  },
};

// ─── Performance Logger ────────────────────────────────────────────────────

export const performanceLogger = {
  api: (path, method, status, duration, meta = {}) => {
    if (duration > 1000) {
      // Log slow requests (> 1 second)
      logger.warn(`Slow API request: ${method} ${path} - ${duration}ms`, {
        performanceEvent: true,
        path,
        method,
        status,
        duration,
        ...meta,
      });
    } else {
      logger.debug(`API request: ${method} ${path} - ${duration}ms`, {
        performanceEvent: true,
        path,
        method,
        status,
        duration,
        ...meta,
      });
    }
  },
  error: (message, meta = {}) => {
    logger.error(`Performance issue: ${message}`, {
      performanceEvent: true,
      ...meta,
    });
  },
};

// ─── Export default logger ─────────────────────────────────────────────────

export default logger;

// ─── Uncaught Exception/Rejection Logging ─────────────────────────────────

// Log uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", {
    error: error.message,
    stack: error.stack,
    type: "uncaughtException",
  });
  // Don't exit in production - let PM2 handle it
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

// Log unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection:", {
    reason: reason?.message || reason,
    stack: reason?.stack,
    type: "unhandledRejection",
  });
});
