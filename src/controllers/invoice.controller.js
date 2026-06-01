// src/controllers/invoice.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/invoice/:bookingId
//
// Generates and streams a professional PDF invoice.
// Accessible to:  the hirer who paid  +  any ADMIN
//
// Requires:  npm install pdfkit
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
  color: "#1A1A2E", // dark navy — change to your primary brand colour
  accent: "#E94560", // red accent
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function naira(amount) {
  return `₦${Number(amount || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function invoiceNumber(payment) {
  // e.g. SP-INV-20260530-A3F2
  const date = new Date(payment.createdAt)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  const ref = (payment.providerRef || payment.id || "").slice(-4).toUpperCase();
  return `SP-INV-${date}-${ref}`;
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

    if (!isAdmin && booking.hirerId !== requesterId) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Access denied — you are not the hirer of this booking",
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

    const W = doc.page.width - 100; // usable width
    const LEFT = 50;

    // ── PAGE HEADER ───────────────────────────────────────────────────────────
    // Brand name
    doc.rect(0, 0, doc.page.width, 80).fill(BRAND.color);
    doc
      .fillColor("#ffffff")
      .fontSize(24)
      .font("Helvetica-Bold")
      .text(BRAND.name, LEFT, 22);
    doc.fontSize(10).font("Helvetica").text(BRAND.tagline, LEFT, 50);

    // Invoice label on right
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("INVOICE", 0, 22, { align: "right" });
    doc.fontSize(10).font("Helvetica").text(invNum, 0, 50, { align: "right" });

    doc.fillColor(BRAND.color);

    // ── METADATA ROW ──────────────────────────────────────────────────────────
    let y = 100;
    doc
      .fontSize(9)
      .fillColor("#666666")
      .text("Date Issued", LEFT, y)
      .text("Status", LEFT + 130, y)
      .text("Payment Method", LEFT + 260, y)
      .text("Reference", LEFT + 390, y);

    y += 14;
    const statusColor =
      payment.status === "RELEASED"
        ? "#16a34a"
        : payment.status === "HELD"
          ? "#d97706"
          : payment.status === "REFUNDED"
            ? "#dc2626"
            : "#374151";

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(BRAND.color)
      .text(fmtDate(payment.createdAt), LEFT, y)
      .fillColor(statusColor)
      .text(payment.status, LEFT + 130, y)
      .fillColor(BRAND.color)
      .text((payment.provider || "paystack").toUpperCase(), LEFT + 260, y)
      .text((payment.providerRef || "—").slice(0, 20), LEFT + 390, y);

    doc.font("Helvetica");

    // ── DIVIDER ───────────────────────────────────────────────────────────────
    y += 26;
    doc
      .moveTo(LEFT, y)
      .lineTo(LEFT + W, y)
      .strokeColor("#e5e7eb")
      .lineWidth(1)
      .stroke();

    // ── PARTIES ───────────────────────────────────────────────────────────────
    y += 16;
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

    y += 15;
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
    y += 10;
    doc
      .moveTo(LEFT, y)
      .lineTo(LEFT + W, y)
      .strokeColor("#e5e7eb")
      .stroke();

    // ── SERVICE TABLE HEADER ──────────────────────────────────────────────────
    y += 16;
    doc.rect(LEFT, y, W, 24).fill("#f3f4f6");
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(BRAND.color)
      .text("SERVICE DESCRIPTION", LEFT + 8, y + 7)
      .text("CATEGORY", LEFT + 280, y + 7)
      .text("DATE", LEFT + 380, y + 7)
      .text("AMOUNT", LEFT + W - 60, y + 7, { align: "right", width: 60 });

    // ── SERVICE ROW ───────────────────────────────────────────────────────────
    y += 28;
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#111827")
      .text(booking.title || "Service booking", LEFT + 8, y, { width: 265 })
      .fontSize(9)
      .fillColor("#6b7280")
      .text(booking.category?.name || "General", LEFT + 280, y)
      .text(
        booking.scheduledAt
          ? fmtDate(booking.scheduledAt)
          : fmtDate(booking.createdAt),
        LEFT + 380,
        y,
      );

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(BRAND.color)
      .text(naira(payment.amount), LEFT, y, { align: "right", width: W - 8 });

    // ── TOTALS BOX ────────────────────────────────────────────────────────────
    y += 40;
    doc
      .moveTo(LEFT, y)
      .lineTo(LEFT + W, y)
      .strokeColor("#e5e7eb")
      .stroke();
    y += 12;

    const TOTAL_X = LEFT + W - 200;
    const TOTAL_LABEL = TOTAL_X;
    const TOTAL_VAL = TOTAL_X + 105;
    const ROW_H = 18;

    const rows = [
      {
        label: "Service amount",
        val: naira(
          payment.workerPayout || payment.amount - (payment.platformFee || 0),
        ),
        bold: false,
      },
      {
        label: "Platform fee",
        val: naira(payment.platformFee || 0),
        bold: false,
      },
      { label: "Total charged", val: naira(payment.amount), bold: true },
    ];

    rows.forEach(({ label, val, bold }) => {
      doc
        .fontSize(9)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fillColor(bold ? BRAND.color : "#4b5563")
        .text(label, TOTAL_LABEL, y)
        .text(val, TOTAL_VAL, y, { align: "right", width: 94 });
      if (bold) {
        doc
          .moveTo(TOTAL_LABEL, y + 14)
          .lineTo(TOTAL_LABEL + 189, y + 14)
          .strokeColor(BRAND.accent)
          .lineWidth(1.5)
          .stroke();
      }
      y += ROW_H;
    });

    // ── PAYMENT STATUS STAMP ──────────────────────────────────────────────────
    if (payment.status === "RELEASED") {
      doc
        .save()
        .rotate(-30, { origin: [LEFT + 80, y - 60] })
        .rect(LEFT + 10, y - 75, 140, 36)
        .stroke("#16a34a")
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#16a34a")
        .text("PAID", LEFT + 36, y - 68)
        .restore();
    } else if (payment.status === "REFUNDED") {
      doc
        .save()
        .rotate(-30, { origin: [LEFT + 80, y - 60] })
        .rect(LEFT + 10, y - 75, 140, 36)
        .stroke("#dc2626")
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#dc2626")
        .text("REFUNDED", LEFT + 14, y - 68)
        .restore();
    }

    // ── NOTES ─────────────────────────────────────────────────────────────────
    y += 20;
    doc
      .moveTo(LEFT, y)
      .lineTo(LEFT + W, y)
      .strokeColor("#e5e7eb")
      .stroke();
    y += 14;

    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(BRAND.color)
      .text("NOTES", LEFT, y);
    y += 12;
    doc
      .fontSize(8.5)
      .font("Helvetica")
      .fillColor("#6b7280")
      .text(
        "This invoice is system-generated and valid without a signature. " +
          "For queries please contact us at support@skilledproz.com quoting your invoice number.",
        LEFT,
        y,
        { width: W },
      );

    // ── PAGE FOOTER ───────────────────────────────────────────────────────────
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
