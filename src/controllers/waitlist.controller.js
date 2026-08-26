// src/controllers/waitlist.controller.js

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { logAdminAction as auditLog } from "../utils/auditLog.js";
import crypto from "crypto";
import { sendEmail } from "../services/email.service.js";

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
const BONUS_TYPES = ["SIGNUP", "REFERRAL", "SOCIAL", "EARLY_BIRD"];

// ─── Response Wrapper ─────────────────────────────────────────────────────────

const response = {
  success: (res, message, data = null, status = 200) => {
    return sendResponse(res, { status, message, data });
  },
  error: (res, message, status = 400, errors = null) => {
    return sendError(res, message, status, errors);
  },
};

// ─── Join Waitlist ──────────────────────────────────────────────────────────

export const joinWaitlist = async (req, res) => {
  try {
    const { email, name, referralCode } = req.body;

    if (!email) {
      return response.error(res, "Email is required", 400);
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

    // Generate referral code
    const code = generateReferralCode(email);

    // Check if referral code is valid
    let referredByEntry = null;
    if (referralCode) {
      referredByEntry = await prisma.waitlistEntry.findFirst({
        where: { referralCode: referralCode.toUpperCase().trim() },
      });
    }

    // Create waitlist entry
    const entry = await prisma.waitlistEntry.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name?.trim() || null,
        referralCode: code,
        referredBy: referredByEntry?.id || null,
        status: "PENDING",
        token: generateToken(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
      },
    });

    // Create referral record if referred
    if (referredByEntry) {
      await prisma.waitlistReferral.create({
        data: {
          referrerId: referredByEntry.id,
          referredId: entry.id,
          status: "PENDING",
          rewardAmount: 2000,
        },
      });
    }

    // Create signup bonus
    await prisma.waitlistBonus.create({
      data: {
        waitlistId: entry.id,
        type: "SIGNUP",
        amount: 2000,
        description: "Signup bonus for joining the waitlist",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    // Send confirmation email
    try {
      const confirmLink = `${process.env.CLIENT_URL || "https://skilledproz.com"}/confirm-waitlist?token=${entry.token}`;
      await sendEmail(
        email,
        "Confirm Your Waitlist Spot - SkilledProz",
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #F59E0B;">🎉 You're on the list!</h1>
          <p>Hi ${name || "there"},</p>
          <p>Thank you for joining the SkilledProz waitlist! You're now part of our early adopter community.</p>
          <div style="background: #1a1a2e; padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid #F59E0B20;">
            <h3 style="color: #F59E0B; margin: 0 0 10px;">Your Referral Code</h3>
            <p style="font-size: 24px; font-weight: 700; color: #fff; letter-spacing: 2px; margin: 0;">${code}</p>
            <p style="color: #888; margin: 10px 0 0;">Share this code with friends and earn ₦2,000 each!</p>
          </div>
          <p><strong>What's next?</strong></p>
          <ul>
            <li>Confirm your email by clicking the link below</li>
            <li>Share your referral code to earn bonuses</li>
            <li>You'll get early access notifications</li>
          </ul>
          <a href="${confirmLink}" style="display: inline-block; background: #F59E0B; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 700; margin: 20px 0;">
            Confirm Your Email → 
          </a>
          <p style="color: #888; font-size: 14px;">If you didn't sign up for SkilledProz, you can safely ignore this email.</p>
        </div>
        `,
      );
    } catch (err) {
      console.error("Failed to send confirmation email:", err);
    }

    // Log audit
    await auditLog({
      req,
      adminId: null,
      action: "WAITLIST_JOINED",
      targetType: "waitlist",
      targetId: entry.id,
      description: `New waitlist entry: ${email}`,
      meta: {
        email,
        referralCode: code,
        referredBy: referredByEntry?.email || null,
      },
    });

    return response.success(
      res,
      "Successfully joined the waitlist!",
      {
        id: entry.id,
        email: entry.email,
        referralCode: entry.referralCode,
        referredBy: referredByEntry?.email || null,
        bonuses: [{ type: "SIGNUP", amount: 2000 }],
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

    // Update entry
    const updated = await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
    });

    // Check if this referral should be marked as confirmed
    if (entry.referredBy) {
      await prisma.waitlistReferral.updateMany({
        where: {
          referrerId: entry.referredBy,
          referredId: entry.id,
        },
        data: {
          status: "CONFIRMED",
        },
      });

      // Create referral bonus for referrer
      await prisma.waitlistBonus.create({
        data: {
          waitlistId: entry.referredBy,
          type: "REFERRAL",
          amount: 2000,
          description: `Referral bonus for ${entry.email}`,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Create referral bonus for referred user
      await prisma.waitlistBonus.create({
        data: {
          waitlistId: entry.id,
          type: "REFERRAL",
          amount: 2000,
          description: `Welcome bonus from referral`,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Log audit
    await auditLog({
      req,
      adminId: null,
      action: "WAITLIST_CONFIRMED",
      targetType: "waitlist",
      targetId: entry.id,
      description: `Waitlist confirmed: ${entry.email}`,
      meta: { email: entry.email },
    });

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

// ─── Get Waitlist Stats ─────────────────────────────────────────────────────

export const getWaitlistStats = async (req, res) => {
  try {
    const [total, pending, confirmed, rewarded, today, thisWeek, thisMonth] =
      await Promise.all([
        prisma.waitlistEntry.count(),
        prisma.waitlistEntry.count({ where: { status: "PENDING" } }),
        prisma.waitlistEntry.count({ where: { status: "CONFIRMED" } }),
        prisma.waitlistEntry.count({ where: { status: "REWARDED" } }),
        prisma.waitlistEntry.count({
          where: {
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        }),
        prisma.waitlistEntry.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setDate(new Date().getDate() - 7)),
            },
          },
        }),
        prisma.waitlistEntry.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setMonth(new Date().getMonth() - 1)),
            },
          },
        }),
      ]);

    const bonusStats = await prisma.waitlistBonus.groupBy({
      by: ["type"],
      _sum: { amount: true },
      _count: { type: true },
    });

    return response.success(res, "Waitlist statistics retrieved", {
      total,
      pending,
      confirmed,
      rewarded,
      today,
      thisWeek,
      thisMonth,
      bonuses: bonusStats.map((b) => ({
        type: b.type,
        totalAmount: b._sum.amount || 0,
        count: b._count.type,
      })),
    });
  } catch (error) {
    console.error("Waitlist stats error:", error);
    return response.error(res, "Failed to get waitlist stats", 500);
  }
};

// ─── Get All Waitlist Entries ──────────────────────────────────────────────

export const getAllWaitlistEntries = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      fromDate,
      toDate,
    } = req.query;

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
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
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
                createdAt: true,
              },
            },
          },
        },
        bonuses: true,
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

    if (!WAITLIST_STATUSES.includes(status)) {
      return response.error(res, "Invalid status", 400, {
        validStatuses: WAITLIST_STATUSES,
      });
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

// ─── Get Referral Stats ────────────────────────────────────────────────────

export const getReferralStats = async (req, res) => {
  try {
    const { code } = req.params;

    const entry = await prisma.waitlistEntry.findFirst({
      where: { referralCode: code.toUpperCase().trim() },
      include: {
        _count: {
          select: { referredEntries: true },
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
          where: { status: "CONFIRMED" },
        },
        bonuses: {
          where: { type: "REFERRAL", status: "PENDING" },
        },
      },
    });

    if (!entry) {
      return response.error(res, "Referral code not found", 404);
    }

    const confirmedReferrals = entry.referredEntries.filter(
      (r) => r.status === "CONFIRMED",
    );

    return response.success(res, "Referral stats retrieved", {
      referralCode: entry.referralCode,
      totalReferrals: entry._count.referredEntries,
      confirmedReferrals: confirmedReferrals.length,
      pendingBonuses: entry.bonuses.reduce((sum, b) => sum + b.amount, 0),
      referrals: entry.referredEntries.map((r) => ({
        email: r.referred.email,
        name: r.referred.name,
        status: r.status,
        confirmedAt: r.referred.confirmedAt,
      })),
    });
  } catch (error) {
    console.error("Get referral stats error:", error);
    return response.error(res, "Failed to get referral stats", 500);
  }
};

// ─── Validate Referral Code ────────────────────────────────────────────────

export const validateReferralCode = async (req, res) => {
  try {
    const { code } = req.params;

    const entry = await prisma.waitlistEntry.findFirst({
      where: { referralCode: code.toUpperCase().trim() },
      select: {
        id: true,
        email: true,
        name: true,
        referralCode: true,
        status: true,
      },
    });

    if (!entry) {
      return response.error(res, "Invalid referral code", 404);
    }

    return response.success(res, "Valid referral code", {
      valid: true,
      referrer: {
        email: entry.email,
        name: entry.name,
        code: entry.referralCode,
      },
      bonus: "₦2,000 for both of you!",
    });
  } catch (error) {
    console.error("Validate referral code error:", error);
    return response.error(res, "Failed to validate referral code", 500);
  }
};

// ─── Claim Bonus ────────────────────────────────────────────────────────────

export const claimBonus = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    const entry = await prisma.waitlistEntry.findFirst({
      where: { email: email.toLowerCase().trim() },
      include: {
        bonuses: {
          where: { status: "PENDING", expiresAt: { gt: new Date() } },
        },
      },
    });

    if (!entry) {
      return response.error(res, "Waitlist entry not found", 404);
    }

    // Claim all pending bonuses
    const claimed = await prisma.waitlistBonus.updateMany({
      where: {
        waitlistId: entry.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: {
        status: "CLAIMED",
        claimedAt: new Date(),
      },
    });

    // Update entry status if all bonuses claimed
    const remainingBonuses = await prisma.waitlistBonus.count({
      where: {
        waitlistId: entry.id,
        status: "PENDING",
      },
    });

    if (remainingBonuses === 0) {
      await prisma.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: "REWARDED" },
      });
    }

    return response.success(res, "Bonuses claimed successfully", {
      claimed: claimed.count,
      status: remainingBonuses === 0 ? "REWARDED" : "PARTIAL",
    });
  } catch (error) {
    console.error("Claim bonus error:", error);
    return response.error(res, "Failed to claim bonuses", 500);
  }
};

// ─── Export CSV ─────────────────────────────────────────────────────────────

export const exportWaitlistCSV = async (req, res) => {
  try {
    const { status, search, fromDate, toDate } = req.query;
    const where = {};

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
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
