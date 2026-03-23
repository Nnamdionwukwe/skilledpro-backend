import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendEmail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
};

export const sendVerificationEmail = async (email, token) => {
  const url = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Verify your SkilledPro account",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#7C3AED">Welcome to SkilledPro</h2>
        <p>Click the button below to verify your email address.</p>
        <a href="${url}" style="background:#7C3AED;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">
          Verify Email
        </a>
        <p style="color:#666;font-size:12px">Link expires in 24 hours. If you did not sign up, ignore this email.</p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (email, token) => {
  const url = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Reset your SkilledPro password",
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#7C3AED">Password Reset</h2>
        <p>Click below to reset your password. This link expires in 1 hour.</p>
        <a href="${url}" style="background:#7C3AED;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">
          Reset Password
        </a>
        <p style="color:#666;font-size:12px">If you did not request this, ignore this email.</p>
      </div>
    `,
  });
};
