"use client";
// Top-level client shell. Polls /api/worlds/:id/state every 2s and routes by
// phase. The state machine is DISCUSSION → RESOLVE → CLOSED; legacy VOTE
// turns render as DISCUSSION.
//
// Reality's advance button is context-aware:
//   DISCUSSION + all submitted, all voted   →  "End discussion → Resolve"
//   DISCUSSION + all submitted, votes open  →  "Resolve (3 still voting)" (warn)
//   DISCUSSION + stragglers                 →  "Resolve anyway (2 still drafting)" (warn)
//   RESOLVE + work pending                  →  "Resolve N more to close" (disabled)
//   RESOLVE + done                          →  "Close turn → next"
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Ribbon } from "@/components/Ribbon";
import type { WorldView } from "@/lib/world/state";
import type { Phase } from "@/lib/phases";
import { formatDate, type TimestepUnit } from "@/lib/timestep";
import { REFRESH_EVENT, requestRefresh } from "@/lib/refresh";
import { DiscussionView } from "./phases/DiscussionView";
import { ResolveView } from "./phases/ResolveView";
import { RoleMenu } from "./RoleMenu";

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
  // Single-flight guard. If a fetch is already in flight, don't queue another —
  // the in-flight one will return the freshest state anyway.
  const inFlight = useRef(false);

  const fetchState = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/worlds/${worldId}/state`, { cache: "no-store" });
      if (res.ok) setView(await res.json());
    } catch {
      // Network blip — next poll will recover.
    } finally {
      inFlight.current = false;
    }
  }, [worldId]);

  // Slow background poll for picking up other players' changes.
  useEffect(() => {
    const t = setInterval(fetchState, POLL_MS);
    return () => clearInterval(t);
  }, [fetchState]);

  // Fast refresh after my own mutations. Any child component can fire
  // requestRefresh() and we'll refetch immediately, bypassing the 2s gap.
  useEffect(() => {
    const handler = () => fetchState();
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [fetchState]);

  const turn = view.currentTurn;
  const phase = (turn?.phase as Phase) ?? "DISCUSSION";
  // Legacy VOTE renders identically to DISCUSSION (combined drafting+voting).
  const showResolveView = phase === "RESOLVE";
  const showClosedView = phase === "CLOSED";

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
        currentTurnId={view.world.currentTurnId ?? turn?.id ?? null}
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <RoleMenu
            worldId={worldId}
            roles={view.roles}
            myRoleIds={view.myRoleIds}
            seatCountsByRole={view.seats.reduce(
              (acc, s) => {
                acc[s.roleId] = (acc[s.roleId] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            )}
          />
          {view.isReality && (
            <>
              <CancelBranchButton worldId={worldId} view={view} />
              <PhaseAdvanceButton worldId={worldId} view={view} />
            </>
          )}
        </div>
      </div>

      <main style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {showClosedView ? (
          <div className="gb-card" style={{ maxWidth: 600, margin: "0 auto" }}>
            <p className="gb-p">Turn closed. Waiting for the next turn to open.</p>
          </div>
        ) : showResolveView ? (
          <ResolveView view={view} />
        ) : (
          <DiscussionView worldId={worldId} view={view} you={you} />
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

  if (phase === "DISCUSSION" || phase === "VOTE") {
    const stragglers = submitProgress.expected - submitProgress.submitted;
    if (stragglers > 0) {
      return {
        label: `Resolve anyway (${stragglers} still drafting)`,
        warn: true,
        blocked: false,
      };
    }
    const pendingVoters = voteProgress.total - voteProgress.finished;
    if (pendingVoters > 0) {
      return {
        label: `Resolve (${pendingVoters} still voting)`,
        warn: true,
        blocked: false,
      };
    }
    return { label: "End discussion → Resolve", warn: false, blocked: false };
  }

  if (phase === "RESOLVE") {
    const submittedActions = view.actions.filter(
      (a) => a.submittedAt && (a.submittedText ?? "").trim().length > 0,
    );
    // An action is "resolved" once it has an outcome — text is optional.
    const unresolved = submittedActions.filter((a) => !a.resolvedOutcome).length;
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

/**
 * "Cancel branch" only appears when the current turn is a provisional fork —
 * RESOLVE phase, has a sibling (was created via /branch), has no children
 * yet. Discards the turn server-side and points the world back at the
 * sibling's chain.
 */
function CancelBranchButton({
  worldId,
  view,
}: {
  worldId: string;
  view: WorldView;
}) {
  const [busy, setBusy] = useState(false);
  const turn = view.currentTurn;
  if (!turn || turn.phase !== "RESOLVE") return null;
  const sameParent = view.allTurns.filter(
    (t) => t.parentTurnId === turn.parentTurnId,
  );
  const hasSibling = sameParent.length > 1;
  const hasChildren = view.allTurns.some((t) => t.parentTurnId === turn.id);
  if (!hasSibling || hasChildren) return null;

  async function cancel() {
    const ok = window.confirm(
      "Discard this branch? The resolutions you set won't be saved.",
    );
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/worlds/${worldId}/cancel-branch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turnId: turn!.id }),
    });
    if (res.ok) requestRefresh();
    setBusy(false);
  }

  return (
    <button
      type="button"
      className="gb-btn sm"
      onClick={cancel}
      disabled={busy}
      style={{
        borderColor: "var(--bad)",
        color: "var(--bad)",
      }}
      title="Discard this fork and return to the original branch."
    >
      {busy ? "…" : "✕ Cancel branch"}
    </button>
  );
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

  // Build a confirmation message that names what's unfinished. Browsers'
  // native confirm dialog is plenty for this one decision.
  function confirmMessage(): string {
    const phase = view.currentTurn?.phase;
    if (phase === "DISCUSSION" || phase === "VOTE") {
      const stragglers =
        view.submitProgress.expected - view.submitProgress.submitted;
      if (stragglers > 0) {
        return `${stragglers} seat${stragglers === 1 ? "" : "s"} haven't submitted yet. Their action${
          stragglers === 1 ? "" : "s"
        } will be dropped for this turn. Continue to Resolve?`;
      }
      const pendingVoters = view.voteProgress.total - view.voteProgress.finished;
      return `${pendingVoters} player${pendingVoters === 1 ? "" : "s"} haven't finished voting on every action. Continue to Resolve anyway?`;
    }
    return "Continue?";
  }

  async function go() {
    if (state!.warn) {
      const ok = window.confirm(confirmMessage());
      if (!ok) return;
    }
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/worlds/${worldId}/advance`, { method: "POST" });
    if (!res.ok) setError(await res.text());
    else requestRefresh();
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
            ? { borderColor: "var(--warn)", color: "var(--warn)" }
            : undefined
        }
      >
        {busy ? "…" : state.label}
      </button>
    </div>
  );
}
