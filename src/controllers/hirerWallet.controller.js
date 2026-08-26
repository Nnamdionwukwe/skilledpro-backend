// src/controllers/hirerWallet.controller.js
// Complete Hirer Wallet Controller with Flutterwave Integration

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import crypto from "crypto";
import axios from "axios";

// ─── Response wrapper ────────────────────────────────────────────────────────
const response = {
  success: (res, message, data = null, status = 200) => {
    return sendResponse(res, { status, message, data });
  },
  error: (res, message, status = 400, errors = null) => {
    return sendError(res, message, status, errors);
  },
};

// ─── Helper Functions ────────────────────────────────────────────────────────

const generateReference = (prefix = "HW") => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

const getFlutterwaveSecret = () => {
  return process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLUTTERWAVE_SECRET;
};

const getFlutterwavePublicKey = () => {
  return process.env.FLUTTERWAVE_PUBLIC_KEY;
};

// ─── Get or Create Wallet ────────────────────────────────────────────────────

const getOrCreateWallet = async (hirerId) => {
  let wallet = await prisma.hirerWallet.findUnique({
    where: { hirerId },
  });

  if (!wallet) {
    wallet = await prisma.hirerWallet.create({
      data: {
        hirerId,
        balance: 0,
        currency: "NGN",
      },
    });
  }

  return wallet;
};

// ─── Get Wallet Balance ─────────────────────────────────────────────────────

export const getWalletBalance = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);

    // Get transaction summary
    const [totalDeposited, totalSpent, totalWithdrawn] = await Promise.all([
      prisma.hirerTransaction.aggregate({
        where: {
          hirerId: req.user.id,
          type: "DEPOSIT",
          status: "COMPLETED",
        },
        _sum: { netAmount: true },
      }),
      prisma.hirerTransaction.aggregate({
        where: {
          hirerId: req.user.id,
          type: "PAYMENT",
          status: "COMPLETED",
        },
        _sum: { netAmount: true },
      }),
      prisma.hirerTransaction.aggregate({
        where: {
          hirerId: req.user.id,
          type: "WITHDRAWAL",
          status: "COMPLETED",
        },
        _sum: { netAmount: true },
      }),
    ]);

    const recentTransactions = await prisma.hirerTransaction.findMany({
      where: { hirerId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        booking: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    return response.success(res, "Wallet balance retrieved", {
      balance: wallet.balance,
      currency: wallet.currency,
      totalDeposited: totalDeposited._sum.netAmount || 0,
      totalSpent: totalSpent._sum.netAmount || 0,
      totalWithdrawn: totalWithdrawn._sum.netAmount || 0,
      recentTransactions,
    });
  } catch (error) {
    console.error("Get wallet balance error:", error);
    return response.error(res, "Failed to get wallet balance", 500);
  }
};

// ─── Get Transactions ────────────────────────────────────────────────────────

export const getWalletTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status, fromDate, toDate } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where = { hirerId: req.user.id };

    if (type) where.type = type;
    if (status) where.status = status;
    if (fromDate) where.createdAt = { gte: new Date(fromDate) };
    if (toDate) where.createdAt = { ...where.createdAt, lte: new Date(toDate) };

    const [transactions, total] = await Promise.all([
      prisma.hirerTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          booking: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
      prisma.hirerTransaction.count({ where }),
    ]);

    return response.success(res, "Transactions retrieved", {
      transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    return response.error(res, "Failed to get transactions", 500);
  }
};

// ─── Fund Wallet with Flutterwave ───────────────────────────────────────────

export const fundWallet = async (req, res) => {
  try {
    const { amount, currency = "NGN", redirectUrl } = req.body;

    if (!amount || amount < 100) {
      return response.error(res, "Minimum deposit amount is ₦100", 400);
    }

    const wallet = await getOrCreateWallet(req.user.id);
    const reference = generateReference("DEP");

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true, firstName: true, lastName: true, phone: true },
    });

    // Create funding attempt
    const fundingAttempt = await prisma.hirerFundingAttempt.create({
      data: {
        walletId: wallet.id,
        hirerId: req.user.id,
        amount,
        currency,
        provider: "FLUTTERWAVE",
        providerRef: reference,
        status: "INITIATED",
        meta: {
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`,
        },
      },
    });

    // Prepare Flutterwave payload
    const flutterwavePayload = {
      tx_ref: reference,
      amount: amount,
      currency: currency,
      redirect_url:
        redirectUrl || `${process.env.CLIENT_URL}/wallet/deposit/callback`,
      payment_options: "card",
      meta: {
        consumer_id: req.user.id,
        consumer_mac: reference,
      },
      customer: {
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        phonenumber: user.phone || "",
      },
      customizations: {
        title: "SkilledProz - Fund Wallet",
        description: `Add ₦${amount} to your wallet`,
        logo: process.env.LOGO_URL || "https://skilledproz.com/logo.png",
      },
    };

    // Make request to Flutterwave
    const flutterwaveResponse = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      flutterwavePayload,
      {
        headers: {
          Authorization: `Bearer ${getFlutterwaveSecret()}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (flutterwaveResponse.data.status === "success") {
      // Update funding attempt with payment link
      await prisma.hirerFundingAttempt.update({
        where: { id: fundingAttempt.id },
        data: {
          paymentLink: flutterwaveResponse.data.data.link,
          status: "PROCESSING",
        },
      });

      return response.success(res, "Funding initiated", {
        reference,
        paymentLink: flutterwaveResponse.data.data.link,
        amount,
        currency,
      });
    } else {
      // Update funding attempt as failed
      await prisma.hirerFundingAttempt.update({
        where: { id: fundingAttempt.id },
        data: {
          status: "FAILED",
          meta: {
            ...fundingAttempt.meta,
            error: flutterwaveResponse.data.message,
          },
        },
      });

      return response.error(
        res,
        flutterwaveResponse.data.message || "Failed to initiate payment",
        400,
      );
    }
  } catch (error) {
    console.error("Fund wallet error:", error);
    return response.error(res, "Failed to initiate payment", 500);
  }
};

// ─── Flutterwave Webhook ────────────────────────────────────────────────────

export const flutterwaveWebhook = async (req, res) => {
  try {
    const payload = req.body;

    // Verify webhook signature
    const signature = req.headers["verif-hash"];
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;

    if (signature !== secretHash) {
      console.error("Invalid webhook signature");
      return res
        .status(401)
        .json({ status: "error", message: "Invalid signature" });
    }

    const { tx_ref, status, transaction_id } = payload.data || payload;

    // Find the funding attempt
    const fundingAttempt = await prisma.hirerFundingAttempt.findUnique({
      where: { providerRef: tx_ref },
    });

    if (!fundingAttempt) {
      console.error(`Funding attempt not found: ${tx_ref}`);
      return res
        .status(404)
        .json({ status: "error", message: "Funding attempt not found" });
    }

    if (fundingAttempt.status === "SUCCESS") {
      // Already processed
      return res
        .status(200)
        .json({ status: "success", message: "Already processed" });
    }

    // Update funding attempt
    await prisma.hirerFundingAttempt.update({
      where: { id: fundingAttempt.id },
      data: {
        status: status === "successful" ? "SUCCESS" : "FAILED",
        providerRef: transaction_id || fundingAttempt.providerRef,
        completedAt: status === "successful" ? new Date() : undefined,
        callbackData: payload,
      },
    });

    // If successful, credit the wallet
    if (status === "successful") {
      const wallet = await prisma.hirerWallet.findUnique({
        where: { id: fundingAttempt.walletId },
      });

      const balanceBefore = wallet.balance;
      const balanceAfter = wallet.balance + fundingAttempt.amount;

      // Update wallet balance
      await prisma.hirerWallet.update({
        where: { id: fundingAttempt.walletId },
        data: {
          balance: balanceAfter,
          totalDeposited: wallet.totalDeposited + fundingAttempt.amount,
          lastTransactionAt: new Date(),
        },
      });

      // Create transaction record
      const transaction = await prisma.hirerTransaction.create({
        data: {
          walletId: fundingAttempt.walletId,
          hirerId: fundingAttempt.hirerId,
          type: "DEPOSIT",
          amount: fundingAttempt.amount,
          currency: fundingAttempt.currency,
          fee: 0,
          netAmount: fundingAttempt.amount,
          reference: fundingAttempt.providerRef,
          status: "COMPLETED",
          description: `Wallet funding via Flutterwave`,
          balanceBefore,
          balanceAfter,
          completedAt: new Date(),
          meta: {
            paymentProvider: "FLUTTERWAVE",
            transactionId: transaction_id,
          },
        },
      });

      // Link transaction to funding attempt
      await prisma.hirerFundingAttempt.update({
        where: { id: fundingAttempt.id },
        data: { transactionId: transaction.id },
      });

      console.log(
        `✅ Wallet funded: ${fundingAttempt.hirerId} - ₦${fundingAttempt.amount}`,
      );
    }

    return res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Flutterwave webhook error:", error);
    return res.status(500).json({ status: "error", message: error.message });
  }
};

// ─── Verify Transaction ──────────────────────────────────────────────────────

export const verifyTransaction = async (req, res) => {
  try {
    const { reference } = req.params;

    const fundingAttempt = await prisma.hirerFundingAttempt.findUnique({
      where: { providerRef: reference },
      include: {
        transaction: true,
        wallet: true,
      },
    });

    if (!fundingAttempt) {
      return response.error(res, "Transaction not found", 404);
    }

    // If already processed, return the result
    if (
      fundingAttempt.status === "SUCCESS" ||
      fundingAttempt.status === "FAILED"
    ) {
      return response.success(res, "Transaction verified", {
        status: fundingAttempt.status,
        amount: fundingAttempt.amount,
        currency: fundingAttempt.currency,
        reference: fundingAttempt.providerRef,
        transaction: fundingAttempt.transaction,
        balance: fundingAttempt.wallet?.balance || 0,
      });
    }

    // Verify with Flutterwave
    const flutterwaveResponse = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${fundingAttempt.providerRef}/verify`,
      {
        headers: {
          Authorization: `Bearer ${getFlutterwaveSecret()}`,
        },
      },
    );

    const data = flutterwaveResponse.data;
    const isSuccessful =
      data.status === "success" && data.data?.status === "successful";

    // Update funding attempt
    await prisma.hirerFundingAttempt.update({
      where: { id: fundingAttempt.id },
      data: {
        status: isSuccessful ? "SUCCESS" : "FAILED",
        completedAt: isSuccessful ? new Date() : undefined,
        callbackData: data,
      },
    });

    if (isSuccessful) {
      // Credit the wallet (if not already credited)
      const wallet = await prisma.hirerWallet.findUnique({
        where: { id: fundingAttempt.walletId },
      });

      const balanceBefore = wallet.balance;
      const balanceAfter = wallet.balance + fundingAttempt.amount;

      await prisma.hirerWallet.update({
        where: { id: fundingAttempt.walletId },
        data: {
          balance: balanceAfter,
          totalDeposited: wallet.totalDeposited + fundingAttempt.amount,
          lastTransactionAt: new Date(),
        },
      });

      // Create transaction record
      const transaction = await prisma.hirerTransaction.create({
        data: {
          walletId: fundingAttempt.walletId,
          hirerId: fundingAttempt.hirerId,
          type: "DEPOSIT",
          amount: fundingAttempt.amount,
          currency: fundingAttempt.currency,
          fee: 0,
          netAmount: fundingAttempt.amount,
          reference: fundingAttempt.providerRef,
          status: "COMPLETED",
          description: `Wallet funding via Flutterwave`,
          balanceBefore,
          balanceAfter,
          completedAt: new Date(),
          meta: {
            paymentProvider: "FLUTTERWAVE",
          },
        },
      });

      await prisma.hirerFundingAttempt.update({
        where: { id: fundingAttempt.id },
        data: { transactionId: transaction.id },
      });

      return response.success(res, "Transaction verified and completed", {
        status: "SUCCESS",
        amount: fundingAttempt.amount,
        currency: fundingAttempt.currency,
        reference: fundingAttempt.providerRef,
        transaction,
        balance: balanceAfter,
      });
    }

    return response.success(res, "Transaction verification failed", {
      status: "FAILED",
      amount: fundingAttempt.amount,
      currency: fundingAttempt.currency,
      reference: fundingAttempt.providerRef,
    });
  } catch (error) {
    console.error("Verify transaction error:", error);
    return response.error(res, "Failed to verify transaction", 500);
  }
};

// ─── Request Withdrawal ──────────────────────────────────────────────────────

export const requestWithdrawal = async (req, res) => {
  try {
    const { amount, bankName, accountNumber, accountName, bankCode } = req.body;

    if (!amount || amount < 100) {
      return response.error(res, "Minimum withdrawal amount is ₦100", 400);
    }

    if (!bankName || !accountNumber || !accountName) {
      return response.error(res, "Bank details are required", 400);
    }

    const wallet = await getOrCreateWallet(req.user.id);

    if (wallet.balance < amount) {
      return response.error(res, "Insufficient wallet balance", 400);
    }

    const reference = generateReference("WD");
    const fee = Math.min(amount * 0.01, 100); // 1% fee, max ₦100
    const netAmount = amount - fee;

    // Create withdrawal record
    const withdrawal = await prisma.hirerWithdrawal.create({
      data: {
        walletId: wallet.id,
        hirerId: req.user.id,
        amount,
        currency: wallet.currency,
        fee,
        netAmount,
        bankName,
        accountNumber,
        accountName,
        bankCode,
        reference,
        status: "PENDING",
      },
    });

    // Create transaction record (pending)
    const transaction = await prisma.hirerTransaction.create({
      data: {
        walletId: wallet.id,
        hirerId: req.user.id,
        type: "WITHDRAWAL",
        amount,
        currency: wallet.currency,
        fee,
        netAmount,
        reference,
        status: "PENDING",
        description: `Withdrawal to ${bankName} - ${accountNumber}`,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance - amount,
        meta: {
          bankName,
          accountNumber,
          accountName,
        },
      },
    });

    // Temporarily deduct from balance
    await prisma.hirerWallet.update({
      where: { id: wallet.id },
      data: {
        balance: wallet.balance - amount,
        totalWithdrawn: wallet.totalWithdrawn + amount,
        lastTransactionAt: new Date(),
      },
    });

    return response.success(res, "Withdrawal request submitted", {
      id: withdrawal.id,
      reference,
      amount,
      fee,
      netAmount,
      status: "PENDING",
      bankName,
      accountNumber,
      accountName,
    });
  } catch (error) {
    console.error("Request withdrawal error:", error);
    return response.error(res, "Failed to process withdrawal request", 500);
  }
};

// ─── Admin: Process Withdrawal ──────────────────────────────────────────────

export const processWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, failureReason } = req.body;

    const withdrawal = await prisma.hirerWithdrawal.findUnique({
      where: { id },
      include: {
        wallet: true,
        hirer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!withdrawal) {
      return response.error(res, "Withdrawal not found", 404);
    }

    if (withdrawal.status !== "PENDING") {
      return response.error(res, "Withdrawal already processed", 400);
    }

    if (action === "APPROVE") {
      // Update withdrawal status
      await prisma.hirerWithdrawal.update({
        where: { id },
        data: {
          status: "COMPLETED",
          processedAt: new Date(),
          completedAt: new Date(),
        },
      });

      // Update transaction status
      await prisma.hirerTransaction.updateMany({
        where: {
          reference: withdrawal.reference,
          type: "WITHDRAWAL",
        },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      return response.success(res, "Withdrawal approved", {
        id: withdrawal.id,
        status: "COMPLETED",
        amount: withdrawal.amount,
      });
    } else if (action === "REJECT") {
      // Refund the amount back to wallet
      const wallet = await prisma.hirerWallet.findUnique({
        where: { id: withdrawal.walletId },
      });

      // Update withdrawal status
      await prisma.hirerWithdrawal.update({
        where: { id },
        data: {
          status: "FAILED",
          failureReason: failureReason || "Rejected by admin",
          processedAt: new Date(),
        },
      });

      // Refund the amount
      await prisma.hirerWallet.update({
        where: { id: withdrawal.walletId },
        data: {
          balance: wallet.balance + withdrawal.amount,
          totalWithdrawn: wallet.totalWithdrawn - withdrawal.amount,
          lastTransactionAt: new Date(),
        },
      });

      // Update transaction status
      await prisma.hirerTransaction.updateMany({
        where: {
          reference: withdrawal.reference,
          type: "WITHDRAWAL",
        },
        data: {
          status: "REVERSED",
          completedAt: new Date(),
          meta: {
            failureReason: failureReason || "Rejected by admin",
          },
        },
      });

      // Create refund transaction
      await prisma.hirerTransaction.create({
        data: {
          walletId: withdrawal.walletId,
          hirerId: withdrawal.hirerId,
          type: "REFUND",
          amount: withdrawal.amount,
          currency: withdrawal.currency,
          fee: 0,
          netAmount: withdrawal.amount,
          reference: `REF-${withdrawal.reference}`,
          status: "COMPLETED",
          description: `Refund for rejected withdrawal #${withdrawal.reference}`,
          balanceBefore: wallet.balance,
          balanceAfter: wallet.balance + withdrawal.amount,
          completedAt: new Date(),
        },
      });

      return response.success(res, "Withdrawal rejected and refunded", {
        id: withdrawal.id,
        status: "FAILED",
        amount: withdrawal.amount,
      });
    }

    return response.error(res, "Invalid action", 400);
  } catch (error) {
    console.error("Process withdrawal error:", error);
    return response.error(res, "Failed to process withdrawal", 500);
  }
};

// ─── Admin: Get All Withdrawals ─────────────────────────────────────────────

export const getWithdrawals = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where = {};

    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      prisma.hirerWithdrawal.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          hirer: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.hirerWithdrawal.count({ where }),
    ]);

    return response.success(res, "Withdrawals retrieved", {
      withdrawals,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get withdrawals error:", error);
    return response.error(res, "Failed to get withdrawals", 500);
  }
};

// ─── Admin: Get Wallet Stats ────────────────────────────────────────────────

export const getWalletStats = async (req, res) => {
  try {
    const [totalWallets, totalBalance, totalDeposited, totalWithdrawn] =
      await Promise.all([
        prisma.hirerWallet.count(),
        prisma.hirerWallet.aggregate({
          _sum: { balance: true },
        }),
        prisma.hirerWallet.aggregate({
          _sum: { totalDeposited: true },
        }),
        prisma.hirerWallet.aggregate({
          _sum: { totalWithdrawn: true },
        }),
      ]);

    return response.success(res, "Wallet stats retrieved", {
      totalWallets,
      totalBalance: totalBalance._sum.balance || 0,
      totalDeposited: totalDeposited._sum.totalDeposited || 0,
      totalWithdrawn: totalWithdrawn._sum.totalWithdrawn || 0,
    });
  } catch (error) {
    console.error("Get wallet stats error:", error);
    return response.error(res, "Failed to get wallet stats", 500);
  }
};
