"use client";
// Magic-link request form. On submit we POST and then show a "check your
// email" panel. The resend button is disabled for 30s after each send so
// users can't hammer their own inbox (the server also rate-limits to 60s).
import { useState } from "react";

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (Date.now() < cooldownUntil) return;
    if (!email.trim()) return;
    setPhase("sending");
    setErrMsg(null);
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), next }),
    });
    if (res.ok) {
      setPhase("sent");
      setCooldownUntil(Date.now() + 30_000);
      return;
    }
    if (res.status === 429) {
      setPhase("error");
      setErrMsg(
        "We just sent a link to that address. Check your inbox or wait a minute and try again.",
      );
      return;
    }
    setPhase("error");
    setErrMsg("Couldn't send the link. Try again in a moment.");
  }

  const cooldownLeft = Math.max(0, cooldownUntil - Date.now());

  if (phase === "sent") {
    return (
      <div className="gb-card">
        <p className="gb-p" style={{ marginBottom: 6 }}>
          Check <strong>{email}</strong> for a sign-in link.
        </p>
        <p
          className="gb-p"
          style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}
        >
          The link expires in 15 minutes. You can close this tab.
        </p>
        <ResendBlock
          onResend={send}
          cooldownLeft={cooldownLeft}
          errMsg={errMsg}
        />
      </div>
    );
  }

  return (
    <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          className="gb-mono"
          style={{
            color: "var(--muted)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Email
        </span>
        <input
          className="gb-input"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>
      {errMsg && (
        <div
          className="gb-mono"
          style={{ color: "var(--bad)", fontSize: 12 }}
        >
          {errMsg}
        </div>
      )}
      <button
        type="submit"
        className="gb-btn primary"
        disabled={phase === "sending" || !email.trim()}
      >
        {phase === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}

function ResendBlock({
  onResend,
  cooldownLeft,
  errMsg,
}: {
  onResend: () => void;
  cooldownLeft: number;
  errMsg: string | null;
}) {
  const secs = Math.ceil(cooldownLeft / 1000);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        className="gb-btn sm"
        onClick={onResend}
        disabled={cooldownLeft > 0}
      >
        {cooldownLeft > 0 ? `Resend in ${secs}s` : "Resend link"}
      </button>
      {errMsg && (
        <span
          className="gb-mono"
          style={{ color: "var(--bad)", fontSize: 11 }}
        >
          {errMsg}
        </span>
      )}
    </div>
  );
}
