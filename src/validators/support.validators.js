// src/validators/support.validators.js
import { z } from "zod";

const categoryEnum = z.enum([
  "ACCOUNT",
  "PAYMENT",
  "BOOKING",
  "TECHNICAL",
  "VERIFICATION",
  "WITHDRAWAL",
  "REFERRAL",
  "RETAINED_STAFF",
  "ABUSE_REPORT",
  "FEATURE_REQUEST",
  "OTHER",
]);

const priorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
const statusEnum = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_USER",
  "WAITING_ADMIN",
  "RESOLVED",
  "CLOSED",
]);

export const createTicketSchema = z.object({
  category: categoryEnum,
  priority: priorityEnum.optional(),
  subject: z
    .string()
    .trim()
    .min(4, "Subject must be at least 4 characters")
    .max(200),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(5000),
  relatedType: z.string().trim().max(40).optional(),
  relatedId: z.string().trim().max(64).optional(),
});

export const replyTicketSchema = z.object({
  body: z.string().trim().max(5000).optional(),
});

export const adminReplyTicketSchema = z.object({
  body: z.string().trim().max(5000).optional(),
  isInternal: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => v === true || v === "true")
    .optional(),
});

export const csatSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export const assignTicketSchema = z.object({
  adminId: z.string().uuid().nullable(),
});

export const updateStatusSchema = z.object({
  status: statusEnum,
  note: z.string().trim().max(500).optional(),
});

export const updatePrioritySchema = z.object({
  priority: priorityEnum,
});

export const startChatSchema = z.object({
  category: categoryEnum.optional(),
  message: z.string().trim().max(2000).optional(),
  subject: z.string().trim().max(200).optional(),
});

export const escalateChatSchema = z.object({
  category: categoryEnum,
  subject: z.string().trim().min(4).max(200),
  priority: priorityEnum.optional(),
});

/**
 * Express middleware. Parses req.body through a Zod schema.
 * On failure → 400 with fieldErrors. On success → replaces
 * req.body with the parsed (and coerced) value.
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: result.error.flatten().fieldErrors,
    });
  }
  req.body = result.data;
  next();
};
