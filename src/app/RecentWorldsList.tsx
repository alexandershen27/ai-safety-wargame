"use client";
// Client component for the landing-page "Your worlds" list. We need a client
// boundary so Reality can hit a delete button next to worlds they own without
// leaving the page.
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

type Row = {
  id: string;
  name: string;
  joinCode: string;
  status: string;
  isReality: boolean;
};

export function RecentWorldsList({ worlds }: { worlds: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [list, setList] = useState(worlds);

  async function del(w: Row) {
    const ok = window.confirm(
      `Delete "${w.name}"? This permanently removes the world and all its turns, actions, and votes. Players can't rejoin.`,
    );
    if (!ok) return;
    setBusyId(w.id);
    const res = await fetch(`/api/worlds/${w.id}`, { method: "DELETE" });
    if (res.ok) {
      setList((l) => l.filter((x) => x.id !== w.id));
      router.refresh();
    }
    setBusyId(null);
  }

  if (list.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {list.map((w) => (
        <div
          key={w.id}
          className="gb-card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 0,
            overflow: "hidden",
          }}
        >
          <Link
            href={w.status === "lobby" ? `/world/${w.id}/lobby` : `/world/${w.id}`}
            style={{
              flex: 1,
              minWidth: 0,
              padding: 14,
              textDecoration: "none",
              display: "block",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 2,
              }}
            >
              <span style={{ color: "var(--text)", fontSize: 14 }}>{w.name}</span>
              {w.isReality && <span className="gb-pill accent">Reality</span>}
              <span
                className="gb-mono"
                style={{ color: "var(--muted)", fontSize: 10 }}
              >
                {w.status}
              </span>
            </div>
            <div
              className="gb-mono"
              style={{ color: "var(--muted)", fontSize: 11 }}
            >
              code {w.joinCode}
            </div>
          </Link>
          {w.isReality && (
            <button
              type="button"
              className="gb-btn sm"
              onClick={() => del(w)}
              disabled={busyId === w.id}
              style={{
                borderColor: "var(--bad)",
                color: "var(--bad)",
                marginRight: 12,
              }}
              title="Delete this world (Reality only)."
            >
              {busyId === w.id ? "…" : "Delete"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
