// src/controllers/invoice.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/invoice/:bookingId
//
// Generates a professional, modern PDF invoice with full booking details,
// payment breakdown, and discounts. Accessible to hirer, worker, and admin.
// ─────────────────────────────────────────────────────────────────────────────
import PDFDocument from "pdfkit";
import prisma from "../config/database.js";

// ── Brand constants ───────────────────────────────────────────────────────────
const BRAND = {
  name: "SkilledProz",
  tagline: "Nigeria's Trusted Skills Marketplace",
  email: "support@skilledproz.com",
  website: "www.skilledproz.com",
  phone: "+234 800 000 0000",
  color: "#1A1A2E", // dark navy
  accent: "#E94560", // red accent
  secondary: "#F5F5FA", // light grey
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function currency(amount, currency = "NGN") {
  const symbol = currency === "NGN" ? "₦" : currency === "USD" ? "$" : "₦";
  return `${symbol}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function invoiceNumber(payment) {
  const date = new Date(payment.createdAt)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  const ref = (payment.providerRef || payment.id || "").slice(-4).toUpperCase();
  return `SP-INV-${date}-${ref}`;
}

function formatDuration(booking) {
  const unit = booking.estimatedUnit || "hours";
  const value = booking.estimatedValue;
  const hours = booking.estimatedHours;

  if (value && unit !== "custom") {
    const unitLabel =
      {
        hours: "hour",
        days: "day",
        weeks: "week",
        months: "month",
        years: "year",
      }[unit] || unit;
    const num = parseFloat(value);
    const label = unitLabel + (num !== 1 ? "s" : "");
    const eqv = unit !== "hours" && hours ? `≈ ${hours}h` : null;
    return { main: `${num} ${label}`, sub: eqv };
  }
  if (hours) return { main: `${hours} hours`, sub: null };
  return null;
}

function jobTypeLabel(type) {
  if (!type) return "—";
  return type
    .toLowerCase()
    .replace("_", " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────
export const getPaymentInvoice = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const requesterId = req.user.id;
    const isAdmin = req.user.role === "ADMIN";

    // ── Fetch booking + payment ───────────────────────────────────────────────
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        hirer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            city: true,
            country: true,
          },
        },
        worker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            city: true,
            country: true,
          },
        },
        category: { select: { name: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!booking) {
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    }

    // Allow hirer, worker, or admin
    if (
      !isAdmin &&
      booking.hirerId !== requesterId &&
      booking.workerId !== requesterId
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied — you are not the hirer or worker of this booking",
      });
    }

    const payment = booking.payments?.[0];
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "No payment found for this booking" });
    }

    // ── Build PDF ─────────────────────────────────────────────────────────────
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const invNum = invoiceNumber(payment);
    const filename = `${invNum}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const W = doc.page.width - 100;
    const LEFT = 50;
    const RIGHT = doc.page.width - 50;

    // ── HEADER ────────────────────────────────────────────────────────────────
    // Brand background
    doc.rect(0, 0, doc.page.width, 90).fill(BRAND.color);
    doc
      .fillColor("#ffffff")
      .fontSize(28)
      .font("Helvetica-Bold")
      .text(BRAND.name, LEFT, 28);
    doc.fontSize(11).font("Helvetica").text(BRAND.tagline, LEFT, 62);

    // Invoice label & number
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("INVOICE", RIGHT, 28, { align: "right" });
    doc
      .fontSize(11)
      .font("Helvetica")
      .text(invNum, RIGHT, 56, { align: "right" });

    doc.fillColor(BRAND.color);

    // ── METADATA (date, status, method) ──────────────────────────────────────
    let y = 110;
    const statusColor =
      payment.status === "RELEASED"
        ? "#16a34a"
        : payment.status === "HELD"
          ? "#d97706"
          : payment.status === "REFUNDED"
            ? "#dc2626"
            : "#374151";

    doc
      .fontSize(9)
      .fillColor("#6b7280")
      .font("Helvetica")
      .text("Date Issued", LEFT, y)
      .text("Status", LEFT + 130, y)
      .text("Payment Method", LEFT + 260, y)
      .text("Reference", LEFT + 390, y);
    y += 14;
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(BRAND.color)
      .text(
        `${fmtDate(payment.createdAt)} at ${fmtTime(payment.createdAt)}`,
        LEFT,
        y,
      )
      .fillColor(statusColor)
      .text(payment.status, LEFT + 130, y)
      .fillColor(BRAND.color)
      .text((payment.provider || "Paystack").toUpperCase(), LEFT + 260, y)
      .text((payment.providerRef || "—").slice(0, 20), LEFT + 390, y);

    // ── DIVIDER ───────────────────────────────────────────────────────────────
    y += 26;
    doc
      .moveTo(LEFT, y)
      .lineTo(RIGHT, y)
      .strokeColor("#e5e7eb")
      .lineWidth(1)
      .stroke();

    // ── PARTIES ───────────────────────────────────────────────────────────────
    y += 18;
    const COL2 = LEFT + W / 2 + 10;

    doc
      .fontSize(9)
      .fillColor("#9ca3af")
      .font("Helvetica")
      .text("BILL TO (CLIENT)", LEFT, y)
      .text("SERVICE PROVIDER", COL2, y);

    y += 14;
    const hirer = booking.hirer;
    const worker = booking.worker;

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(BRAND.color)
      .text(`${hirer.firstName} ${hirer.lastName}`, LEFT, y)
      .text(`${worker.firstName} ${worker.lastName}`, COL2, y);

    y += 16;
    doc.fontSize(9).font("Helvetica").fillColor("#4b5563");
    [
      [hirer.email, worker.email],
      [hirer.phone || "—", worker.phone || "—"],
      [
        `${hirer.city || ""} ${hirer.country || ""}`.trim() || "—",
        `${worker.city || ""} ${worker.country || ""}`.trim() || "—",
      ],
    ].forEach(([left, right]) => {
      doc.text(left, LEFT, y).text(right, COL2, y);
      y += 13;
    });

    // ── DIVIDER ───────────────────────────────────────────────────────────────
    y += 8;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor("#e5e7eb").stroke();

    // ── BOOKING DETAILS ──────────────────────────────────────────────────────
    y += 18;
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(BRAND.color)
      .text("Booking Details", LEFT, y);

    y += 18;
    const dur = formatDuration(booking);
    const details = [
      { label: "Service", value: booking.title || "—" },
      { label: "Category", value: booking.category?.name || "—" },
      {
        label: "Duration",
        value: dur ? `${dur.main}${dur.sub ? ` (${dur.sub})` : ""}` : "—",
      },
      { label: "Job Type", value: jobTypeLabel(booking.jobType) },
      {
        label: "Location Type",
        value: booking.locationType
          ? booking.locationType.replace("_", " ").toUpperCase()
          : "—",
      },
    ];
    if (booking.isNegotiated && booking.negotiatedRate) {
      details.push({
        label: "Negotiated Rate",
        value: currency(booking.negotiatedRate, booking.currency || "NGN"),
      });
    }

    // Two columns for details
    const col1 = LEFT;
    const col2 = LEFT + 250;
    const colWidth = 200;
    const detailRowHeight = 18;

    details.forEach((d, i) => {
      const x = i < 3 ? col1 : col2;
      const row = i % 3;
      const yPos = y + row * detailRowHeight;
      if (i === 3) y = yPos; // reset y after first column
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#6b7280")
        .text(`${d.label}:`, x, yPos)
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .text(d.value, x + 85, yPos, { width: colWidth - 85 });
    });
    y += 4 * detailRowHeight;

    // ── DIVIDER ───────────────────────────────────────────────────────────────
    y += 10;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor("#e5e7eb").stroke();

    // ── SERVICE SUMMARY TABLE ──────────────────────────────────────────────
    y += 18;
    // Compute breakdown
    const rate = booking.agreedRate || 0;
    const unit = booking.estimatedUnit || "hours";
    const hours = booking.estimatedHours;
    const value = booking.estimatedValue
      ? parseFloat(booking.estimatedValue)
      : null;
    let qty = 1;
    if (value && unit !== "custom") qty = value;
    else if (hours) {
      if (unit === "hours") qty = hours;
      else if (unit === "days") qty = Math.round(hours / 8);
      else if (unit === "weeks") qty = Math.round(hours / 40);
      else if (unit === "months") qty = Math.round(hours / 160);
    }

    const subtotal = parseFloat((rate * qty).toFixed(2));
    const platformFee = parseFloat((subtotal * 0.05).toFixed(2));
    const referralDeduct = payment.referralDeduct || 0;
    const totalCharged = parseFloat(
      (subtotal + platformFee - referralDeduct).toFixed(2),
    );

    // Table header
    doc.rect(LEFT, y, W, 24).fill(BRAND.secondary);
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(BRAND.color)
      .text("Description", LEFT + 8, y + 7)
      .text("Qty", LEFT + 280, y + 7, { width: 40, align: "center" })
      .text("Rate", LEFT + 320, y + 7, { width: 60, align: "right" })
      .text("Amount", RIGHT - 60, y + 7, { width: 60, align: "right" });

    y += 28;
    // Service row
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#111827")
      .text(booking.title || "Service booking", LEFT + 8, y, { width: 270 })
      .text(String(qty), LEFT + 280, y, { width: 40, align: "center" })
      .text(currency(rate, booking.currency), LEFT + 320, y, {
        width: 60,
        align: "right",
      })
      .text(currency(subtotal, booking.currency), RIGHT - 60, y, {
        width: 60,
        align: "right",
      });

    y += 28;

    // ── PAYMENT BREAKDOWN ────────────────────────────────────────────────────
    const breakY = y;
    const boxX = LEFT + W - 220;
    const boxW = 220;
    const boxH = 110;
    doc
      .rect(boxX, breakY, boxW, boxH)
      .fill(BRAND.secondary)
      .strokeColor("#e5e7eb")
      .lineWidth(1)
      .stroke();

    const rows = [
      {
        label: "Subtotal",
        value: currency(subtotal, booking.currency),
        bold: false,
      },
      {
        label: "Platform Fee (5%)",
        value: currency(platformFee, booking.currency),
        bold: false,
      },
    ];
    if (referralDeduct > 0) {
      rows.push({
        label: "Referral Discount",
        value: `- ${currency(referralDeduct, booking.currency)}`,
        bold: false,
        color: "#16a34a",
      });
    }
    rows.push({
      label: "Total Charged",
      value: currency(totalCharged, booking.currency),
      bold: true,
    });

    let innerY = breakY + 10;
    rows.forEach((row) => {
      doc
        .fontSize(9)
        .font(row.bold ? "Helvetica-Bold" : "Helvetica")
        .fillColor(row.color || (row.bold ? BRAND.color : "#4b5563"))
        .text(row.label, boxX + 10, innerY, { width: 120 })
        .text(row.value, boxX + 130, innerY, { width: 80, align: "right" });
      innerY += 18;
      if (row.bold) {
        doc
          .moveTo(boxX + 10, innerY - 2)
          .lineTo(boxX + boxW - 10, innerY - 2)
          .strokeColor(BRAND.accent)
          .lineWidth(1.5)
          .stroke();
      }
    });

    // Advance y past the box
    y = breakY + boxH + 20;

    // ── PAYMENT STATUS STAMP ────────────────────────────────────────────────
    if (payment.status === "RELEASED") {
      doc
        .save()
        .rotate(-30, { origin: [LEFT + 60, y - 20] })
        .rect(LEFT + 10, y - 35, 140, 36)
        .stroke("#16a34a")
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#16a34a")
        .text("PAID", LEFT + 36, y - 28)
        .restore();
    } else if (payment.status === "REFUNDED") {
      doc
        .save()
        .rotate(-30, { origin: [LEFT + 60, y - 20] })
        .rect(LEFT + 10, y - 35, 140, 36)
        .stroke("#dc2626")
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#dc2626")
        .text("REFUNDED", LEFT + 14, y - 28)
        .restore();
    }

    // ── FOOTER NOTES ────────────────────────────────────────────────────────
    y += 30;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor("#e5e7eb").stroke();
    y += 14;

    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(BRAND.color)
      .text("NOTES", LEFT, y);
    y += 14;
    doc
      .fontSize(8.5)
      .font("Helvetica")
      .fillColor("#6b7280")
      .text(
        "This invoice is system-generated and valid without a signature.\n" +
          "All payments are held in escrow and released only after job completion.\n" +
          `For queries, contact us at ${BRAND.email} quoting your invoice number.`,
        LEFT,
        y,
        { width: W },
      );

    // ── PAGE FOOTER ──────────────────────────────────────────────────────────
    const footerY = doc.page.height - 50;
    doc.rect(0, footerY - 10, doc.page.width, 60).fill(BRAND.color);
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#9ca3af")
      .text(
        `${BRAND.name}  ·  ${BRAND.email}  ·  ${BRAND.website}  ·  ${BRAND.phone}`,
        0,
        footerY,
        { align: "center", width: doc.page.width },
      );
    doc
      .fillColor("#ffffff")
      .text(
        `Invoice ${invNum}  ·  ${fmtDate(payment.createdAt)}`,
        0,
        footerY + 14,
        { align: "center", width: doc.page.width },
      );

    doc.end();
  } catch (err) {
    console.error("getPaymentInvoice:", err);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ success: false, message: "Failed to generate invoice" });
    }
  }
};
