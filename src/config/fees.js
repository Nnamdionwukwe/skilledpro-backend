// src/config/fees.js
// ── Central fee configuration — change here, applies everywhere ──────────────

export const FEE_CONFIG = {
  phase: 1,

  // ── Booking fees ──────────────────────────────────────────────────────────
  // Default rate (applies to NGN or any currency without an override)
  HIRER_FEE_RATE: process.env.HIRER_FEE_RATE
    ? parseFloat(process.env.HIRER_FEE_RATE)
    : 0.02, // Changed default to 2% to cover Paystack local fees

  // ✅ NEW: Currency-specific fee overrides
  // Flutterwave charges 4.8% for international cards. We charge 5% to cover it + 0.2% revenue.
  CURRENCY_FEE_OVERRIDES: {
    USD: 0.05,
    EUR: 0.05,
    GBP: 0.05,
    CAD: 0.05,
    AUD: 0.05,
    // Add other foreign currencies here as needed
  },

  WORKER_FEE_RATE: 0.0,

  // ── Withdrawal fees ───────────────────────────────────────────────────────
  WITHDRAWAL_FEE_RATE: 0.0,
  WITHDRAWAL_FEE_CAP: 0,
  WITHDRAWAL_FEE_MIN: 0,

  // ── Computed helpers ──────────────────────────────────────────────────────

  /**
   * Helper to get the correct fee rate for a given currency
   */
  getHirerFeeRate(currency = "NGN") {
    const cur = (currency || "NGN").toUpperCase();
    return this.CURRENCY_FEE_OVERRIDES[cur] !== undefined
      ? this.CURRENCY_FEE_OVERRIDES[cur]
      : this.HIRER_FEE_RATE;
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

  /**
   * Convenience: compute the hirer fee from a subtotal and currency.
   */
  computeHirerFee(subtotal, currency = "NGN") {
    const rate = this.getHirerFeeRate(currency);
    return parseFloat((subtotal * rate).toFixed(2));
  },

  computeWorkerPayout(subtotal) {
    return parseFloat((subtotal * (1 - this.WORKER_FEE_RATE)).toFixed(2));
  },

  /**
   * Convenience: compute the total the hirer is charged (subtotal + hirer fee).
   */
  computeGrossTotal(subtotal, currency = "NGN") {
    const rate = this.getHirerFeeRate(currency);
    return parseFloat((subtotal * (1 + rate)).toFixed(2));
  },

  get HIRER_FEE_PERCENT() {
    return Math.round(this.HIRER_FEE_RATE * 100);
  },

  get WORKER_FEE_PERCENT() {
    return Math.round(this.WORKER_FEE_RATE * 100);
  },
};
