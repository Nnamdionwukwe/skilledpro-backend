// src/controllers/admin.debt.controller.js
import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import { paginate } from "../utils/helpers.js";
import { createNotification } from "../services/notification.service.js";
import { logAdminAction } from "../utils/auditLog.js";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/worker-debts
// Query: status, workerId, search, page, limit
// Returns: paginated list of WorkerDebt rows with worker info
// ─────────────────────────────────────────────────────────────────────────────
export const getAllWorkerDebts = async (req, res) => {
  try {
    const { status, workerId, search, page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = {};
    if (status && status !== "ALL") where.status = status;
    if (workerId) where.workerId = workerId;
    if (search) {
      where.OR = [
        { reason: { contains: search, mode: "insensitive" } },
        { reasonNote: { contains: search, mode: "insensitive" } },
        { worker: { firstName: { contains: search, mode: "insensitive" } } },
        { worker: { lastName: { contains: search, mode: "insensitive" } } },
        { worker: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [debts, total, stats] = await Promise.all([
      prisma.workerDebt.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          worker: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          refund: {
            select: {
              id: true,
              reference: true,
              amount: true,
              currency: true,
            },
          },
        },
      }),
      prisma.workerDebt.count({ where }),
      computeDebtStats(),
    ]);

    return sendResponse(res, {
      data: {
        debts,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / take),
        stats,
      },
    });
  } catch (err) {
    console.error("getAllWorkerDebts error:", err);
    return sendError(res, "Failed to fetch worker debts");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/worker-debts/stats
// Summary stats for the admin dashboard
// ─────────────────────────────────────────────────────────────────────────────
export const getWorkerDebtStats = async (req, res) => {
  try {
    const stats = await computeDebtStats();
    return sendResponse(res, { data: { stats } });
  } catch (err) {
    console.error("getWorkerDebtStats error:", err);
    return sendError(res, "Failed to fetch debt stats");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/worker-debts/:id
// Detailed view of a single debt
// ─────────────────────────────────────────────────────────────────────────────
export const getWorkerDebtDetail = async (req, res) => {
  try {
    const debt = await prisma.workerDebt.findUnique({
      where: { id: req.params.id },
      include: {
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            avatar: true,
          },
        },
        workerProfile: {
          select: {
            id: true,
            debtBalance: true,
            debtCreatedAt: true,
            debtReason: true,
          },
        },
        refund: true,
        forgivenBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        markedCollectionBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!debt) return sendError(res, "Worker debt not found", 404);

    return sendResponse(res, { data: { debt } });
  } catch (err) {
    console.error("getWorkerDebtDetail error:", err);
    return sendError(res, "Failed to fetch worker debt");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/worker-debts/:id/forgive
// Body: { reason?: string, amount?: number }
// Forgive a debt fully OR partially. If amount is provided, forgives that
// portion only; otherwise forgives the entire remaining debt.
// ─────────────────────────────────────────────────────────────────────────────
export const forgiveWorkerDebt = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, amount } = req.body;

    const debt = await prisma.workerDebt.findUnique({
      where: { id },
      include: {
        worker: { select: { id: true, firstName: true, email: true } },
        workerProfile: { select: { id: true, debtBalance: true } },
      },
    });

    if (!debt) return sendError(res, "Worker debt not found", 404);
    if (debt.status === "CLEARED")
      return sendError(res, "This debt has already been cleared", 400);
    if (debt.status === "FORGIVEN")
      return sendError(res, "This debt has already been forgiven", 400);

    const remainingOwed = debt.amount - debt.amountPaid - debt.amountForgiven;
    const forgiveAmount = amount
      ? Math.min(parseFloat(amount), remainingOwed)
      : remainingOwed;

    if (forgiveAmount <= 0) {
      return sendError(res, "Nothing left to forgive on this debt", 400);
    }

    const newForgiven = debt.amountForgiven + forgiveAmount;
    const isFullyForgiven = newForgiven >= debt.amount - debt.amountPaid;

    // Update the WorkerDebt row
    const updated = await prisma.workerDebt.update({
      where: { id },
      data: {
        amountForgiven: newForgiven,
        status: isFullyForgiven ? "FORGIVEN" : "OUTSTANDING",
        forgivenAt: isFullyForgiven ? new Date() : undefined,
        forgivenById: req.user.id,
        meta: {
          ...(debt.meta || {}),
          forgivenHistory: [
            ...(debt.meta?.forgivenHistory || []),
            {
              amount: forgiveAmount,
              at: new Date().toISOString(),
              by: req.user.id,
              reason: reason || null,
            },
          ],
        },
      },
    });

    // Reduce the worker's aggregate debt balance
    if (debt.workerProfile) {
      await prisma.workerProfile.update({
        where: { id: debt.workerProfile.id },
        data: {
          debtBalance: { decrement: forgiveAmount },
          debtForgivenAt: isFullyForgiven
            ? new Date()
            : debt.workerProfile.debtBalance === forgiveAmount
              ? new Date()
              : undefined,
        },
      });
    }

    // Audit log
    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "WORKER_DEBT_FORGIVEN",
      targetType: "USER",
      targetId: debt.workerId,
      description: `Forgave ${forgiveAmount.toFixed(2)} ${debt.currency} of worker debt for ${debt.worker.firstName}`,
      meta: {
        debtId: debt.id,
        forgiveAmount,
        reason,
        fullyForgiven: isFullyForgiven,
      },
    }).catch((err) => console.error("logAdminAction error:", err.message));

    // Notify the worker
    await createNotification({
      userId: debt.workerId,
      title: "Debt forgiven",
      body: isFullyForgiven
        ? `${debt.currency} ${forgiveAmount.toFixed(2)} of your outstanding balance has been forgiven. You no longer owe anything.`
        : `${debt.currency} ${forgiveAmount.toFixed(2)} of your outstanding balance has been forgiven.`,
      type: "WORKER_DEBT_FORGIVEN",
      data: { debtId: debt.id, forgiveAmount, fullyForgiven: isFullyForgiven },
      icon: "FaCheckCircle",
    }).catch(() => {});

    return sendResponse(res, {
      message: isFullyForgiven
        ? "Debt fully forgiven"
        : `Forgave ${forgiveAmount.toFixed(2)} ${debt.currency}`,
      data: { debt: updated, forgiveAmount, fullyForgiven: isFullyForgiven },
    });
  } catch (err) {
    console.error("forgiveWorkerDebt error:", err);
    return sendError(res, "Failed to forgive worker debt");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/worker-debts/:id/mark-collection
// Body: { note?: string }
// Mark the debt as being pursued for manual collection.
// ─────────────────────────────────────────────────────────────────────────────
export const markDebtForCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const debt = await prisma.workerDebt.findUnique({
      where: { id },
      include: {
        worker: { select: { id: true, firstName: true, email: true } },
      },
    });

    if (!debt) return sendError(res, "Worker debt not found", 404);
    if (debt.status === "CLEARED")
      return sendError(res, "This debt has already been cleared", 400);
    if (debt.status === "FORGIVEN")
      return sendError(res, "This debt has already been forgiven", 400);
    if (debt.status === "COLLECTION")
      return sendError(res, "This debt is already marked for collection", 400);

    const updated = await prisma.workerDebt.update({
      where: { id },
      data: {
        status: "COLLECTION",
        markedCollectionAt: new Date(),
        markedCollectionById: req.user.id,
        meta: {
          ...(debt.meta || {}),
          collectionNote: note || null,
        },
      },
    });

    await logAdminAction({
      req,
      adminId: req.user.id,
      action: "WORKER_DEBT_MARKED_COLLECTION",
      targetType: "USER",
      targetId: debt.workerId,
      description: `Marked worker debt of ${debt.amount} ${debt.currency} for manual collection`,
      meta: {
        debtId: debt.id,
        note,
        outstandingAmount: debt.amount - debt.amountPaid - debt.amountForgiven,
      },
    }).catch((err) => console.error("logAdminAction error:", err.message));

    return sendResponse(res, {
      message: "Debt marked for collection",
      data: { debt: updated },
    });
  } catch (err) {
    console.error("markDebtForCollection error:", err);
    return sendError(res, "Failed to mark debt for collection");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/worker-debts/by-worker/:workerId
// All debts for a specific worker (for admin to investigate)
// ─────────────────────────────────────────────────────────────────────────────
export const getDebtsByWorker = async (req, res) => {
  try {
    const { workerId } = req.params;

    const [worker, debts] = await Promise.all([
      prisma.user.findUnique({
        where: { id: workerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          workerProfile: {
            select: {
              id: true,
              debtBalance: true,
              debtCreatedAt: true,
              debtForgivenAt: true,
              debtReason: true,
              totalEarnings: true,
            },
          },
        },
      }),
      prisma.workerDebt.findMany({
        where: { workerId },
        orderBy: { createdAt: "desc" },
        include: {
          refund: {
            select: {
              id: true,
              reference: true,
              amount: true,
              currency: true,
            },
          },
        },
      }),
    ]);

    if (!worker) return sendError(res, "Worker not found", 404);

    return sendResponse(res, {
      data: {
        worker,
        debts,
        totalDebts: debts.length,
        totalOutstanding: debts
          .filter(
            (d) => d.status === "OUTSTANDING" || d.status === "COLLECTION",
          )
          .reduce(
            (sum, d) => sum + (d.amount - d.amountPaid - d.amountForgiven),
            0,
          ),
      },
    });
  } catch (err) {
    console.error("getDebtsByWorker error:", err);
    return sendError(res, "Failed to fetch worker debts");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL — compute stats for the dashboard
// ─────────────────────────────────────────────────────────────────────────────
async function computeDebtStats() {
  const [
    outstandingCount,
    collectionCount,
    clearedCount,
    forgivenCount,
    totalOutstandingAgg,
    totalPaidAgg,
    totalForgivenAgg,
  ] = await Promise.all([
    prisma.workerDebt.count({ where: { status: "OUTSTANDING" } }),
    prisma.workerDebt.count({ where: { status: "COLLECTION" } }),
    prisma.workerDebt.count({ where: { status: "CLEARED" } }),
    prisma.workerDebt.count({ where: { status: "FORGIVEN" } }),
    prisma.workerDebt.aggregate({
      where: { status: { in: ["OUTSTANDING", "COLLECTION"] } },
      _sum: { amount: true },
    }),
    prisma.workerDebt.aggregate({
      _sum: { amountPaid: true },
    }),
    prisma.workerDebt.aggregate({
      _sum: { amountForgiven: true },
    }),
  ]);

  // Unique workers with debt
  const uniqueWorkers = await prisma.workerDebt.groupBy({
    by: ["workerId"],
    where: { status: { in: ["OUTSTANDING", "COLLECTION"] } },
  });

  return {
    outstanding: outstandingCount,
    collection: collectionCount,
    cleared: clearedCount,
    forgiven: forgivenCount,
    totalWorkersWithDebt: uniqueWorkers.length,
    totalOutstandingAmount: totalOutstandingAgg._sum.amount || 0,
    totalRecoveredAmount: totalPaidAgg._sum.amountPaid || 0,
    totalForgivenAmount: totalForgivenAgg._sum.amountForgiven || 0,
  };
}
