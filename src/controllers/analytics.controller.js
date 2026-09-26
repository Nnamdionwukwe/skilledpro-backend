// src/controllers/analytics.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Public analytics ingest endpoint. Called by the frontend tracker every
// ~5 seconds with a batch of events. Fire-and-forget — returns 202 always.
// ─────────────────────────────────────────────────────────────────────────────

import { asyncHandler } from "../middleware/error.middleware.js";
import {
  enqueueEvents,
  enrichFromRequest,
} from "../services/analytics.service.js";
import prisma from "../config/database.js";

// ─────────────────────────────────────────────────────────────────────────────
// § 1  Ingest events from frontend tracker
// POST /api/analytics/events
// ─────────────────────────────────────────────────────────────────────────────
export const ingestEvents = asyncHandler(async (req, res) => {
  const { sessionId, anonymousId, userId, events } = req.body || {};

  // ── Validate the envelope ────────────────────────────────────────────────
  if (!sessionId || typeof sessionId !== "string" || sessionId.length > 100) {
    return res
      .status(400)
      .json({ success: false, message: "sessionId required" });
  }
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(202).json({ success: true, accepted: 0 });
  }
  if (events.length > 200) {
    events.length = 200; // silently truncate huge batches
  }

  // ── Sanitize each event ──────────────────────────────────────────────────
  const clean = [];
  for (const e of events) {
    if (!e || typeof e.name !== "string" || e.name.length === 0) continue;
    if (e.name.length > 100) continue;

    const props = stripSensitive(e.props);
    clean.push({
      name: e.name.slice(0, 100),
      props,
      ts: Number.isFinite(e.ts) ? e.ts : Date.now(),
    });
  }

  // ── Resolve userId — trust authenticated user only ───────────────────────
  const trustedUserId = req.user?.id || null;

  // ── Enrich once per request ──────────────────────────────────────────────
  const enriched = enrichFromRequest(req);

  // ── Enqueue for async insert ─────────────────────────────────────────────
  enqueueEvents({
    events: clean,
    sessionId,
    anonymousId: anonymousId || null,
    userId: trustedUserId,
    enriched,
  });

  // ── Update session lastPingAt (cheap upsert, fire-and-forget) ────────────
  // Use the relation form for userId to satisfy Prisma's strict create type.
  prisma.userSession
    .upsert({
      where: { sessionId },
      update: {
        lastPingAt: new Date(),
        eventsCount: { increment: clean.length },
        ...(trustedUserId ? { user: { connect: { id: trustedUserId } } } : {}),
      },
      create: {
        sessionId,
        ...(trustedUserId ? { user: { connect: { id: trustedUserId } } } : {}),
        anonymousId: anonymousId || null,
        eventsCount: clean.length,
        entryPage:
          clean.find((e) => e.name === "page.view")?.props?.path || null,
        ...enriched,
      },
    })
    .catch((err) => {
      console.error("[analytics] session upsert failed:", err.message);
    });

  res.status(202).json({ success: true, accepted: clean.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 2  Record a page view
// POST /api/analytics/pageview
// ─────────────────────────────────────────────────────────────────────────────
export const recordPageView = asyncHandler(async (req, res) => {
  const {
    sessionId,
    path,
    title,
    referrer,
    enteredAt,
    leftAt,
    durationMs,
    scrollDepthPct,
    interactionCount,
  } = req.body || {};

  if (!sessionId || !path) {
    return res
      .status(400)
      .json({ success: false, message: "sessionId and path required" });
  }

  const userId = req.user?.id || null;
  const pageRef = path
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "[id]",
    )
    .replace(/\/\d+(?=\/|$)/g, "/[id]");

  try {
    await prisma.pageView.create({
      data: {
        ...(userId ? { user: { connect: { id: userId } } } : {}),
        sessionId,
        pagePath: path.slice(0, 500),
        pageRef: pageRef.slice(0, 500),
        title: title?.slice(0, 200) || null,
        enteredAt: enteredAt ? new Date(enteredAt) : new Date(),
        leftAt: leftAt ? new Date(leftAt) : null,
        durationMs: Number.isFinite(durationMs) ? durationMs : null,
        scrollDepthPct: Number.isFinite(scrollDepthPct) ? scrollDepthPct : null,
        interactionCount: Number.isFinite(interactionCount)
          ? interactionCount
          : 0,
        referrer: referrer?.slice(0, 500) || null,
      },
    });

    if (userId) {
      prisma.userSession
        .update({
          where: { sessionId },
          data: { pageViews: { increment: 1 } },
        })
        .catch(() => {});
    }

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("[analytics] pageView error:", err.message);
    return res.status(202).json({ success: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// § 3  Record an interaction
// POST /api/analytics/interaction
// ─────────────────────────────────────────────────────────────────────────────
export const recordInteraction = asyncHandler(async (req, res) => {
  const {
    sessionId,
    pageViewId,
    elementId,
    elementType,
    action,
    value,
    metadata,
  } = req.body || {};

  if (!sessionId || !elementId || !action) {
    return res.status(400).json({
      success: false,
      message: "sessionId, elementId, action required",
    });
  }

  const userId = req.user?.id || null;

  try {
    await prisma.interactionEvent.create({
      data: {
        ...(userId ? { user: { connect: { id: userId } } } : {}),
        sessionId,
        pageViewId: pageViewId || null,
        elementId: String(elementId).slice(0, 150),
        elementType: String(elementType || "unknown").slice(0, 50),
        action: String(action).slice(0, 50),
        value: value ? String(value).slice(0, 500) : null,
        metadata: sanitizeMetadata(metadata),
      },
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("[analytics] interaction error:", err.message);
    return res.status(202).json({ success: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// § 4  Session lifecycle
// ─────────────────────────────────────────────────────────────────────────────
export const startSession = asyncHandler(async (req, res) => {
  const { sessionId, anonymousId, entryPage, referrer } = req.body || {};
  if (!sessionId) {
    return res
      .status(400)
      .json({ success: false, message: "sessionId required" });
  }

  const userId = req.user?.id || null;
  const enriched = enrichFromRequest(req);

  await prisma.userSession.upsert({
    where: { sessionId },
    update: {
      lastPingAt: new Date(),
      ...(userId ? { user: { connect: { id: userId } } } : {}),
    },
    create: {
      sessionId,
      ...(userId ? { user: { connect: { id: userId } } } : {}),
      anonymousId: anonymousId || null,
      entryPage: entryPage?.slice(0, 500) || null,
      referrer: referrer?.slice(0, 500) || null,
      ...enriched,
    },
  });

  return res.status(201).json({ success: true });
});

export const endSession = asyncHandler(async (req, res) => {
  const { sessionId, exitPage, durationMs } = req.body || {};
  if (!sessionId) {
    return res
      .status(400)
      .json({ success: false, message: "sessionId required" });
  }

  const now = new Date();
  const session = await prisma.userSession.findUnique({ where: { sessionId } });
  if (!session) return res.status(200).json({ success: true });

  const computedDuration = session.startedAt
    ? now.getTime() - session.startedAt.getTime()
    : 0;

  await prisma.userSession.update({
    where: { sessionId },
    data: {
      endedAt: now,
      durationMs: Number.isFinite(durationMs) ? durationMs : computedDuration,
      exitPage: exitPage?.slice(0, 500) || session.exitPage,
      bounce: session.pageViews <= 1 && computedDuration < 10_000,
    },
  });

  return res.status(200).json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const SENSITIVE_KEYS = new Set([
  "password",
  "confirmPassword",
  "currentPassword",
  "newPassword",
  "token",
  "accessToken",
  "refreshToken",
  "jwt",
  "authorization",
  "cardNumber",
  "cvv",
  "cvc",
  "ssn",
  "pin",
  "withdrawalPin",
]);

function stripSensitive(props) {
  if (!props || typeof props !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (SENSITIVE_KEYS.has(k)) continue;
    if (typeof v === "string" && v.length > 500) {
      out[k] = v.slice(0, 500);
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 20);
    } else if (typeof v === "object" && v !== null) {
      out[k] = stripSensitive(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== "object") return null;
  try {
    return stripSensitive(meta);
  } catch {
    return null;
  }
}
