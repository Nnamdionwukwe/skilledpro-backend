// src/controllers/survey.controller.js

import { PrismaClient } from "../generated/prisma/index.js";
import { sendResponse, sendError } from "../utils/response.js";
import { logAdminAction as auditLog } from "../utils/auditLog.js";

// Create response wrapper with .success and .error methods
const response = {
  success: (res, message, data = null, status = 200) => {
    return sendResponse(res, { status, message, data });
  },
  error: (res, message, status = 400, errors = null) => {
    return sendError(res, message, status, errors);
  },
};

const prisma = new PrismaClient();

// ── Helper validation functions ──
const validateEmail = (email) => {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const validatePhone = (phone) => {
  if (!phone) return true;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  const phoneRegex =
    /^(\+?\d{1,3})?[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/;
  return phoneRegex.test(cleaned) && cleaned.replace(/[^0-9]/g, "").length >= 7;
};

const validateSurveyData = (data) => {
  const errors = [];

  const validRoles = ["hirer", "worker", "both"];
  if (!data.role || !validRoles.includes(data.role)) {
    errors.push("Role must be hirer, worker, or both");
  }

  const validIndustries = [
    "plumbing",
    "electrical",
    "carpentry",
    "cleaning",
    "hvac",
    "painting",
    "office",
    "other",
  ];
  if (!data.industry || !validIndustries.includes(data.industry)) {
    errors.push("Invalid industry selected");
  }

  const validExperience = ["beginner", "intermediate", "expert"];
  if (!data.experience || !validExperience.includes(data.experience)) {
    errors.push("Experience must be beginner, intermediate, or expert");
  }

  if (!data.problem || data.problem.trim().length < 10) {
    errors.push("Problem description must be at least 10 characters");
  }

  if (!data.feature || data.feature.trim().length < 10) {
    errors.push("Feature description must be at least 10 characters");
  }

  if (data.email && !validateEmail(data.email)) {
    errors.push("Invalid email address");
  }

  if (data.phone && !validatePhone(data.phone)) {
    errors.push("Invalid phone number");
  }

  if (data.rating !== undefined && (data.rating < 0 || data.rating > 5)) {
    errors.push("Rating must be between 0 and 5");
  }

  return errors;
};

// ── Submit Survey ──
export const submitSurvey = async (req, res) => {
  try {
    const {
      role,
      industry,
      experience,
      problem,
      feature,
      concern,
      hearAbout,
      email,
      name,
      phone,
      location,
      additionalFeedback,
      rating = 0,
    } = req.body;

    // Validate
    const errors = validateSurveyData(req.body);
    if (errors.length > 0) {
      return response.error(res, "Validation failed", 400, { errors });
    }

    // Check for duplicate submission (same email within 24 hours)
    if (email) {
      const existing = await prisma.surveyResponse.findFirst({
        where: {
          email: email.toLowerCase().trim(),
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      });

      if (existing) {
        return response.error(
          res,
          "You have already submitted a survey within 24 hours. Please wait before submitting again.",
          429,
          { code: "DUPLICATE_SUBMISSION" },
        );
      }
    }

    // Create survey response
    const surveyResponse = await prisma.surveyResponse.create({
      data: {
        role,
        industry,
        experience,
        problem: problem.trim(),
        feature: feature.trim(),
        concern: concern || null,
        hearAbout: hearAbout || null,
        email: email ? email.toLowerCase().trim() : null,
        name: name ? name.trim() : null,
        phone: phone ? phone.trim() : null,
        location: location ? location.trim() : null,
        additionalFeedback: additionalFeedback
          ? additionalFeedback.trim()
          : null,
        rating: rating || 0,
        status: "PENDING",
        ipAddress: req.ip || req.connection?.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
      },
    });

    // Log audit
    await auditLog({
      req,
      adminId: req.user?.id || null,
      action: "SURVEY_SUBMITTED",
      targetType: "survey",
      targetId: surveyResponse.id,
      description: `Survey submitted by ${email || "anonymous"}`,
      meta: { email, role, industry },
    });

    // Send confirmation email (don't await)
    if (email) {
      sendSurveyConfirmation(email, name).catch((err) =>
        console.error("Failed to send survey confirmation:", err),
      );
    }

    return response.success(
      res,
      "Survey submitted successfully",
      {
        id: surveyResponse.id,
        email: surveyResponse.email,
      },
      201,
    );
  } catch (error) {
    console.error("Survey submission error:", error);
    return response.error(res, "Failed to submit survey", 500);
  }
};

// ── Admin: Get Survey Stats ──
export const getSurveyStats = async (req, res) => {
  try {
    const [
      total,
      pending,
      reviewed,
      contacted,
      archived,
      today,
      thisWeek,
      thisMonth,
    ] = await Promise.all([
      prisma.surveyResponse.count(),
      prisma.surveyResponse.count({ where: { status: "PENDING" } }),
      prisma.surveyResponse.count({ where: { status: "REVIEWED" } }),
      prisma.surveyResponse.count({ where: { status: "CONTACTED" } }),
      prisma.surveyResponse.count({ where: { status: "ARCHIVED" } }),
      prisma.surveyResponse.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.surveyResponse.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setDate(new Date().getDate() - 7)),
          },
        },
      }),
      prisma.surveyResponse.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setMonth(new Date().getMonth() - 1)),
          },
        },
      }),
    ]);

    const roleDistribution = await prisma.surveyResponse.groupBy({
      by: ["role"],
      _count: { role: true },
      orderBy: { _count: { role: "desc" } },
    });

    const industryDistribution = await prisma.surveyResponse.groupBy({
      by: ["industry"],
      _count: { industry: true },
      orderBy: { _count: { industry: "desc" } },
    });

    return response.success(res, "Survey statistics retrieved", {
      total,
      pending,
      reviewed,
      contacted,
      archived,
      today,
      thisWeek,
      thisMonth,
      roleDistribution: roleDistribution.map((r) => ({
        role: r.role,
        count: r._count.role,
      })),
      industryDistribution: industryDistribution.map((i) => ({
        industry: i.industry,
        count: i._count.industry,
      })),
    });
  } catch (error) {
    console.error("Survey stats error:", error);
    return response.error(res, "Failed to get survey statistics", 500);
  }
};

// ── Admin: Get All Survey Responses ──
export const getAllSurveyResponses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      role,
      industry,
      search,
      fromDate,
      toDate,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where = {};

    if (status) where.status = status;
    if (role) where.role = role;
    if (industry) where.industry = industry;

    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { problem: { contains: search, mode: "insensitive" } },
        { feature: { contains: search, mode: "insensitive" } },
      ];
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const [responses, total] = await Promise.all([
      prisma.surveyResponse.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          role: true,
          industry: true,
          experience: true,
          problem: true,
          feature: true,
          concern: true,
          hearAbout: true,
          email: true,
          name: true,
          phone: true,
          location: true,
          additionalFeedback: true,
          rating: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.surveyResponse.count({ where }),
    ]);

    return response.success(res, "Survey responses retrieved", {
      responses,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get survey responses error:", error);
    return response.error(res, "Failed to get survey responses", 500);
  }
};

// ── Admin: Get Single Survey Response ──
export const getSurveyResponseById = async (req, res) => {
  try {
    const { id } = req.params;

    const surveyResponse = await prisma.surveyResponse.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        industry: true,
        experience: true,
        problem: true,
        feature: true,
        concern: true,
        hearAbout: true,
        email: true,
        name: true,
        phone: true,
        location: true,
        additionalFeedback: true,
        rating: true,
        status: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!surveyResponse) {
      return response.error(res, "Survey response not found", 404);
    }

    await auditLog({
      req,
      adminId: req.user?.id,
      action: "SURVEY_VIEWED",
      targetType: "survey",
      targetId: id,
      description: `Survey response ${id} viewed`,
    });

    return response.success(res, "Survey response retrieved", surveyResponse);
  } catch (error) {
    console.error("Get survey response error:", error);
    return response.error(res, "Failed to get survey response", 500);
  }
};

// ── Admin: Update Survey Status ──
export const updateSurveyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ["PENDING", "REVIEWED", "CONTACTED", "ARCHIVED"];
    if (!validStatuses.includes(status)) {
      return response.error(res, "Invalid status", 400, { validStatuses });
    }

    const existing = await prisma.surveyResponse.findUnique({ where: { id } });
    if (!existing) {
      return response.error(res, "Survey response not found", 404);
    }

    const updated = await prisma.surveyResponse.update({
      where: { id },
      data: { status, updatedAt: new Date() },
    });

    await auditLog({
      req,
      adminId: req.user?.id,
      action: "SURVEY_STATUS_UPDATED",
      targetType: "survey",
      targetId: id,
      description: `Survey status changed from ${existing.status} to ${status}`,
      meta: { oldStatus: existing.status, newStatus: status, notes },
    });

    return response.success(res, "Survey status updated", {
      id: updated.id,
      status: updated.status,
    });
  } catch (error) {
    console.error("Update survey status error:", error);
    return response.error(res, "Failed to update survey status", 500);
  }
};

// ── Admin: Bulk Delete ──
export const bulkDeleteSurveyResponses = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return response.error(
        res,
        "Please provide an array of response IDs",
        400,
      );
    }

    const result = await prisma.surveyResponse.deleteMany({
      where: { id: { in: ids } },
    });

    await auditLog({
      req,
      adminId: req.user?.id,
      action: "SURVEY_BULK_DELETED",
      targetType: "survey",
      description: `Bulk deleted ${result.count} survey responses`,
      meta: { deletedCount: result.count, ids },
    });

    return response.success(res, "Survey responses deleted", {
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return response.error(res, "Failed to delete survey responses", 500);
  }
};

// ── Admin: Export CSV ──
export const exportSurveyCSV = async (req, res) => {
  try {
    const { status, role, industry, fromDate, toDate } = req.query;
    const where = {};

    if (status) where.status = status;
    if (role) where.role = role;
    if (industry) where.industry = industry;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const responses = await prisma.surveyResponse.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    if (responses.length === 0) {
      return response.error(res, "No survey responses found", 404);
    }

    const headers = [
      "ID",
      "Role",
      "Industry",
      "Experience",
      "Biggest Challenge",
      "Desired Feature",
      "Concern",
      "Hear About",
      "Email",
      "Name",
      "Phone",
      "Location",
      "Additional Feedback",
      "Rating",
      "Status",
      "Created At",
    ];

    const rows = responses.map((r) => [
      r.id,
      r.role || "",
      r.industry || "",
      r.experience || "",
      `"${(r.problem || "").replace(/"/g, '""')}"`,
      `"${(r.feature || "").replace(/"/g, '""')}"`,
      r.concern || "",
      r.hearAbout || "",
      r.email || "",
      r.name || "",
      r.phone || "",
      r.location || "",
      `"${(r.additionalFeedback || "").replace(/"/g, '""')}"`,
      r.rating || 0,
      r.status,
      r.createdAt.toISOString(),
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n",
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=survey-responses-${new Date().toISOString().split("T")[0]}.csv`,
    );
    return res.send(csv);
  } catch (error) {
    console.error("Export CSV error:", error);
    return response.error(res, "Failed to export survey responses", 500);
  }
};

// ── Email Helper ──
async function sendSurveyConfirmation(email, name) {
  // Implement your email sending logic here
  console.log(`📧 Sending confirmation email to ${email}`);
  // Use your email service
}
