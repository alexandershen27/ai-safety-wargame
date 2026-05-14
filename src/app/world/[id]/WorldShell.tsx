"use client";
// Top-level client shell. Polls /api/worlds/:id/state every 2s and routes by phase.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Ribbon } from "@/components/Ribbon";
import type { WorldView } from "@/lib/world/state";
import type { Phase } from "@/lib/phases";
import { formatDate, type TimestepUnit } from "@/lib/timestep";
import { DiscussionView } from "./phases/DiscussionView";
import { VoteView } from "./phases/VoteView";
import { ResolveView } from "./phases/ResolveView";

const POLL_MS = 2000;

export function WorldShell({
  worldId,
  you,
  initial,
}: {
  worldId: string;
  you: { id: string; displayName: string };
  initial: WorldView;
}) {
  const [view, setView] = useState<WorldView>(initial);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/worlds/${worldId}/state`, { cache: "no-store" });
        if (res.ok && alive) setView(await res.json());
      } catch {}
    };
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [worldId]);

  const turn = view.currentTurn;
  const phase = (turn?.phase as Phase) ?? "DISCUSSION";

  // For Reality's "Close turn" button: count submitted-but-not-resolved actions.
  const submittedActions = view.actions.filter((a) => a.submittedAt);
  const unresolved = submittedActions.filter((a) => !a.resolvedText).length;

  return (
    <>
      <Topbar
        worldName={view.world.name}
        turnNumber={turn?.turnNumber}
        phase={phase}
        date={turn ? formatDate(turn.dateAtTurn) : undefined}
        you={you.displayName}
      />
      <Ribbon
        worldId={worldId}
        turns={view.allTurns}
        unit={view.world.timestepUnit as TimestepUnit}
      />
      <div className="gb-shellbar">
        <Link
          href={`/world/${worldId}/timeline`}
          className="gb-mono"
          style={{ color: "var(--muted)" }}
        >
          ↺ History
        </Link>
        {view.isReality && (
          <PhaseAdvanceButton
            worldId={worldId}
            phase={phase}
            unresolved={unresolved}
          />
        )}
      </div>

      <main style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {phase === "DISCUSSION" && (
          <DiscussionView worldId={worldId} view={view} you={you} />
        )}
        {phase === "VOTE" && <VoteView worldId={worldId} view={view} you={you} />}
        {phase === "RESOLVE" && <ResolveView view={view} />}
        {phase === "CLOSED" && (
          <div className="gb-card" style={{ maxWidth: 600, margin: "0 auto" }}>
            <p className="gb-p">Turn closed. Waiting for the next turn to open.</p>
          </div>
        )}
      </main>
    </>
  );
}

function PhaseAdvanceButton({
  worldId,
  phase,
  unresolved,
}: {
  worldId: string;
  phase: Phase;
  unresolved: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label =
    phase === "DISCUSSION"
      ? "End discussion → Vote"
      : phase === "VOTE"
        ? "End voting → Resolve"
        : phase === "RESOLVE"
          ? unresolved > 0
            ? `Resolve ${unresolved} more to close`
            : "Close turn → next"
          : null;
  if (!label) return null;
  const blocked = phase === "RESOLVE" && unresolved > 0;
  async function go() {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/worlds/${worldId}/advance`, { method: "POST" });
    if (!res.ok) setError(await res.text());
    setBusy(false);
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {error && (
        <span className="gb-mono" style={{ color: "var(--bad)", fontSize: 11 }}>
          {error}
        </span>
      )}
      <button
        className="gb-btn primary sm"
        onClick={go}
        disabled={busy || blocked}
      >
        {busy ? "…" : label}
      </button>
    </div>
  );
}
