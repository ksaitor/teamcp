import { prisma } from "@/db";
import { sendEmail } from "@/lib/email";

interface NotificationPayload {
  type: "approval_needed";
  approvalId: string;
  memberName: string;
  toolName: string;
  connectorName: string;
}

/**
 * Dispatch notifications to admins via configured channels.
 */
export async function dispatchNotification(
  organizationId: string,
  payload: NotificationPayload
) {
  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId },
  });

  if (!settings) return;

  const promises: Promise<void>[] = [];

  // Email notification to all admins/owners
  if (settings.notifyEmail) {
    promises.push(sendEmailToAdmins(organizationId, payload));
  }

  // Webhook notification
  if (settings.notifyWebhookUrl) {
    promises.push(sendWebhook(settings.notifyWebhookUrl, payload));
  }

  // Slack notification
  if (settings.notifySlackWebhookUrl) {
    promises.push(sendSlackNotification(settings.notifySlackWebhookUrl, payload));
  }

  await Promise.allSettled(promises);
}

async function sendEmailToAdmins(
  organizationId: string,
  payload: NotificationPayload
) {
  try {
    // Find all OWNER and ADMIN members with active status
    const adminMemberships = await prisma.orgMembership.findMany({
      where: {
        organizationId,
        role: { in: ["OWNER", "ADMIN"] },
        status: "ACTIVE",
        suspendedAt: null,
      },
      include: {
        user: { select: { email: true, name: true } },
      },
    });

    const adminEmails = adminMemberships
      .map((m) => m.user.email)
      .filter((e): e is string => !!e);

    if (adminEmails.length === 0) return;

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const approvalUrl = `${appUrl}/approvals`;

    await sendEmail({
      to: adminEmails,
      subject: `[Teamcp] Approval needed: ${payload.memberName} → ${payload.toolName}`,
      text: [
        `An action requires your approval.`,
        ``,
        `Member: ${payload.memberName}`,
        `Tool: ${payload.toolName}`,
        `Connector: ${payload.connectorName}`,
        ``,
        `Review and respond: ${approvalUrl}`,
      ].join("\n"),
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="margin: 0 0 16px; color: #111;">Approval Required</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; color: #666; width: 100px;">Member</td>
              <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(payload.memberName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Tool</td>
              <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(payload.toolName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Connector</td>
              <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(payload.connectorName)}</td>
            </tr>
          </table>
          <a href="${approvalUrl}" style="display: inline-block; padding: 10px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">
            Review in Dashboard
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            This approval request will expire in 5 minutes if not acted upon.
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("Email notification failed:", error);
  }
}

async function sendWebhook(url: string, payload: NotificationPayload) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Webhook notification failed:", error);
  }
}

async function sendSlackNotification(
  webhookUrl: string,
  payload: NotificationPayload
) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Approval needed: ${payload.memberName} wants to use ${payload.toolName} on ${payload.connectorName}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Approval Required*\n*Member:* ${payload.memberName}\n*Tool:* ${payload.toolName}\n*Connector:* ${payload.connectorName}`,
            },
          },
        ],
      }),
    });
  } catch (error) {
    console.error("Slack notification failed:", error);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
