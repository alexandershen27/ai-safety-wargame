"use client";
// Top-level client shell. Polls /api/worlds/:id/state every 2s and routes by phase.
//
// The advance button is context-aware:
//   DISCUSSION + all submitted: "End discussion → Resolve"
//                               (server skips VOTE entirely)
//   DISCUSSION + stragglers:    "Force vote (3 still drafting)"
//                               (warning label; advances to VOTE)
//   VOTE + everyone voted:      "End voting → Resolve"
//   VOTE + voters unfinished:   "Resolve anyway (2 still voting)"
//   RESOLVE + work pending:     "Resolve N more to close" — disabled
//   RESOLVE + done:             "Close turn → next"
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
        {view.isReality && <PhaseAdvanceButton worldId={worldId} view={view} />}
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

type AdvanceState = {
  label: string;
  warn: boolean;
  blocked: boolean;
};

function computeAdvanceState(view: WorldView): AdvanceState | null {
  const phase = (view.currentTurn?.phase as Phase) ?? "DISCUSSION";
  const { submitProgress, voteProgress } = view;
  const submittedActions = view.actions.filter((a) => a.submittedText);

  if (phase === "DISCUSSION") {
    const allSubmitted =
      submitProgress.expected === 0 ||
      submitProgress.submitted >= submitProgress.expected;
    if (allSubmitted) {
      return { label: "End discussion → Resolve", warn: false, blocked: false };
    }
    const pending = submitProgress.expected - submitProgress.submitted;
    return {
      label: `Force vote (${pending} still drafting)`,
      warn: true,
      blocked: false,
    };
  }

  if (phase === "VOTE") {
    const pendingVoters = voteProgress.total - voteProgress.finished;
    if (pendingVoters <= 0) {
      return { label: "End voting → Resolve", warn: false, blocked: false };
    }
    return {
      label: `Resolve anyway (${pendingVoters} still voting)`,
      warn: true,
      blocked: false,
    };
  }

  if (phase === "RESOLVE") {
    const unresolved = submittedActions.filter((a) => !a.resolvedText).length;
    if (unresolved > 0) {
      return {
        label: `Resolve ${unresolved} more to close`,
        warn: false,
        blocked: true,
      };
    }
    return { label: "Close turn → next", warn: false, blocked: false };
  }

  return null;
}

function PhaseAdvanceButton({
  worldId,
  view,
}: {
  worldId: string;
  view: WorldView;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = computeAdvanceState(view);
  if (!state) return null;

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
        className={"gb-btn sm " + (state.warn ? "" : "primary")}
        onClick={go}
        disabled={busy || state.blocked}
        style={
          state.warn
            ? {
                borderColor: "var(--warn)",
                color: "var(--warn)",
              }
            : undefined
        }
      >
        {busy ? "…" : state.label}
      </button>
    </div>
  );
}
