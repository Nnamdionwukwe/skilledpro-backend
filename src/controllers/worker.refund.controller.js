// src/controllers/worker.refund.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Worker-facing refund history
//
// Workers can see every refund that has ever affected their earnings:
// dispute-based refunds, admin-initiated refunds, chargebacks, reversals.
// They get full context — booking, hirer, reason, amount deducted — plus
// printable / downloadable receipts for their records.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from "../config/database.js";
import { asyncHandler } from "../middleware/error.middleware.js";
import { paginate } from "../utils/helpers.js";

// ─────────────────────────────────────────────────────────────────────────────
// § 1  LIST — GET /api/worker/refunds
// Query: status, reason, from, to, page, limit
// ─────────────────────────────────────────────────────────────────────────────
export const getMyRefunds = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const { status, refundType, from, to, page = 1, limit = 15 } = req.query;
  const { skip, take } = paginate(page, limit);

  const where = {
    workerId,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(refundType && refundType !== "ALL" ? { refundType } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [refunds, total, totals] = await Promise.all([
    prisma.refund.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        booking: {
          select: {
            id: true,
            title: true,
            description: true,
            address: true,
            scheduledAt: true,
            completedAt: true,
            currency: true,
            category: { select: { id: true, name: true, icon: true } },
          },
        },
        hirer: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
        dispute: {
          select: {
            id: true,
            reason: true,
            description: true,
            raisedByRole: true,
            raisedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            resolution: true,
            resolvedAt: true,
          },
        },
      },
    }),
    prisma.refund.count({ where }),
    prisma.refund.aggregate({
      where: { workerId },
      _sum: { amount: true, workerAmountDeducted: true },
      _count: true,
    }),
  ]);

  // Break down by type for the summary card
  const byType = await prisma.refund.groupBy({
    by: ["refundType"],
    where: { workerId },
    _sum: { workerAmountDeducted: true },
    _count: true,
  });

  // Attach debt context (whether a WorkerDebt exists for this refund)
  const refundIds = refunds.map((r) => r.id);
  const debts = await prisma.workerDebt.findMany({
    where: { workerId, refundId: { in: refundIds } },
    select: {
      id: true,
      refundId: true,
      status: true,
      amount: true,
      amountPaid: true,
      amountForgiven: true,
      currency: true,
    },
  });
  const debtByRefund = Object.fromEntries(debts.map((d) => [d.refundId, d]));

  const enriched = refunds.map((r) => ({
    ...r,
    // Whether the worker actually owed money from this refund (post-withdrawal case)
    workerDebt: debtByRefund[r.id] || null,
    // Whether this refund resulted in debt being created
    resultedInDebt: !!debtByRefund[r.id],
  }));

  return res.status(200).json({
    success: true,
    data: {
      refunds: enriched,
      total,
      page: Number(page),
      pages: Math.ceil(total / take),
      summary: {
        lifetimeRefunds: totals._count,
        lifetimeAmount: totals._sum.amount ?? 0,
        lifetimeDeductedFromEarnings: totals._sum.workerAmountDeducted ?? 0,
        byType: byType.map((b) => ({
          refundType: b.refundType,
          count: b._count,
          totalDeducted: b._sum.workerAmountDeducted ?? 0,
        })),
      },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 2  SUMMARY — GET /api/worker/refunds/summary
// Lifetime totals, debt balance, recent activity
// ─────────────────────────────────────────────────────────────────────────────
export const getMyRefundSummary = asyncHandler(async (req, res) => {
  const workerId = req.user.id;

  const [
    workerProfile,
    totalRefunds,
    totalDeducted,
    byType,
    recentRefunds,
    debts,
  ] = await Promise.all([
    prisma.workerProfile.findUnique({
      where: { userId: workerId },
      select: {
        id: true,
        totalEarnings: true,
        debtBalance: true,
        debtCreatedAt: true,
        debtForgivenAt: true,
        debtReason: true,
      },
    }),
    prisma.refund.count({ where: { workerId } }),
    prisma.refund.aggregate({
      where: { workerId },
      _sum: { amount: true, workerAmountDeducted: true },
    }),
    prisma.refund.groupBy({
      by: ["refundType"],
      where: { workerId },
      _sum: { workerAmountDeducted: true },
      _count: true,
    }),
    prisma.refund.findMany({
      where: { workerId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        reference: true,
        amount: true,
        currency: true,
        refundType: true,
        status: true,
        createdAt: true,
        booking: { select: { id: true, title: true } },
      },
    }),
    prisma.workerDebt.findMany({
      where: { workerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        amount: true,
        amountPaid: true,
        amountForgiven: true,
        currency: true,
        status: true,
        reason: true,
        createdAt: true,
        clearedAt: true,
        forgivenAt: true,
      },
    }),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      totalRefunds,
      totalRefunded: totalDeducted._sum.amount ?? 0,
      totalDeductedFromEarnings: totalDeducted._sum.workerAmountDeducted ?? 0,
      totalEarnings: workerProfile?.totalEarnings ?? 0,
      debtBalance: workerProfile?.debtBalance ?? 0,
      debtCreatedAt: workerProfile?.debtCreatedAt ?? null,
      debtForgivenAt: workerProfile?.debtForgivenAt ?? null,
      debtReason: workerProfile?.debtReason ?? null,
      byType: byType.map((b) => ({
        refundType: b.refundType,
        count: b._count,
        totalDeducted: b._sum.workerAmountDeducted ?? 0,
      })),
      recentRefunds,
      recentDebts: debts,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 3  DETAIL — GET /api/worker/refunds/:refundId
// ─────────────────────────────────────────────────────────────────────────────
export const getMyRefundDetail = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const { refundId } = req.params;

  const refund = await prisma.refund.findFirst({
    where: { id: refundId, workerId },
    include: {
      booking: {
        include: {
          category: { select: { id: true, name: true, icon: true } },
          hirer: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
      },
      hirer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
        },
      },
      payment: {
        select: {
          id: true,
          provider: true,
          providerRef: true,
          amount: true,
          currency: true,
          platformFee: true,
          workerPayout: true,
          escrowReleasedAt: true,
          refundedAt: true,
        },
      },
      dispute: {
        include: {
          raisedBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          resolvedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
      admin: {
        select: { id: true, firstName: true, lastName: true },
      },
      workerDebts: true,
    },
  });

  if (!refund) {
    return res.status(404).json({
      success: false,
      message: "Refund not found or does not belong to you",
    });
  }

  return res.status(200).json({ success: true, data: { refund } });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 4  RECEIPT (JSON) — GET /api/worker/refunds/:refundId/receipt
// Structured receipt data the frontend can render / print / save as PDF
// ─────────────────────────────────────────────────────────────────────────────
export const getMyRefundReceipt = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const { refundId } = req.params;

  const refund = await prisma.refund.findFirst({
    where: { id: refundId, workerId },
    include: {
      booking: {
        include: {
          category: { select: { name: true } },
          hirer: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      },
      hirer: { select: { firstName: true, lastName: true, email: true } },
      worker: {
        select: { firstName: true, lastName: true, email: true },
      },
      payment: true,
      dispute: {
        include: {
          raisedBy: { select: { firstName: true, lastName: true, role: true } },
          resolvedBy: { select: { firstName: true, lastName: true } },
        },
      },
      admin: { select: { firstName: true, lastName: true } },
      workerDebts: true,
    },
  });

  if (!refund) {
    return res.status(404).json({
      success: false,
      message: "Refund not found or does not belong to you",
    });
  }

  // ── Build a self-contained receipt object ────────────────────────────────
  const receipt = {
    meta: {
      issuedAt: new Date().toISOString(),
      receiptType: "REFUND_ADVICE",
      platform: {
        name: "SkilledProz",
        supportEmail: process.env.SUPPORT_EMAIL ?? "support@skilledproz.com",
        website: process.env.CLIENT_URL ?? "https://skilledproz.com",
      },
    },
    refund: {
      id: refund.id,
      reference: refund.reference,
      amount: refund.amount,
      currency: refund.currency,
      refundType: refund.refundType,
      percentage: refund.percentage,
      status: refund.status,
      reason: refund.reason,
      adminNotes: refund.adminNotes,
      platformFeeRefunded: refund.platformFeeRefunded,
      workerAmountDeducted: refund.workerAmountDeducted,
      createdAt: refund.createdAt,
      processedAt: refund.processedAt,
    },
    // For the worker, the key number is what was deducted from their side
    deduction: {
      amountDeducted: refund.workerAmountDeducted,
      currency: refund.currency,
      reason: refund.reason,
      explanation:
        refund.workerAmountDeducted > 0
          ? `This refund resulted in ${refund.currency} ${refund.workerAmountDeducted.toFixed(2)} being deducted from your earnings for booking "${refund.booking?.title}".`
          : "No amount was deducted from your earnings for this refund.",
    },
    booking: refund.booking
      ? {
          id: refund.booking.id,
          title: refund.booking.title,
          description: refund.booking.description,
          address: refund.booking.address,
          category: refund.booking.category?.name ?? null,
          scheduledAt: refund.booking.scheduledAt,
          completedAt: refund.booking.completedAt,
          agreedRate: refund.booking.agreedRate,
          currency: refund.booking.currency,
          quantity: refund.booking.quantity,
          estimatedUnit: refund.booking.estimatedUnit,
          estimatedValue: refund.booking.estimatedValue,
        }
      : null,
    hirer: refund.hirer
      ? {
          firstName: refund.hirer.firstName,
          lastName: refund.hirer.lastName,
          email: refund.hirer.email,
        }
      : null,
    worker: refund.worker
      ? {
          firstName: refund.worker.firstName,
          lastName: refund.worker.lastName,
          email: refund.worker.email,
        }
      : null,
    payment: refund.payment
      ? {
          provider: refund.payment.provider,
          providerRef: refund.payment.providerRef,
          originalAmount: refund.payment.amount,
          platformFee: refund.payment.platformFee,
          workerPayout: refund.payment.workerPayout,
          escrowReleasedAt: refund.payment.escrowReleasedAt,
          refundedAt: refund.payment.refundedAt,
        }
      : null,
    dispute: refund.dispute
      ? {
          id: refund.dispute.id,
          reason: refund.dispute.reason,
          description: refund.dispute.description,
          raisedBy: refund.dispute.raisedBy
            ? {
                name: `${refund.dispute.raisedBy.firstName} ${refund.dispute.raisedBy.lastName}`,
                role: refund.dispute.raisedBy.role,
              }
            : null,
          resolvedBy: refund.dispute.resolvedBy
            ? `${refund.dispute.resolvedBy.firstName} ${refund.dispute.resolvedBy.lastName}`
            : null,
          resolution: refund.dispute.resolution,
          resolvedAt: refund.dispute.resolvedAt,
        }
      : null,
    // If a WorkerDebt was created (post-withdrawal clawback), surface it
    workerDebt: refund.workerDebts?.[0]
      ? {
          id: refund.workerDebts[0].id,
          status: refund.workerDebts[0].status,
          amount: refund.workerDebts[0].amount,
          amountPaid: refund.workerDebts[0].amountPaid,
          amountForgiven: refund.workerDebts[0].amountForgiven,
          currency: refund.workerDebts[0].currency,
          reason: refund.workerDebts[0].reason,
          reasonNote: refund.workerDebts[0].reasonNote,
          createdAt: refund.workerDebts[0].createdAt,
          clearedAt: refund.workerDebts[0].clearedAt,
          forgivenAt: refund.workerDebts[0].forgivenAt,
        }
      : null,
  };

  return res.status(200).json({ success: true, data: { receipt } });
});

// ─────────────────────────────────────────────────────────────────────────────
// § 5  RECEIPT (HTML) — GET /api/worker/refunds/:refundId/receipt.html
// Renders an A4-styled HTML page the browser can "Save as PDF" or print
// ─────────────────────────────────────────────────────────────────────────────
export const getMyRefundReceiptHtml = asyncHandler(async (req, res) => {
  const workerId = req.user.id;
  const { refundId } = req.params;

  const refund = await prisma.refund.findFirst({
    where: { id: refundId, workerId },
    include: {
      booking: {
        include: {
          category: { select: { name: true } },
        },
      },
      hirer: { select: { firstName: true, lastName: true, email: true } },
      worker: { select: { firstName: true, lastName: true, email: true } },
      payment: true,
      dispute: {
        include: {
          raisedBy: { select: { firstName: true, lastName: true, role: true } },
          resolvedBy: { select: { firstName: true, lastName: true } },
        },
      },
      admin: { select: { firstName: true, lastName: true } },
      workerDebts: true,
    },
  });

  if (!refund) {
    return res.status(404).send("<h1>Refund not found</h1>");
  }

  const wd = refund.workerDebts?.[0];
  const fmt = (n) =>
    Number(n ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 });
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Refund Receipt — ${esc(refund.reference)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #111;
      max-width: 800px;
      margin: 40px auto;
      padding: 40px;
      background: #fff;
      line-height: 1.5;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
    .brand { font-size: 28px; font-weight: 800; color: #2563eb; letter-spacing: -0.5px; }
    .brand-sub { font-size: 12px; color: #666; margin-top: 4px; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 22px; margin: 0 0 6px; color: #111; }
    .doc-title .ref { font-family: monospace; font-size: 13px; color: #666; }
    .section { margin-bottom: 28px; }
    .section h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin: 0 0 12px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 32px; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #eee; }
    .row .k { color: #666; font-size: 13px; }
    .row .v { font-weight: 500; font-size: 13px; text-align: right; max-width: 60%; }
    .amount-box {
      background: #f0f9ff;
      border: 2px solid #2563eb;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
    }
    .amount-box .label { font-size: 12px; text-transform: uppercase; color: #1e40af; letter-spacing: 1px; }
    .amount-box .amount { font-size: 36px; font-weight: 800; color: #1e40af; margin-top: 8px; }
    .amount-box .sub { font-size: 12px; color: #666; margin-top: 4px; }
    .status-pill {
      display: inline-block; padding: 4px 12px; border-radius: 999px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .status-COMPLETED { background: #d1fae5; color: #065f46; }
    .status-PENDING { background: #fef3c7; color: #92400e; }
    .status-FAILED { background: #fee2e2; color: #991b1b; }
    .status-REVERSED { background: #e0e7ff; color: #3730a3; }
    .status-APPROVED { background: #dbeafe; color: #1e40af; }
    .status-PROCESSING { background: #ede9fe; color: #5b21b6; }
    .debt-notice {
      background: #fef3c7; border-left: 4px solid #f59e0b;
      padding: 16px; border-radius: 6px; margin-top: 12px;
    }
    .debt-notice .title { font-weight: 700; color: #92400e; font-size: 13px; }
    .debt-notice .body { font-size: 13px; color: #78350f; margin-top: 6px; }
    .footer {
      margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;
      font-size: 11px; color: #999; text-align: center;
    }
    @media print {
      body { margin: 0; padding: 20px; }
      .no-print { display: none; }
    }
    .print-btn {
      position: fixed; top: 20px; right: 20px;
      padding: 10px 18px; background: #2563eb; color: #fff; border: none;
      border-radius: 6px; font-weight: 600; cursor: pointer;
      box-shadow: 0 4px 12px rgba(37,99,235,0.3);
    }
    .print-btn:hover { background: #1e40af; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>

  <div class="header">
    <div>
      <div class="brand">SkilledProz</div>
      <div class="brand-sub">Trusted Work Marketplace</div>
    </div>
    <div class="doc-title">
      <h1>Refund Advice</h1>
      <div class="ref">${esc(refund.reference)}</div>
      <div style="margin-top:8px;">
        <span class="status-pill status-${esc(refund.status)}">${esc(refund.status)}</span>
      </div>
    </div>
  </div>

  <div class="amount-box">
    <div class="label">Amount Deducted from Your Earnings</div>
    <div class="amount">${esc(refund.currency)} ${fmt(refund.workerAmountDeducted)}</div>
    <div class="sub">of ${esc(refund.currency)} ${fmt(refund.amount)} total refund to hirer</div>
  </div>

  <div class="section">
    <h2>Refund Details</h2>
    <div class="row"><span class="k">Reference</span><span class="v">${esc(refund.reference)}</span></div>
    <div class="row"><span class="k">Type</span><span class="v">${esc(refund.refundType)}</span></div>
    ${refund.percentage != null ? `<div class="row"><span class="k">Percentage</span><span class="v">${esc(refund.percentage)}%</span></div>` : ""}
    <div class="row"><span class="k">Reason</span><span class="v">${esc(refund.reason)}</span></div>
    <div class="row"><span class="k">Initiated</span><span class="v">${esc(new Date(refund.createdAt).toLocaleString())}</span></div>
    ${refund.processedAt ? `<div class="row"><span class="k">Processed</span><span class="v">${esc(new Date(refund.processedAt).toLocaleString())}</span></div>` : ""}
  </div>

  ${
    refund.booking
      ? `
  <div class="section">
    <h2>Booking</h2>
    <div class="row"><span class="k">Title</span><span class="v">${esc(refund.booking.title)}</span></div>
    ${refund.booking.category ? `<div class="row"><span class="k">Category</span><span class="v">${esc(refund.booking.category.name)}</span></div>` : ""}
    <div class="row"><span class="k">Address</span><span class="v">${esc(refund.booking.address)}</span></div>
    <div class="row"><span class="k">Scheduled</span><span class="v">${esc(new Date(refund.booking.scheduledAt).toLocaleString())}</span></div>
    ${refund.booking.completedAt ? `<div class="row"><span class="k">Completed</span><span class="v">${esc(new Date(refund.booking.completedAt).toLocaleString())}</span></div>` : ""}
    <div class="row"><span class="k">Agreed Rate</span><span class="v">${esc(refund.booking.currency)} ${fmt(refund.booking.agreedRate)}</span></div>
  </div>`
      : ""
  }

  ${
    refund.dispute
      ? `
  <div class="section">
    <h2>Dispute Context</h2>
    <div class="row"><span class="k">Raised By</span><span class="v">${esc(refund.dispute.raisedBy ? `${refund.dispute.raisedBy.firstName} ${refund.dispute.raisedBy.lastName} (${refund.dispute.raisedBy.role})` : "—")}</span></div>
    <div class="row"><span class="k">Reason</span><span class="v">${esc(refund.dispute.reason)}</span></div>
    ${refund.dispute.description ? `<div class="row"><span class="k">Description</span><span class="v">${esc(refund.dispute.description)}</span></div>` : ""}
    <div class="row"><span class="k">Resolution</span><span class="v">${esc(refund.dispute.resolution ?? "—")}</span></div>
    ${refund.dispute.resolvedBy ? `<div class="row"><span class="k">Resolved By</span><span class="v">${esc(`${refund.dispute.resolvedBy.firstName} ${refund.dispute.resolvedBy.lastName}`)}</span></div>` : ""}
    ${refund.dispute.resolvedAt ? `<div class="row"><span class="k">Resolved At</span><span class="v">${esc(new Date(refund.dispute.resolvedAt).toLocaleString())}</span></div>` : ""}
  </div>`
      : ""
  }

  ${
    wd
      ? `
  <div class="section">
    <h2>Outstanding Balance</h2>
    <div class="debt-notice">
      <div class="title">A debt of ${esc(wd.currency)} ${fmt(wd.amount)} was recorded</div>
      <div class="body">
        Because you had already withdrawn this booking's earnings, this refund created an outstanding balance.
        It will be deducted from your next payout${wd.status === "CLEARED" ? " — and it has now been fully cleared." : wd.status === "FORGIVEN" ? " — and it has since been forgiven." : "."}
      </div>
    </div>
    <div class="row"><span class="k">Debt Status</span><span class="v">${esc(wd.status)}</span></div>
    <div class="row"><span class="k">Original Amount</span><span class="v">${esc(wd.currency)} ${fmt(wd.amount)}</span></div>
    <div class="row"><span class="k">Amount Recovered</span><span class="v">${esc(wd.currency)} ${fmt(wd.amountPaid)}</span></div>
    <div class="row"><span class="k">Amount Forgiven</span><span class="v">${esc(wd.currency)} ${fmt(wd.amountForgiven)}</span></div>
  </div>`
      : ""
  }

  <div class="section">
    <h2>Parties</h2>
    <div class="grid">
      <div>
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;">Worker</div>
        <div style="font-weight:600;margin-top:4px;">${esc(refund.worker?.firstName)} ${esc(refund.worker?.lastName)}</div>
        <div style="font-size:12px;color:#666;">${esc(refund.worker?.email)}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;">Hirer</div>
        <div style="font-weight:600;margin-top:4px;">${esc(refund.hirer?.firstName)} ${esc(refund.hirer?.lastName)}</div>
        <div style="font-size:12px;color:#666;">${esc(refund.hirer?.email)}</div>
      </div>
    </div>
  </div>

  <div class="footer">
    This is a computer-generated refund advice and does not require a signature.<br/>
    Issued on ${esc(new Date().toLocaleString())} · SkilledProz · support@skilledproz.com
  </div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
});
