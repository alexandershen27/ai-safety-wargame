"use client";
// Branch graph + turn details panel for the timeline page.
//
// Horizontal layout: columns = turn_number, lanes (rows) = branch identity.
// The active branch occupies lane 0. Connectors between parent and child are
// SVG paths with a single 45-degree-ish diagonal bend (git-graph style).
//
// Clicking a node selects it and shows its actions/resolutions below. Reality
// gets two buttons on closed nodes:
//   - "Redo this turn"  -> POST /api/.../branch (creates a sibling)
//   - "Switch here"     -> POST /api/.../switch-to (jumps to this branch)
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RoleChip } from "@/components/RoleChip";
import { formatTurnDate, type TimestepUnit } from "@/lib/timestep";
import { layoutBranchGraph, type TurnNode } from "./graphLayout";

type Role = { id: string; name: string; color: string };
type Action = {
  id: string;
  turnId: string;
  roleId: string;
  submittedText: string | null;
  resolvedText: string | null;
  resolvedOutcome: string | null;
};

const COL_WIDTH = 132;
const LANE_HEIGHT = 88;
const NODE_WIDTH = 96;
const NODE_HEIGHT = 56;
const PAD_X = 16;
const PAD_Y = 16;
const EDGE_GAP = 6;

function nodeCenterX(col: number) {
  // turn numbers are 1-indexed
  return PAD_X + (col - 1) * COL_WIDTH + NODE_WIDTH / 2;
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
    if (!r.ok) setError(await r.text());
    setBusy(false);
    router.refresh();
  }

  async function callSwitch(toTurnId: string) {
    setError(null);
    setBusy(true);
    const r = await fetch(`/api/worlds/${worldId}/switch-to`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toTurnId }),
    });
    if (!r.ok) setError(await r.text());
    setBusy(false);
    router.refresh();
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
            const fromX = nodeCenterX(c.fromCol) + NODE_WIDTH / 2; // right edge of parent
            const fromY = nodeCenterY(c.fromLane);
            const toX = nodeCenterX(c.toCol) - NODE_WIDTH / 2; // left edge of child
            const toY = nodeCenterY(c.toLane);
            const dx = toX - fromX;
            const dy = toY - fromY;
            // Path: horizontal stub from parent -> diagonal -> horizontal stub
            // to child. If same lane, just one horizontal line.
            let d: string;
            if (dy === 0) {
              d = `M ${fromX} ${fromY} L ${toX} ${toY}`;
            } else {
              const diagWidth = Math.min(Math.abs(dy), dx - EDGE_GAP * 2);
              const bend1X = fromX + EDGE_GAP;
              const bend2X = toX - EDGE_GAP;
              const startDiagX = bend2X - diagWidth;
              d = `M ${fromX} ${fromY} L ${bend1X} ${fromY} L ${startDiagX} ${fromY} L ${bend2X} ${toY} L ${toX} ${toY}`;
            }
            return (
              <path
                key={c.fromId + c.toId}
                d={d}
                fill="none"
                stroke={c.isActive ? "var(--accent)" : "var(--border-2)"}
                strokeWidth={c.isActive ? 2 : 1.5}
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {layout.nodes.map((n) => {
          const left = PAD_X + (n.turnNumber - 1) * COL_WIDTH;
          const top = PAD_Y + n.lane * LANE_HEIGHT;
          const sel = n.id === selectedId;
          const closed = !!n.closedAt;
          const muted = !n.isActive;
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
                background: n.isCurrent
                  ? "var(--accent-soft)"
                  : closed
                    ? "var(--panel)"
                    : "transparent",
                border: `1.5px solid ${
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
              {n.isCurrent && (
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--accent)",
                    letterSpacing: "0.08em",
                  }}
                >
                  NOW
                </span>
              )}
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
              <Link href={`/world/${worldId}`} className="gb-btn sm primary">
                Go to active world →
              </Link>
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
                const status = a.resolvedText
                  ? "resolved"
                  : a.submittedText
                    ? "submitted"
                    : "draft";
                return (
                  <div
                    key={a.id}
                    style={{ borderLeft: "2px solid var(--border)", paddingLeft: 10 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      {role && <RoleChip role={role} />}
                      <span
                        className="gb-mono"
                        style={{ color: "var(--muted)", fontSize: 10 }}
                      >
                        {status}
                        {a.resolvedOutcome ? ` · ${a.resolvedOutcome}` : ""}
                      </span>
                    </div>
                    {a.submittedText && (
                      <p className="gb-p" style={{ marginBottom: 4 }}>
                        <span className="gb-mute" style={{ marginRight: 6, fontSize: 10 }}>
                          PROPOSED
                        </span>
                        {a.submittedText}
                      </p>
                    )}
                    {a.resolvedText && (
                      <p className="gb-p">
                        <span className="gb-mute" style={{ marginRight: 6, fontSize: 10 }}>
                          RESOLVED
                        </span>
                        {a.resolvedText}
                      </p>
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
  node: { closedAt: string | null; isActive: boolean; hasChildren: boolean };
  busy: boolean;
  onBranch: () => void;
  onSwitch: () => void;
}) {
  // Closed turns can be redone (sibling branch). Inactive turns can be switched
  // to (jump back). The current turn already has its own button rendered above.
  const canRedo = !!node.closedAt;
  const canSwitch = !node.isActive;
  if (!canRedo && !canSwitch) return null;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {canSwitch && (
        <button
          type="button"
          className="gb-btn sm"
          onClick={onSwitch}
          disabled={busy}
          title="Make this the active branch. If it's a leaf, opens a new child to continue play."
        >
          ↪ Switch here
        </button>
      )}
      {canRedo && (
        <button
          type="button"
          className="gb-btn sm primary"
          onClick={onBranch}
          disabled={busy}
          title="Create a parallel turn at this point. Reality re-resolves with new outcomes."
        >
          ⎇ Redo this turn
        </button>
      )}
    </div>
  );
}
