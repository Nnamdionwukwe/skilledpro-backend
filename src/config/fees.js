// src/config/fees.js
// ── Central fee configuration — change here, applies everywhere ──────────────

export const FEE_CONFIG = {
  phase: 1,

  // ── Booking fees ──────────────────────────────────────────────────────────
  // Two-tier model:
  //   NGN → 2%   (covers Paystack's 1.5% + ₦100)
  //   any other currency → 5% (covers Flutterwave's ~4.8% international fee)
  NGN_HIRER_FEE_RATE: process.env.NGN_HIRER_FEE_RATE
    ? parseFloat(process.env.NGN_HIRER_FEE_RATE)
    : 0.02,
  FOREIGN_HIRER_FEE_RATE: process.env.FOREIGN_HIRER_FEE_RATE
    ? parseFloat(process.env.FOREIGN_HIRER_FEE_RATE)
    : 0.05,

  // Kept for backwards compatibility with importers that read
  // HIRER_FEE_RATE directly (defaults to the NGN rate).
  HIRER_FEE_RATE: process.env.NGN_HIRER_FEE_RATE
    ? parseFloat(process.env.NGN_HIRER_FEE_RATE)
    : 0.02,

  WORKER_FEE_RATE: 0.0,

  // ── Worker escrow withdrawal fees (Paystack/Flutterwave transfer) ────────
  // (Not currently applied — kept at 0 for now; you can flip later.)
  WITHDRAWAL_FEE_RATE: 0.0,
  WITHDRAWAL_FEE_CAP: 0,
  WITHDRAWAL_FEE_MIN: 0,

  // ── Hirer wallet withdrawal fees ─────────────────────────────────────────
  // Charged when a hirer withdraws money from their wallet back to a bank.
  // NGN → 1% capped at ₦100 (covers Paystack's ₦10–₦50 transfer cost).
  // Foreign → 2% uncapped (covers Flutterwave's international transfer cost).
  NGN_WALLET_WITHDRAWAL_FEE_RATE: 0.01,
  NGN_WALLET_WITHDRAWAL_FEE_CAP: 100,
  FOREIGN_WALLET_WITHDRAWAL_FEE_RATE: 0.02,

  // ── Computed helpers ──────────────────────────────────────────────────────

  getHirerFeeRate(currency = "NGN") {
    const cur = (currency || "NGN").toUpperCase();
    return cur === "NGN"
      ? this.NGN_HIRER_FEE_RATE
      : this.FOREIGN_HIRER_FEE_RATE;
  },

  /**
   * Compute the wallet withdrawal fee for a given amount and currency.
   * NGN:   1% capped at ₦100
   * Other: 2% uncapped
   *
   * Returns { fee, netAmount, feeRate, feePercent }
   */
  computeWalletWithdrawalFee(amount, currency = "NGN") {
    const cur = (currency || "NGN").toUpperCase();
    const numAmount = Number(amount) || 0;
    if (numAmount <= 0) {
      return { fee: 0, netAmount: 0, feeRate: 0, feePercent: 0 };
    }

    let feeRate;
    let fee;

    if (cur === "NGN") {
      feeRate = this.NGN_WALLET_WITHDRAWAL_FEE_RATE;
      fee = numAmount * feeRate;
      if (this.NGN_WALLET_WITHDRAWAL_FEE_CAP > 0) {
        fee = Math.min(fee, this.NGN_WALLET_WITHDRAWAL_FEE_CAP);
      }
    } else {
      feeRate = this.FOREIGN_WALLET_WITHDRAWAL_FEE_RATE;
      fee = numAmount * feeRate;
    }

    fee = parseFloat(fee.toFixed(2));
    const netAmount = parseFloat((numAmount - fee).toFixed(2));
    const feePercent = Math.round(feeRate * 100);

    return { fee, netAmount, feeRate, feePercent };
  },

  compute(agreedRate, currency = "NGN") {
    const rate = this.getHirerFeeRate(currency);
    const platformFeeFromHirer = parseFloat((agreedRate * rate).toFixed(2));
    const platformFeeFromWorker = parseFloat(
      (agreedRate * this.WORKER_FEE_RATE).toFixed(2),
    );
    const totalToHirer = parseFloat(
      (agreedRate + platformFeeFromHirer).toFixed(2),
    );
    const workerPayout = parseFloat(
      (agreedRate - platformFeeFromWorker).toFixed(2),
    );
    const totalPlatformRevenue = parseFloat(
      (platformFeeFromHirer + platformFeeFromWorker).toFixed(2),
    );

    return {
      agreedRate,
      platformFeeFromHirer,
      platformFeeFromWorker,
      totalToHirer,
      workerPayout,
      totalPlatformRevenue,
      breakdown: {
        jobValue: agreedRate,
        hirerFee: `${(rate * 100).toFixed(0)}% service fee`,
        workerFee:
          this.WORKER_FEE_RATE > 0
            ? `${(this.WORKER_FEE_RATE * 100).toFixed(0)}% platform fee`
            : "No platform fee on earnings",
        totalCharged: totalToHirer,
        workerReceives: workerPayout,
      },
    };
  },

  computeWithdrawal(amount) {
    if (this.WITHDRAWAL_FEE_RATE === 0) {
      return { fee: 0, netAmount: amount };
    }
    let fee = parseFloat((amount * this.WITHDRAWAL_FEE_RATE).toFixed(2));
    if (this.WITHDRAWAL_FEE_CAP > 0) {
      fee = Math.min(fee, this.WITHDRAWAL_FEE_CAP);
    }
    fee = Math.max(fee, this.WITHDRAWAL_FEE_MIN);
    return {
      fee: parseFloat(fee.toFixed(2)),
      netAmount: parseFloat((amount - fee).toFixed(2)),
    };
  },

  computeHirerFee(subtotal, currency = "NGN") {
    const rate = this.getHirerFeeRate(currency);
    return parseFloat((subtotal * rate).toFixed(2));
  },

  computeWorkerPayout(subtotal) {
    return parseFloat((subtotal * (1 - this.WORKER_FEE_RATE)).toFixed(2));
  },

  computeGrossTotal(subtotal, currency = "NGN") {
    const rate = this.getHirerFeeRate(currency);
    return parseFloat((subtotal * (1 + rate)).toFixed(2));
  },

  get HIRER_FEE_PERCENT() {
    return Math.round(this.NGN_HIRER_FEE_RATE * 100);
  },

  get WORKER_FEE_PERCENT() {
    return Math.round(this.WORKER_FEE_RATE * 100);
  },
};
