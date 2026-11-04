import "server-only";
import { Resend } from "resend";
import { isDemo } from "@/lib/demo";

export interface AlertMessage {
  subject: string;
  text: string;
}

export async function sendEmail(to: string, msg: AlertMessage) {
  if (isDemo() || !process.env.RESEND_API_KEY) {
    console.info(`[notify] email to ${to} (not sent: ${isDemo() ? "demo mode" : "RESEND_API_KEY not set"})\n${msg.subject}\n${msg.text}`);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.ALERT_FROM_EMAIL ?? "alerts@burncap.dev",
    to,
    subject: msg.subject,
    text: msg.text,
  });
}

export async function sendSlack(webhookUrl: string, msg: AlertMessage) {
  if (isDemo()) {
    console.info(`[notify] slack (not sent: demo mode)\n${msg.subject}\n${msg.text}`);
    return;
  }
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `*${msg.subject}*\n${msg.text}` }),
  });
  if (!res.ok) console.error("[notify] slack webhook failed", res.status);
}
