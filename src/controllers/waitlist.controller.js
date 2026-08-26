import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import crypto from "crypto";

// ─── Response Wrapper ─────────────────────────────────────────────────────────

const response = {
  success: (res, message, data = null, status = 200) => {
    return sendResponse(res, { status, message, data });
  },
  error: (res, message, status = 400, errors = null) => {
    return sendError(res, message, status, errors);
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// ─── Join Waitlist ──────────────────────────────────────────────────────────

export const joinWaitlist = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return response.error(res, "Email is required", 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return response.error(res, "Please provide a valid email address", 400);
    }

    // Check if email already exists
    const existing = await prisma.waitlistEntry.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      if (existing.status === "CONFIRMED") {
        return response.error(
          res,
          "Email already confirmed on the waitlist",
          409,
        );
      }
      return response.error(res, "Email already on the waitlist", 409);
    }

    // Create waitlist entry
    const entry = await prisma.waitlistEntry.create({
      data: {
        email: email.toLowerCase().trim(),
        status: "PENDING",
        token: generateToken(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
      },
    });

    console.log(`📧 New waitlist signup: ${email}`);

    return response.success(
      res,
      "Successfully joined the waitlist!",
      {
        id: entry.id,
        email: entry.email,
        status: entry.status,
      },
      201,
    );
  } catch (error) {
    console.error("Join waitlist error:", error);
    return response.error(res, "Failed to join waitlist", 500);
  }
};

// ─── Confirm Waitlist Email ─────────────────────────────────────────────────

export const confirmWaitlist = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return response.error(res, "Token is required", 400);
    }

    const entry = await prisma.waitlistEntry.findUnique({
      where: { token },
    });

    if (!entry) {
      return response.error(res, "Invalid or expired token", 404);
    }

    if (entry.status === "CONFIRMED") {
      return response.error(res, "Email already confirmed", 409);
    }

    if (entry.tokenExpiresAt && new Date() > entry.tokenExpiresAt) {
      return response.error(
        res,
        "Token has expired. Please request a new one.",
        400,
      );
    }

    const updated = await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    console.log(`✅ Email confirmed: ${entry.email}`);

    return response.success(res, "Email confirmed successfully!", {
      id: updated.id,
      email: updated.email,
      status: updated.status,
    });
  } catch (error) {
    console.error("Confirm waitlist error:", error);
    return response.error(res, "Failed to confirm email", 500);
  }
};

// ─── Admin: Get Waitlist Stats ─────────────────────────────────────────────

export const getWaitlistStats = async (req, res) => {
  try {
    const [total, pending, confirmed, today] = await Promise.all([
      prisma.waitlistEntry.count(),
      prisma.waitlistEntry.count({ where: { status: "PENDING" } }),
      prisma.waitlistEntry.count({ where: { status: "CONFIRMED" } }),
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
      today,
    });
  } catch (error) {
    console.error("Waitlist stats error:", error);
    return response.error(res, "Failed to get waitlist stats", 500);
  }
};

// ─── Admin: Get All Waitlist Entries ──────────────────────────────────────

export const getAllWaitlistEntries = async (req, res) => {
  try {
    const { page = 1, limit = 24, status, search } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where = {};

    if (status) where.status = status;
    if (search) {
      where.OR = [{ email: { contains: search, mode: "insensitive" } }];
    }

    const [entries, total] = await Promise.all([
      prisma.waitlistEntry.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          status: true,
          createdAt: true,
          confirmedAt: true,
          ipAddress: true,
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

// ─── Admin: Get Single Waitlist Entry ─────────────────────────────────────

export const getWaitlistEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await prisma.waitlistEntry.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        status: true,
        token: true,
        tokenExpiresAt: true,
        confirmedAt: true,
        createdAt: true,
        ipAddress: true,
        userAgent: true,
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

// ─── Admin: Update Waitlist Status ────────────────────────────────────────

export const updateWaitlistStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["PENDING", "CONFIRMED", "EXPIRED"];
    if (!validStatuses.includes(status)) {
      return response.error(res, "Invalid status", 400, { validStatuses });
    }

    const existing = await prisma.waitlistEntry.findUnique({ where: { id } });
    if (!existing) {
      return response.error(res, "Waitlist entry not found", 404);
    }

    const updated = await prisma.waitlistEntry.update({
      where: { id },
      data: { status },
    });

    return response.success(res, "Status updated successfully", updated);
  } catch (error) {
    console.error("Update waitlist status error:", error);
    return response.error(res, "Failed to update status", 500);
  }
};

// ─── Admin: Export CSV ─────────────────────────────────────────────────────

export const exportWaitlistCSV = async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = {};

    if (status) where.status = status;
    if (search) {
      where.OR = [{ email: { contains: search, mode: "insensitive" } }];
    }

    const entries = await prisma.waitlistEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        email: true,
        status: true,
        createdAt: true,
        confirmedAt: true,
      },
    });

    if (entries.length === 0) {
      return response.error(res, "No waitlist entries found", 404);
    }

    const headers = ["Email", "Status", "Created At", "Confirmed At"];
    const rows = entries.map((e) => [
      e.email,
      e.status,
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
