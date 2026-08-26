// src/controllers/waitlist.controller.js

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { logAdminAction as auditLog } from "../utils/auditLog.js";
import crypto from "crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateReferralCode = (email) => {
  const prefix = email.split("@")[0].substring(0, 4).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${random}`;
};

const generateToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const WAITLIST_STATUSES = ["PENDING", "CONFIRMED", "REWARDED", "EXPIRED"];

// ─── Response Wrapper ─────────────────────────────────────────────────────────

const response = {
  success: (res, message, data = null, status = 200) => {
    return sendResponse(res, { status, message, data });
  },
  error: (res, message, status = 400, errors = null) => {
    return sendError(res, message, status, errors);
  },
};

// ─── Get Waitlist Stats ─────────────────────────────────────────────────────

export const getWaitlistStats = async (req, res) => {
  try {
    const [total, pending, confirmed, rewarded, expired, today] =
      await Promise.all([
        prisma.waitlistEntry.count(),
        prisma.waitlistEntry.count({ where: { status: "PENDING" } }),
        prisma.waitlistEntry.count({ where: { status: "CONFIRMED" } }),
        prisma.waitlistEntry.count({ where: { status: "REWARDED" } }),
        prisma.waitlistEntry.count({ where: { status: "EXPIRED" } }),
        prisma.waitlistEntry.count({
          where: {
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        }),
      ]);

    return response.success(res, "Waitlist statistics retrieved", {
      total,
      pending,
      confirmed,
      rewarded,
      expired,
      today,
    });
  } catch (error) {
    console.error("Waitlist stats error:", error);
    return response.error(res, "Failed to get waitlist stats", 500);
  }
};

// ─── Get All Waitlist Entries ──────────────────────────────────────────────

export const getAllWaitlistEntries = async (req, res) => {
  try {
    const { page = 1, limit = 24, status, search } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where = {};

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { referralCode: { contains: search, mode: "insensitive" } },
      ];
    }

    const [entries, total] = await Promise.all([
      prisma.waitlistEntry.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          referredByEntry: {
            select: { email: true, name: true, referralCode: true },
          },
          bonuses: true,
          _count: {
            select: { referredEntries: true },
          },
        },
      }),
      prisma.waitlistEntry.count({ where }),
    ]);

    return response.success(res, "Waitlist entries retrieved", {
      entries,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get waitlist entries error:", error);
    return response.error(res, "Failed to get waitlist entries", 500);
  }
};

// ─── Get Single Waitlist Entry ─────────────────────────────────────────────

export const getWaitlistEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await prisma.waitlistEntry.findUnique({
      where: { id },
      include: {
        referredByEntry: {
          select: { email: true, name: true, referralCode: true },
        },
        referredEntries: {
          include: {
            referred: {
              select: {
                email: true,
                name: true,
                status: true,
                confirmedAt: true,
              },
            },
          },
        },
        bonuses: true,
        _count: {
          select: { referredEntries: true },
        },
      },
    });

    if (!entry) {
      return response.error(res, "Waitlist entry not found", 404);
    }

    return response.success(res, "Waitlist entry retrieved", entry);
  } catch (error) {
    console.error("Get waitlist entry error:", error);
    return response.error(res, "Failed to get waitlist entry", 500);
  }
};

// ─── Update Waitlist Status ─────────────────────────────────────────────────

export const updateWaitlistStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["PENDING", "CONFIRMED", "REWARDED", "EXPIRED"];
    if (!validStatuses.includes(status)) {
      return response.error(res, "Invalid status", 400, { validStatuses });
    }

    const existing = await prisma.waitlistEntry.findUnique({
      where: { id },
    });

    if (!existing) {
      return response.error(res, "Waitlist entry not found", 404);
    }

    const updated = await prisma.waitlistEntry.update({
      where: { id },
      data: { status },
    });

    await auditLog({
      req,
      adminId: req.user?.id,
      action: "WAITLIST_STATUS_UPDATED",
      targetType: "waitlist",
      targetId: id,
      description: `Waitlist status updated to ${status}`,
      meta: { oldStatus: existing.status, newStatus: status },
    });

    return response.success(res, "Status updated successfully", updated);
  } catch (error) {
    console.error("Update waitlist status error:", error);
    return response.error(res, "Failed to update status", 500);
  }
};

// ─── Export CSV ─────────────────────────────────────────────────────────────

export const exportWaitlistCSV = async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = {};

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const entries = await prisma.waitlistEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { referredEntries: true } },
      },
    });

    if (entries.length === 0) {
      return response.error(res, "No waitlist entries found", 404);
    }

    const headers = [
      "ID",
      "Email",
      "Name",
      "Referral Code",
      "Referred By",
      "Status",
      "Total Referrals",
      "Created At",
      "Confirmed At",
    ];

    const rows = entries.map((e) => [
      e.id,
      e.email,
      e.name || "",
      e.referralCode || "",
      e.referredBy || "",
      e.status,
      e._count.referredEntries || 0,
      e.createdAt.toISOString(),
      e.confirmedAt?.toISOString() || "",
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n",
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=waitlist-${new Date().toISOString().split("T")[0]}.csv`,
    );
    return res.send(csv);
  } catch (error) {
    console.error("Export waitlist CSV error:", error);
    return response.error(res, "Failed to export CSV", 500);
  }
};
