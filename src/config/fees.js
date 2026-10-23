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

  // ── Withdrawal fees ───────────────────────────────────────────────────────
  WITHDRAWAL_FEE_RATE: 0.0,
  WITHDRAWAL_FEE_CAP: 0,
  WITHDRAWAL_FEE_MIN: 0,

  // ── Computed helpers ──────────────────────────────────────────────────────

  /**
   * Get the effective hirer fee rate for a given currency.
   * NGN → NGN_HIRER_FEE_RATE (2%)
   * everything else → FOREIGN_HIRER_FEE_RATE (5%)
   */
  getHirerFeeRate(currency = "NGN") {
    const cur = (currency || "NGN").toUpperCase();
    return cur === "NGN"
      ? this.NGN_HIRER_FEE_RATE
      : this.FOREIGN_HIRER_FEE_RATE;
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
