// src/validators/survey.validator.js

import { body, param, query } from "express-validator";
import { validate } from "../middleware/validate.middleware.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_ROLES = ["hirer", "worker", "both"];
const VALID_INDUSTRIES = [
  "plumbing",
  "electrical",
  "carpentry",
  "cleaning",
  "hvac",
  "painting",
  "office",
  "other",
];
const VALID_EXPERIENCE = ["beginner", "intermediate", "expert"];
const VALID_STATUSES = ["PENDING", "REVIEWED", "CONTACTED", "ARCHIVED"];
const VALID_CONCERNS = [
  "payment",
  "reliability",
  "finding",
  "payment_time",
  "communication",
  "other",
];
const VALID_HEAR_ABOUT = ["google", "social", "friend", "ad", "other"];

// ─── Public: Submit Survey ──────────────────────────────────────────────────
// POST /api/survey

export const validateSubmitSurvey = [
  // ─── Required fields ────────────────────────────────────────────────────
  body("role")
    .trim()
    .notEmpty()
    .withMessage("Role is required")
    .isIn(VALID_ROLES)
    .withMessage(`Role must be one of: ${VALID_ROLES.join(", ")}`),

  body("industry")
    .trim()
    .notEmpty()
    .withMessage("Industry is required")
    .isIn(VALID_INDUSTRIES)
    .withMessage(`Industry must be one of: ${VALID_INDUSTRIES.join(", ")}`),

  body("experience")
    .trim()
    .notEmpty()
    .withMessage("Experience level is required")
    .isIn(VALID_EXPERIENCE)
    .withMessage(`Experience must be one of: ${VALID_EXPERIENCE.join(", ")}`),

  // ─── Problem & Feature (min 10 chars) ──────────────────────────────────
  body("problem")
    .trim()
    .notEmpty()
    .withMessage("Problem description is required")
    .isLength({ min: 10, max: 5000 })
    .withMessage("Problem description must be between 10 and 5000 characters"),

  body("feature")
    .trim()
    .notEmpty()
    .withMessage("Feature description is required")
    .isLength({ min: 10, max: 5000 })
    .withMessage("Feature description must be between 10 and 5000 characters"),

  // ─── Optional fields ────────────────────────────────────────────────────
  body("concern")
    .optional({ checkFalsy: true })
    .trim()
    .isIn(VALID_CONCERNS)
    .withMessage(`Concern must be one of: ${VALID_CONCERNS.join(", ")}`),

  body("hearAbout")
    .optional({ checkFalsy: true })
    .trim()
    .isIn(VALID_HEAR_ABOUT)
    .withMessage(`Hear about must be one of: ${VALID_HEAR_ABOUT.join(", ")}`),

  body("email")
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage("Email must not exceed 255 characters"),

  body("name")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters")
    .matches(/^[a-zA-Z\s\-']+$/)
    .withMessage(
      "Name can only contain letters, spaces, hyphens, and apostrophes",
    ),

  body("phone")
    .optional({ checkFalsy: true })
    .trim()
    .custom((value) => {
      const cleaned = value.replace(/[\s\-()]/g, "");
      const phoneRegex =
        /^(\+?\d{1,3})?[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/;
      if (
        !phoneRegex.test(cleaned) ||
        cleaned.replace(/[^0-9]/g, "").length < 7
      ) {
        throw new Error("Invalid phone number. Must be at least 7 digits");
      }
      return true;
    }),

  body("location")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage("Location must not exceed 255 characters"),

  body("additionalFeedback")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 5000 })
    .withMessage("Additional feedback must not exceed 5000 characters"),

  body("rating")
    .optional({ checkFalsy: true })
    .isInt({ min: 0, max: 5 })
    .withMessage("Rating must be between 0 and 5")
    .toInt(),

  // ─── Validate all ──────────────────────────────────────────────────────
  validate,
];

// ─── Admin: Get Survey Stats ───────────────────────────────────────────────
// GET /api/survey/admin/stats

export const validateGetSurveyStats = [
  // No body params needed, just authentication
  validate,
];

// ─── Admin: Get All Survey Responses ──────────────────────────────────────
// GET /api/survey/admin/responses

export const validateGetAllSurveyResponses = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),

  query("status")
    .optional()
    .trim()
    .isIn(VALID_STATUSES)
    .withMessage(`Status must be one of: ${VALID_STATUSES.join(", ")}`),

  query("role")
    .optional()
    .trim()
    .isIn(VALID_ROLES)
    .withMessage(`Role must be one of: ${VALID_ROLES.join(", ")}`),

  query("industry")
    .optional()
    .trim()
    .isIn(VALID_INDUSTRIES)
    .withMessage(`Industry must be one of: ${VALID_INDUSTRIES.join(", ")}`),

  query("search")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Search term must not exceed 255 characters"),

  query("fromDate")
    .optional()
    .isISO8601()
    .withMessage("fromDate must be a valid ISO date"),

  query("toDate")
    .optional()
    .isISO8601()
    .withMessage("toDate must be a valid ISO date"),

  validate,
];

// ─── Admin: Get Single Survey Response ────────────────────────────────────
// GET /api/survey/admin/responses/:id

export const validateGetSurveyResponseById = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Survey ID is required")
    .isUUID(4)
    .withMessage("Survey ID must be a valid UUID"),

  validate,
];

// ─── Admin: Update Survey Status ──────────────────────────────────────────
// PATCH /api/survey/admin/responses/:id/status

export const validateUpdateSurveyStatus = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Survey ID is required")
    .isUUID(4)
    .withMessage("Survey ID must be a valid UUID"),

  body("status")
    .trim()
    .notEmpty()
    .withMessage("Status is required")
    .isIn(VALID_STATUSES)
    .withMessage(`Status must be one of: ${VALID_STATUSES.join(", ")}`),

  body("notes")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Notes must not exceed 1000 characters"),

  validate,
];

// ─── Admin: Bulk Delete Survey Responses ──────────────────────────────────
// DELETE /api/survey/admin/responses/bulk

export const validateBulkDeleteSurveyResponses = [
  body("ids")
    .isArray({ min: 1 })
    .withMessage("ids must be a non-empty array")
    .custom((value) => {
      const isValid = value.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
      );
      if (!isValid) {
        throw new Error("Each ID must be a valid UUID");
      }
      return true;
    }),

  validate,
];

// ─── Admin: Export Survey CSV ─────────────────────────────────────────────
// GET /api/survey/admin/export/csv

export const validateExportSurveyCSV = [
  query("status")
    .optional()
    .trim()
    .isIn(VALID_STATUSES)
    .withMessage(`Status must be one of: ${VALID_STATUSES.join(", ")}`),

  query("role")
    .optional()
    .trim()
    .isIn(VALID_ROLES)
    .withMessage(`Role must be one of: ${VALID_ROLES.join(", ")}`),

  query("industry")
    .optional()
    .trim()
    .isIn(VALID_INDUSTRIES)
    .withMessage(`Industry must be one of: ${VALID_INDUSTRIES.join(", ")}`),

  query("fromDate")
    .optional()
    .isISO8601()
    .withMessage("fromDate must be a valid ISO date"),

  query("toDate")
    .optional()
    .isISO8601()
    .withMessage("toDate must be a valid ISO date"),

  validate,
];
