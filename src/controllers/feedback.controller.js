// src/controllers/feedback.controller.js
// Complete Feedback Controller for SkilledProz

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { sendEmail } from "../services/email.service.js";

// ─── Submit Feedback ──────────────────────────────────────────────────────────

export const submitFeedback = async (req, res) => {
  try {
    const {
      type,
      rating,
      title,
      description,
      email,
      name,
      tags,
      screenUrl,
      browserInfo,
      submittedAt,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!type) {
      return sendError(res, "Feedback type is required", 400);
    }

    const validTypes = ["praise", "suggestion", "bug", "feature", "general"];
    if (!validTypes.includes(type)) {
      return sendError(res, "Invalid feedback type", 400, { validTypes });
    }

    if (!rating || rating < 1 || rating > 5) {
      return sendError(res, "Rating must be between 1 and 5", 400);
    }

    if (!title || title.trim().length < 3) {
      return sendError(res, "Title must be at least 3 characters", 400);
    }

    if (!description || description.trim().length < 10) {
      return sendError(res, "Description must be at least 10 characters", 400);
    }

    // ── Get user ID if authenticated ──────────────────────────────────────
    let userId = null;
    if (req.user) {
      userId = req.user.id;
    }

    // ── Create feedback entry ─────────────────────────────────────────────
    const feedback = await prisma.feedback.create({
      data: {
        type,
        rating,
        title: title.trim(),
        description: description.trim(),
        email: email || null,
        name: name || null,
        tags: tags || [],
        screenUrl: screenUrl || null,
        browserInfo: browserInfo || null,
        userId,
        submittedAt: submittedAt ? new Date(submittedAt) : new Date(),
        status: "PENDING",
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
      },
    });

    console.log(`📝 New feedback: ${type} (${rating}⭐) - ${title}`);

    // ── Send admin notification email ──────────────────────────────────────
    try {
      await sendFeedbackNotificationEmail({
        feedback,
        adminEmails: process.env.ADMIN_EMAILS?.split(",") || [
          "admin@skilledproz.com",
        ],
      });
    } catch (err) {
      console.error("Failed to send admin notification:", err);
    }

    // ── Send thank you email to user ──────────────────────────────────────
    if (email) {
      try {
        await sendFeedbackThankYouEmail({
          to: email,
          name: name || "there",
          feedbackType: type,
        });
      } catch (err) {
        console.error("Failed to send thank you email:", err);
      }
    }

    return sendResponse(res, {
      status: 201,
      message:
        "Feedback submitted successfully! Thank you for helping us improve.",
      data: {
        id: feedback.id,
        type: feedback.type,
        rating: feedback.rating,
        title: feedback.title,
        status: feedback.status,
        createdAt: feedback.createdAt,
      },
    });
  } catch (error) {
    console.error("Submit feedback error:", error);
    return sendError(res, "Failed to submit feedback", 500);
  }
};

// ─── Admin: Get All Feedback ──────────────────────────────────────────────

export const getAllFeedback = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      rating,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where = {};

    if (type) where.type = type;
    if (status) where.status = status;
    if (rating) where.rating = Number(rating);

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const [feedback, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      }),
      prisma.feedback.count({ where }),
    ]);

    // Get stats
    const stats = await getFeedbackStats();

    return sendResponse(res, {
      message: "Feedback retrieved successfully",
      data: {
        feedback,
        stats,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Get all feedback error:", error);
    return sendError(res, "Failed to get feedback", 500);
  }
};

// ─── Admin: Get Feedback Stats ────────────────────────────────────────────

export const getFeedbackStats = async (req, res) => {
  try {
    const stats = await getFeedbackStats();

    return sendResponse(res, {
      message: "Feedback stats retrieved",
      data: stats,
    });
  } catch (error) {
    console.error("Get feedback stats error:", error);
    return sendError(res, "Failed to get feedback stats", 500);
  }
};

// ─── Helper: Get Feedback Stats ───────────────────────────────────────────

const getFeedbackStats = async () => {
  const [
    total,
    pending,
    reviewed,
    resolved,
    byType,
    avgRating,
    ratingDistribution,
    recent,
  ] = await Promise.all([
    prisma.feedback.count(),
    prisma.feedback.count({ where: { status: "PENDING" } }),
    prisma.feedback.count({ where: { status: "REVIEWED" } }),
    prisma.feedback.count({ where: { status: "RESOLVED" } }),
    prisma.feedback.groupBy({
      by: ["type"],
      _count: true,
    }),
    prisma.feedback.aggregate({
      _avg: { rating: true },
    }),
    prisma.feedback.groupBy({
      by: ["rating"],
      _count: true,
    }),
    prisma.feedback.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        rating: true,
        title: true,
        status: true,
        createdAt: true,
        name: true,
        email: true,
      },
    }),
  ]);

  return {
    total,
    pending,
    reviewed,
    resolved,
    byType: byType.reduce((acc, t) => ({ ...acc, [t.type]: t._count }), {
      praise: 0,
      suggestion: 0,
      bug: 0,
      feature: 0,
      general: 0,
    }),
    avgRating: avgRating._avg.rating || 0,
    ratingDistribution: ratingDistribution.reduce(
      (acc, r) => ({ ...acc, [r.rating]: r._count }),
      { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    ),
    recent,
  };
};

// ─── Admin: Get Single Feedback ───────────────────────────────────────────

export const getFeedbackById = async (req, res) => {
  try {
    const { id } = req.params;

    const feedback = await prisma.feedback.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    if (!feedback) {
      return sendError(res, "Feedback not found", 404);
    }

    return sendResponse(res, {
      message: "Feedback retrieved",
      data: feedback,
    });
  } catch (error) {
    console.error("Get feedback by ID error:", error);
    return sendError(res, "Failed to get feedback", 500);
  }
};

// ─── Admin: Update Feedback Status ────────────────────────────────────────

export const updateFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const validStatuses = ["PENDING", "REVIEWED", "RESOLVED", "DISMISSED"];
    if (!validStatuses.includes(status)) {
      return sendError(res, "Invalid status", 400, { validStatuses });
    }

    const existing = await prisma.feedback.findUnique({
      where: { id },
    });

    if (!existing) {
      return sendError(res, "Feedback not found", 404);
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: {
        status,
        adminNotes: adminNotes || existing.adminNotes,
        reviewedAt:
          status === "REVIEWED" || status === "RESOLVED" ? new Date() : null,
        reviewedBy: req.user?.id || null,
      },
    });

    console.log(`📝 Feedback ${id} status updated to ${status}`);

    return sendResponse(res, {
      message: "Feedback status updated",
      data: updated,
    });
  } catch (error) {
    console.error("Update feedback status error:", error);
    return sendError(res, "Failed to update feedback status", 500);
  }
};

// ─── Admin: Delete Feedback ───────────────────────────────────────────────

export const deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.feedback.findUnique({
      where: { id },
    });

    if (!existing) {
      return sendError(res, "Feedback not found", 404);
    }

    await prisma.feedback.delete({
      where: { id },
    });

    console.log(`🗑️ Feedback deleted: ${existing.title}`);

    return sendResponse(res, {
      message: "Feedback deleted successfully",
      data: {
        id: existing.id,
        title: existing.title,
      },
    });
  } catch (error) {
    console.error("Delete feedback error:", error);
    return sendError(res, "Failed to delete feedback", 500);
  }
};

// ─── Admin: Export Feedback CSV ───────────────────────────────────────────

export const exportFeedbackCSV = async (req, res) => {
  try {
    const { type, status, rating, fromDate, toDate } = req.query;
    const where = {};

    if (type) where.type = type;
    if (status) where.status = status;
    if (rating) where.rating = Number(rating);
    if (fromDate) where.createdAt = { gte: new Date(fromDate) };
    if (toDate) where.createdAt = { ...where.createdAt, lte: new Date(toDate) };

    const feedback = await prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        rating: true,
        title: true,
        description: true,
        name: true,
        email: true,
        status: true,
        tags: true,
        screenUrl: true,
        createdAt: true,
        submittedAt: true,
      },
    });

    if (feedback.length === 0) {
      return sendError(res, "No feedback found", 404);
    }

    const headers = [
      "ID",
      "Type",
      "Rating",
      "Title",
      "Description",
      "Name",
      "Email",
      "Status",
      "Tags",
      "Screen URL",
      "Created At",
      "Submitted At",
    ];

    const rows = feedback.map((f) => [
      f.id,
      f.type,
      f.rating,
      f.title,
      f.description.replace(/,/g, "; "),
      f.name || "",
      f.email || "",
      f.status,
      f.tags?.join(", ") || "",
      f.screenUrl || "",
      f.createdAt.toISOString(),
      f.submittedAt?.toISOString() || "",
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n",
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=feedback-${new Date().toISOString().split("T")[0]}.csv`,
    );
    return res.send(csv);
  } catch (error) {
    console.error("Export feedback CSV error:", error);
    return sendError(res, "Failed to export feedback CSV", 500);
  }
};

// ─── Email Helpers ──────────────────────────────────────────────────────────

const sendFeedbackNotificationEmail = async ({ feedback, adminEmails }) => {
  const adminEmailList = adminEmails.filter(Boolean);

  if (adminEmailList.length === 0) return;

  const typeLabels = {
    praise: "🌟 Praise",
    suggestion: "💡 Suggestion",
    bug: "🐛 Bug Report",
    feature: "❤️ Feature Request",
    general: "💬 General",
  };

  const statusColors = {
    PENDING: "#F59E0B",
    REVIEWED: "#3B82F6",
    RESOLVED: "#10B981",
    DISMISSED: "#6B7280",
  };

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 30px; background: #0a0a1a; border-radius: 20px; color: #fff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="font-size: 28px; font-weight: 900; background: linear-gradient(135deg, #F59E0B, #F97316); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0;">New Feedback</h1>
        <p style="color: #888; font-size: 14px;">${new Date().toLocaleString()}</p>
      </div>

      <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 16px; padding: 25px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <span style="font-size: 20px;">${typeLabels[feedback.type] || feedback.type}</span>
          <span style="background: rgba(245, 158, 11, 0.15); padding: 4px 12px; border-radius: 20px; font-size: 14px; color: #F59E0B;">
            ${feedback.rating}⭐
          </span>
        </div>

        <h3 style="font-size: 18px; color: #fff; margin: 0 0 10px;">${feedback.title}</h3>
        <p style="color: #ccc; font-size: 15px; line-height: 1.7;">${feedback.description}</p>

        ${feedback.email ? `<p style="color: #888; font-size: 13px; margin-top: 15px;">📧 From: ${feedback.email}${feedback.name ? ` (${feedback.name})` : ""}</p>` : ""}
        ${feedback.tags?.length ? `<p style="color: #888; font-size: 13px;">🏷️ Tags: ${feedback.tags.join(", ")}</p>` : ""}
        ${feedback.screenUrl ? `<p style="color: #888; font-size: 13px;">🔗 URL: ${feedback.screenUrl}</p>` : ""}
      </div>

      <div style="margin-top: 20px; text-align: center;">
        <a href="${process.env.ADMIN_URL || "https://admin.skilledproz.com"}/feedback/${feedback.id}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #F59E0B, #F97316); color: #000; font-weight: 700; text-decoration: none; border-radius: 10px;">
          View Feedback
        </a>
      </div>
    </div>
  `;

  for (const adminEmail of adminEmailList) {
    await sendEmail({
      to: adminEmail,
      subject: `📝 New Feedback: ${feedback.title}`,
      html,
    });
  }
};

const sendFeedbackThankYouEmail = async ({ to, name, feedbackType }) => {
  const messages = {
    praise:
      "Thank you for your kind words! They mean the world to us and keep us motivated.",
    suggestion:
      "Your suggestion is valuable! We'll review it and consider it for future updates.",
    bug: "Thank you for reporting this. Our team will investigate and work on a fix.",
    feature: "Great idea! We'll evaluate this feature request for our roadmap.",
    general: "Thank you for taking the time to share your thoughts with us.",
  };

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 30px; background: #0a0a1a; border-radius: 20px; color: #fff;">
      <div style="text-align: center;">
        <span style="font-size: 48px;">🙏</span>
        <h2 style="font-size: 28px; font-weight: 900; color: #F59E0B; margin: 10px 0;">Thank You!</h2>
        <p style="font-size: 16px; color: #ccc;">Your feedback helps us build a better SkilledProz</p>
      </div>

      <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 16px; padding: 25px; margin: 20px 0;">
        <p style="font-size: 16px; color: #e0e0e0; margin: 0;">
          ${messages[feedbackType] || messages.general}
        </p>
      </div>

      <div style="background: rgba(245, 158, 11, 0.05); border-radius: 12px; padding: 15px; border: 1px dashed rgba(245, 158, 11, 0.15);">
        <p style="font-size: 13px; color: #888; margin: 0; text-align: center;">
          🌟 Your feedback directly influences our product decisions. Thank you for being part of our community!
        </p>
      </div>

      <p style="text-align: center; color: #666; font-size: 13px; margin-top: 20px;">
        You received this email because you submitted feedback on SkilledProz.
      </p>
    </div>
  `;

  await sendEmail({
    to,
    subject: "🙏 Thank you for your feedback!",
    html,
  });
};
