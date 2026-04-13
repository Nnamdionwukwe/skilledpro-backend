// src/services/email.service.js
import nodemailer from "nodemailer";
// ── Transporter ───────────────────────────────────────────────────────────────
let transporter;

// function getTransporter() {
//   // Read env fresh every call until transporter is built with valid creds.
//   // This avoids the dotenv timing bug where this file is imported before
//   // dotenv has populated process.env.
//   const user = (process.env.SMTP_USER || "").trim();
//   const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

//   if (!transporter || !user || !pass) {
//     transporter = nodemailer.createTransport({
//       host: "smtp.gmail.com",
//       port: 587,
//       secure: false, // STARTTLS on port 587
//       family: 4, // Force IPv4 — prevents ENETUNREACH
//       auth: { user, pass },
//       tls: { rejectUnauthorized: false },
//     });
//   }
//   return transporter;
// }

// Replace your existing getTransporter() function in email.service.js with this one.
// Tries port 465 (SSL) first, falls back gracefully.

function getTransporter() {
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

  if (!transporter || !user || !pass) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465, // ← changed from 587 to 465
      secure: true, // ← changed from false to true (SSL, not STARTTLS)
      family: 4,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

// Add `sendJobApplicationEmail` to your `email.service.js` — it's called in `applyToJob`.

// Call this from server.js AFTER dotenv has loaded env vars
export function verifyEmailTransporter() {
  transporter = null; // force rebuild with now-loaded env vars
  getTransporter().verify((error) => {
    if (error) {
      console.error("Email transporter error:", error.message);
    } else {
      console.log("Email transporter ready");
    }
  });
}

// ── Base template wrapper ─────────────────────────────────────────────────────
function baseTemplate({ title, preheader, body }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; color: #333; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0f0f6e, #1a1a9e); padding: 32px 40px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
    .header span { color: #a0a8ff; font-size: 14px; }
    .body { padding: 40px; }
    .greeting { font-size: 18px; font-weight: 600; color: #0f0f6e; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.7; color: #555; margin-bottom: 16px; }
    .btn { display: inline-block; margin: 24px 0; padding: 14px 32px; background: #0f0f6e; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.3px; }
    .btn:hover { background: #1a1a9e; }
    .btn-success { background: #16a34a; }
    .btn-danger  { background: #dc2626; }
    .card { background: #f8f8ff; border: 1px solid #e0e0f0; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
    .card-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ececf8; font-size: 14px; }
    .card-row:last-child { border-bottom: none; }
    .card-label { color: #888; font-weight: 500; }
    .card-value { color: #222; font-weight: 600; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-green  { background: #dcfce7; color: #16a34a; }
    .badge-blue   { background: #dbeafe; color: #1d4ed8; }
    .badge-orange { background: #ffedd5; color: #ea580c; }
    .divider { border: none; border-top: 1px solid #ececf8; margin: 28px 0; }
    .otp { font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #0f0f6e; text-align: center; padding: 24px; background: #f0f0ff; border-radius: 8px; margin: 20px 0; }
    .warning { background: #fff7ed; border-left: 4px solid #ea580c; padding: 14px 18px; border-radius: 4px; font-size: 13px; color: #9a3412; margin: 16px 0; }
    .footer { background: #f8f8ff; padding: 24px 40px; text-align: center; }
    .footer p { font-size: 12px; color: #aaa; margin-bottom: 6px; }
    .footer a { color: #0f0f6e; text-decoration: none; }
    .social { margin: 12px 0; }
    .social a { display: inline-block; margin: 0 6px; color: #0f0f6e; font-size: 13px; font-weight: 600; text-decoration: none; }
  </style>
</head>
<body>
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <div class="wrapper">
    <div class="header">
      <h1>SkilledPro</h1>
      <span>Connecting skilled workers with the world</span>
    </div>
    <div class="body">
      ${body}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} SkilledPro. All rights reserved.</p>
      <p>You received this email because you have an account on SkilledPro.</p>
      <p><a href="${process.env.CLIENT_URL}/unsubscribe">Unsubscribe</a> · <a href="${process.env.CLIENT_URL}/privacy">Privacy Policy</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ── Core send function ────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  try {
    const info = await getTransporter().sendMail({
      from: `"SkilledPro" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
    });
    console.log(`📧 Email sent to ${to} — ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Email failed to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

// ── 1. Email verification ─────────────────────────────────────────────────────
export async function sendVerificationEmail({ to, firstName, token }) {
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

  const html = baseTemplate({
    title: "Verify your email — SkilledPro",
    preheader: "Click the link to verify your SkilledPro account",
    body: `
      <p class="greeting">Hi ${firstName} 👋</p>
      <p>Welcome to SkilledPro! You're one step away from connecting with skilled professionals around the world.</p>
      <p>Please verify your email address to activate your account:</p>
      <div style="text-align:center;">
        <a href="${verifyUrl}" class="btn">Verify My Email</a>
      </div>
      <p style="font-size:13px;color:#999;text-align:center;">Or copy this link into your browser:<br/>
        <span style="color:#0f0f6e;word-break:break-all;">${verifyUrl}</span>
      </p>
      <hr class="divider"/>
      <div class="warning">
        ⏰ This link expires in <strong>24 hours</strong>. If you didn't create a SkilledPro account, you can safely ignore this email.
      </div>
    `,
  });

  return sendEmail({ to, subject: "Verify your SkilledPro account", html });
}

// ── 2. Welcome email (after verification) ────────────────────────────────────
export async function sendWelcomeEmail({ to, firstName, role }) {
  const isWorker = role === "WORKER";

  const html = baseTemplate({
    title: "Welcome to SkilledPro!",
    preheader: `Your account is verified. Let's get started!`,
    body: `
      <p class="greeting">Welcome aboard, ${firstName}! 🎉</p>
      <p>Your email is verified and your SkilledPro account is active.</p>

      ${
        isWorker
          ? `
        <div class="card">
          <p style="font-weight:700;color:#0f0f6e;margin-bottom:12px;">As a Worker, here's what to do next:</p>
          <div class="card-row"><span class="card-label">1.</span><span class="card-value">Complete your profile and set your trade category</span></div>
          <div class="card-row"><span class="card-label">2.</span><span class="card-value">Set your hourly rate and service radius</span></div>
          <div class="card-row"><span class="card-label">3.</span><span class="card-value">Upload portfolio work and certifications</span></div>
          <div class="card-row"><span class="card-label">4.</span><span class="card-value">Get verified to unlock more booking requests</span></div>
        </div>
      `
          : `
        <div class="card">
          <p style="font-weight:700;color:#0f0f6e;margin-bottom:12px;">As a Hirer, here's what to do next:</p>
          <div class="card-row"><span class="card-label">1.</span><span class="card-value">Search for skilled workers near you</span></div>
          <div class="card-row"><span class="card-label">2.</span><span class="card-value">Browse profiles, reviews, and rates</span></div>
          <div class="card-row"><span class="card-label">3.</span><span class="card-value">Book a worker and pay securely with escrow</span></div>
          <div class="card-row"><span class="card-label">4.</span><span class="card-value">Leave a review after the job is done</span></div>
        </div>
      `
      }

      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/dashboard" class="btn">Go to Dashboard</a>
      </div>
    `,
  });

  return sendEmail({ to, subject: "Welcome to SkilledPro 🎉", html });
}

// ── 3. Password reset ─────────────────────────────────────────────────────────
export async function sendPasswordResetEmail({ to, firstName, token }) {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;

  const html = baseTemplate({
    title: "Reset your password — SkilledPro",
    preheader: "We received a request to reset your password",
    body: `
      <p class="greeting">Hi ${firstName},</p>
      <p>We received a request to reset the password on your SkilledPro account.</p>
      <p>Click the button below to choose a new password:</p>
      <div style="text-align:center;">
        <a href="${resetUrl}" class="btn">Reset My Password</a>
      </div>
      <hr class="divider"/>
      <div class="warning">
        ⏰ This link expires in <strong>1 hour</strong>. If you did not request a password reset, please ignore this email — your password will remain unchanged.
      </div>
    `,
  });

  return sendEmail({ to, subject: "Reset your SkilledPro password", html });
}

// ── 4. Booking request (worker notified) ─────────────────────────────────────
export async function sendBookingRequestEmail({
  to,
  workerName,
  hirerName,
  booking,
}) {
  const html = baseTemplate({
    title: "New booking request — SkilledPro",
    preheader: `${hirerName} wants to book you for a job`,
    body: `
      <p class="greeting">Hi ${workerName},</p>
      <p>You have a new booking request from <strong>${hirerName}</strong>.</p>

      <div class="card">
        <div class="card-row">
          <span class="card-label">Job Title</span>
          <span class="card-value">${booking.title}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Category</span>
          <span class="card-value">${booking.category}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Scheduled</span>
          <span class="card-value">${new Date(booking.scheduledAt).toLocaleString()}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Location</span>
          <span class="card-value">${booking.address}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Agreed Rate</span>
          <span class="card-value">${booking.currency} ${booking.agreedRate}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Status</span>
          <span class="badge badge-orange">Pending</span>
        </div>
      </div>

      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/bookings/${booking.id}" class="btn">View & Respond</a>
      </div>

      <div class="warning">
        ⏰ Respond within <strong>24 hours</strong> to maintain your response rate.
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `New booking request from ${hirerName}`,
    html,
  });
}

// ── 5. Booking confirmed (hirer notified) ─────────────────────────────────────
export async function sendBookingConfirmedEmail({
  to,
  hirerName,
  workerName,
  booking,
}) {
  const html = baseTemplate({
    title: "Booking confirmed — SkilledPro",
    preheader: `${workerName} has accepted your booking request`,
    body: `
      <p class="greeting">Great news, ${hirerName}! 🎉</p>
      <p><strong>${workerName}</strong> has accepted your booking request. Your job is confirmed.</p>

      <div class="card">
        <div class="card-row">
          <span class="card-label">Job Title</span>
          <span class="card-value">${booking.title}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Worker</span>
          <span class="card-value">${workerName}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Scheduled</span>
          <span class="card-value">${new Date(booking.scheduledAt).toLocaleString()}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Location</span>
          <span class="card-value">${booking.address}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Amount</span>
          <span class="card-value">${booking.currency} ${booking.agreedRate}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Status</span>
          <span class="badge badge-green">Confirmed</span>
        </div>
      </div>

      <p>Please complete payment to secure your booking. Funds are held in escrow until the job is done.</p>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/bookings/${booking.id}/pay" class="btn btn-success">Pay Now</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `Booking confirmed — ${booking.title}`,
    html,
  });
}

// ── 6. Payment receipt ────────────────────────────────────────────────────────
export async function sendPaymentReceiptEmail({ to, name, payment, booking }) {
  const html = baseTemplate({
    title: "Payment receipt — SkilledPro",
    preheader: `Your payment of ${payment.currency} ${payment.amount} is held securely in escrow`,
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>Your payment has been received and is held securely in escrow. It will be released to the worker once the job is completed and you confirm it.</p>

      <div class="card">
        <div class="card-row">
          <span class="card-label">Booking</span>
          <span class="card-value">${booking.title}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Total Paid</span>
          <span class="card-value">${payment.currency} ${payment.amount}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Platform Fee</span>
          <span class="card-value">${payment.currency} ${payment.platformFee}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Worker Payout</span>
          <span class="card-value">${payment.currency} ${payment.workerPayout}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Payment Provider</span>
          <span class="card-value">${payment.provider}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Reference</span>
          <span class="card-value" style="font-size:12px;">${payment.providerRef}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Status</span>
          <span class="badge badge-blue">In Escrow</span>
        </div>
      </div>

      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/bookings/${booking.id}" class="btn">View Booking</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `Payment receipt — ${payment.currency} ${payment.amount}`,
    html,
  });
}

// ── 7. Job completed — release prompt ────────────────────────────────────────
export async function sendJobCompletedEmail({
  to,
  hirerName,
  workerName,
  booking,
}) {
  const html = baseTemplate({
    title: "Job completed — release payment?",
    preheader: `${workerName} has marked the job as complete`,
    body: `
      <p class="greeting">Hi ${hirerName},</p>
      <p><strong>${workerName}</strong> has marked your job as complete.</p>
      <p>If you're satisfied with the work, please release the payment from escrow. You can also leave a review.</p>

      <div class="card">
        <div class="card-row">
          <span class="card-label">Job</span>
          <span class="card-value">${booking.title}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Worker</span>
          <span class="card-value">${workerName}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Completed</span>
          <span class="card-value">${new Date().toLocaleString()}</span>
        </div>
      </div>

      <div style="text-align:center;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
        <a href="${process.env.CLIENT_URL}/bookings/${booking.id}/release" class="btn btn-success">Release Payment</a>
        <a href="${process.env.CLIENT_URL}/bookings/${booking.id}/dispute" class="btn btn-danger">Raise Dispute</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `Job complete — release payment to ${workerName}?`,
    html,
  });
}

// ── 8. Payment released (worker notified) ─────────────────────────────────────
export async function sendPaymentReleasedEmail({
  to,
  workerName,
  payment,
  booking,
}) {
  const html = baseTemplate({
    title: "Payment released — SkilledPro",
    preheader: `${payment.currency} ${payment.workerPayout} has been released to you`,
    body: `
      <p class="greeting">Hi ${workerName},</p>
      <p>Great news! The hirer has confirmed the job is complete and your payment has been released.</p>

      <div class="card">
        <div class="card-row">
          <span class="card-label">Job</span>
          <span class="card-value">${booking.title}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Your Payout</span>
          <span class="card-value" style="color:#16a34a;font-size:18px;">${payment.currency} ${payment.workerPayout}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Released</span>
          <span class="card-value">${new Date().toLocaleString()}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Status</span>
          <span class="badge badge-green">Released</span>
        </div>
      </div>

      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/dashboard/earnings" class="btn">View Earnings</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `Payment of ${payment.currency} ${payment.workerPayout} released!`,
    html,
  });
}

// ── 9. Booking cancelled ──────────────────────────────────────────────────────
export async function sendBookingCancelledEmail({ to, name, booking, reason }) {
  const html = baseTemplate({
    title: "Booking cancelled — SkilledPro",
    preheader: `Your booking for ${booking.title} has been cancelled`,
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>Your booking has been cancelled.</p>

      <div class="card">
        <div class="card-row">
          <span class="card-label">Job</span>
          <span class="card-value">${booking.title}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Scheduled Date</span>
          <span class="card-value">${new Date(booking.scheduledAt).toLocaleString()}</span>
        </div>
        ${
          reason
            ? `
        <div class="card-row">
          <span class="card-label">Reason</span>
          <span class="card-value">${reason}</span>
        </div>`
            : ""
        }
      </div>

      <p>If a payment was made, a refund has been initiated and will appear within 3–5 business days.</p>

      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/search" class="btn">Find Another Worker</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `Booking cancelled — ${booking.title}`,
    html,
  });
}

// ── 10. Review request ────────────────────────────────────────────────────────
export async function sendReviewRequestEmail({
  to,
  name,
  otherPartyName,
  booking,
}) {
  const html = baseTemplate({
    title: "Leave a review — SkilledPro",
    preheader: `How was your experience with ${otherPartyName}?`,
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>Your job <strong>${booking.title}</strong> is complete. How was your experience with <strong>${otherPartyName}</strong>?</p>
      <p>Reviews help build trust in the SkilledPro community. It only takes 30 seconds.</p>

      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/bookings/${booking.id}/review" class="btn">Leave a Review</a>
      </div>

      <p style="font-size:13px;color:#aaa;text-align:center;margin-top:20px;">Reviews can be submitted up to 14 days after job completion.</p>
    `,
  });

  return sendEmail({
    to,
    subject: `How was ${otherPartyName}? Leave a review`,
    html,
  });
}

// ── 11. Job application notification (hirer notified) ────────────────────────
export async function sendJobApplicationEmail({
  to,
  hirerName,
  workerName,
  workerTitle,
  workerRating,
  jobTitle,
  jobId,
  applicationId,
  message,
}) {
  const html = baseTemplate({
    title: "New job application — SkilledPro",
    preheader: `${workerName} has applied for your job: ${jobTitle}`,
    body: `
      <p class="greeting">Hi ${hirerName},</p>
      <p>You have a new application for your job posting.</p>
      <div class="card">
        <div class="card-row">
          <span class="card-label">Job</span>
          <span class="card-value">${jobTitle}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Applicant</span>
          <span class="card-value">${workerName}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Trade / Title</span>
          <span class="card-value">${workerTitle || "—"}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Rating</span>
          <span class="card-value">${workerRating > 0 ? `★ ${Number(workerRating).toFixed(1)}` : "New worker"}</span>
        </div>
        ${
          message
            ? `<div class="card-row">
          <span class="card-label">Message</span>
          <span class="card-value" style="font-style:italic;">"${message}"</span>
        </div>`
            : ""
        }
      </div>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/jobs/${jobId}/applications/${applicationId}" class="btn">
          Review Application
        </a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `New application for "${jobTitle}" from ${workerName}`,
    html,
  });
}

// ── 12. New message notification ──────────────────────────────────────────────
export async function sendNewMessageEmail({
  to,
  recipientName,
  senderName,
  preview,
  conversationId,
}) {
  const html = baseTemplate({
    title: "New message — SkilledPro",
    preheader: `${senderName} sent you a message`,
    body: `
      <p class="greeting">Hi ${recipientName},</p>
      <p>You have a new message from <strong>${senderName}</strong>.</p>
      ${
        preview
          ? `
      <div class="card" style="border-left:4px solid #0f0f6e;">
        <p style="font-style:italic;color:#555;margin:0;">"${preview.slice(0, 120)}${preview.length > 120 ? "…" : ""}"</p>
      </div>`
          : ""
      }
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/messages" class="btn">Reply Now</a>
      </div>
      <p style="font-size:12px;color:#aaa;text-align:center;margin-top:16px;">You can manage message notifications in your account settings.</p>
    `,
  });
  return sendEmail({ to, subject: `New message from ${senderName}`, html });
}

// ── 13. Profile viewed ────────────────────────────────────────────────────────
export async function sendProfileViewedEmail({
  to,
  ownerName,
  viewerName,
  viewerRole,
  profileUrl,
}) {
  const html = baseTemplate({
    title: "Someone viewed your profile — SkilledPro",
    preheader: `${viewerName} viewed your SkilledPro profile`,
    body: `
      <p class="greeting">Hi ${ownerName},</p>
      <p>Your profile was just viewed by <strong>${viewerName}</strong> — a ${viewerRole?.toLowerCase() || "user"} on SkilledPro.</p>
      <p>This could be a potential opportunity! Make sure your profile is complete and up to date to maximise your chances.</p>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/settings" class="btn">Update Profile</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `👀 ${viewerName} viewed your profile`,
    html,
  });
}

// ── 14. New device / login alert ──────────────────────────────────────────────
export async function sendLoginAlertEmail({
  to,
  name,
  ip,
  device,
  time,
  location,
}) {
  const html = baseTemplate({
    title: "New login detected — SkilledPro",
    preheader: "A new login to your account was detected",
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>We detected a new login to your SkilledPro account. Here are the details:</p>
      <div class="card">
        <div class="card-row">
          <span class="card-label">Time</span>
          <span class="card-value">${time || new Date().toLocaleString()}</span>
        </div>
        ${ip ? `<div class="card-row"><span class="card-label">IP Address</span><span class="card-value">${ip}</span></div>` : ""}
        ${device ? `<div class="card-row"><span class="card-label">Device</span><span class="card-value">${device}</span></div>` : ""}
        ${location ? `<div class="card-row"><span class="card-label">Location</span><span class="card-value">${location}</span></div>` : ""}
      </div>
      <div class="warning">
        ⚠️ If this wasn't you, <strong>change your password immediately</strong> and contact our support team.
      </div>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/settings?tab=security" class="btn btn-danger">Secure My Account</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: "🔐 New login to your SkilledPro account",
    html,
  });
}

// ── 15. Application accepted (worker notified) ────────────────────────────────
export async function sendApplicationAcceptedEmail({
  to,
  workerName,
  hirerName,
  jobTitle,
  jobId,
  workerId,
}) {
  const html = baseTemplate({
    title: "Application accepted! — SkilledPro",
    preheader: `Your application for "${jobTitle}" has been accepted`,
    body: `
      <p class="greeting">Congratulations, ${workerName}! 🎉</p>
      <p><strong>${hirerName}</strong> has accepted your application for <strong>"${jobTitle}"</strong>.</p>
      <p>The hirer may now create a booking with you. Make sure your profile is complete so they can proceed quickly.</p>
      <div class="card">
        <div class="card-row"><span class="card-label">Job</span><span class="card-value">${jobTitle}</span></div>
        <div class="card-row"><span class="card-label">Hirer</span><span class="card-value">${hirerName}</span></div>
        <div class="card-row"><span class="card-label">Status</span><span class="badge badge-green">Accepted</span></div>
      </div>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/jobs/${jobId}" class="btn btn-success">View Job</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `🎉 Application accepted — ${jobTitle}`,
    html,
  });
}

// ── 16. Application rejected (worker notified) ────────────────────────────────
export async function sendApplicationRejectedEmail({
  to,
  workerName,
  jobTitle,
  jobId,
}) {
  const html = baseTemplate({
    title: "Application update — SkilledPro",
    preheader: `Your application for "${jobTitle}"`,
    body: `
      <p class="greeting">Hi ${workerName},</p>
      <p>Thank you for applying to <strong>"${jobTitle}"</strong>. Unfortunately the hirer has chosen to move forward with another applicant this time.</p>
      <p>Don't be discouraged — there are many more jobs available on the platform.</p>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/jobs" class="btn">Browse More Jobs</a>
      </div>
    `,
  });
  return sendEmail({ to, subject: `Application update — ${jobTitle}`, html });
}

// ── 17. Dispute raised ────────────────────────────────────────────────────────
export async function sendDisputeRaisedEmail({
  to,
  name,
  raisedBy,
  bookingTitle,
  bookingId,
  reason,
}) {
  const html = baseTemplate({
    title: "Dispute raised — SkilledPro",
    preheader: `A dispute has been raised on booking "${bookingTitle}"`,
    body: `
      <p class="greeting">Hi ${name},</p>
      <p><strong>${raisedBy}</strong> has raised a dispute on the booking <strong>"${bookingTitle}"</strong>.</p>
      ${reason ? `<div class="card"><div class="card-row"><span class="card-label">Reason</span><span class="card-value">${reason}</span></div></div>` : ""}
      <p>Our support team will review the dispute within <strong>24–48 hours</strong>. Both parties will be contacted. In the meantime, payment remains in escrow.</p>
      <div class="warning">
        📋 Please avoid any actions on this booking until the dispute is resolved.
      </div>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/bookings/${bookingId}" class="btn">View Booking</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `⚠️ Dispute raised — ${bookingTitle}`,
    html,
  });
}

// ── 18. Dispute resolved ──────────────────────────────────────────────────────
export async function sendDisputeResolvedEmail({
  to,
  name,
  bookingTitle,
  bookingId,
  resolution,
}) {
  const html = baseTemplate({
    title: "Dispute resolved — SkilledPro",
    preheader: `The dispute on "${bookingTitle}" has been resolved`,
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>The dispute on booking <strong>"${bookingTitle}"</strong> has been resolved by our support team.</p>
      ${resolution ? `<div class="card"><div class="card-row"><span class="card-label">Resolution</span><span class="card-value">${resolution}</span></div></div>` : ""}
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/bookings/${bookingId}" class="btn">View Booking</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `✅ Dispute resolved — ${bookingTitle}`,
    html,
  });
}

// ── 19. Payment refund ────────────────────────────────────────────────────────
export async function sendRefundEmail({
  to,
  name,
  amount,
  currency,
  bookingTitle,
  bookingId,
}) {
  const html = baseTemplate({
    title: "Refund processed — SkilledPro",
    preheader: `Your refund of ${currency} ${amount} is on its way`,
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>A refund of <strong>${currency} ${Number(amount).toLocaleString()}</strong> has been processed for the booking <strong>"${bookingTitle}"</strong>.</p>
      <div class="card">
        <div class="card-row"><span class="card-label">Amount</span><span class="card-value" style="color:#16a34a;">${currency} ${Number(amount).toLocaleString()}</span></div>
        <div class="card-row"><span class="card-label">Booking</span><span class="card-value">${bookingTitle}</span></div>
        <div class="card-row"><span class="card-label">ETA</span><span class="card-value">3–5 business days</span></div>
      </div>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/bookings/${bookingId}" class="btn">View Booking</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `Refund of ${currency} ${amount} processed`,
    html,
  });
}

// ── 20. Withdrawal status ─────────────────────────────────────────────────────
export async function sendWithdrawalEmail({
  to,
  workerName,
  amount,
  currency,
  status,
  method,
  reference,
}) {
  const isSuccess = status === "COMPLETED";
  const html = baseTemplate({
    title: `Withdrawal ${isSuccess ? "successful" : "update"} — SkilledPro`,
    preheader: `Your withdrawal of ${currency} ${amount} is ${status.toLowerCase()}`,
    body: `
      <p class="greeting">Hi ${workerName},</p>
      <p>Your withdrawal request has been <strong>${status.toLowerCase()}</strong>.</p>
      <div class="card">
        <div class="card-row"><span class="card-label">Amount</span><span class="card-value">${currency} ${Number(amount).toLocaleString()}</span></div>
        <div class="card-row"><span class="card-label">Method</span><span class="card-value">${method}</span></div>
        <div class="card-row"><span class="card-label">Reference</span><span class="card-value" style="font-size:12px;">${reference}</span></div>
        <div class="card-row"><span class="card-label">Status</span>
          <span class="badge ${isSuccess ? "badge-green" : "badge-orange"}">${status}</span>
        </div>
      </div>
      ${!isSuccess ? '<div class="warning">⚠️ If your withdrawal failed, your balance has been restored. Please contact support if you need help.</div>' : ""}
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/dashboard/earnings" class="btn">View Earnings</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `Withdrawal ${status.toLowerCase()} — ${currency} ${amount}`,
    html,
  });
}

// ── 21. Verification status changed (worker) ──────────────────────────────────
export async function sendVerificationStatusEmail({
  to,
  workerName,
  status,
  reason,
}) {
  const isApproved = status === "VERIFIED";
  const html = baseTemplate({
    title: `Verification ${isApproved ? "approved" : "update"} — SkilledPro`,
    preheader: `Your SkilledPro verification status: ${status}`,
    body: `
      <p class="greeting">Hi ${workerName},</p>
      ${
        isApproved
          ? `<p>🎉 Congratulations! Your profile has been <strong>verified</strong>. You'll now appear with a verified badge, helping you get more bookings.</p>`
          : `<p>Your verification application has been <strong>${status.toLowerCase()}</strong>.</p>
           ${reason ? `<div class="card"><div class="card-row"><span class="card-label">Reason</span><span class="card-value">${reason}</span></div></div>` : ""}
           <p>You can update your documents and reapply from your dashboard.</p>`
      }
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/settings?tab=security" class="btn ${isApproved ? "btn-success" : ""}">
          ${isApproved ? "View Profile" : "Reapply"}
        </a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `Verification ${isApproved ? "approved ✅" : `update — ${status}`}`,
    html,
  });
}

// ── 22. Password changed confirmation ─────────────────────────────────────────
export async function sendPasswordChangedEmail({ to, name }) {
  const html = baseTemplate({
    title: "Password changed — SkilledPro",
    preheader: "Your SkilledPro password was successfully changed",
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>Your SkilledPro password was successfully changed.</p>
      <div class="warning">
        ⚠️ If you did not make this change, your account may be compromised. Please <strong>reset your password immediately</strong> and contact support.
      </div>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/forgot-password" class="btn btn-danger">Reset Password</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: "Your SkilledPro password was changed",
    html,
  });
}

// ── 23. SOS alert (to hirer + admins) ────────────────────────────────────────
export async function sendSOSAlertEmail({
  to,
  recipientName,
  workerName,
  bookingTitle,
  bookingId,
  lat,
  lng,
}) {
  const mapsLink =
    lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  const html = baseTemplate({
    title: "🚨 SOS Alert — SkilledPro",
    preheader: `Emergency alert from ${workerName}`,
    body: `
      <p class="greeting" style="color:#dc2626;">🚨 Emergency Alert</p>
      <p>Hi ${recipientName},</p>
      <p><strong>${workerName}</strong> has activated an SOS emergency alert on booking <strong>"${bookingTitle}"</strong>.</p>
      <div class="card" style="border-left:4px solid #dc2626;">
        <div class="card-row"><span class="card-label">Worker</span><span class="card-value">${workerName}</span></div>
        <div class="card-row"><span class="card-label">Booking</span><span class="card-value">${bookingTitle}</span></div>
        <div class="card-row"><span class="card-label">Time</span><span class="card-value">${new Date().toLocaleString()}</span></div>
        ${mapsLink ? `<div class="card-row"><span class="card-label">Location</span><span class="card-value"><a href="${mapsLink}" style="color:#0f0f6e;">View on Google Maps →</a></span></div>` : ""}
      </div>
      <div class="warning" style="background:#fef2f2;border-left-color:#dc2626;color:#991b1b;">
        Please check in with the worker or contact emergency services immediately if needed.
      </div>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/bookings/${bookingId}" class="btn btn-danger">View Booking</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `🚨 SOS Alert — ${workerName} needs help`,
    html,
  });
}

// ── 24. New job posted matching worker category ───────────────────────────────
export async function sendNewJobMatchEmail({
  to,
  workerName,
  jobTitle,
  jobId,
  categoryName,
  budget,
  currency,
  address,
}) {
  const html = baseTemplate({
    title: "New job matching your skills — SkilledPro",
    preheader: `A new ${categoryName} job was just posted`,
    body: `
      <p class="greeting">Hi ${workerName},</p>
      <p>A new job matching your skills has been posted on SkilledPro.</p>
      <div class="card">
        <div class="card-row"><span class="card-label">Job Title</span><span class="card-value">${jobTitle}</span></div>
        <div class="card-row"><span class="card-label">Category</span><span class="card-value">${categoryName}</span></div>
        <div class="card-row"><span class="card-label">Budget</span><span class="card-value">${currency} ${Number(budget).toLocaleString()}</span></div>
        <div class="card-row"><span class="card-label">Location</span><span class="card-value">${address}</span></div>
      </div>
      <div style="text-align:center;">
        <a href="${process.env.CLIENT_URL}/jobs/${jobId}" class="btn">Apply Now →</a>
      </div>
      <p style="font-size:12px;color:#aaa;text-align:center;margin-top:16px;">You received this because your profile matches this job category. Manage job alerts in settings.</p>
    `,
  });
  return sendEmail({
    to,
    subject: `New ${categoryName} job posted — Apply now`,
    html,
  });
}
