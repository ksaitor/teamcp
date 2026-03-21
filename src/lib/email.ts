import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const smtpUrl = process.env.SMTP_URL;
  if (!smtpUrl) return null;
  transporter = nodemailer.createTransport(smtpUrl);
  return transporter;
}

export async function sendVerificationCode(email: string, code: string) {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[DEV] Verification code for ${email}: ${code}`);
    return;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || "TeamMCP <noreply@teammcp.com>",
    to: email,
    subject: `Your TeamMCP verification code: ${code}`,
    text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="margin-bottom: 8px;">Your verification code</h2>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; margin: 16px 0;">${code}</p>
        <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}
