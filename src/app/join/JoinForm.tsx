"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState(defaultName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (code.trim().length !== 6) return setError("Code is 6 characters.");
    if (!name.trim()) return setError("Display name required.");
    setSubmitting(true);
    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.trim().toUpperCase(), displayName: name.trim() }),
    });
    if (!res.ok) {
      setSubmitting(false);
      setError(await res.text());
      return;
    }
    const { worldId } = (await res.json()) as { worldId: string };
    router.push(`/world/${worldId}/lobby`);
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Join code
        </span>
        <input
          className="gb-input mono"
          maxLength={6}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          style={{ fontSize: 18, letterSpacing: "0.4em", textAlign: "center" }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Your name
        </span>
        <input
          className="gb-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {error && (
        <div className="gb-card" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
          {error}
        </div>
      )}
      <button type="submit" className="gb-btn primary" disabled={submitting}>
        {submitting ? "Joining…" : "Join"}
      </button>
    </form>
  );
}
