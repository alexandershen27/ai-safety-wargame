// Email sender — abstraction over Resend so local dev never needs an API key.
//
// Driver selection:
//   EMAIL_DRIVER=console  → log the magic-link URL to stdout. Default in dev.
//   EMAIL_DRIVER=resend   → send via Resend's REST API. Default in prod.
//
// We only need ONE message type (magic-link), so the surface area is tiny.
// If we ever add more, switch the driver to a `send({ to, subject, html })`
// shape.
import "server-only";

const FROM = process.env.EMAIL_FROM ?? "Wargame <noreply@example.com>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DRIVER =
  process.env.EMAIL_DRIVER ??
  (process.env.NODE_ENV === "production" ? "resend" : "console");

export async function sendMagicLink(email: string, url: string): Promise<void> {
  if (DRIVER === "console") {
    // Local dev: just print the link. The verify endpoint is idempotent so
    // copy-pasting from the terminal works.
    // eslint-disable-next-line no-console
    console.log(
      `\n[email:console] Magic-link for ${email}\n  ${url}\n  (click within 15 min)\n`,
    );
    return;
  }

  if (DRIVER === "resend") {
    if (!RESEND_API_KEY) {
      throw new Error("EMAIL_DRIVER=resend but RESEND_API_KEY is not set.");
    }
    const subject = "Sign in to Wargame";
    const html = renderMagicLinkHtml(url);
    const text = `Click to sign in: ${url}\n\nThis link expires in 15 minutes.`;
    // Direct fetch to keep the bundle slim — Resend's SDK is ~100kb gzipped
    // for a single POST endpoint.
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend send failed: ${res.status} ${body}`);
    }
    return;
  }

  throw new Error(`Unknown EMAIL_DRIVER: ${DRIVER}`);
}

function renderMagicLinkHtml(url: string): string {
  // Plain, accessible. No tracking pixels, no remote assets.
  const safe = url.replace(/"/g, "&quot;");
  return `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; color: #111;">
  <p>Click below to sign in to Wargame:</p>
  <p><a href="${safe}" style="display: inline-block; padding: 10px 16px; background: #1a0f08; color: #fff; text-decoration: none; border-radius: 4px;">Sign in</a></p>
  <p style="font-size: 12px; color: #555;">Or copy this link into your browser:<br><span style="word-break: break-all;">${safe}</span></p>
  <p style="font-size: 12px; color: #555;">This link expires in 15 minutes. If you didn't request it, ignore this email.</p>
</body></html>`;
}
