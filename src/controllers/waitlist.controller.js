// src/controllers/waitlist.controller.js

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import {
  sendEmail,
  sendWaitlistConfirmationEmail,
} from "../services/email.service.js";
import crypto from "crypto";
import geoip from "geoip-lite";
import UAParser from "ua-parser-js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateToken = () => crypto.randomBytes(32).toString("hex");
const generateReferralCode = (email) => {
  const prefix = email.split("@")[0].substring(0, 4).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${random}`;
};

// ─── Geo & Device Detection ──────────────────────────────────────────────────

const getGeoInfo = (ip) => {
  if (!ip || ip === "::1" || ip === "127.0.0.1") return null;
  const geo = geoip.lookup(ip);
  if (!geo) return null;
  return {
    country: geo.country,
    region: geo.region,
    city: geo.city,
    latitude: geo.ll?.[0] || null,
    longitude: geo.ll?.[1] || null,
    timezone: geo.timezone || null,
    postalCode: geo.zip || null,
  };
};

const getDeviceInfo = (userAgent) => {
  if (!userAgent) return null;
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  // Determine device type
  let deviceType = "desktop";
  if (result.device.type === "mobile") deviceType = "mobile";
  else if (result.device.type === "tablet") deviceType = "tablet";

  return {
    deviceType,
    deviceBrand: result.device.vendor || null,
    deviceModel: result.device.model || null,
    osName: result.os.name || null,
    osVersion: result.os.version || null,
    browserName: result.browser.name || null,
    browserVersion: result.browser.version || null,
  };
};

// ─── Response Wrapper ─────────────────────────────────────────────────────────

const response = {
  success: (res, message, data = null, status = 200) => {
    return sendResponse(res, { status, message, data });
  },
  error: (res, message, status = 400, errors = null) => {
    return sendError(res, message, status, errors);
  },
};

// ─── Email Templates ─────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = {
  CONFIRMATION: {
    subject: "🎉 Welcome to SkilledProz! Confirm Your Spot",
    getBody: (name, referralCode) => `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 30px; background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 100%); border-radius: 20px; color: #fff;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 32px; font-weight: 900; background: linear-gradient(135deg, #F59E0B, #F97316); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0;">SkilledProz</h1>
          <p style="color: #F59E0B; font-size: 14px; font-weight: 600; letter-spacing: 2px; margin-top: 5px;">EARLY ADOPTER PROGRAM</p>
        </div>
        
        <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 16px; padding: 25px;">
          <h2 style="font-size: 24px; font-weight: 800; color: #F59E0B; margin: 0 0 15px;">Hey ${name || "Trailblazer"}! 👋</h2>
          <p style="font-size: 16px; line-height: 1.7; color: #e0e0e0; margin: 0 0 20px;">
            You're <strong style="color: #F59E0B;">one step away</strong> from joining the future of work! 
            We're building something <strong style="color: #fff;">extraordinary</strong> — a platform where 
            skilled workers and hirers connect seamlessly.
          </p>
          <p style="font-size: 16px; line-height: 1.7; color: #e0e0e0; margin: 0 0 25px;">
            🚀 <strong style="color: #fff;">What's waiting for you:</strong>
          </p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 25px;">
            <div style="background: rgba(245, 158, 11, 0.05); padding: 12px; border-radius: 10px; border-left: 3px solid #F59E0B;">
              <span style="font-size: 20px;">🎯</span>
              <p style="font-size: 12px; font-weight: 700; color: #F59E0B; margin: 5px 0 0;">Early Access</p>
            </div>
            <div style="background: rgba(16, 185, 129, 0.05); padding: 12px; border-radius: 10px; border-left: 3px solid #10B981;">
              <span style="font-size: 20px;">💰</span>
              <p style="font-size: 12px; font-weight: 700; color: #10B981; margin: 5px 0 0;">₦5,000 Bonus</p>
            </div>
            <div style="background: rgba(139, 92, 246, 0.05); padding: 12px; border-radius: 10px; border-left: 3px solid #8B5CF6;">
              <span style="font-size: 20px;">♾️</span>
              <p style="font-size: 12px; font-weight: 700; color: #8B5CF6; margin: 5px 0 0;">0% Commission</p>
            </div>
            <div style="background: rgba(59, 130, 246, 0.05); padding: 12px; border-radius: 10px; border-left: 3px solid #3B82F6;">
              <span style="font-size: 20px;">⭐</span>
              <p style="font-size: 12px; font-weight: 700; color: #3B82F6; margin: 5px 0 0;">VIP Support</p>
            </div>
          </div>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="{{CONFIRM_LINK}}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #F59E0B, #F97316); color: #000; font-size: 18px; font-weight: 800; text-decoration: none; border-radius: 12px; transition: transform 0.2s;">
            ✅ Confirm Your Email
          </a>
          <p style="color: #888; font-size: 13px; margin-top: 12px;">This link expires in 7 days</p>
        </div>

        <div style="background: rgba(255, 255, 255, 0.03); border-radius: 12px; padding: 20px; border: 1px dashed rgba(255, 255, 255, 0.06);">
          <p style="font-size: 14px; color: #888; margin: 0; text-align: center;">
            🎁 <strong style="color: #F59E0B;">${referralCode || "✨"}</strong> — Share this referral code 
            and earn <strong style="color: #fff;">₦2,000</strong> for each friend who joins!
          </p>
        </div>

        <div style="margin-top: 30px; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px;">
          <p style="font-size: 13px; color: #666;">© 2026 SkilledProz. Built with 💛 for the future of work.</p>
        </div>
      </div>
    `,
  },
  BENEFIT_UNLOCKED: {
    subject: "🎁 You've Unlocked a New Benefit!",
    getBody: (name, benefit) => `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 30px; background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 100%); border-radius: 20px; color: #fff;">
        <h2 style="font-size: 24px; font-weight: 800; color: #F59E0B; text-align: center;">🎉 New Benefit Unlocked!</h2>
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 16px; padding: 25px; text-align: center;">
          <span style="font-size: 48px;">🏆</span>
          <h3 style="font-size: 22px; font-weight: 700; color: #10B981; margin: 10px 0;">${benefit}</h3>
          <p style="font-size: 16px; color: #e0e0e0;">You're getting closer to the full package!</p>
        </div>
        <p style="text-align: center; color: #888; font-size: 14px; margin-top: 20px;">
          Keep sharing and completing tasks to unlock more benefits.
        </p>
      </div>
    `,
  },
  LAUNCH_ANNOUNCEMENT: {
    subject: "🚀 SkilledProz is LIVE! Your Early Adopter Benefits Await",
    getBody: (name) => `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 30px; background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 100%); border-radius: 20px; color: #fff;">
        <div style="text-align: center;">
          <span style="font-size: 48px;">🚀</span>
          <h2 style="font-size: 28px; font-weight: 900; color: #F59E0B; margin: 10px 0;">We're LIVE!</h2>
          <p style="font-size: 18px; color: #e0e0e0;">${name || "Early Adopter"}, the moment you've been waiting for is here!</p>
        </div>
        <div style="background: rgba(245, 158, 11, 0.08); border-radius: 16px; padding: 25px; margin: 20px 0; border: 1px solid rgba(245, 158, 11, 0.15);">
          <h3 style="color: #F59E0B; font-size: 18px;">🎯 Your Early Adopter Perks:</h3>
          <ul style="color: #e0e0e0; line-height: 2; padding-left: 20px;">
            <li>✅ <strong style="color: #fff;">Free Lifetime Registration</strong></li>
            <li>✅ <strong style="color: #fff;">0% Commission</strong> on all transactions</li>
            <li>✅ <strong style="color: #fff;">₦5,000</strong> credit (hirers) or <strong style="color: #fff;">Premium Badge</strong> (workers)</li>
            <li>✅ <strong style="color: #fff;">VIP Support</strong> — priority response</li>
          </ul>
        </div>
        <div style="text-align: center; margin: 25px 0;">
          <a href="https://skilledproz.com" style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #F59E0B, #F97316); color: #000; font-size: 18px; font-weight: 800; text-decoration: none; border-radius: 12px;">
            🎉 Claim Your Benefits
          </a>
        </div>
        <p style="text-align: center; color: #666; font-size: 14px;">Welcome to the future of work. 🌍</p>
      </div>
    `,
  },
};

// ─── Join Waitlist ──────────────────────────────────────────────────────────

export const joinWaitlist = async (req, res) => {
  try {
    const { email, name, referralCode } = req.body;

    if (!email) {
      return response.error(res, "Email is required", 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return response.error(res, "Please provide a valid email address", 400);
    }

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

    // Get IP address
    const ip = req.ip || req.connection?.remoteAddress || null;
    const geoInfo = getGeoInfo(ip);
    const deviceInfo = getDeviceInfo(req.headers["user-agent"]);

    // Generate referral code
    const code = generateReferralCode(email);

    // Check if referred by existing user
    let referrer = null;
    if (referralCode) {
      referrer = await prisma.waitlistEntry.findFirst({
        where: { referralCode: referralCode.toUpperCase().trim() },
      });
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name?.trim() || null,
        status: "PENDING",
        token: generateToken(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        referralCode: code,
        referredBy: referrer?.id || null,
        ipAddress: ip,
        ...geoInfo,
        ...deviceInfo,
        userAgent: req.headers["user-agent"] || null,
      },
    });

    // Send confirmation email

    try {
      await sendWaitlistConfirmationEmail({
        to: email,
        name: name || "there",
      });

      // Log email
      await prisma.waitlistEmailLog.create({
        data: {
          waitlistId: entry.id,
          email: entry.email,
          type: "CONFIRMATION",
          subject: "You're on the SkilledProz waitlist",
          sentAt: new Date(),
        },
      });
    } catch (err) {
      console.error("Failed to send confirmation email:", err);
    }

    console.log(
      `📧 New waitlist signup: ${email} (${deviceInfo?.deviceType || "unknown"})`,
    );

    return response.success(
      res,
      "Successfully joined the waitlist!",
      {
        id: entry.id,
        email: entry.email,
        status: entry.status,
        referralCode: entry.referralCode,
        benefits: [
          "🎯 Early Access",
          "💰 ₦5,000 Bonus",
          "♾️ 0% Commission",
          "⭐ VIP Support",
        ],
      },
      201,
    );
  } catch (error) {
    console.error("Join waitlist error:", error);
    return response.error(res, "Failed to join waitlist", 500);
  }
};

// ─── Confirm Waitlist ────────────────────────────────────────────────────────

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

    // Unlock initial benefits
    const unlockedBenefits = ["EARLY_ACCESS"];

    // If confirmed within 7 days, unlock bonus
    const daysSinceSignup =
      (Date.now() - new Date(entry.createdAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSinceSignup <= 7) {
      unlockedBenefits.push("EXCLUSIVE_BONUS");
    }

    const updated = await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        unlockedBenefits,
        benefitUnlockedAt: new Date(),
      },
    });

    // Send benefit unlocked email
    try {
      if (unlockedBenefits.length > 0) {
        const benefitNames = unlockedBenefits
          .map((b) =>
            b === "EARLY_ACCESS"
              ? "🎯 Early Access"
              : b === "EXCLUSIVE_BONUS"
                ? "💰 Exclusive Bonuses"
                : b === "LIFETIME_BENEFITS"
                  ? "♾️ Lifetime Benefits"
                  : b === "VIP_SUPPORT"
                    ? "⭐ VIP Support"
                    : b,
          )
          .join(", ");

        await sendEmail(
          entry.email,
          EMAIL_TEMPLATES.BENEFIT_UNLOCKED.subject,
          EMAIL_TEMPLATES.BENEFIT_UNLOCKED.getBody(entry.name, benefitNames),
        );
      }
    } catch (err) {
      console.error("Failed to send benefit email:", err);
    }

    console.log(`✅ Email confirmed: ${entry.email}`);

    return response.success(res, "Email confirmed successfully!", {
      id: updated.id,
      email: updated.email,
      status: updated.status,
      unlockedBenefits: updated.unlockedBenefits,
    });
  } catch (error) {
    console.error("Confirm waitlist error:", error);
    return response.error(res, "Failed to confirm email", 500);
  }
};

// ─── Admin: Get Waitlist Stats ─────────────────────────────────────────────

export const getWaitlistStats = async (req, res) => {
  try {
    const [total, pending, confirmed, today, geoStats, deviceStats] =
      await Promise.all([
        prisma.waitlistEntry.count(),
        prisma.waitlistEntry.count({ where: { status: "PENDING" } }),
        prisma.waitlistEntry.count({ where: { status: "CONFIRMED" } }),
        prisma.waitlistEntry.count({
          where: {
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        }),
        prisma.waitlistEntry.groupBy({
          by: ["country"],
          _count: true,
          orderBy: { _count: { country: "desc" } },
          take: 5,
        }),
        prisma.waitlistEntry.groupBy({
          by: ["deviceType"],
          _count: true,
        }),
      ]);

    return response.success(res, "Waitlist statistics retrieved", {
      total,
      pending,
      confirmed,
      today,
      topCountries: geoStats.map((g) => ({
        country: g.country || "Unknown",
        count: g._count,
      })),
      devices: deviceStats.reduce(
        (acc, d) => ({ ...acc, [d.deviceType || "unknown"]: d._count }),
        {},
      ),
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
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
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
          name: true,
          status: true,
          country: true,
          region: true,
          city: true,
          deviceType: true,
          osName: true,
          browserName: true,
          createdAt: true,
          confirmedAt: true,
          unlockedBenefits: true,
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

// ─── Admin: Broadcast Email ─────────────────────────────────────────────────

export const broadcastEmail = async (req, res) => {
  try {
    const { subject, content, type, targetStatus = "CONFIRMED" } = req.body;

    if (!subject || !content) {
      return response.error(res, "Subject and content are required", 400);
    }

    // Get all confirmed waitlist entries
    const entries = await prisma.waitlistEntry.findMany({
      where: { status: targetStatus },
      select: { id: true, email: true, name: true },
    });

    if (entries.length === 0) {
      return response.error(
        res,
        `No ${targetStatus} waitlist entries found`,
        404,
      );
    }

    // Create campaign record
    const campaign = await prisma.waitlistCampaign.create({
      data: {
        title: subject,
        subject,
        content,
        status: "SENT",
        sentAt: new Date(),
        recipientCount: entries.length,
        createdBy: req.user?.id || null,
      },
    });

    // Send emails
    let sentCount = 0;
    let errorCount = 0;

    for (const entry of entries) {
      try {
        const personalizedContent = content
          .replace(/\{\{name\}\}/g, entry.name || "there")
          .replace(/\{\{email\}\}/g, entry.email);

        await sendEmail(entry.email, subject, personalizedContent);

        await prisma.waitlistEmailLog.create({
          data: {
            waitlistId: entry.id,
            campaignId: campaign.id,
            email: entry.email,
            type: type || "BROADCAST",
            subject,
            sentAt: new Date(),
          },
        });

        sentCount++;
      } catch (err) {
        errorCount++;
        console.error(`Failed to send to ${entry.email}:`, err);

        await prisma.waitlistEmailLog.create({
          data: {
            waitlistId: entry.id,
            campaignId: campaign.id,
            email: entry.email,
            type: type || "BROADCAST",
            subject,
            sentAt: new Date(),
            error: err.message,
          },
        });
      }
    }

    return response.success(res, "Broadcast sent successfully!", {
      campaignId: campaign.id,
      recipients: entries.length,
      sent: sentCount,
      errors: errorCount,
    });
  } catch (error) {
    console.error("Broadcast error:", error);
    return response.error(res, "Failed to send broadcast", 500);
  }
};

// ─── Admin: Get Campaigns ───────────────────────────────────────────────────

export const getCampaigns = async (req, res) => {
  try {
    const campaigns = await prisma.waitlistCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return response.success(res, "Campaigns retrieved", campaigns);
  } catch (error) {
    console.error("Get campaigns error:", error);
    return response.error(res, "Failed to get campaigns", 500);
  }
};

// ─── Admin: Launch Announcement ─────────────────────────────────────────────

export const sendLaunchAnnouncement = async (req, res) => {
  try {
    const entries = await prisma.waitlistEntry.findMany({
      where: { status: "CONFIRMED" },
      select: { id: true, email: true, name: true },
    });

    if (entries.length === 0) {
      return response.error(res, "No confirmed waitlist entries found", 404);
    }

    let sentCount = 0;
    let errorCount = 0;

    for (const entry of entries) {
      try {
        const content = EMAIL_TEMPLATES.LAUNCH_ANNOUNCEMENT.getBody(entry.name);
        await sendEmail(
          entry.email,
          EMAIL_TEMPLATES.LAUNCH_ANNOUNCEMENT.subject,
          content,
        );

        await prisma.waitlistEmailLog.create({
          data: {
            waitlistId: entry.id,
            email: entry.email,
            type: "LAUNCH_ANNOUNCEMENT",
            subject: EMAIL_TEMPLATES.LAUNCH_ANNOUNCEMENT.subject,
            sentAt: new Date(),
          },
        });

        sentCount++;
      } catch (err) {
        errorCount++;
        console.error(
          `Failed to send launch announcement to ${entry.email}:`,
          err,
        );
      }
    }

    return response.success(res, "Launch announcement sent!", {
      recipients: entries.length,
      sent: sentCount,
      errors: errorCount,
    });
  } catch (error) {
    console.error("Launch announcement error:", error);
    return response.error(res, "Failed to send launch announcement", 500);
  }
};

// ─── Admin: Export CSV ─────────────────────────────────────────────────────

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
      select: {
        email: true,
        name: true,
        status: true,
        country: true,
        region: true,
        city: true,
        deviceType: true,
        osName: true,
        browserName: true,
        createdAt: true,
        confirmedAt: true,
        unlockedBenefits: true,
      },
    });

    if (entries.length === 0) {
      return response.error(res, "No waitlist entries found", 404);
    }

    const headers = [
      "Email",
      "Name",
      "Status",
      "Country",
      "Region/State",
      "City",
      "Device",
      "OS",
      "Browser",
      "Created At",
      "Confirmed At",
      "Benefits",
    ];

    const rows = entries.map((e) => [
      e.email,
      e.name || "",
      e.status,
      e.country || "",
      e.region || "",
      e.city || "",
      e.deviceType || "",
      e.osName || "",
      e.browserName || "",
      e.createdAt.toISOString(),
      e.confirmedAt?.toISOString() || "",
      e.unlockedBenefits?.join(", ") || "",
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

// ─── Admin: Update Waitlist Status ────────────────────────────────────────

export const updateWaitlistStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["PENDING", "CONFIRMED", "UNLOCKED", "LAUNCHED"];
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

// ─── Admin: Get Single Waitlist Entry ─────────────────────────────────────

export const getWaitlistEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await prisma.waitlistEntry.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        country: true,
        region: true,
        city: true,
        latitude: true,
        longitude: true,
        timezone: true,
        postalCode: true,
        deviceType: true,
        deviceBrand: true,
        deviceModel: true,
        osName: true,
        osVersion: true,
        browserName: true,
        browserVersion: true,
        ipAddress: true,
        userAgent: true,
        referralCode: true,
        referredBy: true,
        unlockedBenefits: true,
        token: true,
        tokenExpiresAt: true,
        confirmedAt: true,
        createdAt: true,
        updatedAt: true,
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
