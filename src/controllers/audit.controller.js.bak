// src/controllers/audit.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin Audit Log — read-only endpoints for the admin dashboard
//
// All write operations happen via logAdminAction() in src/utils/auditLog.js
// This controller is entirely for QUERYING the log.
//
// Endpoints:
//   GET  /api/audit                        — full paginated log with filters
//   GET  /api/audit/stats                  — stats dashboard (30-day chart, top admins, etc.)
//   GET  /api/audit/me                     — current admin's own trail
//   GET  /api/audit/admins                 — list of all admins who have logged actions
//   GET  /api/audit/target/:type/:id       — all entries affecting one specific record
//   GET  /api/audit/:id                    — single entry detail
//   GET  /api/audit/export                 — CSV export (max 5000 rows)
//   DELETE /api/audit/purge                — delete entries older than N days
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";

// ─── Readable labels for the UI ──────────────────────────────────────────────
const ACTION_LABELS = {
  USER_BANNED: "Banned user",
  USER_UNBANNED: "Unbanned user",
  USER_DELETED: "Deleted user",
  USER_ROLE_CHANGED: "Changed user role",
  USER_VERIFIED: "Verified worker",
  USER_VERIFICATION_REJECTED: "Rejected verification",
  USER_SUSPENDED: "Suspended user",
  PAYMENT_RELEASED: "Released payment",
  PAYMENT_REFUNDED: "Refunded payment",
  PAYMENT_MANUAL_VERIFIED: "Verified manual payment",
  PAYMENT_MANUAL_REJECTED: "Rejected manual payment",
  WITHDRAWAL_APPROVED: "Approved withdrawal",
  WITHDRAWAL_REJECTED: "Rejected withdrawal",
  REPORT_REVIEWED: "Started reviewing report",
  REPORT_RESOLVED: "Resolved report",
  REPORT_DISMISSED: "Dismissed report",
  REPORT_BULK_DISMISSED: "Bulk dismissed reports",
  CATEGORY_CREATED: "Created category",
  CATEGORY_UPDATED: "Updated category",
  CATEGORY_DELETED: "Deleted category",
  REVIEW_DELETED: "Deleted review",
  JOB_DELETED: "Deleted job post",
  JOB_STATUS_CHANGED: "Changed job status",
  POST_DELETED: "Deleted community post",
  COMMENT_DELETED: "Deleted comment",
  FEATURED_REMOVED: "Removed featured listing",
  BOOKING_STATUS_CHANGED: "Changed booking status",
  DISPUTE_RESOLVED: "Resolved dispute",
  CAMPAIGN_SUBMISSION_REVIEWED: "Reviewed campaign submission",
  CAMPAIGN_WITHDRAWAL_APPROVED: "Approved campaign withdrawal",
  CAMPAIGN_WITHDRAWAL_REJECTED: "Rejected campaign withdrawal",
  REFERRAL_PAYOUT_PROCESSED: "Processed referral payout",
  REFERRAL_FLAGGED: "Flagged referral",
  SUBSCRIPTION_CANCELLED: "Cancelled subscription",
  NOTIFICATION_BROADCAST: "Sent broadcast notification",
  ADMIN_LOGIN: "Admin logged in",
  SETTINGS_CHANGED: "Changed platform settings",
};

// ─── Severity level for colour-coding in the UI ───────────────────────────────
const ACTION_SEVERITY = {
  USER_BANNED: "critical",
  USER_UNBANNED: "info",
  USER_DELETED: "critical",
  USER_ROLE_CHANGED: "warning",
  USER_VERIFIED: "success",
  USER_VERIFICATION_REJECTED: "warning",
  USER_SUSPENDED: "critical",
  PAYMENT_RELEASED: "success",
  PAYMENT_REFUNDED: "warning",
  PAYMENT_MANUAL_VERIFIED: "success",
  PAYMENT_MANUAL_REJECTED: "warning",
  WITHDRAWAL_APPROVED: "success",
  WITHDRAWAL_REJECTED: "warning",
  REPORT_REVIEWED: "info",
  REPORT_RESOLVED: "success",
  REPORT_DISMISSED: "info",
  REPORT_BULK_DISMISSED: "info",
  CATEGORY_CREATED: "success",
  CATEGORY_UPDATED: "info",
  CATEGORY_DELETED: "warning",
  REVIEW_DELETED: "warning",
  JOB_DELETED: "warning",
  JOB_STATUS_CHANGED: "info",
  POST_DELETED: "warning",
  COMMENT_DELETED: "info",
  FEATURED_REMOVED: "warning",
  BOOKING_STATUS_CHANGED: "warning",
  DISPUTE_RESOLVED: "success",
  CAMPAIGN_SUBMISSION_REVIEWED: "info",
  CAMPAIGN_WITHDRAWAL_APPROVED: "success",
  CAMPAIGN_WITHDRAWAL_REJECTED: "warning",
  REFERRAL_PAYOUT_PROCESSED: "success",
  REFERRAL_FLAGGED: "warning",
  SUBSCRIPTION_CANCELLED: "warning",
  NOTIFICATION_BROADCAST: "info",
  ADMIN_LOGIN: "info",
  SETTINGS_CHANGED: "warning",
};

// ─── Helper: enrich a log row ─────────────────────────────────────────────────
function enrichLog(log) {
  return {
    ...log,
    actionLabel: ACTION_LABELS[log.action] ?? log.action,
    severity: ACTION_SEVERITY[log.action] ?? "info",
    ref: `#${log.id.slice(-8).toUpperCase()}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1  GET ALL AUDIT LOGS (paginated, filterable)
// GET /api/audit
// Query: adminId, action, targetType, result, from, to, search, page, limit
// ─────────────────────────────────────────────────────────────────────────────
export const getAuditLogs = async (req, res) => {
  try {
    const {
      adminId,
      action,
      targetType,
      targetId,
      result,
      from,
      to,
      search,
      severity,
      page = 1,
      limit = 25,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build severity filter (action-level — convert to action list)
    const severityActions = severity
      ? Object.entries(ACTION_SEVERITY)
          .filter(([, s]) => s === severity)
          .map(([a]) => a)
      : null;

    const where = {
      ...(adminId ? { adminId } : {}),
      ...(action ? { action } : {}),
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
      ...(result ? { result } : {}),
      ...(severityActions ? { action: { in: severityActions } } : {}),
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
                admin: { firstName: { contains: search, mode: "insensitive" } },
              },
              { admin: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
        include: {
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        logs: logs.map(enrichLog),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("getAuditLogs:", err);
    return sendError(res, "Failed to fetch audit logs");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 2  GET STATS DASHBOARD
// GET /api/audit/stats?days=30
// ─────────────────────────────────────────────────────────────────────────────
export const getAuditStats = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days ?? 30), 90);
    const since = new Date(Date.now() - days * 86400000);

    const [
      total,
      resultBreakdown,
      actionBreakdown,
      targetTypeBreakdown,
      topAdmins,
      recentLogs,
      allLogs,
    ] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      prisma.auditLog.groupBy({
        by: ["result"],
        _count: true,
        where: { createdAt: { gte: since } },
      }),
      prisma.auditLog.groupBy({
        by: ["action"],
        _count: true,
        where: { createdAt: { gte: since } },
        orderBy: { _count: { action: "desc" } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ["targetType"],
        _count: true,
        where: { createdAt: { gte: since } },
      }),
      // Top 5 most active admins in the period
      prisma.auditLog.groupBy({
        by: ["adminId"],
        _count: true,
        where: { createdAt: { gte: since } },
        orderBy: { _count: { adminId: "desc" } },
        take: 5,
      }),
      // Most recent 10 entries for the activity feed
      prisma.auditLog.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          admin: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
      }),
      // For daily chart
      prisma.auditLog.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, result: true },
      }),
    ]);

    // ── Enrich top admins with name ───────────────────────────────────────────
    const topAdminsEnriched = await Promise.all(
      topAdmins.map(async (a) => {
        const user = await prisma.user.findUnique({
          where: { id: a.adminId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        });
        return { ...user, actionCount: a._count };
      }),
    );

    // ── Daily chart ───────────────────────────────────────────────────────────
    const dailyMap = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = { date: key, total: 0, success: 0, failed: 0 };
    }
    for (const log of allLogs) {
      const key = log.createdAt.toISOString().slice(0, 10);
      if (dailyMap[key]) {
        dailyMap[key].total++;
        if (log.result === "SUCCESS") dailyMap[key].success++;
        if (log.result === "FAILED") dailyMap[key].failed++;
      }
    }

    // ── Severity breakdown ────────────────────────────────────────────────────
    const severityBreakdown = { critical: 0, warning: 0, success: 0, info: 0 };
    for (const entry of actionBreakdown) {
      const sev = ACTION_SEVERITY[entry.action] ?? "info";
      severityBreakdown[sev] = (severityBreakdown[sev] || 0) + entry._count;
    }

    // ── Success rate ──────────────────────────────────────────────────────────
    const successCount =
      resultBreakdown.find((r) => r.result === "SUCCESS")?._count ?? 0;
    const failedCount =
      resultBreakdown.find((r) => r.result === "FAILED")?._count ?? 0;
    const successRate =
      total > 0 ? Math.round((successCount / total) * 100) : 100;

    return sendResponse(res, {
      data: {
        period: `Last ${days} days`,
        total,
        successRate,
        byResult: resultBreakdown.reduce(
          (a, r) => ({ ...a, [r.result]: r._count }),
          {},
        ),
        byAction: actionBreakdown.map((r) => ({
          action: r.action,
          label: ACTION_LABELS[r.action] ?? r.action,
          count: r._count,
          severity: ACTION_SEVERITY[r.action] ?? "info",
        })),
        byTargetType: targetTypeBreakdown.reduce(
          (a, r) => ({ ...a, [r.targetType]: r._count }),
          {},
        ),
        bySeverity: severityBreakdown,
        dailyActivity: Object.values(dailyMap),
        topAdmins: topAdminsEnriched,
        recentActivity: recentLogs.map(enrichLog),
      },
    });
  } catch (err) {
    console.error("getAuditStats:", err);
    return sendError(res, "Failed to load audit stats");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 3  GET CURRENT ADMIN'S OWN TRAIL
// GET /api/audit/me?page=&limit=&action=
// ─────────────────────────────────────────────────────────────────────────────
export const getMyAuditTrail = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { page = 1, limit = 20, action } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { adminId, ...(action ? { action } : {}) };

    const [logs, total, summary] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by: ["action"],
        _count: true,
        where: { adminId },
      }),
    ]);

    return sendResponse(res, {
      data: {
        logs: logs.map(enrichLog),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        summary: summary.reduce(
          (a, s) => ({
            ...a,
            [s.action]: {
              count: s._count,
              label: ACTION_LABELS[s.action] ?? s.action,
            },
          }),
          {},
        ),
      },
    });
  } catch (err) {
    console.error("getMyAuditTrail:", err);
    return sendError(res, "Failed to fetch your audit trail");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 4  GET ALL ACTIVE ADMINS (who have audit log entries)
// GET /api/audit/admins
// ─────────────────────────────────────────────────────────────────────────────
export const getAuditAdmins = async (req, res) => {
  try {
    const adminGroups = await prisma.auditLog.groupBy({
      by: ["adminId"],
      _count: true,
      orderBy: { _count: { adminId: "desc" } },
    });

    const admins = await Promise.all(
      adminGroups.map(async (g) => {
        const user = await prisma.user.findUnique({
          where: { id: g.adminId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            role: true,
          },
        });
        const lastAction = await prisma.auditLog.findFirst({
          where: { adminId: g.adminId },
          orderBy: { createdAt: "desc" },
          select: { action: true, createdAt: true },
        });
        return {
          ...user,
          totalActions: g._count,
          lastAction: lastAction?.action ?? null,
          lastActionAt: lastAction?.createdAt ?? null,
          lastActionLabel: lastAction
            ? (ACTION_LABELS[lastAction.action] ?? lastAction.action)
            : null,
        };
      }),
    );

    return sendResponse(res, { data: { admins } });
  } catch (err) {
    console.error("getAuditAdmins:", err);
    return sendError(res, "Failed to fetch audit admins");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 5  GET ALL AUDIT LOGS FOR A SPECIFIC TARGET RECORD
// GET /api/audit/target/:targetType/:targetId
// ─────────────────────────────────────────────────────────────────────────────
export const getAuditByTarget = async (req, res) => {
  try {
    const { targetType, targetId } = req.params;

    const logs = await prisma.auditLog.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: "desc" },
      include: {
        admin: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });

    return sendResponse(res, {
      data: {
        targetType,
        targetId,
        total: logs.length,
        logs: logs.map(enrichLog),
      },
    });
  } catch (err) {
    console.error("getAuditByTarget:", err);
    return sendError(res, "Failed to fetch target audit logs");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 6  GET SINGLE AUDIT LOG ENTRY
// GET /api/audit/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getAuditLogDetail = async (req, res) => {
  try {
    const log = await prisma.auditLog.findUnique({
      where: { id: req.params.id },
      include: {
        admin: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
      },
    });
    if (!log) return sendError(res, "Audit log entry not found", 404);

    // Try to fetch the current state of the target for comparison
    let targetCurrent = null;
    if (log.targetId) {
      try {
        switch (log.targetType) {
          case "USER":
            targetCurrent = await prisma.user.findUnique({
              where: { id: log.targetId },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                isBanned: true,
                isActive: true,
              },
            });
            break;
          case "PAYMENT":
            targetCurrent = await prisma.payment.findUnique({
              where: { id: log.targetId },
              select: { id: true, status: true, amount: true, currency: true },
            });
            break;
          case "WITHDRAWAL":
            targetCurrent = await prisma.withdrawal.findUnique({
              where: { id: log.targetId },
              select: { id: true, status: true, amount: true, currency: true },
            });
            break;
          case "BOOKING":
            targetCurrent = await prisma.booking.findUnique({
              where: { id: log.targetId },
              select: { id: true, status: true, title: true },
            });
            break;
        }
      } catch {}
    }

    return sendResponse(res, {
      data: {
        log: enrichLog(log),
        targetCurrent,
      },
    });
  } catch (err) {
    console.error("getAuditLogDetail:", err);
    return sendError(res, "Failed to fetch audit log entry");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 7  EXPORT AUDIT LOGS AS CSV
// GET /api/audit/export?adminId=&action=&from=&to=&limit=5000
// ─────────────────────────────────────────────────────────────────────────────
export const exportAuditLogs = async (req, res) => {
  try {
    const { adminId, action, targetType, result, from, to } = req.query;
    const limit = Math.min(parseInt(req.query.limit ?? 1000), 5000);

    const where = {
      ...(adminId ? { adminId } : {}),
      ...(action ? { action } : {}),
      ...(targetType ? { targetType } : {}),
      ...(result ? { result } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        admin: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    // ── Build CSV ─────────────────────────────────────────────────────────────
    const escape = (val) => {
      if (val == null) return "";
      const s = String(val).replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s}"`
        : s;
    };

    const headers = [
      "Ref",
      "Timestamp",
      "Admin Name",
      "Admin Email",
      "Action",
      "Action Label",
      "Severity",
      "Target Type",
      "Target ID",
      "Description",
      "Result",
      "Error",
      "IP Address",
    ];

    const rows = logs.map((log) => [
      `#${log.id.slice(-8).toUpperCase()}`,
      log.createdAt.toISOString(),
      `${log.admin.firstName} ${log.admin.lastName}`,
      log.admin.email,
      log.action,
      ACTION_LABELS[log.action] ?? log.action,
      ACTION_SEVERITY[log.action] ?? "info",
      log.targetType,
      log.targetId ?? "",
      log.description,
      log.result,
      log.errorMessage ?? "",
      log.ipAddress ?? "",
    ]);

    const csv = [
      headers.map(escape).join(","),
      ...rows.map((r) => r.map(escape).join(",")),
    ].join("\n");

    const filename = `audit-log-export-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("exportAuditLogs:", err);
    return sendError(res, "Export failed");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 8  PURGE OLD AUDIT LOGS
// DELETE /api/audit/purge
// Body: { olderThanDays: 90 }   — minimum 30, default 90
// ─────────────────────────────────────────────────────────────────────────────
export const purgeAuditLogs = async (req, res) => {
  try {
    const days = Math.max(parseInt(req.body?.olderThanDays ?? 90), 30);
    const cutoff = new Date(Date.now() - days * 86400000);

    // Safety: only purge entries older than the cutoff AND result is SUCCESS
    // Keep FAILED entries indefinitely for investigation
    const { count } = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        result: "SUCCESS",
      },
    });

    // Log this purge itself as an audit entry
    const { logAdminAction } = await import("../utils/auditLog.js");
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "SETTINGS_CHANGED",
      targetType: "SYSTEM",
      description: `Purged ${count} audit log entries older than ${days} days`,
      meta: {
        olderThanDays: days,
        purgedCount: count,
        cutoff: cutoff.toISOString(),
      },
    });

    return sendResponse(res, {
      message: `Purged ${count} audit log entries older than ${days} days`,
      data: {
        purgedCount: count,
        cutoffDate: cutoff.toISOString(),
        note: "FAILED entries were preserved",
      },
    });
  } catch (err) {
    console.error("purgeAuditLogs:", err);
    return sendError(res, "Purge failed");
  }
};
