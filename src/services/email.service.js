import nodemailer from "nodemailer";
import { Resend } from "resend";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Load logo as base64 for email embedding ────────────────────────────────
let logoBase64 = null;
try {
  const logoPath = path.join(__dirname, "../../src/assets/skilledproz.JPG");
  if (fs.existsSync(logoPath)) {
    const imageBuffer = fs.readFileSync(logoPath);
    logoBase64 = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;
  }
} catch {
  console.warn("Logo not found at src/assets/skilledproz.JPG");
}

// ── Provider selection ───────────────────────────────────────────────────────
const useResend = !!process.env.RESEND_API_KEY;

let resend = null;
let transporter = null;

function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

function getTransporter() {
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

  if (!transporter || !user || !pass) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
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

export function verifyEmailTransporter() {
  if (useResend) {
    console.log("📧 Email provider: Resend");
    if (!process.env.EMAIL_FROM) {
      console.warn(
        "⚠️  EMAIL_FROM not set — Resend will reject sends. Set it to a verified domain.",
      );
    }
    return;
  }

  console.log("📧 Email provider: Gmail SMTP (local dev)");
  transporter = null;
  getTransporter().verify((error) => {
    if (error) {
      console.error("Email transporter error:", error.message);
    } else {
      console.log("Email transporter ready");
    }
  });
}

// ── Helper to build frontend URLs ──────────────────────────────────────────
const FRONTEND_URL = process.env.CLIENT_URL || "http://localhost:5173";
const CONTACT_EMAIL = "skilledprozmarketplace@gmail.com";

function buildUrl(path) {
  return `${FRONTEND_URL}${path}`;
}

// ── Icons as inline SVG ──────────────────────────────────────────────────────
const ICONS = {
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F0F6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  user: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F0F6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  briefcase: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F0F6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  globe: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F0F6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  handshake: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 11L12 6 7 11M12 6V18M12 18L7 13M12 18L17 13"/></svg>`,
};

// ── Base template wrapper ─────────────────────────────────────────────────────
function baseTemplate({ title, preheader, body }) {
  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" alt="SkilledProz" style="max-width:180px;height:auto;display:block;margin:0 auto;" />`
    : `<h1 style="color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;margin:0;">Skilled<span style="color:#F59E0B;">Proz</span></h1>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; 
      background: #f4f4f7; 
      color: #333; 
      -webkit-font-smoothing: antialiased;
    }
    .wrapper { 
      max-width: 600px; 
      margin: 20px auto; 
      background: #ffffff; 
      border-radius: 12px; 
      overflow: hidden; 
      box-shadow: 0 4px 20px rgba(0,0,0,0.08); 
    }
    .header { 
      background: linear-gradient(135deg, #0F0F6E, #1A1A6E); 
      padding: 32px 40px; 
      text-align: center; 
    }
    .header-logo { 
      max-width: 180px; 
      height: auto; 
      display: block; 
      margin: 0 auto; 
    }
    .header-sub { 
      color: #F59E0B; 
      font-size: 13px; 
      letter-spacing: 1px; 
      text-transform: uppercase; 
      margin-top: 6px; 
      display: block; 
    }
    .body { padding: 40px; }
    .greeting { font-size: 18px; font-weight: 600; color: #0F0F6E; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.7; color: #555; margin-bottom: 16px; }
    .btn { 
      display: inline-block; 
      margin: 24px 0; 
      padding: 14px 32px; 
      background: #0F0F6E; 
      color: #ffffff !important; 
      text-decoration: none; 
      border-radius: 8px; 
      font-size: 15px; 
      font-weight: 600; 
      letter-spacing: 0.3px; 
      border: none;
      cursor: pointer;
    }
    .btn:hover { background: #1A1A6E; }
    .btn-success { background: #16a34a; }
    .btn-success:hover { background: #15803d; }
    .btn-danger { background: #dc2626; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-outline { 
      background: transparent; 
      color: #0F0F6E !important; 
      border: 1px solid #0F0F6E; 
    }
    .btn-outline:hover { background: #f0f0ff; }
    .card { 
      background: #f8f8ff; 
      border: 1px solid #e0e0f0; 
      border-radius: 8px; 
      padding: 20px 24px; 
      margin: 20px 0; 
    }
    .card-row { 
      display: flex; 
      justify-content: space-between; 
      padding: 8px 0; 
      border-bottom: 1px solid #ececf8; 
      font-size: 14px; 
      align-items: center;
    }
    .card-row:last-child { border-bottom: none; }
    .card-label { color: #888; font-weight: 500; }
    .card-value { color: #222; font-weight: 600; }
    .badge { 
      display: inline-block; 
      padding: 4px 12px; 
      border-radius: 20px; 
      font-size: 12px; 
      font-weight: 700; 
      text-transform: uppercase; 
      letter-spacing: 0.5px; 
    }
    .badge-green { background: #dcfce7; color: #16a34a; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-orange { background: #ffedd5; color: #ea580c; }
    .badge-red { background: #fef2f2; color: #dc2626; }
    .badge-gold { background: #fef3c7; color: #d97706; }
    .divider { border: none; border-top: 1px solid #ececf8; margin: 28px 0; }
    .icon-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
    .icon-row svg { flex-shrink: 0; }
    .warning { 
      background: #fff7ed; 
      border-left: 4px solid #ea580c; 
      padding: 14px 18px; 
      border-radius: 4px; 
      font-size: 13px; 
      color: #9a3412; 
      margin: 16px 0; 
    }
    .warning-red { 
      background: #fef2f2; 
      border-left-color: #dc2626; 
      color: #991b1b; 
    }
    .footer { 
      background: #f8f8ff; 
      padding: 24px 40px; 
      text-align: center; 
      border-top: 1px solid #e0e0f0; 
    }
    .footer p { font-size: 12px; color: #aaa; margin-bottom: 4px; }
    .footer a { color: #0F0F6E; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    .role-tag {
      display: inline-block;
      background: #e0e7ff;
      color: #0F0F6E;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 10px;
      border-radius: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    @media only screen and (max-width: 480px) {
      .header { padding: 24px 20px; }
      .header-logo { max-width: 140px; }
      .body { padding: 24px 20px; }
      .body p { font-size: 14px; }
      .card { padding: 16px; }
      .card-row { flex-direction: column; gap: 4px; align-items: flex-start; }
      .card-value { text-align: left; }
      .btn { display: block; text-align: center; margin: 16px 0; padding: 12px 24px; width: 100%; }
      .btn-outline { display: block; text-align: center; }
      .footer { padding: 20px; }
      .footer p { font-size: 11px; }
      .greeting { font-size: 16px; }
    }

    @media only screen and (max-width: 380px) {
      .header-logo { max-width: 110px; }
      .body { padding: 16px; }
      .card { padding: 12px; }
      .btn { font-size: 13px; padding: 10px 16px; }
    }
  </style>
</head>
<body>
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <div class="wrapper">
    <div class="header">
      ${logoHtml}
      <span class="header-sub">Connecting the world's skilled workers</span>
    </div>
    <div class="body">
      ${body}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} SkilledProz. All rights reserved.</p>
      <p>
        <a href="${buildUrl("/privacy")}">Privacy Policy</a> · 
        <a href="${buildUrl("/terms")}">Terms of Service</a> · 
        <a href="${buildUrl("/contact")}">Contact</a>
      </p>
      <p style="font-size:11px;color:#bbb;margin-top:8px;">
        Questions? Email us at <a href="mailto:${CONTACT_EMAIL}" style="color:#0F0F6E;">${CONTACT_EMAIL}</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Core send function ─────────────────────────────────────────────────────
export async function sendEmail({ to, subject, html }) {
  const fromAddress = (process.env.EMAIL_FROM || "").trim();
  if (!fromAddress) {
    console.error("❌ EMAIL_FROM env var is not set");
    return { success: false, error: "EMAIL_FROM not configured" };
  }
  const from = `SkilledProz <${fromAddress}>`;

  try {
    if (useResend) {
      const { data, error } = await getResend().emails.send({
        from,
        to,
        subject,
        html,
      });
      if (error) {
        throw new Error(
          typeof error === "string"
            ? error
            : error.message || JSON.stringify(error),
        );
      }
      console.log(`📧 Email sent to ${to} — ${data?.id}`);
      return { success: true, messageId: data?.id };
    }

    const info = await getTransporter().sendMail({ from, to, subject, html });
    console.log(`📧 Email sent to ${to} — ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Email failed to ${to} | subject: "${subject}"`);
    console.error("   provider:", useResend ? "Resend" : "SMTP");
    console.error("   error:", error.message);
    if (error.code) console.error("   code:", error.code);
    if (error.statusCode) console.error("   status:", error.statusCode);
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. Waitlist Confirmation
// ─────────────────────────────────────────────────────────────────────────────
export async function sendWaitlistConfirmationEmail({ to, name }) {
  const html = baseTemplate({
    title: "You're on the waitlist! — SkilledProz",
    preheader: "We'll notify you when SkilledProz launches in your city",
    body: `
      <p class="greeting">Hi ${name || "there"}! </p>
      <p>Thank you for joining the <strong>SkilledProz</strong> waitlist!</p>
      <p>We're building a global marketplace connecting skilled workers with clients. You'll be among the first to know when we launch.</p>
      <div class="card">
        <p style="font-weight:700;color:#0F0F6E;margin-bottom:8px;">What happens next?</p>
        <div class="icon-row">${ICONS.check} <span>We'll build and test the platform</span></div>
        <div class="icon-row">${ICONS.clock} <span>You get early access before the public launch</span></div>
        <div class="icon-row">${ICONS.star} <span>You'll receive a special launch discount</span></div>
      </div>
      <p style="font-size:13px;color:#aaa;text-align:center;margin-top:20px;">You can unsubscribe anytime. We respect your privacy.</p>
      <div style="text-align:center;">
        <a href="${buildUrl("/")}" class="btn">Visit SkilledProz</a>
      </div>
    `,
  });
  return sendEmail({ to, subject: "You're on the SkilledProz waitlist", html });
}

// ─────────────────────────────────────────────────────────────────────────────
//  2. Email Verification – User-aware
// ─────────────────────────────────────────────────────────────────────────────
export async function sendVerificationEmail({ to, firstName, token, role }) {
  const verifyUrl = buildUrl(`/verify-email?token=${token}`);
  const isWorker = role === "WORKER";

  const roleTag = isWorker
    ? `<span class="role-tag">Worker</span>`
    : `<span class="role-tag">Hirer</span>`;

  const roleMessage = isWorker
    ? "Once verified, you can start setting up your worker profile, showcase your skills, and start earning."
    : "Once verified, you can start posting jobs, browsing skilled workers, and getting work done.";

  const ctaText = isWorker ? "Start Your Worker Journey" : "Start Hiring Today";

  const html = baseTemplate({
    title: "Verify your email — SkilledProz",
    preheader: "Click the link to verify your SkilledProz account",
    body: `
      <p class="greeting">Hi ${firstName}! ${roleTag}</p>
      <p>Welcome to <strong>SkilledProz</strong>! You've joined as a <strong>${isWorker ? "Worker" : "Hirer"}</strong>.</p>
      <p>${roleMessage}</p>
      <p>Please verify your email address to activate your account:</p>
      <div style="text-align:center;">
        <a href="${verifyUrl}" class="btn btn-success">${ctaText}</a>
      </div>
      <p style="font-size:13px;color:#999;text-align:center;">Or copy this link into your browser:<br/>
        <span style="color:#0F0F6E;word-break:break-all;">${verifyUrl}</span>
      </p>
      <hr class="divider"/>
      <div class="warning">
        ⏰ This link expires in <strong>24 hours</strong>. If you didn't create a SkilledProz account, you can safely ignore this email.
      </div>
    `,
  });

  return sendEmail({ to, subject: "Verify your SkilledProz account", html });
}

// ─────────────────────────────────────────────────────────────────────────────
//  3. Welcome Email – User-aware
// ─────────────────────────────────────────────────────────────────────────────
export async function sendWelcomeEmail({ to, firstName, role }) {
  const isWorker = role === "WORKER";
  const dashboardUrl = buildUrl(
    isWorker ? "/dashboard/worker" : "/dashboard/hirer",
  );
  const profileUrl = buildUrl(
    isWorker ? "/dashboard/worker/profile" : "/dashboard/hirer/profile",
  );
  const searchUrl = buildUrl(isWorker ? "/jobs" : "/search");

  const roleEmoji = isWorker ? "🔧" : "🏗️";
  const roleTitle = isWorker ? "Worker" : "Hirer";
  const roleTag = isWorker ? "Worker" : "Hirer";

  const steps = isWorker
    ? `
      <div class="icon-row">${ICONS.user} <span>Complete your profile and set your trade category</span></div>
      <div class="icon-row">${ICONS.star} <span>Set your hourly rate and service radius</span></div>
      <div class="icon-row">${ICONS.shield} <span>Upload portfolio work and certifications</span></div>
      <div class="icon-row">${ICONS.check} <span>Get verified to unlock more booking requests</span></div>
    `
    : `
      <div class="icon-row">${ICONS.search} <span>Search for skilled workers near you</span></div>
      <div class="icon-row">${ICONS.user} <span>Browse profiles, reviews, and rates</span></div>
      <div class="icon-row">${ICONS.handshake} <span>Book a worker and pay securely with escrow</span></div>
      <div class="icon-row">${ICONS.star} <span>Leave a review after the job is done</span></div>
    `;

  const ctaText = isWorker ? "Complete Your Profile" : "Find a Worker";
  const ctaUrl = isWorker ? profileUrl : searchUrl;

  const html = baseTemplate({
    title: "Welcome to SkilledProz!",
    preheader: "Your account is verified. Let's get started!",
    body: `
      <p class="greeting">Welcome aboard, ${firstName}! 🎉</p>
      <p>Your email is verified and your <strong>SkilledProz</strong> account is active. You're now part of the global skilled workforce community.</p>
      <p><span class="role-tag">${roleTag}</span> – here's how to get started:</p>

      <div class="card">
        <p style="font-weight:700;color:#0F0F6E;margin-bottom:12px;">As a ${roleTitle}, here's what to do next:</p>
        ${steps}
      </div>

      <div style="text-align:center;">
        <a href="${ctaUrl}" class="btn btn-success">${ctaText}</a>
      </div>
      <div style="text-align:center;margin-top:12px;">
        <a href="${dashboardUrl}" class="btn btn-outline">Go to Dashboard</a>
      </div>
    `,
  });

  return sendEmail({ to, subject: "Welcome to SkilledProz", html });
}

// ─────────────────────────────────────────────────────────────────────────────
//  4. Password Reset
// ─────────────────────────────────────────────────────────────────────────────
export async function sendPasswordResetEmail({ to, firstName, token }) {
  const resetUrl = buildUrl(`/reset-password?token=${token}`);

  const html = baseTemplate({
    title: "Reset your password — SkilledProz",
    preheader: "We received a request to reset your password",
    body: `
      <p class="greeting">Hi ${firstName},</p>
      <p>We received a request to reset the password on your <strong>SkilledProz</strong> account.</p>
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

  return sendEmail({ to, subject: "Reset your SkilledProz password", html });
}

// ─────────────────────────────────────────────────────────────────────────────
//  5. Booking Request (Worker)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBookingRequestEmail({
  to,
  workerName,
  hirerName,
  booking,
}) {
  const bookingUrl = buildUrl(`/bookings/${booking.id}`);

  const html = baseTemplate({
    title: "New booking request — SkilledProz",
    preheader: `${hirerName} wants to book you for a job`,
    body: `
      <p class="greeting">Hi ${workerName},</p>
      <p>You have a new booking request from <strong>${hirerName}</strong>.</p>
      <div class="card">
        <div class="card-row">
          <span class="card-label">Job Title</span>
          <span class="card-value">${booking.title || "Untitled Job"}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Category</span>
          <span class="card-value">${booking.category || "General"}</span>
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
        <a href="${bookingUrl}" class="btn">View & Respond</a>
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

// ─────────────────────────────────────────────────────────────────────────────
//  6. Booking Confirmed (Hirer)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBookingConfirmedEmail({
  to,
  hirerName,
  workerName,
  booking,
}) {
  const bookingUrl = buildUrl(`/bookings/${booking.id}`);
  const payUrl = buildUrl(`/bookings/${booking.id}/pay`);

  const html = baseTemplate({
    title: "Booking confirmed — SkilledProz",
    preheader: `${workerName} has accepted your booking request`,
    body: `
      <p class="greeting">Great news, ${hirerName}! 🎉</p>
      <p><strong>${workerName}</strong> has accepted your booking request. Your job is confirmed.</p>
      <div class="card">
        <div class="card-row">
          <span class="card-label">Job Title</span>
          <span class="card-value">${booking.title || "Untitled Job"}</span>
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
        <a href="${payUrl}" class="btn btn-success">Pay Now</a>
      </div>
      <div style="text-align:center;margin-top:12px;">
        <a href="${bookingUrl}" class="btn btn-outline">View Booking</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `Booking confirmed — ${booking.title || "Job"}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  7. Payment Receipt
// ─────────────────────────────────────────────────────────────────────────────
export async function sendPaymentReceiptEmail({ to, name, payment, booking }) {
  const bookingUrl = buildUrl(`/bookings/${booking.id}`);

  const html = baseTemplate({
    title: "Payment receipt — SkilledProz",
    preheader: `Your payment of ${payment.currency} ${payment.amount} is held securely in escrow`,
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>Your payment has been received and is held securely in escrow. It will be released to the worker once the job is completed and you confirm it.</p>
      <div class="card">
        <div class="card-row">
          <span class="card-label">Booking</span>
          <span class="card-value">${booking.title || "Untitled Job"}</span>
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
          <span class="card-label">Provider</span>
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
        <a href="${bookingUrl}" class="btn">View Booking</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `Payment receipt — ${payment.currency} ${payment.amount}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  8. Job Completed (Release Prompt)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendJobCompletedEmail({
  to,
  hirerName,
  workerName,
  booking,
}) {
  const bookingUrl = buildUrl(`/bookings/${booking.id}`);
  const releaseUrl = buildUrl(`/bookings/${booking.id}/release`);
  const disputeUrl = buildUrl(`/disputes`);

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
          <span class="card-value">${booking.title || "Untitled Job"}</span>
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
        <a href="${releaseUrl}" class="btn btn-success">Release Payment</a>
        <a href="${disputeUrl}" class="btn btn-danger">Raise Dispute</a>
      </div>
      <div style="text-align:center;margin-top:12px;">
        <a href="${bookingUrl}" class="btn btn-outline">View Booking</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `Job complete — release payment to ${workerName}?`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  9. Payment Released (Worker)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendPaymentReleasedEmail({
  to,
  workerName,
  payment,
  booking,
}) {
  const earningsUrl = buildUrl("/dashboard/worker/earnings");
  const bookingUrl = buildUrl(`/bookings/${booking.id}`);

  const html = baseTemplate({
    title: "Payment released — SkilledProz",
    preheader: `${payment.currency} ${payment.workerPayout} has been released to you`,
    body: `
      <p class="greeting">Hi ${workerName},</p>
      <p>Great news! The hirer has confirmed the job is complete and your payment has been released.</p>
      <div class="card">
        <div class="card-row">
          <span class="card-label">Job</span>
          <span class="card-value">${booking.title || "Untitled Job"}</span>
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
        <a href="${earningsUrl}" class="btn btn-success">View Earnings</a>
      </div>
      <div style="text-align:center;margin-top:12px;">
        <a href="${bookingUrl}" class="btn btn-outline">View Booking</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `Payment of ${payment.currency} ${payment.workerPayout} released!`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. Booking Cancelled
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBookingCancelledEmail({ to, name, booking, reason }) {
  const searchUrl = buildUrl("/search");

  const html = baseTemplate({
    title: "Booking cancelled — SkilledProz",
    preheader: `Your booking for ${booking.title} has been cancelled`,
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>Your booking has been cancelled.</p>
      <div class="card">
        <div class="card-row">
          <span class="card-label">Job</span>
          <span class="card-value">${booking.title || "Untitled Job"}</span>
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
        <a href="${searchUrl}" class="btn">Find Another Worker</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `Booking cancelled — ${booking.title || "Job"}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  11. Review Request
// ─────────────────────────────────────────────────────────────────────────────
export async function sendReviewRequestEmail({
  to,
  name,
  otherPartyName,
  booking,
}) {
  const reviewUrl = buildUrl(`/bookings/${booking.id}/review`);

  const html = baseTemplate({
    title: "Leave a review — SkilledProz",
    preheader: `How was your experience with ${otherPartyName}?`,
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>Your job <strong>${booking.title}</strong> is complete. How was your experience with <strong>${otherPartyName}</strong>?</p>
      <p>Reviews help build trust in the SkilledProz community. It only takes 30 seconds.</p>
      <div style="text-align:center;">
        <a href="${reviewUrl}" class="btn">Leave a Review</a>
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

// ─────────────────────────────────────────────────────────────────────────────
//  12. Job Application (Hirer)
// ─────────────────────────────────────────────────────────────────────────────
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
  const appUrl = buildUrl(`/jobs/${jobId}/applications`);

  const html = baseTemplate({
    title: "New job application — SkilledProz",
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
        <a href="${appUrl}" class="btn">Review Application</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `New application for "${jobTitle}" from ${workerName}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  13. New Message
// ─────────────────────────────────────────────────────────────────────────────
export async function sendNewMessageEmail({
  to,
  recipientName,
  senderName,
  preview,
  conversationId,
}) {
  const messagesUrl = buildUrl("/messages");

  const html = baseTemplate({
    title: "New message — SkilledProz",
    preheader: `${senderName} sent you a message`,
    body: `
      <p class="greeting">Hi ${recipientName},</p>
      <p>You have a new message from <strong>${senderName}</strong>.</p>
      ${
        preview
          ? `
      <div class="card" style="border-left:4px solid #0F0F6E;">
        <p style="font-style:italic;color:#555;margin:0;">"${preview.slice(0, 120)}${preview.length > 120 ? "…" : ""}"</p>
      </div>`
          : ""
      }
      <div style="text-align:center;">
        <a href="${messagesUrl}" class="btn">Reply Now</a>
      </div>
    `,
  });
  return sendEmail({ to, subject: `New message from ${senderName}`, html });
}

// ─────────────────────────────────────────────────────────────────────────────
//  14. Profile Viewed
// ─────────────────────────────────────────────────────────────────────────────
export async function sendProfileViewedEmail({
  to,
  ownerName,
  viewerName,
  viewerRole,
  profileUrl,
}) {
  const html = baseTemplate({
    title: "Someone viewed your profile — SkilledProz",
    preheader: `${viewerName} viewed your SkilledProz profile`,
    body: `
      <p class="greeting">Hi ${ownerName},</p>
      <p>Your profile was just viewed by <strong>${viewerName}</strong> — a ${viewerRole?.toLowerCase() || "user"} on SkilledProz.</p>
      <p>This could be a potential opportunity! Make sure your profile is complete and up to date to maximise your chances.</p>
      <div style="text-align:center;">
        <a href="${buildUrl("/settings")}" class="btn">Update Profile</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `${viewerName} viewed your profile`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  15. Application Accepted (Worker)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendApplicationAcceptedEmail({
  to,
  workerName,
  hirerName,
  jobTitle,
  jobId,
  workerId,
}) {
  const jobUrl = buildUrl(`/jobs/${jobId}`);

  const html = baseTemplate({
    title: "Application accepted! — SkilledProz",
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
        <a href="${jobUrl}" class="btn btn-success">View Job</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `🎉 Application accepted — ${jobTitle}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  16. Application Rejected (Worker)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendApplicationRejectedEmail({
  to,
  workerName,
  jobTitle,
  jobId,
}) {
  const jobsUrl = buildUrl("/jobs");

  const html = baseTemplate({
    title: "Application update — SkilledProz",
    preheader: `Your application for "${jobTitle}"`,
    body: `
      <p class="greeting">Hi ${workerName},</p>
      <p>Thank you for applying to <strong>"${jobTitle}"</strong>. Unfortunately the hirer has chosen to move forward with another applicant this time.</p>
      <p>Don't be discouraged — there are many more jobs available on the platform.</p>
      <div style="text-align:center;">
        <a href="${jobsUrl}" class="btn">Browse More Jobs</a>
      </div>
    `,
  });
  return sendEmail({ to, subject: `Application update — ${jobTitle}`, html });
}

// ─────────────────────────────────────────────────────────────────────────────
//  17. Dispute Raised
// ─────────────────────────────────────────────────────────────────────────────
export async function sendDisputeRaisedEmail({
  to,
  name,
  raisedBy,
  bookingTitle,
  bookingId,
  reason,
}) {
  const bookingUrl = buildUrl(`/bookings/${bookingId}`);

  const html = baseTemplate({
    title: "Dispute raised — SkilledProz",
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
        <a href="${bookingUrl}" class="btn">View Booking</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `Dispute raised — ${bookingTitle}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  18. Dispute Resolved
// ─────────────────────────────────────────────────────────────────────────────
export async function sendDisputeResolvedEmail({
  to,
  name,
  bookingTitle,
  bookingId,
  resolution,
}) {
  const bookingUrl = buildUrl(`/bookings/${bookingId}`);

  const html = baseTemplate({
    title: "Dispute resolved — SkilledProz",
    preheader: `The dispute on "${bookingTitle}" has been resolved`,
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>The dispute on booking <strong>"${bookingTitle}"</strong> has been resolved by our support team.</p>
      ${resolution ? `<div class="card"><div class="card-row"><span class="card-label">Resolution</span><span class="card-value">${resolution}</span></div></div>` : ""}
      <div style="text-align:center;">
        <a href="${bookingUrl}" class="btn">View Booking</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `Dispute resolved — ${bookingTitle}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  19. Refund
// ─────────────────────────────────────────────────────────────────────────────
export async function sendRefundEmail({
  to,
  name,
  amount,
  currency,
  bookingTitle,
  bookingId,
}) {
  const bookingUrl = buildUrl(`/bookings/${bookingId}`);

  const html = baseTemplate({
    title: "Refund processed — SkilledProz",
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
        <a href="${bookingUrl}" class="btn">View Booking</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `Refund of ${currency} ${amount} processed`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  20. Withdrawal
// ─────────────────────────────────────────────────────────────────────────────
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
  const earningsUrl = buildUrl("/dashboard/worker/earnings");

  const html = baseTemplate({
    title: `Withdrawal ${isSuccess ? "successful" : "update"} — SkilledProz`,
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
      ${!isSuccess ? '<div class="warning">If your withdrawal failed, your balance has been restored. Please contact support if you need help.</div>' : ""}
      <div style="text-align:center;">
        <a href="${earningsUrl}" class="btn">View Earnings</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `Withdrawal ${status.toLowerCase()} — ${currency} ${amount}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  21. Verification Status
// ─────────────────────────────────────────────────────────────────────────────
export async function sendVerificationStatusEmail({
  to,
  workerName,
  status,
  reason,
}) {
  const isApproved = status === "VERIFIED";
  const verifUrl = buildUrl("/dashboard/worker/verification");

  const html = baseTemplate({
    title: `Verification ${isApproved ? "approved" : "update"} — SkilledProz`,
    preheader: `Your SkilledProz verification status: ${status}`,
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
        <a href="${verifUrl}" class="btn ${isApproved ? "btn-success" : ""}">
          ${isApproved ? "View Profile" : "Reapply"}
        </a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `Verification ${isApproved ? "approved" : `update — ${status}`}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  22. Password Changed
// ─────────────────────────────────────────────────────────────────────────────
export async function sendPasswordChangedEmail({ to, name }) {
  const settingsUrl = buildUrl("/settings");

  const html = baseTemplate({
    title: "Password changed — SkilledProz",
    preheader: "Your SkilledProz password was successfully changed",
    body: `
      <p class="greeting">Hi ${name},</p>
      <p>Your SkilledProz password was successfully changed.</p>
      <div class="warning-red">
        If you did not make this change, your account may be compromised. Please <strong>reset your password immediately</strong> and contact support.
      </div>
      <div style="text-align:center;">
        <a href="${buildUrl("/forgot-password")}" class="btn btn-danger">Reset Password</a>
      </div>
      <div style="text-align:center;margin-top:12px;">
        <a href="${settingsUrl}" class="btn btn-outline">Account Settings</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: "Your SkilledProz password was changed",
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  23. SOS Alert
// ─────────────────────────────────────────────────────────────────────────────
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
  const bookingUrl = buildUrl(`/bookings/${bookingId}`);

  const html = baseTemplate({
    title: "SOS Alert — SkilledProz",
    preheader: `Emergency alert from ${workerName}`,
    body: `
      <p class="greeting" style="color:#dc2626;">🚨 Emergency Alert</p>
      <p>Hi ${recipientName},</p>
      <p><strong>${workerName}</strong> has activated an SOS emergency alert on booking <strong>"${bookingTitle}"</strong>.</p>
      <div class="card" style="border-left:4px solid #dc2626;">
        <div class="card-row"><span class="card-label">Worker</span><span class="card-value">${workerName}</span></div>
        <div class="card-row"><span class="card-label">Booking</span><span class="card-value">${bookingTitle}</span></div>
        <div class="card-row"><span class="card-label">Time</span><span class="card-value">${new Date().toLocaleString()}</span></div>
        ${mapsLink ? `<div class="card-row"><span class="card-label">Location</span><span class="card-value"><a href="${mapsLink}" style="color:#0F0F6E;">View on Google Maps →</a></span></div>` : ""}
      </div>
      <div class="warning-red">
        Please check in with the worker or contact emergency services immediately if needed.
      </div>
      <div style="text-align:center;">
        <a href="${bookingUrl}" class="btn btn-danger">View Booking</a>
      </div>
    `,
  });
  return sendEmail({
    to,
    subject: `SOS Alert — ${workerName} needs help`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  24. New Job Match (Worker)
// ─────────────────────────────────────────────────────────────────────────────
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
  const jobUrl = buildUrl(`/jobs/${jobId}`);

  const html = baseTemplate({
    title: "New job matching your skills — SkilledProz",
    preheader: `A new ${categoryName} job was just posted`,
    body: `
      <p class="greeting">Hi ${workerName},</p>
      <p>A new job matching your skills has been posted on SkilledProz.</p>
      <div class="card">
        <div class="card-row"><span class="card-label">Job Title</span><span class="card-value">${jobTitle}</span></div>
        <div class="card-row"><span class="card-label">Category</span><span class="card-value">${categoryName}</span></div>
        <div class="card-row"><span class="card-label">Budget</span><span class="card-value">${currency} ${Number(budget).toLocaleString()}</span></div>
        <div class="card-row"><span class="card-label">Location</span><span class="card-value">${address}</span></div>
      </div>
      <div style="text-align:center;">
        <a href="${jobUrl}" class="btn btn-success">Apply Now →</a>
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

// ─────────────────────────────────────────────────────────────────────────────
//  25. Login Alert
// ─────────────────────────────────────────────────────────────────────────────
export async function sendLoginAlertEmail({ to, name, ip, userAgent, time }) {
  const settingsUrl = buildUrl("/settings");
  const securityUrl = buildUrl("/settings/security");

  const html = baseTemplate({
    title: "New login to your account — SkilledProz",
    preheader: `We detected a new login to your SkilledProz account from ${ip || "an unknown location"}`,
    body: `
      <p class="greeting">Hi ${name || "there"},</p>
      <p>We noticed a new login to your SkilledProz account.</p>
      <div class="card">
        <div class="card-row">
          <span class="card-label">📍 IP Address</span>
          <span class="card-value">${ip || "Unknown"}</span>
        </div>
        <div class="card-row">
          <span class="card-label">🖥️ Device</span>
          <span class="card-value">${userAgent || "Unknown"}</span>
        </div>
        <div class="card-row">
          <span class="card-label">🕐 Time</span>
          <span class="card-value">${time || new Date().toLocaleString()}</span>
        </div>
      </div>
      <div class="warning">
        If this was you, you can safely ignore this email.
      </div>
      <div class="warning-red">
        If this wasn't you, your account may be compromised. Please reset your password immediately.
      </div>
      <div style="text-align:center;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
        <a href="${securityUrl}" class="btn btn-danger">Secure Account</a>
        <a href="${settingsUrl}" class="btn btn-outline">Account Settings</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: `New login to your SkilledProz account ${ip ? `from ${ip}` : ""}`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Waitlist Broadcast Email
// ─────────────────────────────────────────────────────────────────────────────
export async function sendWaitlistBroadcastEmail({
  to,
  name,
  subject,
  content,
}) {
  const html = baseTemplate({
    title: subject,
    preheader: content.replace(/<[^>]*>/g, "").slice(0, 150) + "...",
    body: `
      <p class="greeting">Hi ${name || "there"}! 👋</p>
      ${content}
      <div style="text-align:center;margin-top:20px;">
        <a href="${buildUrl("/")}" class="btn">Visit SkilledProz</a>
      </div>
    `,
  });
  return sendEmail({ to, subject, html });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Waitlist Benefit Unlocked
// ─────────────────────────────────────────────────────────────────────────────
export async function sendWaitlistBenefitUnlockedEmail({ to, name, benefit }) {
  const html = baseTemplate({
    title: "🎁 You've Unlocked a New Benefit!",
    preheader: `You unlocked: ${benefit}`,
    body: `
      <p class="greeting">Hey ${name || "there"}! 🎉</p>
      <p>Great news! You've unlocked a new benefit as a SkilledProz early adopter:</p>
      <div class="card" style="text-align:center;border:2px solid #F59E0B;">
        <span style="font-size:48px;">🏆</span>
        <h3 style="color:#F59E0B;font-size:22px;margin:8px 0;">${benefit}</h3>
        <p style="color:#555;">You're getting closer to the full package!</p>
      </div>
      <div style="text-align:center;margin-top:20px;">
        <a href="${buildUrl("/")}" class="btn btn-success">Explore SkilledProz</a>
      </div>
    `,
  });
  return sendEmail({ to, subject: `🎁 You Unlocked: ${benefit}`, html });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Waitlist Launch Announcement
// ─────────────────────────────────────────────────────────────────────────────
export async function sendWaitlistLaunchEmail({ to, name }) {
  const html = baseTemplate({
    title: "🚀 SkilledProz is LIVE!",
    preheader: "Your early adopter benefits are waiting for you!",
    body: `
      <p class="greeting">🚀 IT'S HERE, ${name?.toUpperCase() || "EARLY ADOPTER"}!</p>
      <p><strong>SkilledProz is officially LIVE!</strong> The future of work has arrived.</p>
      <div class="card" style="border:2px solid #F59E0B;">
        <h3 style="color:#F59E0B;">🎯 Your Early Adopter Perks:</h3>
        <ul style="color:#555;line-height:2;padding-left:20px;">
          <li>✅ <strong>Free Lifetime Registration</strong></li>
          <li>✅ <strong>0% Commission</strong> forever</li>
          <li>✅ <strong>₦5,000 Credit</strong> (hirers) / <strong>Premium Badge</strong> (workers)</li>
          <li>✅ <strong>VIP Support</strong> — priority response</li>
        </ul>
      </div>
      <div style="text-align:center;margin-top:20px;">
        <a href="${buildUrl("/register")}" class="btn btn-success">Claim Your Benefits →</a>
      </div>
      <p style="text-align:center;color:#888;font-size:14px;">Welcome to the future of work. 🌍</p>
    `,
  });
  return sendEmail({
    to,
    subject: "🚀 SkilledProz is LIVE! Claim Your Benefits",
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Survey Response Auto-Reply
// ─────────────────────────────────────────────────────────────────────────────
export async function sendSurveyResponseEmail({ to, name, role, industry }) {
  const roleLabels = {
    hirer: "Hirer (Client)",
    worker: "Worker (Skilled Professional)",
    both: "Both Hirer & Worker",
  };

  const roleLabel = roleLabels[role] || role;

  const html = baseTemplate({
    title: "We received your survey — SkilledProz",
    preheader: "Thank you for helping us build a better SkilledProz",
    body: `
      <p class="greeting">Hi ${name || "there"}! 👋</p>
      <p>Thank you for taking the time to complete our survey. Your feedback is invaluable in helping us build a platform that truly serves the needs of the skilled workforce community.</p>

      <div style="text-align:center;padding:16px 0;">
        <span style="font-size:32px;">📊</span>
        <p style="font-size:14px;color:#888;margin-top:4px;">
          <strong style="color:#0F0F6E;">${roleLabel}</strong> · 
          <span style="color:#555;">${industry}</span>
        </p>
      </div>

      <div class="card" style="border-left:4px solid #F59E0B;">
        <p style="margin:0;color:#555;line-height:1.7;">
          Here's what happens next:
        </p>
        <div style="margin-top:12px;">
          <div class="icon-row" style="margin:6px 0;">
            <span style="font-size:18px;">📋</span>
            <span>Our team reviews your survey responses</span>
          </div>
          <div class="icon-row" style="margin:6px 0;">
            <span style="font-size:18px;">💡</span>
            <span>Your insights help shape our product roadmap</span>
          </div>
          <div class="icon-row" style="margin:6px 0;">
            <span style="font-size:18px;">📧</span>
            <span>We may reach out if we need more details</span>
          </div>
          <div class="icon-row" style="margin:6px 0;">
            <span style="font-size:18px;">🚀</span>
            <span>You'll be notified when the platform launches</span>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;">
        <div style="background:#f0fdf4;border-radius:8px;padding:12px 16px;text-align:center;border:1px solid #bbf7d0;">
          <span style="font-size:20px;">🎯</span>
          <p style="font-size:12px;color:#16a34a;font-weight:600;margin:4px 0 0;">Direct Impact</p>
        </div>
        <div style="background:#fffbeb;border-radius:8px;padding:12px 16px;text-align:center;border:1px solid #fde68a;">
          <span style="font-size:20px;">⏰</span>
          <p style="font-size:12px;color:#d97706;font-weight:600;margin:4px 0 0;">Response Within 48h</p>
        </div>
        <div style="background:#eff6ff;border-radius:8px;padding:12px 16px;text-align:center;border:1px solid #bfdbfe;">
          <span style="font-size:20px;">🤝</span>
          <p style="font-size:12px;color:#2563eb;font-weight:600;margin:4px 0 0;">Community Building</p>
        </div>
        <div style="background:#f5f3ff;border-radius:8px;padding:12px 16px;text-align:center;border:1px solid #ddd6fe;">
          <span style="font-size:20px;">✨</span>
          <p style="font-size:12px;color:#7c3aed;font-weight:600;margin:4px 0 0;">Platform Evolution</p>
        </div>
      </div>

      <div class="warning" style="background:#fffbeb;border-left-color:#F59E0B;margin:16px 0;">
        💡 <strong>Did you know?</strong> Over 80% of our product features come directly from user feedback like yours. 
        Your voice truly makes a difference!
      </div>

      <p style="font-size:13px;color:#888;text-align:center;margin-top:16px;">
        If you have additional thoughts, just reply to this email — we'd love to hear more!
      </p>

      <div style="text-align:center;margin-top:20px;">
        <a href="${buildUrl("/")}" class="btn" style="background:#0F0F6E;">Visit SkilledProz</a>
      </div>
      <div style="text-align:center;margin-top:12px;">
        <a href="${buildUrl("/contact")}" class="btn btn-outline">Contact Support</a>
      </div>
    `,
  });

  return sendEmail({
    to,
    subject: "🙏 We received your survey — Thank you!",
    html,
  });
}
