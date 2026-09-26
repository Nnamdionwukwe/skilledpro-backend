// src/services/analytics.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Buffered ingestion + enrichment for user analytics events.
//
// The controller calls `enqueueEvents(...)` and returns immediately. A
// debounced flush writes batches to Postgres so we never block the request
// thread on a slow insert.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import crypto from "crypto";

const BATCH_SIZE = 500;
const FLUSH_INTERVAL_MS = 1000;
const MAX_BUFFER = 5000;

let buffer = [];
let flushTimer = null;
let flushing = false;

// ── Path normalization ──────────────────────────────────────────────────────
// "/bookings/abc-123" → "/bookings/[id]"
// so aggregations group by page-type, not specific instance.
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_RE = /\/\d+(?=\/|$)/g;

export function normalizePath(p) {
  if (!p) return null;
  return p.replace(UUID_RE, "[id]").replace(NUMERIC_RE, "/[id]");
}

// ── Request enrichment ──────────────────────────────────────────────────────
// Extracts IP, UA, device, OS, browser from a request.
// Never throws — returns nulls on any failure.
export function enrichFromRequest(req) {
  try {
    const ua = req.headers["user-agent"] || "";
    const ip =
      req.headers["x-real-ip"] ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      null;
    const locale = req.headers["accept-language"]?.split(",")[0] || null;

    return {
      ipAddress: ip,
      userAgent: ua ? ua.slice(0, 500) : null,
      deviceType: detectDevice(ua),
      os: detectOS(ua),
      browser: detectBrowser(ua),
      locale,
    };
  } catch {
    return {
      ipAddress: null,
      userAgent: null,
      deviceType: null,
      os: null,
      browser: null,
      locale: null,
    };
  }
}

function detectDevice(ua) {
  if (!ua) return null;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobile|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

function detectOS(ua) {
  if (!ua) return null;
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

function detectBrowser(ua) {
  if (!ua) return null;
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (/Firefox\//i.test(ua)) return "Firefox";
  return "Other";
}

// ── Enqueue ─────────────────────────────────────────────────────────────────
// Called by the controller. Returns immediately.
export function enqueueEvents({
  events,
  sessionId,
  anonymousId,
  userId,
  enriched,
}) {
  const now = new Date();

  for (const e of events) {
    if (buffer.length >= MAX_BUFFER) break;

    const pagePath = typeof e.props?.path === "string" ? e.props.path : null;

    buffer.push({
      id: crypto.randomUUID(),
      userId: userId || null,
      anonymousId: anonymousId || null,
      sessionId,
      eventName: e.name,
      eventProps: e.props || {},
      pagePath,
      pageRef: normalizePath(pagePath),
      referrer: typeof e.props?.referrer === "string" ? e.props.referrer : null,
      ...enriched,
      createdAt: new Date(e.ts || now),
    });
  }

  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

async function flushBuffer() {
  if (flushing || buffer.length === 0) return;
  flushing = true;

  const batch = buffer.splice(0, Math.min(buffer.length, BATCH_SIZE));

  try {
    await prisma.userEvent.createMany({ data: batch, skipDuplicates: true });
  } catch (err) {
    console.error("[analytics] userEvent flush failed:", err.message);
    // Don't requeue indefinitely — drop the batch but log
  } finally {
    flushing = false;
    if (buffer.length > 0) scheduleFlush();
  }
}

// Graceful shutdown — flush remaining on process exit
process.on("SIGTERM", () => flushBuffer().finally(() => process.exit(0)));
process.on("SIGINT", () => flushBuffer().finally(() => process.exit(0)));
