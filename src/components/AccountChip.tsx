"use client";
// Top-right account state in the Topbar. Three shapes:
//   - Signed in:  ✉ alice@example.com · Sign out
//   - Anonymous:  avatar + display name · Sign in
//   - No identity (rare, e.g. server-render before cookie): just "Sign in"
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AccountChip({
  you,
  account,
}: {
  you?: string;
  account: { email: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/sign-out", { method: "POST" });
    // Full reload so server components re-pick up the unbound state.
    router.refresh();
    setBusy(false);
  }

  if (account) {
    return (
      <div className="gb-user" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          className="gb-mono"
          style={{ color: "var(--muted)", fontSize: 11 }}
          title={account.email}
        >
          ✉ {account.email}
        </span>
        <button
          type="button"
          className="gb-btn sm"
          onClick={signOut}
          disabled={busy}
          style={{ fontSize: 10 }}
          title="Sign out — your anonymous seats on this device stay."
        >
          {busy ? "…" : "Sign out"}
        </button>
      </div>
    );
  }

  return (
    <div className="gb-user" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {you && <div className="gb-avatar">{you[0]?.toUpperCase() ?? "?"}</div>}
      {you && <span>{you}</span>}
      <Link
        href="/sign-in"
        className="gb-btn sm"
        style={{ fontSize: 10, textDecoration: "none" }}
      >
        Sign in
      </Link>
    </div>
  );
}
