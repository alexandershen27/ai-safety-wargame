"use client";
// Branch graph + turn details panel for the timeline page.
//
// Horizontal layout: columns = turn_number, lanes = branch identity. Original
// chain stays on lane 0; siblings fork onto new lanes by creation time.
// Connectors are SVG paths with a single diagonal bend (git-graph style).
//
// Clicking a node selects it and shows its actions/resolutions below. Reality
// can act on selected nodes:
//   - "Resolve Differently"  on any closed turn        -> POST /api/.../branch
//                            (creates a sibling with the original resolutions
//                            pre-filled; navigates to the world page so
//                            Reality can edit and commit / cancel)
//   - "Switch here"          on inactive leaf nodes    -> POST /api/.../switch-to
//
// A "provisional" turn is one that was just forked but hasn't been committed
// (phase === RESOLVE, has a sibling, no children yet). It renders with a
// dashed border in the graph. Reality can cancel it from the world page.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RoleChip } from "@/components/RoleChip";
import { formatTurnDate, type TimestepUnit } from "@/lib/timestep";
import { layoutBranchGraph, type TurnNode } from "./graphLayout";

type Role = { id: string; name: string; color: string };
type Action = {
  id: string;
  turnId: string;
  roleId: string;
  submittedAt: string | null;
  submittedText: string | null;
  resolvedText: string | null;
  resolvedOutcome: string | null;
};
// TurnNode is re-exported from graphLayout but includes createdAt now —
// callers pass it through unmodified.

// Normalize legacy outcome ids ("success-high", "fail-hard") to the new
// success/partial/fail triplet for display.
function normalizeOutcome(outcomeId: string | null): {
  id: string;
  label: string;
  symbol: string;
  color: string;
} | null {
  if (!outcomeId) return null;
  const id = outcomeId.startsWith("success")
    ? "success"
    : outcomeId.startsWith("fail")
      ? "fail"
      : "partial";
  switch (id) {
    case "success":
      return { id, label: "Success", symbol: "✓", color: "var(--good)" };
    case "fail":
      return { id, label: "Fail", symbol: "✗", color: "var(--bad)" };
    default:
      return { id, label: "Partial", symbol: "~", color: "var(--warn)" };
  }
}

const COL_WIDTH = 132;
const LANE_HEIGHT = 88;
const NODE_WIDTH = 96;
const NODE_HEIGHT = 56;
const PAD_X = 16;
const PAD_Y = 16;

function nodeCenterX(turnNumber: number, minTurnNumber: number) {
  // Column index = turnNumber - minTurnNumber so a T0 boot turn (turnNumber=0)
  // sits at column 0 instead of off-canvas at column -1.
  return (
    PAD_X + (turnNumber - minTurnNumber) * COL_WIDTH + NODE_WIDTH / 2
  );
}
function nodeCenterY(lane: number) {
  return PAD_Y + lane * LANE_HEIGHT + NODE_HEIGHT / 2;
}

export function BranchGraphClient({
  worldId,
  isReality,
  currentTurnId,
  turns,
  roles,
  actions,
  unit,
}: {
  worldId: string;
  isReality: boolean;
  currentTurnId: string | null;
  turns: TurnNode[];
  roles: Role[];
  actions: Action[];
  unit: TimestepUnit;
}) {
  const router = useRouter();
  const layout = useMemo(
    () => layoutBranchGraph(turns, currentTurnId),
    [turns, currentTurnId],
  );
  const [selectedId, setSelectedId] = useState<string | null>(currentTurnId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reselect the current turn when it changes upstream (e.g. after a branch).
  useEffect(() => {
    setSelectedId(currentTurnId);
  }, [currentTurnId]);

  const selected = layout.nodes.find((n) => n.id === selectedId) ?? null;
  const selectedActions = selected
    ? actions.filter((a) => a.turnId === selected.id)
    : [];

  const width = PAD_X * 2 + Math.max(1, layout.numCols) * COL_WIDTH - (COL_WIDTH - NODE_WIDTH);
  const height = PAD_Y * 2 + layout.numLanes * LANE_HEIGHT - (LANE_HEIGHT - NODE_HEIGHT);

  async function callBranch(fromTurnId: string) {
    setError(null);
    setBusy(true);
    const r = await fetch(`/api/worlds/${worldId}/branch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromTurnId }),
    });
    if (!r.ok) {
      setError(await r.text());
      setBusy(false);
      router.refresh();
      return;
    }
    // After forking, send Reality to the resolve form on the new branch so
    // they can edit, commit, or cancel the provisional turn.
    router.push(`/world/${worldId}`);
  }

  async function callSwitch(toTurnId: string) {
    setError(null);
    setBusy(true);
    const r = await fetch(`/api/worlds/${worldId}/switch-to`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toTurnId }),
    });
    if (!r.ok) {
      setError(await r.text());
      setBusy(false);
      router.refresh();
      return;
    }
    // Land on the world page so the player goes straight to whichever phase
    // is now active (DISCUSSION for a fresh leaf-continue, RESOLVE for a
    // mid-resolution jump). Mirrors how "Resolve Differently" navigates.
    router.push(`/world/${worldId}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          position: "relative",
          width,
          height: Math.max(height, NODE_HEIGHT + PAD_Y * 2),
          overflowX: "auto",
        }}
      >
        {/* Connectors. SVG sits behind the nodes (z-index 0). */}
        <svg
          width={width}
          height={Math.max(height, NODE_HEIGHT + PAD_Y * 2)}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        >
          {layout.connectors.map((c) => {
            const fromX =
              nodeCenterX(c.fromCol, layout.minTurnNumber) + NODE_WIDTH / 2; // right edge of parent
            const fromY = nodeCenterY(c.fromLane);
            const toX =
              nodeCenterX(c.toCol, layout.minTurnNumber) - NODE_WIDTH / 2; // left edge of child
            const toY = nodeCenterY(c.toLane);
            // Simple 3-segment path: horizontal stub from parent, single
            // diagonal across the gap, horizontal stub into child. Same lane
            // collapses to a straight line.
            const stub = 14;
            const startStubX = fromX + stub;
            const endStubX = toX - stub;
            const d =
              fromY === toY
                ? `M ${fromX} ${fromY} L ${toX} ${toY}`
                : `M ${fromX} ${fromY} L ${startStubX} ${fromY} L ${endStubX} ${toY} L ${toX} ${toY}`;
            return (
              <path
                key={c.fromId + c.toId}
                d={d}
                fill="none"
                stroke={c.isActive ? "var(--accent)" : "var(--border-2)"}
                strokeWidth={c.isActive ? 2 : 1.5}
                strokeLinejoin="miter"
                strokeLinecap="butt"
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {layout.nodes.map((n) => {
          const left =
            PAD_X + (n.turnNumber - layout.minTurnNumber) * COL_WIDTH;
          const top = PAD_Y + n.lane * LANE_HEIGHT;
          const sel = n.id === selectedId;
          const closed = !!n.closedAt;
          const muted = !n.isActive;
          // A turn is "provisional" if it was forked but not yet committed:
          // RESOLVE phase, has at least one sibling, no children of its own.
          const isProvisional =
            n.phase === "RESOLVE" && n.siblingCount > 0 && !n.hasChildren;
          return (
            <button
              type="button"
              key={n.id}
              onClick={() => setSelectedId(n.id)}
              className="gb-graph-node"
              style={{
                position: "absolute",
                left,
                top,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                background: isProvisional
                  ? "transparent"
                  : n.isCurrent
                    ? "var(--accent-soft)"
                    : closed
                      ? "var(--panel)"
                      : "transparent",
                border: `1.5px ${isProvisional ? "dashed" : "solid"} ${
                  sel
                    ? "var(--accent)"
                    : n.isCurrent
                      ? "var(--accent)"
                      : muted
                        ? "var(--border)"
                        : "var(--border-2)"
                }`,
                borderRadius: 6,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: muted ? "var(--muted)" : "var(--text)",
                fontFamily: "var(--mono)",
                gap: 2,
                padding: 4,
                outline: "none",
              }}
            >
              <span style={{ fontSize: 10, opacity: 0.7 }}>
                T{String(n.turnNumber).padStart(2, "0")}
              </span>
              <span style={{ fontSize: 12 }}>{formatTurnDate(n.dateAtTurn, unit)}</span>
              {isProvisional ? (
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--muted)",
                    letterSpacing: "0.08em",
                  }}
                >
                  DRAFT
                </span>
              ) : n.isCurrent ? (
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--accent)",
                    letterSpacing: "0.08em",
                  }}
                >
                  NOW
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Selected turn details + Reality actions */}
      {selected && (
        <div className="gb-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            className="gb-h"
            style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}
          >
            <span className="ttl">
              Turn {String(selected.turnNumber).padStart(2, "0")} · {selected.phase}
            </span>
            <span className="meta">{formatTurnDate(selected.dateAtTurn, unit)}</span>
            <span style={{ flex: 1 }} />
            {selected.isCurrent ? (
              <span
                className="gb-pill accent"
                style={{ borderColor: "var(--accent)" }}
              >
                Current branch
              </span>
            ) : isReality ? (
              <RealityNodeActions
                node={selected}
                busy={busy}
                onBranch={() => callBranch(selected.id)}
                onSwitch={() => callSwitch(selected.id)}
              />
            ) : null}
          </div>
          {error && (
            <div
              className="gb-mono"
              style={{ color: "var(--bad)", fontSize: 11 }}
            >
              {error}
            </div>
          )}
          {selectedActions.length === 0 ? (
            <p className="gb-p" style={{ color: "var(--muted)" }}>
              No actions on this turn.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {selectedActions.map((a) => {
                const role = roles.find((r) => r.id === a.roleId);
                const submittedText = (a.submittedText ?? "").trim();
                const isSkipped =
                  a.submittedAt !== null && submittedText.length === 0;
                const status = isSkipped
                  ? "skipped"
                  : a.resolvedOutcome
                    ? "resolved"
                    : a.submittedText
                      ? "submitted"
                      : "draft";
                const outcome = normalizeOutcome(a.resolvedOutcome);
                return (
                  <div
                    key={a.id}
                    style={{
                      borderLeft: "2px solid var(--border)",
                      paddingLeft: 10,
                      opacity: isSkipped ? 0.6 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      {role && <RoleChip role={role} />}
                      <span
                        className="gb-mono"
                        style={{ color: "var(--muted)", fontSize: 10 }}
                      >
                        {status}
                      </span>
                      {outcome && (
                        <span
                          className="gb-pill"
                          style={{
                            color: outcome.color,
                            borderColor: outcome.color,
                            background: "transparent",
                          }}
                        >
                          <span style={{ marginRight: 2 }}>{outcome.symbol}</span>
                          {outcome.label}
                        </span>
                      )}
                    </div>
                    {isSkipped ? (
                      <p className="gb-p" style={{ color: "var(--muted)" }}>
                        no action this turn
                      </p>
                    ) : (
                      <>
                        {a.submittedText && (
                          <p className="gb-p" style={{ marginBottom: 4 }}>
                            <span
                              className="gb-mute"
                              style={{ marginRight: 6, fontSize: 10 }}
                            >
                              PROPOSED
                            </span>
                            {a.submittedText}
                          </p>
                        )}
                        {a.resolvedText && (
                          <p className="gb-p">
                            <span
                              className="gb-mute"
                              style={{ marginRight: 6, fontSize: 10 }}
                            >
                              RESOLVED
                            </span>
                            {a.resolvedText}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RealityNodeActions({
  node,
  busy,
  onBranch,
  onSwitch,
}: {
  node: {
    closedAt: string | null;
    isActive: boolean;
    hasChildren: boolean;
  };
  busy: boolean;
  onBranch: () => void;
  onSwitch: () => void;
}) {
  // "Resolve Differently" is offered on any closed turn (any branch, including
  // the active one) — Reality can fork at any historical point. "Switch here"
  // is much narrower: only the LEAF of an inactive line (no children), so it
  // really means "jump to and continue this branch." If the node has children,
  // switching is ambiguous; Reality should follow the chain visually and
  // click the tip.
  const canBranch = !!node.closedAt;
  const canSwitch = !node.isActive && !node.hasChildren;
  if (!canBranch && !canSwitch) return null;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {canSwitch && (
        <button
          type="button"
          className="gb-btn sm"
          onClick={onSwitch}
          disabled={busy}
          title="Jump to the tip of this branch and continue play from here."
        >
          ↪ Switch here
        </button>
      )}
      {canBranch && (
        <button
          type="button"
          className="gb-btn sm primary"
          onClick={onBranch}
          disabled={busy}
          title="Fork a parallel turn at this point with the original resolutions pre-filled. Edit what you want different, then commit."
        >
          ⎇ Resolve Differently
        </button>
      )}
    </div>
  );
}
