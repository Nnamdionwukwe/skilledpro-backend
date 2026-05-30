// src/controllers/promoCode.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Promo code system for subscription discounts.
// Imports ALL_PLANS from plans.js — NO import from subscription.controller.js
// ─────────────────────────────────────────────────────────────────────────────
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { paginate } from "../utils/helpers.js";
import { ALL_PLANS } from "../config/plans.js"; // ← no circular dep

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS — called by subscription.controller.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates and computes the discount for a promo code.
 * Throws a human-readable error string if the code is invalid.
 *
 * @returns {{ finalPrice, discount, record }}
 */
export async function applyPromoToCheckout(
  code,
  planId,
  userId,
  originalPrice,
) {
  const promo = await prisma.promoCode.findFirst({
    where: { code: { equals: code.toUpperCase().trim(), mode: "insensitive" } },
  });

  if (!promo) throw new Error("Promo code not found");
  if (!promo.isActive) throw new Error("Promo code is no longer active");
  if (promo.expiresAt && new Date() > promo.expiresAt)
    throw new Error("Promo code has expired");
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    throw new Error("Promo code has reached its usage limit");
  }
  if (originalPrice < promo.minPlanAmount) {
    throw new Error(
      `This promo requires a plan of at least ₦${promo.minPlanAmount.toLocaleString()}`,
    );
  }

  if (promo.applicableTo) {
    const allowed = JSON.parse(promo.applicableTo);
    if (
      Array.isArray(allowed) &&
      allowed.length > 0 &&
      !allowed.includes(planId)
    ) {
      throw new Error("Promo code is not valid for this plan");
    }
  }

  const alreadyUsed = await prisma.promoCodeUsage.findFirst({
    where: { promoCodeId: promo.id, userId },
  });
  if (alreadyUsed) throw new Error("You have already used this promo code");

  const discount =
    promo.discountType === "PERCENT"
      ? parseFloat(((originalPrice * promo.discountValue) / 100).toFixed(2))
      : Math.min(promo.discountValue, originalPrice);

  const finalPrice = Math.max(
    0,
    parseFloat((originalPrice - discount).toFixed(2)),
  );

  return { finalPrice, discount, record: promo };
}

/**
 * Records usage after a successful payment — call from verifyCheckout.
 */
export async function recordPromoUsage(
  promoCodeId,
  userId,
  planId,
  amounts,
  reference,
) {
  await Promise.all([
    prisma.promoCodeUsage.create({
      data: {
        promoCodeId,
        userId,
        planId,
        reference,
        discountAmt: amounts.discountAmt,
        originalAmt: amounts.originalAmt,
        finalAmt: amounts.finalAmt,
      },
    }),
    prisma.promoCode.update({
      where: { id: promoCodeId },
      data: { usedCount: { increment: 1 }, updatedAt: new Date() },
    }),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1  USER — VALIDATE PROMO CODE
// GET /api/subscriptions/promo/validate/:code?planId=worker_pro
// ─────────────────────────────────────────────────────────────────────────────
export const validatePromoCode = async (req, res) => {
  try {
    const { code } = req.params;
    const { planId } = req.query;
    if (!code?.trim()) return sendError(res, "Code is required", 400);

    const plan = planId ? ALL_PLANS.find((p) => p.id === planId) : null;
    const originalPrice = plan?.price ?? 0;

    try {
      const result = await applyPromoToCheckout(
        code,
        planId || "",
        req.user?.id || "PREVIEW",
        originalPrice,
      );

      return sendResponse(res, {
        data: {
          valid: true,
          code: result.record.code,
          description: result.record.description,
          discountType: result.record.discountType,
          discountValue: result.record.discountValue,
          preview: plan
            ? {
                originalPrice,
                discount: result.discount,
                finalPrice: result.finalPrice,
                currency: "NGN",
              }
            : null,
          expiresAt: result.record.expiresAt,
        },
      });
    } catch (err) {
      return sendError(res, err.message, 400);
    }
  } catch (err) {
    return sendError(res, "Failed to validate promo code");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 2  ADMIN — CREATE
// POST /api/subscriptions/admin/promo-codes
// ─────────────────────────────────────────────────────────────────────────────
export const createPromoCode = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType = "PERCENT",
      discountValue,
      maxUses,
      expiresAt,
      applicableTo,
      minPlanAmount = 0,
    } = req.body;

    if (!code?.trim()) return sendError(res, "code is required", 400);
    if (!discountValue) return sendError(res, "discountValue is required", 400);
    if (!["PERCENT", "FIXED"].includes(discountType)) {
      return sendError(res, "discountType must be PERCENT or FIXED", 400);
    }
    if (
      discountType === "PERCENT" &&
      (discountValue <= 0 || discountValue > 100)
    ) {
      return sendError(res, "PERCENT discount must be 1–100", 400);
    }

    if (applicableTo?.length > 0) {
      const validIds = new Set(ALL_PLANS.map((p) => p.id));
      const invalid = applicableTo.filter((id) => !validIds.has(id));
      if (invalid.length > 0)
        return sendError(res, `Invalid plan IDs: ${invalid.join(", ")}`, 400);
    }

    const promo = await prisma.promoCode.create({
      data: {
        code: code.toUpperCase().trim(),
        description: description || null,
        discountType,
        discountValue: parseFloat(discountValue),
        maxUses: maxUses ? parseInt(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        applicableTo:
          applicableTo?.length > 0 ? JSON.stringify(applicableTo) : null,
        minPlanAmount: parseFloat(minPlanAmount),
        isActive: true,
        createdById: req.user.id,
      },
    });

    return sendResponse(res, {
      status: 201,
      message: `Promo code ${promo.code} created`,
      data: { promoCode: _fmt(promo) },
    });
  } catch (err) {
    if (err.code === "P2002")
      return sendError(res, "A promo code with that name already exists", 409);
    console.error("createPromoCode:", err);
    return sendError(res, "Failed to create promo code");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 3  ADMIN — LIST
// GET /api/subscriptions/admin/promo-codes
// ─────────────────────────────────────────────────────────────────────────────
export const listPromoCodes = async (req, res) => {
  try {
    const { isActive, page = 1, limit = 20, search } = req.query;
    const { skip, take } = paginate(page, limit);
    const where = {};
    if (isActive !== undefined) where.isActive = isActive === "true";
    if (search)
      where.code = { contains: search.toUpperCase(), mode: "insensitive" };

    const [codes, total, stats] = await Promise.all([
      prisma.promoCode.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          _count: { select: { usages: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.promoCode.count({ where }),
      prisma.promoCode.aggregate({
        _sum: { usedCount: true },
        _count: { id: true },
        where: { isActive: true },
      }),
    ]);

    return sendResponse(res, {
      data: {
        promoCodes: codes.map(_fmt),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
        stats: {
          totalCodes: stats._count.id,
          totalUses: stats._sum.usedCount || 0,
        },
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch promo codes");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 4  ADMIN — DETAIL + WHO USED IT
// GET /api/subscriptions/admin/promo-codes/:id
// ─────────────────────────────────────────────────────────────────────────────
export const getPromoCodeDetail = async (req, res) => {
  try {
    const promo = await prisma.promoCode.findUnique({
      where: { id: req.params.id },
      include: {
        usages: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!promo) return sendError(res, "Promo code not found", 404);

    return sendResponse(res, {
      data: {
        promoCode: {
          ..._fmt(promo),
          totalDiscountGiven: promo.usages.reduce(
            (s, u) => s + u.discountAmt,
            0,
          ),
          usages: promo.usages.map((u) => ({
            userId: u.userId,
            userName: `${u.user.firstName} ${u.user.lastName}`,
            userEmail: u.user.email,
            userRole: u.user.role,
            planId: u.planId,
            discountAmt: u.discountAmt,
            originalAmt: u.originalAmt,
            finalAmt: u.finalAmt,
            usedAt: u.createdAt,
          })),
        },
      },
    });
  } catch (err) {
    return sendError(res, "Failed to fetch promo code");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 5  ADMIN — UPDATE
// PATCH /api/subscriptions/admin/promo-codes/:id
// ─────────────────────────────────────────────────────────────────────────────
export const updatePromoCode = async (req, res) => {
  try {
    const {
      description,
      maxUses,
      expiresAt,
      applicableTo,
      isActive,
      minPlanAmount,
    } = req.body;
    const promo = await prisma.promoCode.findUnique({
      where: { id: req.params.id },
    });
    if (!promo) return sendError(res, "Promo code not found", 404);

    const updated = await prisma.promoCode.update({
      where: { id: req.params.id },
      data: {
        ...(description !== undefined && { description }),
        ...(maxUses !== undefined && {
          maxUses: maxUses === null ? null : parseInt(maxUses),
        }),
        ...(expiresAt !== undefined && {
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        }),
        ...(applicableTo !== undefined && {
          applicableTo:
            applicableTo?.length > 0 ? JSON.stringify(applicableTo) : null,
        }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        ...(minPlanAmount !== undefined && {
          minPlanAmount: parseFloat(minPlanAmount),
        }),
        updatedAt: new Date(),
      },
    });

    return sendResponse(res, {
      message: "Promo code updated",
      data: { promoCode: _fmt(updated) },
    });
  } catch (err) {
    return sendError(res, "Failed to update promo code");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 6  ADMIN — TOGGLE
// PATCH /api/subscriptions/admin/promo-codes/:id/toggle
// ─────────────────────────────────────────────────────────────────────────────
export const togglePromoCode = async (req, res) => {
  try {
    const promo = await prisma.promoCode.findUnique({
      where: { id: req.params.id },
    });
    if (!promo) return sendError(res, "Promo code not found", 404);

    const updated = await prisma.promoCode.update({
      where: { id: req.params.id },
      data: { isActive: !promo.isActive, updatedAt: new Date() },
    });

    return sendResponse(res, {
      message: `Promo code ${updated.isActive ? "activated" : "deactivated"}`,
      data: { promoCode: _fmt(updated) },
    });
  } catch (err) {
    return sendError(res, "Failed to toggle promo code");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// § 7  ADMIN — DELETE
// DELETE /api/subscriptions/admin/promo-codes/:id
// ─────────────────────────────────────────────────────────────────────────────
export const deletePromoCode = async (req, res) => {
  try {
    const promo = await prisma.promoCode.findUnique({
      where: { id: req.params.id },
    });
    if (!promo) return sendError(res, "Promo code not found", 404);

    if (promo.usedCount > 0) {
      await prisma.promoCode.update({
        where: { id: req.params.id },
        data: { isActive: false, updatedAt: new Date() },
      });
      return sendResponse(res, {
        message: "Code has been used — deactivated to preserve audit trail.",
      });
    }

    await prisma.promoCode.delete({ where: { id: req.params.id } });
    return sendResponse(res, { message: "Promo code deleted" });
  } catch (err) {
    return sendError(res, "Failed to delete promo code");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL FORMAT HELPER
// ─────────────────────────────────────────────────────────────────────────────
function _fmt(p) {
  return {
    id: p.id,
    code: p.code,
    description: p.description,
    discountType: p.discountType,
    discountValue: p.discountValue,
    discountLabel:
      p.discountType === "PERCENT"
        ? `${p.discountValue}% off`
        : `₦${p.discountValue.toLocaleString()} off`,
    maxUses: p.maxUses,
    usedCount: p.usedCount,
    remainingUses: p.maxUses !== null ? p.maxUses - p.usedCount : null,
    isActive: p.isActive,
    expiresAt: p.expiresAt,
    isExpired: p.expiresAt ? new Date() > p.expiresAt : false,
    applicableTo: p.applicableTo ? JSON.parse(p.applicableTo) : null,
    minPlanAmount: p.minPlanAmount,
    createdBy: p.createdBy
      ? `${p.createdBy.firstName} ${p.createdBy.lastName}`
      : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
