"use client";
// Resolve phase. Reality writes the canonical history entry for each action
// and picks one of three outcome flavors:
//
//   Success — Reality's narrative is the cause of the success.
//   Partial — Reality's text describes a mixed or compromised outcome.
//   Fail    — Reality's text describes why it didn't go through.
//
// Reality can re-resolve as many times as they want until the turn is CLOSED.
// Server enforces "no edits after close" via a turn-already-closed guard.
//
// Skipped actions (submittedAt set, submittedText empty) show up as a muted
// one-liner. They don't need a resolution — the player chose to do nothing.
import { useEffect, useState } from "react";
import { RoleChip } from "@/components/RoleChip";
import type { WorldView } from "@/lib/world/state";

const OUTCOMES: { id: string; label: string; symbol: string; color: string }[] = [
  { id: "success", label: "Success", symbol: "✓", color: "var(--good)" },
  { id: "partial", label: "Partial", symbol: "~", color: "var(--warn)" },
  { id: "fail", label: "Fail", symbol: "✗", color: "var(--bad)" },
];

export function ResolveView({ view }: { view: WorldView }) {
  const submitted = view.actions.filter((a) => a.submittedAt);
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
        const text = (a.submittedText ?? "").trim();
        if (text.length === 0) {
          return <SkippedRow key={a.id} role={role} />;
        }
        const allVotes = view.votes.filter((v) => v.actionId === a.id);
        const avg =
          allVotes.length === 0
            ? null
            : Math.round(
                allVotes.reduce((s, v) => s + v.likelihood, 0) / allVotes.length,
              );
        return (
          <ResolveCard
            key={a.id}
            actionId={a.id}
            text={text}
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

function SkippedRow({
  role,
}: {
  role: { id: string; name: string; color: string };
}) {
  return (
    <div
      className="gb-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderStyle: "dashed",
        opacity: 0.7,
      }}
    >
      <RoleChip role={role} />
      <span className="gb-p" style={{ color: "var(--muted)" }}>
        no action this turn — nothing to resolve
      </span>
    </div>
  );
}

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
  const [resolved, setResolved] = useState(existingResolved ?? "");
  const [outcome, setOutcome] = useState<string>(existingOutcome ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "touched" tracks whether the local state diverges from server state.
  // Polls only overwrite the form when it's clean — so we don't clobber
  // Reality's in-progress edits with a stale snapshot.
  const [touched, setTouched] = useState(false);
  const isResolved = !!existingResolved;

  useEffect(() => {
    if (!touched) {
      setResolved(existingResolved ?? "");
      setOutcome(existingOutcome ?? "");
    }
  }, [existingResolved, existingOutcome, touched]);

  const isDirty =
    (resolved ?? "") !== (existingResolved ?? "") ||
    (outcome ?? "") !== (existingOutcome ?? "");

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
    if (!r.ok) {
      setError(await r.text());
    } else {
      // Re-enable poll syncing; next tick will reflect the just-saved values.
      setTouched(false);
    }
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
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <RoleChip role={role} />
          {isResolved && existingOutcome && (
            <OutcomeChip outcomeId={existingOutcome} />
          )}
        </div>
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginBottom: 8,
          }}
        >
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

      {isReality ? (
        <>
          <textarea
            className="gb-textarea"
            placeholder="Write the resolved fact: 'They did X. Y happened as a result.'"
            value={resolved}
            onChange={(e) => {
              setResolved(e.target.value);
              setTouched(true);
            }}
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
            <OutcomePicker
              value={outcome}
              onChange={(v) => {
                setOutcome(v);
                setTouched(true);
              }}
            />
            {error && (
              <span
                className="gb-mono"
                style={{ color: "var(--bad)", fontSize: 11 }}
              >
                {error}
              </span>
            )}
            <button
              className="gb-btn primary sm"
              onClick={save}
              disabled={busy || !resolved.trim() || (isResolved && !isDirty)}
              style={{ marginLeft: "auto" }}
            >
              {busy
                ? "…"
                : isResolved
                  ? isDirty
                    ? "Update resolution"
                    : "Saved"
                  : "Mark resolved"}
            </button>
          </div>
        </>
      ) : isResolved ? (
        <p className="gb-p" style={{ marginTop: 4 }}>
          <span className="gb-mute" style={{ marginRight: 6, fontSize: 10 }}>
            RESOLVED
          </span>
          {existingResolved}
        </p>
      ) : null}
    </div>
  );
}

function OutcomePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 2,
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "var(--bg)",
      }}
      role="radiogroup"
      aria-label="Outcome"
    >
      {OUTCOMES.map((o) => {
        const active = value === o.id;
        return (
          <button
            type="button"
            key={o.id}
            onClick={() => onChange(active ? "" : o.id)}
            aria-pressed={active}
            title={o.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 4,
              border: 0,
              cursor: "pointer",
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: active ? o.color : "transparent",
              color: active ? "#1a0f08" : "var(--text-2)",
              fontWeight: active ? 600 : 400,
            }}
          >
            <span style={{ fontSize: 13 }}>{o.symbol}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function OutcomeChip({ outcomeId }: { outcomeId: string }) {
  // Tolerate legacy outcome ids ("success-high", "fail-hard", etc.) by
  // mapping them to the new triplet.
  const normalized = outcomeId.startsWith("success")
    ? "success"
    : outcomeId.startsWith("fail")
      ? "fail"
      : "partial";
  const o = OUTCOMES.find((x) => x.id === normalized);
  if (!o) return null;
  return (
    <span
      className="gb-pill"
      style={{
        color: o.color,
        borderColor: o.color,
        background: "transparent",
      }}
    >
      <span style={{ marginRight: 2 }}>{o.symbol}</span>
      {o.label}
    </span>
  );
}
