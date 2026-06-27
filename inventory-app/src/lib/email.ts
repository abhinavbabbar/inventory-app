// Minimal email sender. Uses Resend's HTTP API when configured; otherwise it
// no-ops (the caller logs the link for local/test use). No SDK dependency.
//
// Env:
//   RESEND_API_KEY  Resend API key (https://resend.com)
//   EMAIL_FROM      verified sender, e.g. "Acme <noreply@acme.com>".
//                   Defaults to Resend's test sender (only delivers to the
//                   Resend account owner until you verify a domain).

type Attachment = { filename: string; content: string }; // content = base64

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Attachment[];
};

export type SendResult = { delivered: boolean; reason?: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipping send to ${args.to} (${args.subject}).`);
    return { delivered: false, reason: "not_configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        ...(args.attachments && args.attachments.length > 0 ? { attachments: args.attachments } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend responded ${res.status}: ${body}`);
      return { delivered: false, reason: `http_${res.status}` };
    }
    return { delivered: true };
  } catch (e) {
    console.error("[email] send failed:", e);
    return { delivered: false, reason: "exception" };
  }
}
