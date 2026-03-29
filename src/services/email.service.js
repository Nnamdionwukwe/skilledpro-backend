// src/services/email.service.js
import nodemailer from "nodemailer";
// ── Transporter ───────────────────────────────────────────────────────────────
let transporter;

function getTransporter() {
  // Read env fresh every call until transporter is built with valid creds.
  // This avoids the dotenv timing bug where this file is imported before
  // dotenv has populated process.env.
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

  if (!transporter || !user || !pass) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS on port 587
      family: 4, // Force IPv4 — prevents ENETUNREACH
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
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
