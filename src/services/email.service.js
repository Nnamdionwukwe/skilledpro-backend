// // src/services/email.service.js
// import nodemailer from "nodemailer";
// // ── Transporter ───────────────────────────────────────────────────────────────
// let transporter;

// // function getTransporter() {
// //   // Read env fresh every call until transporter is built with valid creds.
// //   // This avoids the dotenv timing bug where this file is imported before
// //   // dotenv has populated process.env.
// //   const user = (process.env.SMTP_USER || "").trim();
// //   const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

// //   if (!transporter || !user || !pass) {
// //     transporter = nodemailer.createTransport({
// //       host: "smtp.gmail.com",
// //       port: 587,
// //       secure: false, // STARTTLS on port 587
// //       family: 4, // Force IPv4 — prevents ENETUNREACH
// //       auth: { user, pass },
// //       tls: { rejectUnauthorized: false },
// //     });
// //   }
// //   return transporter;
// // }

// // Replace your existing getTransporter() function in email.service.js with this one.
// // Tries port 465 (SSL) first, falls back gracefully.

// function getTransporter() {
//   const user = (process.env.SMTP_USER || "").trim();
//   const pass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

//   if (!transporter || !user || !pass) {
//     transporter = nodemailer.createTransport({
//       host: "smtp.gmail.com",
//       port: 465, // ← changed from 587 to 465
//       secure: true, // ← changed from false to true (SSL, not STARTTLS)
//       family: 4,
//       auth: { user, pass },
//       tls: { rejectUnauthorized: false },
//       connectionTimeout: 10000,
//       greetingTimeout: 10000,
//       socketTimeout: 15000,
//     });
//   }
//   return transporter;
// }

// // Add `sendJobApplicationEmail` to your `email.service.js` — it's called in `applyToJob`.

// // Call this from server.js AFTER dotenv has loaded env vars
// export function verifyEmailTransporter() {
//   transporter = null; // force rebuild with now-loaded env vars
//   getTransporter().verify((error) => {
//     if (error) {
//       console.error("Email transporter error:", error.message);
//     } else {
//       console.log("Email transporter ready");
//     }
//   });
// }

// // ── Base template wrapper ─────────────────────────────────────────────────────
// function baseTemplate({ title, preheader, body }) {
//   return `
// <!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8" />
//   <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
//   <title>${title}</title>
//   <style>
//     * { margin: 0; padding: 0; box-sizing: border-box; }
//     body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f7; color: #333; }
//     .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
//     .header { background: linear-gradient(135deg, #0f0f6e, #1a1a9e); padding: 32px 40px; text-align: center; }
//     .header h1 { color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
//     .header span { color: #a0a8ff; font-size: 14px; }
//     .body { padding: 40px; }
//     .greeting { font-size: 18px; font-weight: 600; color: #0f0f6e; margin-bottom: 16px; }
//     p { font-size: 15px; line-height: 1.7; color: #555; margin-bottom: 16px; }
//     .btn { display: inline-block; margin: 24px 0; padding: 14px 32px; background: #0f0f6e; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.3px; }
//     .btn:hover { background: #1a1a9e; }
//     .btn-success { background: #16a34a; }
//     .btn-danger  { background: #dc2626; }
//     .card { background: #f8f8ff; border: 1px solid #e0e0f0; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
//     .card-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ececf8; font-size: 14px; }
//     .card-row:last-child { border-bottom: none; }
//     .card-label { color: #888; font-weight: 500; }
//     .card-value { color: #222; font-weight: 600; }
//     .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
//     .badge-green  { background: #dcfce7; color: #16a34a; }
//     .badge-blue   { background: #dbeafe; color: #1d4ed8; }
//     .badge-orange { background: #ffedd5; color: #ea580c; }
//     .divider { border: none; border-top: 1px solid #ececf8; margin: 28px 0; }
//     .otp { font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #0f0f6e; text-align: center; padding: 24px; background: #f0f0ff; border-radius: 8px; margin: 20px 0; }
//     .warning { background: #fff7ed; border-left: 4px solid #ea580c; padding: 14px 18px; border-radius: 4px; font-size: 13px; color: #9a3412; margin: 16px 0; }
//     .footer { background: #f8f8ff; padding: 24px 40px; text-align: center; }
//     .footer p { font-size: 12px; color: #aaa; margin-bottom: 6px; }
//     .footer a { color: #0f0f6e; text-decoration: none; }
//     .social { margin: 12px 0; }
//     .social a { display: inline-block; margin: 0 6px; color: #0f0f6e; font-size: 13px; font-weight: 600; text-decoration: none; }
//   </style>
// </head>
// <body>
//   <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
//   <div class="wrapper">
//     <div class="header">
//       <h1>SkilledProz</h1>
//       <span>Connecting skilled workers with the world</span>
//     </div>
//     <div class="body">
//       ${body}
//     </div>
//     <div class="footer">
//       <p>© ${new Date().getFullYear()} SkilledPro. All rights reserved.</p>
//       <p>You received this email because you have an account on SkilledPro.</p>
//       <p><a href="${process.env.CLIENT_URL}/unsubscribe">Unsubscribe</a> · <a href="${process.env.CLIENT_URL}/privacy">Privacy Policy</a></p>
//     </div>
//   </div>
// </body>
// </html>`;
// }

// // ── Core send function ────────────────────────────────────────────────────────
// async function sendEmail({ to, subject, html }) {
//   try {
//     const info = await getTransporter().sendMail({
//       from: `"SkilledPro" <${process.env.EMAIL_FROM}>`,
//       to,
//       subject,
//       html,
//     });
//     console.log(`📧 Email sent to ${to} — ${info.messageId}`);
//     return { success: true, messageId: info.messageId };
//   } catch (error) {
//     console.error(`❌ Email failed to ${to}:`, error.message);
//     return { success: false, error: error.message };
//   }
// }

// // ── 1. Email verification ─────────────────────────────────────────────────────
// export async function sendVerificationEmail({ to, firstName, token }) {
//   const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

//   const html = baseTemplate({
//     title: "Verify your email — SkilledPro",
//     preheader: "Click the link to verify your SkilledPro account",
//     body: `
//       <p class="greeting">Hi ${firstName} 👋</p>
//       <p>Welcome to SkilledPro! You're one step away from connecting with skilled professionals around the world.</p>
//       <p>Please verify your email address to activate your account:</p>
//       <div style="text-align:center;">
//         <a href="${verifyUrl}" class="btn">Verify My Email</a>
//       </div>
//       <p style="font-size:13px;color:#999;text-align:center;">Or copy this link into your browser:<br/>
//         <span style="color:#0f0f6e;word-break:break-all;">${verifyUrl}</span>
//       </p>
//       <hr class="divider"/>
//       <div class="warning">
//         ⏰ This link expires in <strong>24 hours</strong>. If you didn't create a SkilledPro account, you can safely ignore this email.
//       </div>
//     `,
//   });

//   return sendEmail({ to, subject: "Verify your SkilledPro account", html });
// }

// // ── 2. Welcome email (after verification) ────────────────────────────────────
// export async function sendWelcomeEmail({ to, firstName, role }) {
//   const isWorker = role === "WORKER";

//   const html = baseTemplate({
//     title: "Welcome to SkilledPro!",
//     preheader: `Your account is verified. Let's get started!`,
//     body: `
//       <p class="greeting">Welcome aboard, ${firstName}! 🎉</p>
//       <p>Your email is verified and your SkilledPro account is active.</p>

//       ${
//         isWorker
//           ? `
//         <div class="card">
//           <p style="font-weight:700;color:#0f0f6e;margin-bottom:12px;">As a Worker, here's what to do next:</p>
//           <div class="card-row"><span class="card-label">1.</span><span class="card-value">Complete your profile and set your trade category</span></div>
//           <div class="card-row"><span class="card-label">2.</span><span class="card-value">Set your hourly rate and service radius</span></div>
//           <div class="card-row"><span class="card-label">3.</span><span class="card-value">Upload portfolio work and certifications</span></div>
//           <div class="card-row"><span class="card-label">4.</span><span class="card-value">Get verified to unlock more booking requests</span></div>
//         </div>
//       `
//           : `
//         <div class="card">
//           <p style="font-weight:700;color:#0f0f6e;margin-bottom:12px;">As a Hirer, here's what to do next:</p>
//           <div class="card-row"><span class="card-label">1.</span><span class="card-value">Search for skilled workers near you</span></div>
//           <div class="card-row"><span class="card-label">2.</span><span class="card-value">Browse profiles, reviews, and rates</span></div>
//           <div class="card-row"><span class="card-label">3.</span><span class="card-value">Book a worker and pay securely with escrow</span></div>
//           <div class="card-row"><span class="card-label">4.</span><span class="card-value">Leave a review after the job is done</span></div>
//         </div>
//       `
//       }

//       <div style="text-align:center;">
//         <a href="${process.env.CLIENT_URL}/dashboard" class="btn">Go to Dashboard</a>
//       </div>
//     `,
//   });

//   return sendEmail({ to, subject: "Welcome to SkilledPro 🎉", html });
// }

// // ── 3. Password reset ─────────────────────────────────────────────────────────
// export async function sendPasswordResetEmail({ to, firstName, token }) {
//   const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;

//   const html = baseTemplate({
//     title: "Reset your password — SkilledPro",
//     preheader: "We received a request to reset your password",
//     body: `
//       <p class="greeting">Hi ${firstName},</p>
//       <p>We received a request to reset the password on your SkilledPro account.</p>
//       <p>Click the button below to choose a new password:</p>
//       <div style="text-align:center;">
//         <a href="${resetUrl}" class="btn">Reset My Password</a>
//       </div>
//       <hr class="divider"/>
//       <div class="warning">
//         ⏰ This link expires in <strong>1 hour</strong>. If you did not request a password reset, please ignore this email — your password will remain unchanged.
//       </div>
//     `,
//   });

//   return sendEmail({ to, subject: "Reset your SkilledPro password", html });
// }

// // ── 4. Booking request (worker notified) ─────────────────────────────────────
// export async function sendBookingRequestEmail({
//   to,
//   workerName,
//   hirerName,
//   booking,
// }) {
//   const html = baseTemplate({
//     title: "New booking request — SkilledPro",
//     preheader: `${hirerName} wants to book you for a job`,
//     body: `
//       <p class="greeting">Hi ${workerName},</p>
//       <p>You have a new booking request from <strong>${hirerName}</strong>.</p>

//       <div class="card">
//         <div class="card-row">
//           <span class="card-label">Job Title</span>
//           <span class="card-value">${booking.title}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Category</span>
//           <span class="card-value">${booking.category}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Scheduled</span>
//           <span class="card-value">${new Date(booking.scheduledAt).toLocaleString()}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Location</span>
//           <span class="card-value">${booking.address}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Agreed Rate</span>
//           <span class="card-value">${booking.currency} ${booking.agreedRate}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Status</span>
//           <span class="badge badge-orange">Pending</span>
//         </div>
//       </div>

//       <div style="text-align:center;">
//         <a href="${process.env.CLIENT_URL}/bookings/${booking.id}" class="btn">View & Respond</a>
//       </div>

//       <div class="warning">
//         ⏰ Respond within <strong>24 hours</strong> to maintain your response rate.
//       </div>
//     `,
//   });

//   return sendEmail({
//     to,
//     subject: `New booking request from ${hirerName}`,
//     html,
//   });
// }

// // ── 5. Booking confirmed (hirer notified) ─────────────────────────────────────
// export async function sendBookingConfirmedEmail({
//   to,
//   hirerName,
//   workerName,
//   booking,
// }) {
//   const html = baseTemplate({
//     title: "Booking confirmed — SkilledPro",
//     preheader: `${workerName} has accepted your booking request`,
//     body: `
//       <p class="greeting">Great news, ${hirerName}! 🎉</p>
//       <p><strong>${workerName}</strong> has accepted your booking request. Your job is confirmed.</p>

//       <div class="card">
//         <div class="card-row">
//           <span class="card-label">Job Title</span>
//           <span class="card-value">${booking.title}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Worker</span>
//           <span class="card-value">${workerName}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Scheduled</span>
//           <span class="card-value">${new Date(booking.scheduledAt).toLocaleString()}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Location</span>
//           <span class="card-value">${booking.address}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Amount</span>
//           <span class="card-value">${booking.currency} ${booking.agreedRate}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Status</span>
//           <span class="badge badge-green">Confirmed</span>
//         </div>
//       </div>

//       <p>Please complete payment to secure your booking. Funds are held in escrow until the job is done.</p>
//       <div style="text-align:center;">
//         <a href="${process.env.CLIENT_URL}/bookings/${booking.id}/pay" class="btn btn-success">Pay Now</a>
//       </div>
//     `,
//   });

//   return sendEmail({
//     to,
//     subject: `Booking confirmed — ${booking.title}`,
//     html,
//   });
// }

// // ── 6. Payment receipt ────────────────────────────────────────────────────────
// export async function sendPaymentReceiptEmail({ to, name, payment, booking }) {
//   const html = baseTemplate({
//     title: "Payment receipt — SkilledPro",
//     preheader: `Your payment of ${payment.currency} ${payment.amount} is held securely in escrow`,
//     body: `
//       <p class="greeting">Hi ${name},</p>
//       <p>Your payment has been received and is held securely in escrow. It will be released to the worker once the job is completed and you confirm it.</p>

//       <div class="card">
//         <div class="card-row">
//           <span class="card-label">Booking</span>
//           <span class="card-value">${booking.title}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Total Paid</span>
//           <span class="card-value">${payment.currency} ${payment.amount}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Platform Fee</span>
//           <span class="card-value">${payment.currency} ${payment.platformFee}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Worker Payout</span>
//           <span class="card-value">${payment.currency} ${payment.workerPayout}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Payment Provider</span>
//           <span class="card-value">${payment.provider}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Reference</span>
//           <span class="card-value" style="font-size:12px;">${payment.providerRef}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Status</span>
//           <span class="badge badge-blue">In Escrow</span>
//         </div>
//       </div>

//       <div style="text-align:center;">
//         <a href="${process.env.CLIENT_URL}/bookings/${booking.id}" class="btn">View Booking</a>
//       </div>
//     `,
//   });

//   return sendEmail({
//     to,
//     subject: `Payment receipt — ${payment.currency} ${payment.amount}`,
//     html,
//   });
// }

// // ── 7. Job completed — release prompt ────────────────────────────────────────
// export async function sendJobCompletedEmail({
//   to,
//   hirerName,
//   workerName,
//   booking,
// }) {
//   const html = baseTemplate({
//     title: "Job completed — release payment?",
//     preheader: `${workerName} has marked the job as complete`,
//     body: `
//       <p class="greeting">Hi ${hirerName},</p>
//       <p><strong>${workerName}</strong> has marked your job as complete.</p>
//       <p>If you're satisfied with the work, please release the payment from escrow. You can also leave a review.</p>

//       <div class="card">
//         <div class="card-row">
//           <span class="card-label">Job</span>
//           <span class="card-value">${booking.title}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Worker</span>
//           <span class="card-value">${workerName}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Completed</span>
//           <span class="card-value">${new Date().toLocaleString()}</span>
//         </div>
//       </div>

//       <div style="text-align:center;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;">
//         <a href="${process.env.CLIENT_URL}/bookings/${booking.id}/release" class="btn btn-success">Release Payment</a>
//         <a href="${process.env.CLIENT_URL}/bookings/${booking.id}/dispute" class="btn btn-danger">Raise Dispute</a>
//       </div>
//     `,
//   });

//   return sendEmail({
//     to,
//     subject: `Job complete — release payment to ${workerName}?`,
//     html,
//   });
// }

// // ── 8. Payment released (worker notified) ─────────────────────────────────────
// export async function sendPaymentReleasedEmail({
//   to,
//   workerName,
//   payment,
//   booking,
// }) {
//   const html = baseTemplate({
//     title: "Payment released — SkilledPro",
//     preheader: `${payment.currency} ${payment.workerPayout} has been released to you`,
//     body: `
//       <p class="greeting">Hi ${workerName},</p>
//       <p>Great news! The hirer has confirmed the job is complete and your payment has been released.</p>

//       <div class="card">
//         <div class="card-row">
//           <span class="card-label">Job</span>
//           <span class="card-value">${booking.title}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Your Payout</span>
//           <span class="card-value" style="color:#16a34a;font-size:18px;">${payment.currency} ${payment.workerPayout}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Released</span>
//           <span class="card-value">${new Date().toLocaleString()}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Status</span>
//           <span class="badge badge-green">Released</span>
//         </div>
//       </div>

//       <div style="text-align:center;">
//         <a href="${process.env.CLIENT_URL}/dashboard/earnings" class="btn">View Earnings</a>
//       </div>
//     `,
//   });

//   return sendEmail({
//     to,
//     subject: `Payment of ${payment.currency} ${payment.workerPayout} released!`,
//     html,
//   });
// }

// // ── 9. Booking cancelled ──────────────────────────────────────────────────────
// export async function sendBookingCancelledEmail({ to, name, booking, reason }) {
//   const html = baseTemplate({
//     title: "Booking cancelled — SkilledPro",
//     preheader: `Your booking for ${booking.title} has been cancelled`,
//     body: `
//       <p class="greeting">Hi ${name},</p>
//       <p>Your booking has been cancelled.</p>

//       <div class="card">
//         <div class="card-row">
//           <span class="card-label">Job</span>
//           <span class="card-value">${booking.title}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Scheduled Date</span>
//           <span class="card-value">${new Date(booking.scheduledAt).toLocaleString()}</span>
//         </div>
//         ${
//           reason
//             ? `
//         <div class="card-row">
//           <span class="card-label">Reason</span>
//           <span class="card-value">${reason}</span>
//         </div>`
//             : ""
//         }
//       </div>

//       <p>If a payment was made, a refund has been initiated and will appear within 3–5 business days.</p>

//       <div style="text-align:center;">
//         <a href="${process.env.CLIENT_URL}/search" class="btn">Find Another Worker</a>
//       </div>
//     `,
//   });

//   return sendEmail({
//     to,
//     subject: `Booking cancelled — ${booking.title}`,
//     html,
//   });
// }

// // ── 10. Review request ────────────────────────────────────────────────────────
// export async function sendReviewRequestEmail({
//   to,
//   name,
//   otherPartyName,
//   booking,
// }) {
//   const html = baseTemplate({
//     title: "Leave a review — SkilledPro",
//     preheader: `How was your experience with ${otherPartyName}?`,
//     body: `
//       <p class="greeting">Hi ${name},</p>
//       <p>Your job <strong>${booking.title}</strong> is complete. How was your experience with <strong>${otherPartyName}</strong>?</p>
//       <p>Reviews help build trust in the SkilledPro community. It only takes 30 seconds.</p>

//       <div style="text-align:center;">
//         <a href="${process.env.CLIENT_URL}/bookings/${booking.id}/review" class="btn">Leave a Review</a>
//       </div>

//       <p style="font-size:13px;color:#aaa;text-align:center;margin-top:20px;">Reviews can be submitted up to 14 days after job completion.</p>
//     `,
//   });

//   return sendEmail({
//     to,
//     subject: `How was ${otherPartyName}? Leave a review`,
//     html,
//   });
// }

// // ── 11. Job application notification (hirer notified) ────────────────────────
// export async function sendJobApplicationEmail({
//   to,
//   hirerName,
//   workerName,
//   workerTitle,
//   workerRating,
//   jobTitle,
//   jobId,
//   applicationId,
//   message,
// }) {
//   const html = baseTemplate({
//     title: "New job application — SkilledPro",
//     preheader: `${workerName} has applied for your job: ${jobTitle}`,
//     body: `
//       <p class="greeting">Hi ${hirerName},</p>
//       <p>You have a new application for your job posting.</p>
//       <div class="card">
//         <div class="card-row">
//           <span class="card-label">Job</span>
//           <span class="card-value">${jobTitle}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Applicant</span>
//           <span class="card-value">${workerName}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Trade / Title</span>
//           <span class="card-value">${workerTitle || "—"}</span>
//         </div>
//         <div class="card-row">
//           <span class="card-label">Rating</span>
//           <span class="card-value">${workerRating > 0 ? `★ ${Number(workerRating).toFixed(1)}` : "New worker"}</span>
//         </div>
//         ${
//           message
//             ? `<div class="card-row">
//           <span class="card-label">Message</span>
//           <span class="card-value" style="font-style:italic;">"${message}"</span>
//         </div>`
//             : ""
//         }
//       </div>
//       <div style="text-align:center;">
//         <a href="${process.env.CLIENT_URL}/jobs/${jobId}/applications/${applicationId}" class="btn">
//           Review Application
//         </a>
//       </div>
//     `,
//   });

//   return sendEmail({
//     to,
//     subject: `New application for "${jobTitle}" from ${workerName}`,
//     html,
//   });
// }

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// ── Base layout ────────────────────────────────────────────────────────────────
function baseLayout(content, preheader = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SkilledProz</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0a0a0a;">${preheader}</div>` : ""}
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <span style="font-size:22px;font-weight:900;color:#ff6b00;letter-spacing:-0.5px;">Skilled<span style="color:#fff;">Proz</span></span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:40px 36px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#555;">
                © ${new Date().getFullYear()} SkilledProz · 
                <a href="${CLIENT_URL}" style="color:#555;text-decoration:none;">Visit site</a> · 
                <a href="${CLIENT_URL}/unsubscribe" style="color:#555;text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function heading(text) {
  return `<h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${text}</h1>`;
}

function subheading(text) {
  return `<p style="margin:0 0 24px;font-size:15px;color:#888;">${text}</p>`;
}

function divider() {
  return `<hr style="border:none;border-top:1px solid #2a2a2a;margin:24px 0;" />`;
}

function ctaButton(text, href) {
  return `
    <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr>
        <td style="background:#ff6b00;border-radius:10px;">
          <a href="${href}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#000;text-decoration:none;">${text}</a>
        </td>
      </tr>
    </table>`;
}

function infoRow(label, value) {
  return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #222;">
        <span style="font-size:13px;color:#666;">${label}</span>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #222;text-align:right;">
        <span style="font-size:13px;font-weight:600;color:#fff;">${value}</span>
      </td>
    </tr>`;
}

function alertBox(text, color = "#ff6b00") {
  return `
    <div style="background:rgba(255,107,0,0.08);border:1px solid rgba(255,107,0,0.2);border-radius:10px;padding:16px 20px;margin:20px 0;">
      <p style="margin:0;font-size:14px;color:${color};">${text}</p>
    </div>`;
}

async function send({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: `"SkilledProz" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH EMAILS
// ══════════════════════════════════════════════════════════════════════════════

// ── New login / account access alert ──────────────────────────────────────────
export async function sendLoginAlertEmail({
  to,
  name,
  ip,
  device,
  location,
  time,
}) {
  const html = baseLayout(
    `
    ${heading("New sign-in to your account")}
    ${subheading(`Hi ${name}, we detected a new login to your SkilledProz account.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Time", new Date(time || Date.now()).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" }))}
      ${ip ? infoRow("IP Address", ip) : ""}
      ${device ? infoRow("Device", device) : ""}
      ${location ? infoRow("Location", location) : ""}
    </table>

    ${alertBox(`⚠️ If this wasn't you, secure your account immediately by changing your password.`)}

    ${ctaButton("Change My Password", `${CLIENT_URL}/reset-password`)}

    <p style="margin:0;font-size:13px;color:#555;">If this was you, you can safely ignore this email. No action is needed.</p>
  `,
    `New sign-in detected — if this wasn't you, change your password immediately.`,
  );

  await send({ to, subject: "New sign-in to your SkilledProz account", html });
}

// ── Password reset ─────────────────────────────────────────────────────────────
export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const html = baseLayout(`
    ${heading("Reset your password")}
    ${subheading(`Hi ${name}, we received a request to reset your password.`)}
    <p style="margin:0 0 8px;font-size:14px;color:#aaa;">Click the button below to set a new password. This link expires in 1 hour.</p>
    ${ctaButton("Reset Password", resetUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:#555;">If you didn't request this, you can safely ignore this email.</p>
  `);
  await send({ to, subject: "Reset your SkilledProz password", html });
}

// ── Email verification ─────────────────────────────────────────────────────────
export async function sendVerificationEmail({ to, name, verifyUrl }) {
  const html = baseLayout(`
    ${heading("Verify your email")}
    ${subheading(`Welcome to SkilledProz, ${name}!`)}
    <p style="margin:0 0 8px;font-size:14px;color:#aaa;">Please verify your email address to activate your account.</p>
    ${ctaButton("Verify Email", verifyUrl)}
  `);
  await send({ to, subject: "Verify your SkilledProz email", html });
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

  return sendEmail({ to, subject: "Welcome to SkilledProz 🎉", html });
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOKING EMAILS
// ══════════════════════════════════════════════════════════════════════════════

export async function sendBookingRequestEmail({
  to,
  workerName,
  hirerName,
  booking,
}) {
  const html = baseLayout(`
    ${heading("New booking request")}
    ${subheading(`Hi ${workerName}, you have a new booking request from ${hirerName}.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Job", booking.title)}
      ${infoRow("Category", booking.category)}
      ${infoRow("Date", new Date(booking.scheduledAt).toLocaleDateString("en-GB", { dateStyle: "full" }))}
      ${infoRow("Location", booking.address)}
      ${infoRow("Rate", `${booking.currency} ${Number(booking.agreedRate).toLocaleString()}`)}
    </table>
    ${ctaButton("View Booking", `${CLIENT_URL}/bookings/${booking.id}`)}
    <p style="margin:0;font-size:13px;color:#555;">Accept or decline this booking from your dashboard.</p>
  `);
  await send({ to, subject: `New booking request: ${booking.title}`, html });
}

export async function sendBookingConfirmedEmail({
  to,
  hirerName,
  workerName,
  booking,
}) {
  const html = baseLayout(`
    ${heading("Booking confirmed ✅")}
    ${subheading(`Hi ${hirerName}, ${workerName} has accepted your booking.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Job", booking.title)}
      ${infoRow("Date", new Date(booking.scheduledAt).toLocaleDateString("en-GB", { dateStyle: "full" }))}
      ${infoRow("Location", booking.address)}
      ${infoRow("Rate", `${booking.currency} ${Number(booking.agreedRate).toLocaleString()}`)}
    </table>
    ${alertBox("💳 Please complete payment to secure your booking.")}
    ${ctaButton("Pay Now", `${CLIENT_URL}/bookings/${booking.id}/pay`)}
  `);
  await send({ to, subject: `Booking confirmed: ${booking.title}`, html });
}

export async function sendBookingCancelledEmail({ to, name, booking, reason }) {
  const html = baseLayout(`
    ${heading("Booking cancelled")}
    ${subheading(`Hi ${name}, the following booking has been cancelled.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Job", booking.title)}
      ${infoRow("Date", new Date(booking.scheduledAt).toLocaleDateString("en-GB", { dateStyle: "full" }))}
      ${reason ? infoRow("Reason", reason) : ""}
    </table>
    ${ctaButton("View Details", `${CLIENT_URL}/bookings/${booking.id}`)}
  `);
  await send({ to, subject: `Booking cancelled: ${booking.title}`, html });
}

export async function sendJobCompletedEmail({
  to,
  hirerName,
  workerName,
  booking,
}) {
  const html = baseLayout(`
    ${heading("Job completed 🎉")}
    ${subheading(`Hi ${hirerName}, ${workerName} has marked the job as complete.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Job", booking.title)}
    </table>
    ${alertBox("Please release payment to the worker if you're satisfied with the work.")}
    ${ctaButton("Release Payment", `${CLIENT_URL}/bookings/${booking.id}/release`)}
  `);
  await send({ to, subject: `Job completed: ${booking.title}`, html });
}

export async function sendReviewRequestEmail({
  to,
  name,
  otherPartyName,
  booking,
}) {
  const html = baseLayout(`
    ${heading("Leave a review")}
    ${subheading(`Hi ${name}, how was your experience with ${otherPartyName}?`)}
    <p style="margin:0 0 8px;font-size:14px;color:#aaa;">Your review helps build trust in the SkilledProzz community.</p>
    ${ctaButton("Leave Review", `${CLIENT_URL}/bookings/${booking.id}/review`)}
  `);
  await send({ to, subject: `Leave a review for ${otherPartyName}`, html });
}

// ══════════════════════════════════════════════════════════════════════════════
// JOB APPLICATION EMAILS
// ══════════════════════════════════════════════════════════════════════════════

// ── Worker applied to hirer's job ─────────────────────────────────────────────
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
  const html = baseLayout(
    `
    ${heading("New job application 📋")}
    ${subheading(`Hi ${hirerName}, ${workerName} applied for your job posting.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Job", jobTitle)}
      ${infoRow("Applicant", workerName)}
      ${workerTitle ? infoRow("Title", workerTitle) : ""}
      ${workerRating > 0 ? infoRow("Rating", `★ ${Number(workerRating).toFixed(1)}`) : ""}
    </table>

    ${
      message
        ? `
      <div style="background:#1a1a1a;border-left:3px solid #ff6b00;border-radius:0 8px 8px 0;padding:14px 18px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.08em;">Message from applicant</p>
        <p style="margin:0;font-size:14px;color:#ccc;font-style:italic;">"${message}"</p>
      </div>
    `
        : ""
    }

    ${ctaButton("Review Application", `${CLIENT_URL}/jobs/${jobId}/applications`)}
    <p style="margin:0;font-size:13px;color:#555;">You can accept or decline this application from your dashboard.</p>
  `,
    `${workerName} applied for your job: ${jobTitle}`,
  );

  await send({ to, subject: `New application for "${jobTitle}"`, html });
}

// ── Application accepted ───────────────────────────────────────────────────────
export async function sendApplicationAcceptedEmail({
  to,
  workerName,
  hirerName,
  jobTitle,
  jobId,
  message,
}) {
  const html = baseLayout(
    `
    ${heading("Application accepted! 🎉")}
    ${subheading(`Congratulations ${workerName}, your application was accepted.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Job", jobTitle)}
      ${infoRow("Hirer", hirerName)}
    </table>

    ${
      message
        ? `
      <div style="background:#1a1a1a;border-left:3px solid #22c55e;border-radius:0 8px 8px 0;padding:14px 18px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.08em;">Message from hirer</p>
        <p style="margin:0;font-size:14px;color:#ccc;font-style:italic;">"${message}"</p>
      </div>
    `
        : ""
    }

    ${alertBox("🚀 The hirer may reach out to finalise details. Check your messages.", "#22c55e")}
    ${ctaButton("View Job", `${CLIENT_URL}/jobs/${jobId}`)}
  `,
    `Your application for "${jobTitle}" was accepted!`,
  );

  await send({ to, subject: `✅ Application accepted: ${jobTitle}`, html });
}

// ── Application declined ───────────────────────────────────────────────────────
export async function sendApplicationDeclinedEmail({
  to,
  workerName,
  jobTitle,
  hirerName,
}) {
  const html = baseLayout(
    `
    ${heading("Application update")}
    ${subheading(`Hi ${workerName}, we have an update on your application.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Job", jobTitle)}
      ${infoRow("Hirer", hirerName)}
      ${infoRow("Status", "Not selected")}
    </table>

    <p style="margin:16px 0 8px;font-size:14px;color:#aaa;">Unfortunately your application for <strong style="color:#fff;">"${jobTitle}"</strong> was not selected this time. Don't be discouraged — there are many more opportunities waiting for you.</p>

    ${ctaButton("Browse More Jobs", `${CLIENT_URL}/jobs`)}
  `,
    `Update on your application for "${jobTitle}"`,
  );

  await send({ to, subject: `Application update: ${jobTitle}`, html });
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE / SOCIAL EMAILS
// ══════════════════════════════════════════════════════════════════════════════

// ── Profile viewed ─────────────────────────────────────────────────────────────
export async function sendProfileViewedEmail({
  to,
  name,
  viewerName,
  viewerRole,
  viewerAvatar,
  profileUrl,
}) {
  const html = baseLayout(
    `
    ${heading("Someone viewed your profile 👀")}
    ${subheading(`Hi ${name}, a ${viewerRole?.toLowerCase() || "user"} checked out your profile.`)}

    <div style="display:flex;align-items:center;gap:14px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:16px 20px;margin:20px 0;">
      <div style="width:44px;height:44px;border-radius:50%;background:#ff6b00;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:#000;flex-shrink:0;">
        ${viewerName?.[0]?.toUpperCase() || "?"}
      </div>
      <div>
        <p style="margin:0;font-size:15px;font-weight:700;color:#fff;">${viewerName}</p>
        <p style="margin:2px 0 0;font-size:13px;color:#666;">${viewerRole || "SkilledProzz user"}</p>
      </div>
    </div>

    <p style="margin:0 0 8px;font-size:14px;color:#aaa;">Make sure your profile is up to date to make a great impression!</p>

    ${ctaButton("View My Profile", profileUrl || `${CLIENT_URL}/profile`)}
  `,
    `${viewerName} viewed your profile`,
  );

  await send({ to, subject: `${viewerName} viewed your profile`, html });
}

// ── New message ────────────────────────────────────────────────────────────────
export async function sendNewMessageEmail({
  to,
  recipientName,
  senderName,
  preview,
  conversationId,
}) {
  const html = baseLayout(
    `
    ${heading("You have a new message 💬")}
    ${subheading(`Hi ${recipientName}, ${senderName} sent you a message.`)}

    <div style="background:#1a1a1a;border-left:3px solid #ff6b00;border-radius:0 8px 8px 0;padding:14px 18px;margin:20px 0;">
      <p style="margin:0 0 4px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.08em;">${senderName}</p>
      <p style="margin:0;font-size:15px;color:#ddd;font-style:italic;">"${preview?.slice(0, 120)}${preview?.length > 120 ? "…" : ""}"</p>
    </div>

    ${ctaButton("Reply Now", `${CLIENT_URL}/messages${conversationId ? `/${conversationId}` : ""}`)}
    <p style="margin:0;font-size:13px;color:#555;">You can manage your notification preferences in your account settings.</p>
  `,
    `${senderName}: "${preview?.slice(0, 60)}…"`,
  );

  await send({ to, subject: `New message from ${senderName}`, html });
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT EMAILS
// ══════════════════════════════════════════════════════════════════════════════

export async function sendPaymentInitiatedEmail({
  to,
  name,
  booking,
  amount,
  currency,
  provider,
}) {
  const html = baseLayout(`
    ${heading("Payment initiated")}
    ${subheading(`Hi ${name}, your payment is being processed.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Job", booking.title)}
      ${infoRow("Amount", `${currency} ${Number(amount).toLocaleString()}`)}
      ${infoRow("Provider", provider)}
      ${infoRow("Status", "Processing")}
    </table>
    ${ctaButton("View Booking", `${CLIENT_URL}/bookings/${booking.id}`)}
  `);
  await send({ to, subject: `Payment initiated for ${booking.title}`, html });
}

export async function sendPaymentReleasedEmail({
  to,
  workerName,
  hirerName,
  booking,
  amount,
  currency,
}) {
  const html = baseLayout(`
    ${heading("Payment released 💰")}
    ${subheading(`Hi ${workerName}, your payment has been released.`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow("Job", booking.title)}
      ${infoRow("From", hirerName)}
      ${infoRow("Amount", `${currency} ${Number(amount).toLocaleString()}`)}
    </table>
    ${alertBox("💳 Funds will appear in your account within 1-3 business days depending on your provider.", "#22c55e")}
    ${ctaButton("View Earnings", `${CLIENT_URL}/dashboard/worker/earnings`)}
  `);
  await send({ to, subject: `Payment released: ${booking.title}`, html });
}
