// src/controllers/report.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Report / Flag System for SkilledProz
//
// Flow:
//   1. Any authenticated user submits a report against a target
//   2. Admin sees it in their queue (status = PENDING)
//   3. Admin moves to REVIEWING — target user/content is NOT affected yet
//   4. Admin resolves with an action:
//        NO_ACTION       → just mark resolved, notify reporter
//        WARNING_ISSUED  → send warning notification to reported user
//        CONTENT_REMOVED → delete/deactivate the reported content
//        USER_SUSPENDED  → set user.isActive = false
//        USER_BANNED     → set user.isBanned = true (permanent)
//   5. Both reporter and reported user are notified
//   6. Admin can also dismiss false reports
//
// User endpoints  : POST, GET my reports, DELETE (cancel pending)
// Admin endpoints : full CRUD + stats + bulk actions
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { logAdminAction } from "../utils/auditLog.js";
import { paginate, paginationMeta, fullName, formatCurrency, truncate, slugify, uniqueRef, parseJSON, extractIP, timeAgo, safeUser } from "../utils/helpers.js";
// ─── Allowed values (mirrors Prisma enums) ───────────────────────────────────
const VALID_TYPES = [
  "USER",
  "JOB_POST",
  "POST",
  "REVIEW",
  "BOOKING",
  "MESSAGE",
];

const VALID_REASONS = [
  "SPAM",
  "FAKE_PROFILE",
  "INAPPROPRIATE_CONTENT",
  "FRAUD",
  "HARASSMENT",
  "SCAM",
  "MISLEADING_INFORMATION",
  "FAKE_REVIEWS",
  "UNDERAGE_USER",
  "HATE_SPEECH",
  "OTHER",
];

const VALID_ACTIONS = [
  "NO_ACTION",
  "WARNING_ISSUED",
  "CONTENT_REMOVED",
  "USER_SUSPENDED",
  "USER_BANNED",
];

// ─── Human-readable labels (for notifications) ───────────────────────────────
const TYPE_LABEL = {
  USER: "user",
  JOB_POST: "job post",
  POST: "community post",
  REVIEW: "review",
  BOOKING: "booking",
  MESSAGE: "message",
};

const REASON_LABEL = {
  SPAM: "Spam",
  FAKE_PROFILE: "Fake profile",
  INAPPROPRIATE_CONTENT: "Inappropriate content",
  FRAUD: "Fraud / scam activity",
  HARASSMENT: "Harassment",
  SCAM: "Scam",
  MISLEADING_INFORMATION: "Misleading information",
  FAKE_REVIEWS: "Fake reviews",
  UNDERAGE_USER: "Underage user",
  HATE_SPEECH: "Hate speech",
  OTHER: "Other",
};

// ─── Helper: verify the reported target exists ───────────────────────────────
async function targetExists(type, id) {
  try {
    switch (type) {
      case "USER":
        return !!(await prisma.user.findUnique({
          where: { id },
          select: { id: true },
        }));
      case "JOB_POST":
        return !!(await prisma.jobPost.findUnique({
          where: { id },
          select: { id: true },
        }));
      case "POST":
        return !!(await prisma.post.findUnique({
          where: { id },
          select: { id: true },
        }));
      case "REVIEW":
        return !!(await prisma.review.findUnique({
          where: { id },
          select: { id: true },
        }));
      case "BOOKING":
        return !!(await prisma.booking.findUnique({
          where: { id },
          select: { id: true },
        }));
      case "MESSAGE":
        return !!(await prisma.message.findUnique({
          where: { id },
          select: { id: true },
        }));
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ─── Helper: get the owner userId for a target (for notifications) ───────────
async function getTargetOwnerId(type, id) {
  try {
    switch (type) {
      case "USER":
        return id; // the target IS the user
      case "JOB_POST": {
        const j = await prisma.jobPost.findUnique({
          where: { id },
          select: { hirerId: true },
        });
        return j?.hirerId;
      }
      case "POST": {
        const p = await prisma.post.findUnique({
          where: { id },
          select: { authorId: true },
        });
        return p?.authorId;
      }
      case "REVIEW": {
        const r = await prisma.review.findUnique({
          where: { id },
          select: { giverId: true },
        });
        return r?.giverId;
      }
      case "BOOKING": {
        const b = await prisma.booking.findUnique({
          where: { id },
          select: { hirerId: true, workerId: true },
        });
        return b?.hirerId; // or workerId depending on context
      }
      case "MESSAGE": {
        const m = await prisma.message.findUnique({
          where: { id },
          select: { senderId: true },
        });
        return m?.senderId;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1  USER: SUBMIT A REPORT
// POST /api/reports
// Body: { targetType, targetId, reason, description?, evidence?: string[] }
// ─────────────────────────────────────────────────────────────────────────────
export const createReport = async (req, res) => {
  try {
    const reporterId = req.user.id;
    const {
      targetType,
      targetId,
      reason,
      description,
      evidence = [],
    } = req.body;

    // ── Validate inputs ──────────────────────────────────────────────────────
    if (!targetType || !VALID_TYPES.includes(targetType)) {
      return sendError(
        res,
        `targetType must be one of: ${VALID_TYPES.join(", ")}`,
        400,
      );
    }
    if (!targetId || typeof targetId !== "string" || !targetId.trim()) {
      return sendError(res, "targetId is required", 400);
    }
    if (!reason || !VALID_REASONS.includes(reason)) {
      return sendError(
        res,
        `reason must be one of: ${VALID_REASONS.join(", ")}`,
        400,
      );
    }
    if (description && typeof description !== "string") {
      return sendError(res, "description must be a string", 400);
    }
    if (
      !Array.isArray(evidence) ||
      evidence.some((e) => typeof e !== "string")
    ) {
      return sendError(res, "evidence must be an array of strings (URLs)", 400);
    }

    // ── Self-report prevention ───────────────────────────────────────────────
    if (targetType === "USER" && targetId === reporterId) {
      return sendError(res, "You cannot report yourself", 400);
    }

    // ── Check target exists ──────────────────────────────────────────────────
    const exists = await targetExists(targetType, targetId);
    if (!exists) {
      return sendError(
        res,
        `The reported ${TYPE_LABEL[targetType]} could not be found`,
        404,
      );
    }

    // ── Check for duplicate report ───────────────────────────────────────────
    // (DB unique constraint also guards this, but give a friendly message)
    const duplicate = await prisma.report.findUnique({
      where: {
        reporterId_targetType_targetId: { reporterId, targetType, targetId },
      },
      select: { id: true, status: true },
    });
    if (duplicate) {
      if (["RESOLVED", "DISMISSED"].includes(duplicate.status)) {
        return sendError(
          res,
          "You have already reported this and it has been reviewed. You cannot re-submit the same report.",
          409,
        );
      }
      return sendError(
        res,
        "You have already submitted a report for this item. Our team is reviewing it.",
        409,
      );
    }

    // ── Create report ────────────────────────────────────────────────────────
    const report = await prisma.report.create({
      data: {
        reporterId,
        targetType,
        targetId,
        reason,
        description: description?.trim() || null,
        evidence: evidence.slice(0, 5), // max 5 evidence URLs
        status: "PENDING",
      },
    });

    // ── Notify admins ────────────────────────────────────────────────────────
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          title: `New Report: ${REASON_LABEL[reason]}`,
          body: `A ${TYPE_LABEL[targetType]} has been reported for: ${REASON_LABEL[reason]}. Ref #${report.id.slice(-8).toUpperCase()}`,
          type: "REPORT_SUBMITTED",
          data: { reportId: report.id, targetType, targetId, reason },
        })),
      });
    }

    return sendResponse(res, {
      status: 201,
      message: "Report submitted. Our team will review it within 24–48 hours.",
      data: {
        reportId: report.id,
        status: report.status,
        ref: `#${report.id.slice(-8).toUpperCase()}`,
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      return sendError(
        res,
        "You have already submitted a report for this item.",
        409,
      );
    }
    console.error("createReport:", err);
    return sendError(res, "Failed to submit report");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 2  USER: GET MY REPORTS
// GET /api/reports/my?page=1&limit=10&status=
// ─────────────────────────────────────────────────────────────────────────────
export const getMyReports = async (req, res) => {
  try {
    const reporterId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = { reporterId, ...(status ? { status } : {}) };

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          targetType: true,
          targetId: true,
          reason: true,
          description: true,
          status: true,
          adminNote: true,
          actionTaken: true,
          resolvedAt: true,
          createdAt: true,
        },
      }),
      prisma.report.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        reports: reports.map((r) => ({
          ...r,
          ref: `#${r.id.slice(-8).toUpperCase()}`,
          reasonLabel: REASON_LABEL[r.reason],
          typeLabel: TYPE_LABEL[r.targetType],
        })),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("getMyReports:", err);
    return sendError(res, "Failed to fetch your reports");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 3  USER: CANCEL A PENDING REPORT
// DELETE /api/reports/:id
// ─────────────────────────────────────────────────────────────────────────────
export const cancelReport = async (req, res) => {
  try {
    const reporterId = req.user.id;
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      select: { id: true, reporterId: true, status: true },
    });
    if (!report) return sendError(res, "Report not found", 404);
    if (report.reporterId !== reporterId)
      return sendError(res, "Forbidden", 403);
    if (report.status !== "PENDING") {
      return sendError(
        res,
        `Cannot cancel a report that is ${report.status}`,
        400,
      );
    }

    await prisma.report.delete({ where: { id: report.id } });

    return sendResponse(res, { message: "Report cancelled and removed" });
  } catch (err) {
    console.error("cancelReport:", err);
    return sendError(res, "Failed to cancel report");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 4  ADMIN: GET ALL REPORTS
// GET /api/reports/admin?status=&type=&reason=&page=&limit=&search=
// ─────────────────────────────────────────────────────────────────────────────
export const adminGetAllReports = async (req, res) => {
  try {
    const {
      status,
      type,
      reason,
      page = 1,
      limit = 20,
      search,
      from,
      to,
    } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {
      ...(status ? { status } : {}),
      ...(type ? { targetType: type } : {}),
      ...(reason ? { reason } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { description: { contains: search, mode: "insensitive" } },
              {
                reporter: {
                  firstName: { contains: search, mode: "insensitive" },
                },
              },
              {
                reporter: { email: { contains: search, mode: "insensitive" } },
              },
            ],
          }
        : {}),
    };

    const [reports, total, statusCounts] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          reporter: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.report.count({ where }),
      prisma.report.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    // Status summary counts for the admin dashboard top bar
    const summary = statusCounts.reduce(
      (acc, s) => ({ ...acc, [s.status]: s._count }),
      { PENDING: 0, REVIEWING: 0, RESOLVED: 0, DISMISSED: 0 },
    );

    return sendResponse(res, {
      data: {
        reports: reports.map((r) => ({
          ...r,
          ref: `#${r.id.slice(-8).toUpperCase()}`,
          reasonLabel: REASON_LABEL[r.reason],
          typeLabel: TYPE_LABEL[r.targetType],
        })),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
        summary,
      },
    });
  } catch (err) {
    console.error("adminGetAllReports:", err);
    return sendError(res, "Failed to fetch reports");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 5  ADMIN: GET SINGLE REPORT DETAIL
// GET /api/reports/admin/:id
// ─────────────────────────────────────────────────────────────────────────────
export const adminGetReportDetail = async (req, res) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: {
        reporter: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            role: true,
            createdAt: true,
          },
        },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!report) return sendError(res, "Report not found", 404);

    // Fetch the target object for context
    let targetData = null;
    try {
      switch (report.targetType) {
        case "USER":
          targetData = await prisma.user.findUnique({
            where: { id: report.targetId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              role: true,
              isBanned: true,
              isActive: true,
              createdAt: true,
            },
          });
          break;
        case "JOB_POST":
          targetData = await prisma.jobPost.findUnique({
            where: { id: report.targetId },
            select: {
              id: true,
              title: true,
              status: true,
              hirerId: true,
              createdAt: true,
            },
          });
          break;
        case "POST":
          targetData = await prisma.post.findUnique({
            where: { id: report.targetId },
            select: {
              id: true,
              content: true,
              type: true,
              authorId: true,
              createdAt: true,
            },
          });
          break;
        case "REVIEW":
          targetData = await prisma.review.findUnique({
            where: { id: report.targetId },
            select: {
              id: true,
              comment: true,
              rating: true,
              giverId: true,
              receiverId: true,
              createdAt: true,
            },
          });
          break;
        case "BOOKING":
          targetData = await prisma.booking.findUnique({
            where: { id: report.targetId },
            select: {
              id: true,
              title: true,
              status: true,
              hirerId: true,
              workerId: true,
              createdAt: true,
            },
          });
          break;
        case "MESSAGE":
          targetData = await prisma.message.findUnique({
            where: { id: report.targetId },
            select: {
              id: true,
              content: true,
              senderId: true,
              createdAt: true,
            },
          });
          break;
      }
    } catch {}

    // Also check if reporter has previous reports (pattern detection)
    const reporterHistory = await prisma.report.count({
      where: { reporterId: report.reporterId },
    });

    // Check how many reports this target has received in total
    const targetReportCount = await prisma.report.count({
      where: { targetType: report.targetType, targetId: report.targetId },
    });

    return sendResponse(res, {
      data: {
        report: {
          ...report,
          ref: `#${report.id.slice(-8).toUpperCase()}`,
          reasonLabel: REASON_LABEL[report.reason],
          typeLabel: TYPE_LABEL[report.targetType],
          targetData,
          context: {
            reporterTotalReports: reporterHistory,
            targetTotalReports: targetReportCount,
          },
        },
      },
    });
  } catch (err) {
    console.error("adminGetReportDetail:", err);
    return sendError(res, "Failed to fetch report");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 6  ADMIN: GET REPORTS ABOUT A SPECIFIC TARGET
// GET /api/reports/admin/target/:targetType/:targetId
// ─────────────────────────────────────────────────────────────────────────────
export const adminGetReportsByTarget = async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    if (!VALID_TYPES.includes(targetType)) {
      return sendError(res, "Invalid targetType", 400);
    }

    const reports = await prisma.report.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: "desc" },
      include: {
        reporter: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const reasonBreakdown = reports.reduce((acc, r) => {
      acc[r.reason] = (acc[r.reason] || 0) + 1;
      return acc;
    }, {});

    return sendResponse(res, {
      data: {
        targetType,
        targetId,
        total: reports.length,
        pending: reports.filter((r) => r.status === "PENDING").length,
        reasonBreakdown,
        reports,
      },
    });
  } catch (err) {
    console.error("adminGetReportsByTarget:", err);
    return sendError(res, "Failed to fetch target reports");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 7  ADMIN: START REVIEWING (PENDING → REVIEWING)
// PATCH /api/reports/admin/:id/review
// ─────────────────────────────────────────────────────────────────────────────
export const adminStartReview = async (req, res) => {
  try {
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
    });
    if (!report) return sendError(res, "Report not found", 404);
    if (report.status !== "PENDING") {
      return sendError(res, `Report is already ${report.status}`, 400);
    }

    await prisma.report.update({
      where: { id: report.id },
      data: {
        status: "REVIEWING",
        reviewedById: req.user.id,
      },
    });

    return sendResponse(res, { message: "Report moved to REVIEWING" });
  } catch (err) {
    console.error("adminStartReview:", err);
    return sendError(res, "Failed to start review");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 8  ADMIN: RESOLVE REPORT WITH ACTION
// PATCH /api/reports/admin/:id/resolve
// Body: { action, adminNote? }
//   action: NO_ACTION | WARNING_ISSUED | CONTENT_REMOVED | USER_SUSPENDED | USER_BANNED
// ─────────────────────────────────────────────────────────────────────────────
export const adminResolveReport = async (req, res) => {
  try {
    const { action, adminNote } = req.body;
    const adminId = req.user.id;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return sendError(
        res,
        `action must be one of: ${VALID_ACTIONS.join(", ")}`,
        400,
      );
    }

    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: { reporter: { select: { id: true, firstName: true } } },
    });
    if (!report) return sendError(res, "Report not found", 404);
    if (report.status === "RESOLVED" || report.status === "DISMISSED") {
      return sendError(res, `Report is already ${report.status}`, 400);
    }

    // ── Execute the chosen action ────────────────────────────────────────────
    const targetOwnerId = await getTargetOwnerId(
      report.targetType,
      report.targetId,
    );
    const notifications = [];

    switch (action) {
      case "NO_ACTION":
        // Nothing done to the target — just close the report
        break;

      case "WARNING_ISSUED":
        if (targetOwnerId) {
          notifications.push({
            userId: targetOwnerId,
            title: "⚠️ Platform Warning",
            body: `Your ${TYPE_LABEL[report.targetType]} has been reviewed and you have received an official warning from SkilledProz. ${adminNote ? "Reason: " + adminNote : "Please ensure your activity complies with our community guidelines."}`,
            type: "REPORT_ACTION_WARNING",
            data: {
              reportId: report.id,
              action,
              targetType: report.targetType,
            },
          });
        }
        break;

      case "CONTENT_REMOVED":
        // Soft-delete / deactivate the reported content
        try {
          switch (report.targetType) {
            case "JOB_POST":
              await prisma.jobPost.update({
                where: { id: report.targetId },
                data: { status: "CANCELLED" },
              });
              break;
            case "POST":
              await prisma.post
                .delete({ where: { id: report.targetId } })
                .catch(() => {});
              break;
            case "REVIEW":
              await prisma.review
                .delete({ where: { id: report.targetId } })
                .catch(() => {});
              break;
            case "MESSAGE":
              await prisma.message
                .update({
                  where: { id: report.targetId },
                  data: { content: "[Message removed by admin]" },
                })
                .catch(() => {});
              break;
          }
        } catch {}

        if (targetOwnerId) {
          notifications.push({
            userId: targetOwnerId,
            title: "Content Removed",
            body: `Your ${TYPE_LABEL[report.targetType]} has been removed by our moderation team for violating community guidelines. ${adminNote || ""}`,
            type: "REPORT_ACTION_CONTENT_REMOVED",
            data: {
              reportId: report.id,
              action,
              targetType: report.targetType,
            },
          });
        }
        break;

      case "USER_SUSPENDED":
        if (targetOwnerId) {
          await prisma.user.update({
            where: { id: targetOwnerId },
            data: { isActive: false, refreshToken: null },
          });
          notifications.push({
            userId: targetOwnerId,
            title: "Account Suspended",
            body: `Your SkilledProz account has been suspended pending a review of your activity. ${adminNote ? "Reason: " + adminNote : "Please contact support if you believe this is an error."}`,
            type: "REPORT_ACTION_SUSPENDED",
            data: { reportId: report.id, action },
          });
        }
        break;

      case "USER_BANNED":
        if (targetOwnerId) {
          await prisma.user.update({
            where: { id: targetOwnerId },
            data: { isBanned: true, isActive: false, refreshToken: null },
          });
          notifications.push({
            userId: targetOwnerId,
            title: "Account Permanently Banned",
            body: `Your SkilledProz account has been permanently banned for violating our terms of service. ${adminNote || ""}`,
            type: "REPORT_ACTION_BANNED",
            data: { reportId: report.id, action },
          });
        }
        break;
    }

    // ── Notify the reporter of the outcome ───────────────────────────────────
    notifications.push({
      userId: report.reporterId,
      title: "Your report has been reviewed ✅",
      body:
        action === "NO_ACTION"
          ? `We reviewed your report (Ref ${`#${report.id.slice(-8).toUpperCase()}`}) and found no violation. Thank you for keeping our community safe.`
          : `We took action on your report (Ref ${`#${report.id.slice(-8).toUpperCase()}`}). Thank you for helping keep SkilledProz safe.`,
      type: "REPORT_RESOLVED",
      data: { reportId: report.id, action },
    });

    // ── Save everything ──────────────────────────────────────────────────────
    await prisma.$transaction([
      prisma.report.update({
        where: { id: report.id },
        data: {
          status: "RESOLVED",
          actionTaken: action,
          adminNote: adminNote?.trim() || null,
          reviewedById: adminId,
          resolvedAt: new Date(),
        },
      }),
      prisma.notification.createMany({ data: notifications }),
    ]);

    await logAdminAction({
      req,
      adminId: adminId,
      action: "REPORT_RESOLVED",
      targetType: "REPORT",
      targetId: report.id,
      description: `Resolved report #${report.id.slice(-8).toUpperCase()} — Action: ${action}`,
      before: { status: report.status },
      after: { status: "RESOLVED", actionTaken: action },
      meta: {
        action,
        adminNote,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
      },
    });

    return sendResponse(res, {
      message: `Report resolved. Action taken: ${action}`,
      data: { reportId: report.id, action, notified: notifications.length },
    });
  } catch (err) {
    console.error("adminResolveReport:", err);
    return sendError(res, "Failed to resolve report");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 9  ADMIN: DISMISS A FALSE / INVALID REPORT
// PATCH /api/reports/admin/:id/dismiss
// Body: { adminNote? }
// ─────────────────────────────────────────────────────────────────────────────
export const adminDismissReport = async (req, res) => {
  try {
    const { adminNote } = req.body;
    const adminId = req.user.id;

    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
    });
    if (!report) return sendError(res, "Report not found", 404);
    if (report.status === "RESOLVED" || report.status === "DISMISSED") {
      return sendError(res, `Report is already ${report.status}`, 400);
    }

    await prisma.$transaction([
      prisma.report.update({
        where: { id: report.id },
        data: {
          status: "DISMISSED",
          actionTaken: "NO_ACTION",
          adminNote:
            adminNote?.trim() || "Dismissed as not in violation of guidelines.",
          reviewedById: adminId,
          resolvedAt: new Date(),
        },
      }),
      prisma.notification.create({
        data: {
          userId: report.reporterId,
          title: "Your report has been reviewed",
          body: `We reviewed your report (Ref #${report.id.slice(-8).toUpperCase()}) and found no violation of our community guidelines. Thank you for your vigilance.`,
          type: "REPORT_DISMISSED",
          data: { reportId: report.id },
        },
      }),
    ]);

    await logAdminAction({
      req,
      adminId: adminId,
      action: "REPORT_DISMISSED",
      targetType: "REPORT",
      targetId: report.id,
      description: `Dismissed report #${report.id.slice(-8).toUpperCase()} — ${adminNote || "No violation found"}`,
      before: { status: report.status },
      after: { status: "DISMISSED" },
      meta: { adminNote, reason: report.reason },
    });

    return sendResponse(res, { message: "Report dismissed" });
  } catch (err) {
    console.error("adminDismissReport:", err);
    return sendError(res, "Failed to dismiss report");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 10  ADMIN: BULK DISMISS (clear queue of false reports)
// PATCH /api/reports/admin/bulk-dismiss
// Body: { reportIds: string[], adminNote? }
// ─────────────────────────────────────────────────────────────────────────────
export const adminBulkDismiss = async (req, res) => {
  try {
    const { reportIds, adminNote } = req.body;
    const adminId = req.user.id;

    if (!Array.isArray(reportIds) || reportIds.length === 0) {
      return sendError(res, "reportIds must be a non-empty array", 400);
    }
    if (reportIds.length > 50) {
      return sendError(
        res,
        "Cannot bulk dismiss more than 50 reports at once",
        400,
      );
    }

    const { count } = await prisma.report.updateMany({
      where: {
        id: { in: reportIds },
        status: { in: ["PENDING", "REVIEWING"] },
      },
      data: {
        status: "DISMISSED",
        actionTaken: "NO_ACTION",
        adminNote: adminNote?.trim() || "Dismissed — no violation found",
        reviewedById: adminId,
        resolvedAt: new Date(),
      },
    });

    return sendResponse(res, {
      message: `${count} report(s) dismissed`,
      data: { dismissed: count },
    });
  } catch (err) {
    console.error("adminBulkDismiss:", err);
    return sendError(res, "Bulk dismiss failed");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 11  ADMIN: STATS DASHBOARD
// GET /api/reports/admin/stats
// ─────────────────────────────────────────────────────────────────────────────
export const adminGetReportStats = async (req, res) => {
  try {
    const [
      statusBreakdown,
      typeBreakdown,
      reasonBreakdown,
      actionBreakdown,
      recentActivity,
      topReportedUsers,
      totalReports,
    ] = await Promise.all([
      // By status
      prisma.report.groupBy({ by: ["status"], _count: true }),
      // By target type
      prisma.report.groupBy({ by: ["targetType"], _count: true }),
      // By reason
      prisma.report.groupBy({ by: ["reason"], _count: true }),
      // By action taken
      prisma.report.groupBy({
        by: ["actionTaken"],
        _count: true,
        where: { status: "RESOLVED" },
      }),

      // Last 7 days activity
      prisma.report.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        select: { createdAt: true, status: true },
        orderBy: { createdAt: "asc" },
      }),

      // Most reported users
      prisma.report.groupBy({
        by: ["targetId"],
        where: { targetType: "USER" },
        _count: true,
        orderBy: { _count: { targetId: "desc" } },
        take: 5,
      }),

      prisma.report.count(),
    ]);

    // Daily breakdown for the past 7 days
    const dailyMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = { date: key, total: 0, resolved: 0, pending: 0 };
    }
    for (const r of recentActivity) {
      const key = r.createdAt.toISOString().slice(0, 10);
      if (dailyMap[key]) {
        dailyMap[key].total++;
        if (r.status === "RESOLVED" || r.status === "DISMISSED")
          dailyMap[key].resolved++;
        if (r.status === "PENDING") dailyMap[key].pending++;
      }
    }

    // Enrich top reported users with name
    const topReportedUsersEnriched = await Promise.all(
      topReportedUsers.map(async (r) => {
        const user = await prisma.user.findUnique({
          where: { id: r.targetId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            isBanned: true,
            isActive: true,
          },
        });
        return { ...user, reportCount: r._count };
      }),
    );

    return sendResponse(res, {
      data: {
        total: totalReports,
        pending:
          statusBreakdown.find((s) => s.status === "PENDING")?._count || 0,
        reviewing:
          statusBreakdown.find((s) => s.status === "REVIEWING")?._count || 0,
        resolved:
          statusBreakdown.find((s) => s.status === "RESOLVED")?._count || 0,
        dismissed:
          statusBreakdown.find((s) => s.status === "DISMISSED")?._count || 0,
        byStatus: statusBreakdown.reduce(
          (a, s) => ({ ...a, [s.status]: s._count }),
          {},
        ),
        byType: typeBreakdown.reduce(
          (a, s) => ({ ...a, [s.targetType]: s._count }),
          {},
        ),
        byReason: reasonBreakdown.reduce(
          (a, s) => ({ ...a, [s.reason]: s._count }),
          {},
        ),
        byAction: actionBreakdown.reduce(
          (a, s) => ({ ...a, [s.actionTaken ?? "NONE"]: s._count }),
          {},
        ),
        dailyActivity: Object.values(dailyMap),
        topReportedUsers: topReportedUsersEnriched,
      },
    });
  } catch (err) {
    console.error("adminGetReportStats:", err);
    return sendError(res, "Failed to load report stats");
  }
};
