// src/controllers/adminLog.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { paginate } from "../utils/helpers.js";

// ── List audit logs (paginated, filterable) ─────────────────────────────────
export const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      action,
      targetType,
      targetId,
      adminId,
      result,
      fromDate,
      toDate,
      search,
    } = req.query;

    const { skip, take } = paginate(page, limit);

    const where = {};
    if (action) where.action = action;
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;
    if (adminId) where.adminId = adminId;
    if (result) where.result = result;

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { errorMessage: { contains: search, mode: "insensitive" } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
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
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return sendResponse(res, {
      data: {
        logs,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("getAuditLogs error:", err);
    return sendError(res, "Failed to fetch audit logs");
  }
};

// ── Get a single audit log ──────────────────────────────────────────────────
export const getAuditLogById = async (req, res) => {
  try {
    const { id } = req.params;

    const log = await prisma.auditLog.findUnique({
      where: { id },
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

    if (!log) return sendError(res, "Audit log not found", 404);
    return sendResponse(res, { data: { log } });
  } catch (err) {
    console.error("getAuditLogById error:", err);
    return sendError(res, "Failed to fetch audit log");
  }
};

// ── Stats summary ───────────────────────────────────────────────────────────
export const getAuditLogStats = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    const where = {};
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const [total, success, failed, byAction, byTarget] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { ...where, result: "SUCCESS" } }),
      prisma.auditLog.count({ where: { ...where, result: "FAILED" } }),
      prisma.auditLog.groupBy({
        by: ["action"],
        where,
        _count: { action: true },
        orderBy: { _count: { action: "desc" } },
        take: 20,
      }),
      prisma.auditLog.groupBy({
        by: ["targetType"],
        where,
        _count: { targetType: true },
        orderBy: { _count: { targetType: "desc" } },
      }),
    ]);

    return sendResponse(res, {
      data: {
        total,
        success,
        failed,
        byAction: byAction.map((a) => ({
          action: a.action,
          count: a._count.action,
        })),
        byTarget: byTarget.map((t) => ({
          targetType: t.targetType,
          count: t._count.targetType,
        })),
      },
    });
  } catch (err) {
    console.error("getAuditLogStats error:", err);
    return sendError(res, "Failed to fetch audit log stats");
  }
};

// ── List logs by a specific admin ───────────────────────────────────────────
export const getAuditLogsByAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { adminId },
        skip,
        take,
        include: {
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where: { adminId } }),
    ]);

    return sendResponse(res, {
      data: {
        logs,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("getAuditLogsByAdmin error:", err);
    return sendError(res, "Failed to fetch admin audit logs");
  }
};

// ── List logs for a specific target ────────────────────────────────────────
export const getAuditLogsByTarget = async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { targetType, targetId },
        skip,
        take,
        include: {
          admin: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where: { targetType, targetId } }),
    ]);

    return sendResponse(res, {
      data: {
        logs,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error("getAuditLogsByTarget error:", err);
    return sendError(res, "Failed to fetch target audit logs");
  }
};

// ── Export logs as JSON (for download / audit trail) ───────────────────────
export const exportAuditLogs = async (req, res) => {
  try {
    const { fromDate, toDate, action, targetType } = req.query;

    const where = {};
    if (action) where.action = action;
    if (targetType) where.targetType = targetType;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        admin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10000, // hard cap — don't blow up memory
    });

    return sendResponse(res, {
      data: { logs, count: logs.length },
    });
  } catch (err) {
    console.error("exportAuditLogs error:", err);
    return sendError(res, "Failed to export audit logs");
  }
};
