// src/templates/dailyDigest.js
// ─────────────────────────────────────────────────────────────────────────────
// Renders the daily-digest HTML. Reuses baseTemplate() from utils/email.js
// so it matches every other SkilledProz email (dark blue header, orange accent,
// single-column mobile-friendly layout).
// ─────────────────────────────────────────────────────────────────────────────

import { baseTemplate } from "../services/email.service.js";
import { fmtMoney } from "../services/digest.service.js";

const CURRENCY_ORDER = ["NGN", "USD", "GBP", "EUR", "USDC", "USDT"];

function orderCurrencies(obj) {
  const keys = Object.keys(obj || {});
  const known = CURRENCY_ORDER.filter((c) => keys.includes(c));
  const rest = keys.filter((c) => !CURRENCY_ORDER.includes(c)).sort();
  return [...known, ...rest];
}

function deltaBadge(delta) {
  if (delta > 0) {
    return `<span style="color:#16a34a;font-size:13px;font-weight:600;">↑ ${delta} vs day before</span>`;
  }
  if (delta < 0) {
    return `<span style="color:#dc2626;font-size:13px;font-weight:600;">↓ ${Math.abs(delta)} vs day before</span>`;
  }
  return `<span style="color:#9ca3af;font-size:13px;">same as day before</span>`;
}

function revenueTable(byCurrency, { emptyMessage }) {
  const currencies = orderCurrencies(byCurrency);
  if (currencies.length === 0) {
    return `<p style="font-size:13px;color:#9ca3af;margin:8px 0;">${emptyMessage}</p>`;
  }

  const rows = currencies
    .map((c) => {
      const r = byCurrency[c];
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #ececf8;font-size:13px;color:#555;">
            <strong style="color:#0F0F6E;">${c}</strong>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #ececf8;font-size:14px;color:#16a34a;text-align:right;font-weight:700;">
            ${fmtMoney(r.fees, c)}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #ececf8;font-size:12px;color:#888;text-align:right;">
            ${r.count} payment${r.count === 1 ? "" : "s"}
          </td>
        </tr>`;
    })
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0;">
      <tbody>${rows}</tbody>
    </table>`;
}

function escrowTable(byCurrency) {
  const currencies = orderCurrencies(byCurrency);
  if (currencies.length === 0) {
    return `<p style="font-size:13px;color:#9ca3af;margin:8px 0;">No funds currently held in escrow.</p>`;
  }

  const rows = currencies
    .map((c) => {
      const r = byCurrency[c];
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #ececf8;font-size:13px;color:#555;">
            <strong style="color:#0F0F6E;">${c}</strong>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #ececf8;font-size:14px;color:#ea580c;text-align:right;font-weight:700;">
            ${fmtMoney(r.held, c)}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #ececf8;font-size:12px;color:#888;text-align:right;">
            ${r.count} booking${r.count === 1 ? "" : "s"}
          </td>
        </tr>`;
    })
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0;">
      <tbody>${rows}</tbody>
    </table>`;
}

function refundsTable(byCurrency) {
  const currencies = orderCurrencies(byCurrency);
  if (currencies.length === 0) return "";
  const rows = currencies
    .map((c) => {
      const r = byCurrency[c];
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #ececf8;font-size:13px;color:#555;">
            <strong style="color:#0F0F6E;">${c}</strong>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #ececf8;font-size:13px;color:#dc2626;text-align:right;">
            ${fmtMoney(r.completed, c)} refunded
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #ececf8;font-size:12px;color:#ea580c;text-align:right;">
            ${r.pending > 0 ? `${fmtMoney(r.pending, c)} pending` : "—"}
          </td>
        </tr>`;
    })
    .join("");
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0;">
      <tbody>${rows}</tbody>
    </table>`;
}

function attentionList(a) {
  const items = [];
  if (a.pendingVerifications > 0)
    items.push(
      `${a.pendingVerifications} worker verification${a.pendingVerifications === 1 ? "" : "s"} pending review`,
    );
  if (a.pendingWithdrawals > 0)
    items.push(
      `${a.pendingWithdrawals} withdrawal request${a.pendingWithdrawals === 1 ? "" : "s"} pending (₦${(a.pendingWithdrawalsAmount || 0).toLocaleString()})`,
    );
  if (a.openDisputes > 0)
    items.push(
      `${a.openDisputes} dispute${a.openDisputes === 1 ? "" : "s"} awaiting resolution`,
    );
  if (a.pendingRefunds > 0)
    items.push(
      `${a.pendingRefunds} refund${a.pendingRefunds === 1 ? "" : "s"} to process`,
    );
  if (a.pendingReports > 0)
    items.push(
      `${a.pendingReports} report${a.pendingReports === 1 ? "" : "s"} pending moderation`,
    );
  if (a.pendingCampaignSubmissions > 0)
    items.push(
      `${a.pendingCampaignSubmissions} campaign submission${a.pendingCampaignSubmissions === 1 ? "" : "s"} pending`,
    );
  if (a.stuckPayments > 0)
    items.push(
      `${a.stuckPayments} manual payment${a.stuckPayments === 1 ? "" : "s"} stuck in PENDING > 24h`,
    );
  if (a.outstandingDebts > 0)
    items.push(
      `${a.outstandingDebts} outstanding worker debt${a.outstandingDebts === 1 ? "" : "s"} (₦${(a.outstandingDebtsAmount || 0).toLocaleString()})`,
    );

  if (items.length === 0) {
    return `<p style="font-size:14px;color:#16a34a;margin:8px 0;">✅ All clear — nothing needs your attention.</p>`;
  }

  return `
    <ul style="padding-left:20px;margin:8px 0;color:#555;font-size:14px;line-height:1.9;">
      ${items.map((i) => `<li>${i}</li>`).join("")}
    </ul>`;
}

function categoriesTable(top) {
  if (!top || top.length === 0) {
    return `<p style="font-size:13px;color:#9ca3af;margin:8px 0;">No category searches in the last 7 days.</p>`;
  }
  const rows = top
    .map(
      (c, i) => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #ececf8;font-size:13px;color:#555;">
          <strong style="color:#0F0F6E;">${i + 1}.</strong> ${c.icon || "•"} ${c.name}
        </td>
        <td style="padding:6px 0;border-bottom:1px solid #ececf8;font-size:13px;color:#0F0F6E;text-align:right;font-weight:700;">
          ${c.demand} search${c.demand === 1 ? "" : "es"}
        </td>
        <td style="padding:6px 0;border-bottom:1px solid #ececf8;font-size:12px;color:#888;text-align:right;">
          ${c.workers} worker${c.workers === 1 ? "" : "s"}
        </td>
      </tr>`,
    )
    .join("");
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0;">
      <tbody>${rows}</tbody>
    </table>`;
}

function supplyGapsList(gaps) {
  if (!gaps || gaps.length === 0) {
    return `<p style="font-size:13px;color:#9ca3af;margin:8px 0;">No supply gaps detected in the last 7 days.</p>`;
  }
  return `
    <ul style="padding-left:20px;margin:8px 0;color:#555;font-size:14px;line-height:1.9;">
      ${gaps
        .map(
          (g) =>
            `<li><strong>${g.name}:</strong> ${g.demand} searches, ${g.workers} worker${g.workers === 1 ? "" : "s"} → ${g.workers === 0 ? "recruit urgently" : "recruit"}</li>`,
        )
        .join("")}
    </ul>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RENDER
// ─────────────────────────────────────────────────────────────────────────────
export function renderDailyDigest(d) {
  const revTotal = Object.values(d.revenue.byCurrency).reduce(
    (sum, r) => sum + (r.count || 0),
    0,
  );

  const body = `
    <p class="greeting">Good morning 👋</p>
    <p>Here's what happened on <strong>SkilledProz</strong> for <strong>${d.windowLabel}</strong>.</p>

    <hr class="divider"/>

    <h3 style="color:#0F0F6E;font-size:15px;font-weight:700;margin:8px 0 12px;letter-spacing:0.3px;text-transform:uppercase;">📊 Yesterday at a glance</h3>

    <div class="card">
      <div class="card-row">
        <span class="card-label">New users</span>
        <span class="card-value">${d.users.newYesterday} ${deltaBadge(d.users.delta)}</span>
      </div>
      <div class="card-row">
        <span class="card-label">New workers / hirers</span>
        <span class="card-value">${d.users.newWorkers} / ${d.users.newHirers}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Sessions</span>
        <span class="card-value">${d.sessions.yesterday} · ${d.sessions.pageViews} page views</span>
      </div>
      <div class="card-row">
        <span class="card-label">Bookings created</span>
        <span class="card-value">${d.bookings.newYesterday} ${deltaBadge(d.bookings.delta)}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Bookings completed</span>
        <span class="card-value">${d.bookings.completedYesterday}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Reviews received</span>
        <span class="card-value">${d.reviews.count} ${d.reviews.avgRating > 0 ? `· ★ ${d.reviews.avgRating}` : ""}</span>
      </div>
    </div>

    <hr class="divider"/>

    <h3 style="color:#0F0F6E;font-size:15px;font-weight:700;margin:8px 0 12px;letter-spacing:0.3px;text-transform:uppercase;">💰 Revenue — platform fees earned</h3>
    ${revenueTable(d.revenue.byCurrency, {
      emptyMessage: "No payments were released yesterday.",
    })}
    ${revTotal > 0 ? `<p style="font-size:12px;color:#888;margin:8px 0;">Platform fees are per-currency — no cross-currency conversion applied.</p>` : ""}

    <hr class="divider"/>

    <h3 style="color:#0F0F6E;font-size:15px;font-weight:700;margin:8px 0 12px;letter-spacing:0.3px;text-transform:uppercase;">🔒 Currently held in escrow</h3>
    ${escrowTable(d.revenue.escrowByCurrency)}

    ${
      Object.keys(d.revenue.refundsByCurrency).length > 0
        ? `
      <hr class="divider"/>
      <h3 style="color:#0F0F6E;font-size:15px;font-weight:700;margin:8px 0 12px;letter-spacing:0.3px;text-transform:uppercase;">↩️ Refunds yesterday</h3>
      ${refundsTable(d.revenue.refundsByCurrency)}
    `
        : ""
    }

    <hr class="divider"/>

    <h3 style="color:#0F0F6E;font-size:15px;font-weight:700;margin:8px 0 12px;letter-spacing:0.3px;text-transform:uppercase;">⚠️ Needs your attention</h3>
    ${attentionList(d.attention)}

    <hr class="divider"/>

    <h3 style="color:#0F0F6E;font-size:15px;font-weight:700;margin:8px 0 12px;letter-spacing:0.3px;text-transform:uppercase;">🔥 Top categories (searches last 7d)</h3>
    ${categoriesTable(d.categories.top)}

    ${
      d.categories.supplyGaps.length > 0
        ? `
      <h3 style="color:#ea580c;font-size:15px;font-weight:700;margin:20px 0 12px;letter-spacing:0.3px;text-transform:uppercase;">💡 Supply gaps</h3>
      ${supplyGapsList(d.categories.supplyGaps)}
    `
        : ""
    }

    <hr class="divider"/>

    <h3 style="color:#0F0F6E;font-size:15px;font-weight:700;margin:8px 0 12px;letter-spacing:0.3px;text-transform:uppercase;">🎯 Funnel health (last 7d)</h3>
    <div class="card">
      <div class="card-row">
        <span class="card-label">Search → View</span>
        <span class="card-value">${d.funnel.searchToView}% <span style="color:#888;font-weight:400;font-size:12px;">(${d.funnel.searchCount} → ${d.funnel.viewCount})</span></span>
      </div>
      <div class="card-row">
        <span class="card-label">View → Book</span>
        <span class="card-value">${d.funnel.viewToBook}% <span style="color:#888;font-weight:400;font-size:12px;">(${d.funnel.viewCount} → ${d.funnel.bookingCount})</span></span>
      </div>
      <div class="card-row">
        <span class="card-label">Book → Pay</span>
        <span class="card-value">${d.funnel.bookToPay}% <span style="color:#888;font-weight:400;font-size:12px;">(${d.funnel.bookingCount} → ${d.funnel.paymentCount})</span></span>
      </div>
    </div>

    ${
      d.churnRisk > 0
        ? `
      <hr class="divider"/>
      <h3 style="color:#0F0F6E;font-size:15px;font-weight:700;margin:8px 0 12px;letter-spacing:0.3px;text-transform:uppercase;">👥 Churn risk</h3>
      <p style="font-size:14px;color:#555;">${d.churnRisk} user${d.churnRisk === 1 ? "" : "s"} previously active, silent for 30+ days. Consider a re-engagement campaign.</p>
    `
        : ""
    }

    <hr class="divider"/>

    <div style="text-align:center;margin:24px 0;">
      <a href="${process.env.CLIENT_URL || "https://skilledproz.com"}/admin/analytics" class="btn">Open Full Dashboard</a>
    </div>

    <p style="font-size:12px;color:#aaa;text-align:center;margin-top:20px;">
      This digest is generated automatically every day at 07:00 WAT.<br/>
      Generated at ${new Date(d.generatedAt).toLocaleString("en-GB")}.
    </p>
  `;

  return baseTemplate({
    title: `SkilledProz Daily Digest — ${d.windowLabel}`,
    preheader: `${d.users.newYesterday} new users · ${d.bookings.newYesterday} bookings · ${Object.keys(d.revenue.byCurrency).length} currencies active`,
    body,
  });
}
