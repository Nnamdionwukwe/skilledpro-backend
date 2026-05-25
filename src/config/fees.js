// src/config/fees.js
// ── Central fee configuration — change here, applies everywhere ──────────────
// Phase 1: Growth mode (0–10k users) — keep fees low to build liquidity

export const FEE_CONFIG = {
  phase: 1, // increment as you grow

  // ── Booking fees ──────────────────────────────────────────────────────────
  // Phase 1: hirer pays 5%, worker keeps 100% of agreedRate
  // Phase 2: hirer 5% + worker 3%
  // Phase 3: hirer 5% + worker 5%
  HIRER_FEE_RATE: 0.05, // 5% added on top of agreedRate — hirer pays this
  WORKER_FEE_RATE: 0.0, // 0% deducted from worker payout in phase 1

  // ── Withdrawal fees ───────────────────────────────────────────────────────
  WITHDRAWAL_FEE_RATE: 0.0, // 0% in phase 1
  WITHDRAWAL_FEE_CAP: 0, // ₦0 cap in phase 1
  WITHDRAWAL_FEE_MIN: 0, // no minimum fee

  // ── Computed helpers ──────────────────────────────────────────────────────
  /**
   * Given the agreedRate, return the full fee breakdown.
   * agreedRate = what hirer and worker agreed on (net to worker in phase 1)
   */
  compute(agreedRate) {
    const platformFeeFromHirer = parseFloat(
      (agreedRate * this.HIRER_FEE_RATE).toFixed(2),
    );
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
      platformFeeFromHirer, // what hirer pays on top
      platformFeeFromWorker, // what is deducted from worker (0 in phase 1)
      totalToHirer, // total hirer is charged
      workerPayout, // what worker actually receives
      totalPlatformRevenue, // platform's cut
      // Human-readable breakdown for UI display
      breakdown: {
        jobValue: agreedRate,
        hirerFee: `${(this.HIRER_FEE_RATE * 100).toFixed(0)}% service fee`,
        workerFee:
          this.WORKER_FEE_RATE > 0
            ? `${(this.WORKER_FEE_RATE * 100).toFixed(0)}% platform fee`
            : "No platform fee on earnings",
        totalCharged: totalToHirer,
        workerReceives: workerPayout,
      },
    };
  },

  /**
   * Compute withdrawal fee.
   * Returns { fee, netAmount } — both in same currency unit as amount.
   */
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
};
