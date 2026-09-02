// src/controllers/hirerWallet.controller.js
// Complete Hirer Wallet Controller with Multi-Currency Support

import prisma from "../config/database.js";
import { sendResponse, sendError } from "../utils/response.js";
import crypto from "crypto";
import axios from "axios";

const response = {
  success: (res, message, data = null, status = 200) => {
    return sendResponse(res, { status, message, data });
  },
  error: (res, message, status = 400, errors = null) => {
    return sendError(res, message, status, errors);
  },
};

// ─── Helper Functions ──────────────────────────────────────────────────────

const generateReference = (prefix = "HW") => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

const getFlutterwaveSecret = () => {
  return process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLUTTERWAVE_SECRET;
};

// ─── Supported Currencies ──────────────────────────────────────────────────

const SUPPORTED_CURRENCIES = [
  "NGN",
  "USD",
  "EUR",
  "GBP",
  "GHS",
  "KES",
  "ZAR",
  "INR",
  "CAD",
  "AUD",
  "JPY",
  "CNY",
  "BRL",
  "AED",
  "SAR",
  "QAR",
  "EGP",
  "TZS",
  "UGX",
  "RWF",
  "XOF",
  "MAD",
  "PHP",
  "IDR",
  "VND",
  "THB",
  "BDT",
  "PKR",
  "MYR",
  "SGD",
  "HKD",
];

// ─── Get or Create Wallet (Multi-Currency) ────────────────────────────────

const getOrCreateWallet = async (hirerId, currency = "NGN") => {
  // Find existing wallet for this currency
  let wallet = await prisma.hirerWallet.findUnique({
    where: {
      hirerId_currency: {
        hirerId,
        currency,
      },
    },
  });

  // If not found, create one
  if (!wallet) {
    wallet = await prisma.hirerWallet.create({
      data: {
        hirerId,
        currency,
        balance: 0,
      },
    });
  }

  return wallet;
};

// ─── Get All Wallet Balances (Multi-Currency) ─────────────────────────────

export const getAllWalletBalances = async (req, res) => {
  try {
    const wallets = await prisma.hirerWallet.findMany({
      where: { hirerId: req.user.id },
      select: {
        currency: true,
        balance: true,
        totalDeposited: true,
        totalSpent: true,
        totalWithdrawn: true,
      },
    });

    // Format response
    const balances = {};
    wallets.forEach((w) => {
      balances[w.currency] = {
        balance: w.balance,
        totalDeposited: w.totalDeposited,
        totalSpent: w.totalSpent,
        totalWithdrawn: w.totalWithdrawn,
      };
    });

    // Ensure NGN exists
    if (!balances.NGN) {
      const ngnWallet = await getOrCreateWallet(req.user.id, "NGN");
      balances.NGN = {
        balance: ngnWallet.balance,
        totalDeposited: ngnWallet.totalDeposited,
        totalSpent: ngnWallet.totalSpent,
        totalWithdrawn: ngnWallet.totalWithdrawn,
      };
    }

    return response.success(res, "Wallet balances retrieved", {
      balances,
      currencies: Object.keys(balances),
    });
  } catch (error) {
    console.error("Get all wallet balances error:", error);
    return response.error(res, "Failed to get wallet balances", 500);
  }
};

// ─── Get Wallet Balance (Single Currency) ──────────────────────────────────

export const getWalletBalance = async (req, res) => {
  try {
    const { currency = "NGN" } = req.query;

    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return response.error(res, `Currency ${currency} is not supported`, 400);
    }

    const wallet = await getOrCreateWallet(req.user.id, currency);

    const [totalDeposited, totalSpent, totalWithdrawn] = await Promise.all([
      prisma.hirerTransaction.aggregate({
        where: {
          hirerId: req.user.id,
          type: "DEPOSIT",
          status: "COMPLETED",
          currency: currency,
        },
        _sum: { netAmount: true },
      }),
      prisma.hirerTransaction.aggregate({
        where: {
          hirerId: req.user.id,
          type: "PAYMENT",
          status: "COMPLETED",
          currency: currency,
        },
        _sum: { netAmount: true },
      }),
      prisma.hirerTransaction.aggregate({
        where: {
          hirerId: req.user.id,
          type: "WITHDRAWAL",
          status: "COMPLETED",
          currency: currency,
        },
        _sum: { netAmount: true },
      }),
    ]);

    return response.success(res, "Wallet balance retrieved", {
      balance: wallet.balance,
      currency: wallet.currency,
      totalDeposited: totalDeposited._sum.netAmount || 0,
      totalSpent: totalSpent._sum.netAmount || 0,
      totalWithdrawn: totalWithdrawn._sum.netAmount || 0,
    });
  } catch (error) {
    console.error("Get wallet balance error:", error);
    return response.error(res, "Failed to get wallet balance", 500);
  }
};

// ─── Get Wallet Transactions ───────────────────────────────────────────────

export const getWalletTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status, currency } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where = { hirerId: req.user.id };

    if (type) where.type = type;
    if (status) where.status = status;
    if (currency) where.currency = currency;

    const [transactions, total] = await Promise.all([
      prisma.hirerTransaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
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

// ─── Fund Wallet with Flutterwave ──────────────────────────────────────────

export const fundWallet = async (req, res) => {
  try {
    const { amount, currency = "NGN", redirectUrl } = req.body;

    if (!amount || amount < 100) {
      return response.error(res, "Minimum deposit amount is 100", 400);
    }

    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return response.error(
        res,
        `Currency not supported. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`,
        400,
      );
    }

    const wallet = await getOrCreateWallet(req.user.id, currency);
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
      payment_options: "card, banktransfer, ussd, mobilemoney, qr",
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
        description: `Add ${currency} ${amount} to your wallet`,
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
        flutterwaveRef: flutterwaveResponse.data.data.flw_ref,
      });
    } else {
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
    const signature = req.headers["verif-hash"];
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;

    if (signature !== secretHash) {
      console.error("Invalid webhook signature");
      return res
        .status(401)
        .json({ status: "error", message: "Invalid signature" });
    }

    const { tx_ref, status, transaction_id } = payload.data || payload;

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
      return res
        .status(200)
        .json({ status: "success", message: "Already processed" });
    }

    await prisma.hirerFundingAttempt.update({
      where: { id: fundingAttempt.id },
      data: {
        status: status === "successful" ? "SUCCESS" : "FAILED",
        providerRef: transaction_id || fundingAttempt.providerRef,
        completedAt: status === "successful" ? new Date() : undefined,
        callbackData: payload,
      },
    });

    if (status === "successful") {
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
          description: `Wallet funding via Flutterwave (${fundingAttempt.currency})`,
          balanceBefore,
          balanceAfter,
          completedAt: new Date(),
          meta: {
            paymentProvider: "FLUTTERWAVE",
            transactionId: transaction_id,
          },
        },
      });

      await prisma.hirerFundingAttempt.update({
        where: { id: fundingAttempt.id },
        data: { transactionId: transaction.id },
      });

      console.log(
        `✅ Wallet funded: ${fundingAttempt.hirerId} - ${fundingAttempt.currency} ${fundingAttempt.amount}`,
      );
    }

    return res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Flutterwave webhook error:", error);
    return res.status(500).json({ status: "error", message: error.message });
  }
};

// ─── Verify Transaction ────────────────────────────────────────────────────

export const verifyTransaction = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return response.error(res, "Transaction reference is required", 400);
    }

    const fundingAttempt = await prisma.hirerFundingAttempt.findUnique({
      where: { providerRef: reference },
    });

    if (!fundingAttempt) {
      return response.error(res, "Transaction not found", 404);
    }

    const wallet = await prisma.hirerWallet.findUnique({
      where: { id: fundingAttempt.walletId },
    });

    if (fundingAttempt.status === "SUCCESS") {
      let transaction = null;
      if (fundingAttempt.transactionId) {
        transaction = await prisma.hirerTransaction.findUnique({
          where: { id: fundingAttempt.transactionId },
        });
      }
      return response.success(res, "Transaction already completed", {
        status: "SUCCESS",
        amount: fundingAttempt.amount,
        currency: fundingAttempt.currency,
        reference: fundingAttempt.providerRef,
        transaction: transaction,
        balance: wallet?.balance || 0,
      });
    }

    if (fundingAttempt.status === "FAILED") {
      return response.success(res, "Transaction failed", {
        status: "FAILED",
        amount: fundingAttempt.amount,
        currency: fundingAttempt.currency,
        reference: fundingAttempt.providerRef,
        balance: wallet?.balance || 0,
      });
    }

    const isTestMode =
      process.env.NODE_ENV !== "production" ||
      !process.env.FLUTTERWAVE_SECRET_KEY;
    let isSuccessful = false;
    let flutterwaveData = null;

    try {
      const flutterwaveResponse = await axios.get(
        `https://api.flutterwave.com/v3/transactions/${fundingAttempt.providerRef}/verify`,
        {
          headers: {
            Authorization: `Bearer ${getFlutterwaveSecret()}`,
          },
          timeout: 10000,
        },
      );

      flutterwaveData = flutterwaveResponse.data;
      isSuccessful =
        flutterwaveData.status === "success" &&
        flutterwaveData.data?.status === "successful";
    } catch (flutterwaveError) {
      console.error(
        "Flutterwave verification error:",
        flutterwaveError.message,
      );

      if (isTestMode) {
        console.log("🔧 Test mode: Auto-verifying transaction:", reference);
        isSuccessful = true;
      } else {
        return response.success(res, "Transaction verification pending", {
          status: "PENDING",
          amount: fundingAttempt.amount,
          currency: fundingAttempt.currency,
          reference: fundingAttempt.providerRef,
          message: "Payment verification is pending. Please check back later.",
        });
      }
    }

    await prisma.hirerFundingAttempt.update({
      where: { id: fundingAttempt.id },
      data: {
        status: isSuccessful ? "SUCCESS" : "FAILED",
        completedAt: isSuccessful ? new Date() : undefined,
        callbackData: flutterwaveData || { testMode: true },
      },
    });

    if (isSuccessful) {
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

      const newTransaction = await prisma.hirerTransaction.create({
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
          description: isTestMode
            ? `Wallet funding via Flutterwave (TEST MODE) - ${fundingAttempt.currency}`
            : `Wallet funding via Flutterwave (${fundingAttempt.currency})`,
          balanceBefore,
          balanceAfter,
          completedAt: new Date(),
          meta: {
            paymentProvider: "FLUTTERWAVE",
            verified: true,
            testMode: isTestMode,
          },
        },
      });

      await prisma.hirerFundingAttempt.update({
        where: { id: fundingAttempt.id },
        data: { transactionId: newTransaction.id },
      });

      return response.success(
        res,
        "Transaction verified and completed" +
          (isTestMode ? " (Test Mode)" : ""),
        {
          status: "SUCCESS",
          amount: fundingAttempt.amount,
          currency: fundingAttempt.currency,
          reference: fundingAttempt.providerRef,
          transaction: newTransaction,
          balance: balanceAfter,
          testMode: isTestMode,
        },
      );
    }

    return response.success(res, "Transaction verification failed", {
      status: "FAILED",
      amount: fundingAttempt.amount,
      currency: fundingAttempt.currency,
      reference: fundingAttempt.providerRef,
    });
  } catch (error) {
    console.error("Verify transaction error:", error);
    return response.error(
      res,
      "Failed to verify transaction: " + error.message,
      500,
    );
  }
};

// ─── Request Withdrawal ─────────────────────────────────────────────────────

export const requestWithdrawal = async (req, res) => {
  try {
    const {
      amount,
      currency = "NGN",
      bankName,
      accountNumber,
      accountName,
      bankCode,
    } = req.body;

    if (!amount || amount < 100) {
      return response.error(res, "Minimum withdrawal amount is 100", 400);
    }

    if (!bankName || !accountNumber || !accountName) {
      return response.error(res, "Bank details are required", 400);
    }

    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return response.error(
        res,
        `Currency not supported. Supported: ${SUPPORTED_CURRENCIES.join(", ")}`,
        400,
      );
    }

    const wallet = await getOrCreateWallet(req.user.id, currency);

    if (wallet.balance < amount) {
      return response.error(res, `Insufficient ${currency} balance`, 400);
    }

    const reference = generateReference("WD");
    const fee = Math.min(amount * 0.01, 100);
    const netAmount = amount - fee;

    const withdrawal = await prisma.hirerWithdrawal.create({
      data: {
        walletId: wallet.id,
        hirerId: req.user.id,
        amount,
        currency,
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

    const transaction = await prisma.hirerTransaction.create({
      data: {
        walletId: wallet.id,
        hirerId: req.user.id,
        type: "WITHDRAWAL",
        amount,
        currency,
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

    await prisma.hirerWallet.update({
      where: { id: wallet.id },
      data: {
        balance: wallet.balance - amount,
        totalWithdrawn: wallet.totalWithdrawn + amount,
        lastTransactionAt: new Date(),
      },
    });

    return response.success(
      res,
      "Withdrawal request submitted for admin approval",
      {
        id: withdrawal.id,
        reference,
        amount,
        fee,
        netAmount,
        status: "PENDING",
        bankName,
        accountNumber,
        accountName,
      },
    );
  } catch (error) {
    console.error("Request withdrawal error:", error);
    return response.error(res, "Failed to process withdrawal request", 500);
  }
};

// ─── Admin: Get Withdrawals ────────────────────────────────────────────────

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
      }),
      prisma.hirerWithdrawal.count({ where }),
    ]);

    const withdrawalsWithUsers = await Promise.all(
      withdrawals.map(async (withdrawal) => {
        const hirer = await prisma.user.findUnique({
          where: { id: withdrawal.hirerId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        });
        return {
          ...withdrawal,
          hirer,
        };
      }),
    );

    return response.success(res, "Withdrawals retrieved", {
      withdrawals: withdrawalsWithUsers,
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

// ─── Admin: Approve Withdrawal ─────────────────────────────────────────────

export const approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;

    const withdrawal = await prisma.hirerWithdrawal.findUnique({
      where: { id },
    });

    if (!withdrawal) {
      return response.error(res, "Withdrawal not found", 404);
    }

    if (withdrawal.status !== "PENDING") {
      return response.error(res, "Withdrawal already processed", 400);
    }

    await prisma.hirerWithdrawal.update({
      where: { id },
      data: {
        status: "COMPLETED",
        processedAt: new Date(),
        completedAt: new Date(),
      },
    });

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
      currency: withdrawal.currency,
      reference: withdrawal.reference,
    });
  } catch (error) {
    console.error("Approve withdrawal error:", error);
    return response.error(res, "Failed to approve withdrawal", 500);
  }
};

// ─── Admin: Reject Withdrawal ──────────────────────────────────────────────

export const rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { failureReason } = req.body;

    const withdrawal = await prisma.hirerWithdrawal.findUnique({
      where: { id },
    });

    if (!withdrawal) {
      return response.error(res, "Withdrawal not found", 404);
    }

    if (withdrawal.status !== "PENDING") {
      return response.error(res, "Withdrawal already processed", 400);
    }

    await prisma.hirerWithdrawal.update({
      where: { id },
      data: {
        status: "FAILED",
        failureReason: failureReason || "Rejected by admin",
        processedAt: new Date(),
      },
    });

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

    const wallet = await prisma.hirerWallet.findUnique({
      where: { id: withdrawal.walletId },
    });

    if (wallet) {
      await prisma.hirerWallet.update({
        where: { id: withdrawal.walletId },
        data: {
          balance: wallet.balance + withdrawal.amount,
          totalWithdrawn: wallet.totalWithdrawn - withdrawal.amount,
          lastTransactionAt: new Date(),
        },
      });

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
    }

    return response.success(res, "Withdrawal rejected and refunded", {
      id: withdrawal.id,
      status: "FAILED",
      amount: withdrawal.amount,
      currency: withdrawal.currency,
    });
  } catch (error) {
    console.error("Reject withdrawal error:", error);
    return response.error(res, "Failed to reject withdrawal", 500);
  }
};

// ─── Admin: Get Wallet Stats ───────────────────────────────────────────────

export const getWalletStats = async (req, res) => {
  try {
    const [
      totalWallets,
      totalBalance,
      totalDeposited,
      totalWithdrawn,
      pendingWithdrawals,
    ] = await Promise.all([
      prisma.hirerWallet.count(),
      prisma.hirerWallet.aggregate({ _sum: { balance: true } }),
      prisma.hirerWallet.aggregate({ _sum: { totalDeposited: true } }),
      prisma.hirerWallet.aggregate({ _sum: { totalWithdrawn: true } }),
      prisma.hirerWithdrawal.count({ where: { status: "PENDING" } }),
    ]);

    // Get balances by currency
    const balancesByCurrency = await prisma.hirerWallet.groupBy({
      by: ["currency"],
      _sum: {
        balance: true,
        totalDeposited: true,
        totalWithdrawn: true,
      },
    });

    return response.success(res, "Wallet stats retrieved", {
      totalWallets,
      totalBalance: totalBalance._sum.balance || 0,
      totalDeposited: totalDeposited._sum.totalDeposited || 0,
      totalWithdrawn: totalWithdrawn._sum.totalWithdrawn || 0,
      pendingWithdrawals,
      balancesByCurrency,
    });
  } catch (error) {
    console.error("Get wallet stats error:", error);
    return response.error(res, "Failed to get wallet stats", 500);
  }
};

// ─── Get Supported Currencies ──────────────────────────────────────────────

export const getSupportedCurrencies = async (req, res) => {
  try {
    return response.success(res, "Supported currencies retrieved", {
      currencies: SUPPORTED_CURRENCIES,
    });
  } catch (error) {
    console.error("Get supported currencies error:", error);
    return response.error(res, "Failed to get supported currencies", 500);
  }
};
