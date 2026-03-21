import { prisma } from "@/db";

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

  // Webhook notification
  if (settings.notifyWebhookUrl) {
    promises.push(sendWebhook(settings.notifyWebhookUrl, payload));
  }

  // Slack notification
  if (settings.notifySlackWebhookUrl) {
    promises.push(sendSlackNotification(settings.notifySlackWebhookUrl, payload));
  }

  // Email notification (TODO: implement SMTP)
  // if (settings.notifyEmail) { ... }

  await Promise.allSettled(promises);
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
