"use client";
// Resolve phase. Reality writes the resolved-as-fact text + outcome for each
// action and the writeup becomes the canonical history entry.
//
// Once resolved, the entry is FINAL — no edits, no take-backs. Server enforces
// this; UI shows the resolved card as read-only.
import { useState, useEffect } from "react";
import { RoleChip } from "@/components/RoleChip";
import type { WorldView } from "@/lib/world/state";

export function ResolveView({ view }: { view: WorldView }) {
  const submitted = view.actions.filter((a) => a.submittedText);
  return (
    <div
      style={{
        maxWidth: 880,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {!view.isReality && (
        <div className="gb-card">
          <p className="gb-p" style={{ color: "var(--muted)", fontSize: 12 }}>
            Reality is resolving each action. Watch this space.
          </p>
        </div>
      )}
      {submitted.length === 0 && (
        <div className="gb-card">
          <p className="gb-p">No actions to resolve.</p>
        </div>
      )}
      {submitted.map((a) => {
        const role = view.roles.find((r) => r.id === a.roleId)!;
        const allVotes = view.votes.filter((v) => v.actionId === a.id);
        const avg =
          allVotes.length === 0
            ? null
            : Math.round(allVotes.reduce((s, v) => s + v.likelihood, 0) / allVotes.length);
        return (
          <ResolveCard
            key={a.id}
            actionId={a.id}
            text={a.submittedText!}
            role={role}
            avg={avg}
            voteCount={allVotes.length}
            existingResolved={a.resolvedText}
            existingOutcome={a.resolvedOutcome}
            isReality={view.isReality}
            objections={allVotes
              .map((v) => v.objection)
              .filter((o): o is string => !!o)}
          />
        );
      })}
    </div>
  );
}

const OUTCOMES = [
  { id: "success-high", label: "Success · high" },
  { id: "success-med", label: "Success · medium" },
  { id: "partial", label: "Partial" },
  { id: "fail-low", label: "Fail · low" },
  { id: "fail-hard", label: "Fail · hard" },
];

function ResolveCard({
  actionId,
  text,
  role,
  avg,
  voteCount,
  existingResolved,
  existingOutcome,
  isReality,
  objections,
}: {
  actionId: string;
  text: string;
  role: { id: string; name: string; color: string };
  avg: number | null;
  voteCount: number;
  existingResolved: string | null;
  existingOutcome: string | null;
  isReality: boolean;
  objections: string[];
}) {
  const [resolved, setResolved] = useState("");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isResolved = !!existingResolved;

  async function save() {
    if (!resolved.trim()) return;
    setError(null);
    setBusy(true);
    const r = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "resolve",
        actionId,
        resolvedText: resolved,
        resolvedOutcome: outcome || undefined,
      }),
    });
    if (!r.ok) setError(await r.text());
    setBusy(false);
  }

  return (
    <div
      className="gb-card"
      style={isResolved ? { borderColor: "var(--accent-dim)" } : undefined}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <RoleChip role={role} />
        <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 10 }}>
          {voteCount} vote{voteCount === 1 ? "" : "s"}
          {avg !== null ? ` · avg ${avg}%` : ""}
          {isResolved ? " · RESOLVED" : ""}
        </span>
      </div>
      <p className="gb-p" style={{ marginBottom: 8 }}>
        <span className="gb-mute" style={{ marginRight: 6, fontSize: 10 }}>
          PROPOSED
        </span>
        {text}
      </p>

      {objections.length > 0 && !isResolved && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {objections.map((o, i) => (
            <span
              key={i}
              className="gb-mono"
              style={{ color: "var(--muted)", fontSize: 11 }}
            >
              ✎ {o}
            </span>
          ))}
        </div>
      )}

      {isResolved ? (
        <p className="gb-p" style={{ marginTop: 4 }}>
          <span className="gb-mute" style={{ marginRight: 6, fontSize: 10 }}>
            RESOLVED
          </span>
          {existingResolved}
          {existingOutcome ? ` (${existingOutcome})` : ""}
        </p>
      ) : isReality ? (
        <>
          <textarea
            className="gb-textarea"
            placeholder="Write the resolved fact: 'They did X. Y happened as a result.'"
            value={resolved}
            onChange={(e) => setResolved(e.target.value)}
          />
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginTop: 8,
              flexWrap: "wrap",
            }}
          >
            <select
              className="gb-select"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              style={{ width: "auto" }}
            >
              <option value="">Outcome (optional)…</option>
              {OUTCOMES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {error && (
              <span className="gb-mono" style={{ color: "var(--bad)", fontSize: 11 }}>
                {error}
              </span>
            )}
            <button
              className="gb-btn primary sm"
              onClick={save}
              disabled={busy || !resolved.trim()}
              style={{ marginLeft: "auto" }}
            >
              {busy ? "…" : "Mark resolved (final)"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
