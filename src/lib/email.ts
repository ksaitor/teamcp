import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const smtpUrl = process.env.SMTP_URL;
  if (!smtpUrl) return null;
  transporter = nodemailer.createTransport(smtpUrl);
  return transporter;
}

function getFrom(): string {
  return process.env.SMTP_FROM || "TeamCP <noreply@teamrouter.com>";
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
}

/**
 * Send an email via SMTP. Falls back to console.log in dev when SMTP_URL is not set.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const transport = getTransporter();

  if (!transport) {
    const recipients = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
    console.log(`[DEV] Email to ${recipients}: ${opts.subject}`);
    console.log(`[DEV] ${opts.text}`);
    return;
  }

  await transport.sendMail({
    from: getFrom(),
    to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

export async function sendVerificationCode(email: string, code: string) {
  await sendEmail({
    to: email,
    subject: `Your TeamCP verification code: ${code}`,
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
