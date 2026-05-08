"use client";
// Resolve phase: Reality writes the resolved-as-fact text + outcome for each action,
// using the vote distribution as advisory. Players see a read-only view of resolution progress.
import { useState, useEffect } from "react";
import { RoleChip } from "@/components/RoleChip";
import type { WorldView } from "@/lib/world/state";

export function ResolveView({
  view,
}: {
  worldId: string;
  view: WorldView;
  you: { id: string; displayName: string };
}) {
  const submitted = view.actions.filter((a) => a.submittedText);
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
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
            voteSummary={allVotes.map((v) => ({
              likelihood: v.likelihood,
              tags: safeParseTags(v.tags),
              objection: v.objection,
            }))}
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
  voteSummary,
}: {
  actionId: string;
  text: string;
  role: { id: string; name: string; color: string };
  avg: number | null;
  voteCount: number;
  existingResolved: string | null;
  existingOutcome: string | null;
  isReality: boolean;
  voteSummary: { likelihood: number; tags: string[]; objection: string | null }[];
}) {
  const [resolved, setResolved] = useState(existingResolved ?? "");
  const [outcome, setOutcome] = useState(existingOutcome ?? "");
  const [busy, setBusy] = useState(false);
  const isResolved = !!existingResolved;

  useEffect(() => {
    setResolved(existingResolved ?? "");
    setOutcome(existingOutcome ?? "");
  }, [existingResolved, existingOutcome]);

  async function save() {
    if (!resolved.trim()) return;
    setBusy(true);
    await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "resolve",
        actionId,
        resolvedText: resolved,
        resolvedOutcome: outcome || undefined,
      }),
    });
    setBusy(false);
  }

  return (
    <div className="gb-card" style={isResolved ? { borderColor: "var(--accent-dim)" } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <RoleChip role={role} />
        <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 10 }}>
          {voteCount} vote{voteCount === 1 ? "" : "s"}
          {avg !== null ? ` · avg ${avg}%` : ""}
          {isResolved ? " · RESOLVED" : ""}
        </span>
      </div>
      <p className="gb-p" style={{ marginBottom: 8 }}>
        <span className="gb-mute" style={{ marginRight: 6, fontSize: 10 }}>PROPOSED</span>
        {text}
      </p>

      {voteSummary.some((v) => v.tags.length || v.objection) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {voteSummary.flatMap((v, i) =>
            v.tags.map((t) => (
              <span key={i + t} className="gb-pill">
                {t}
              </span>
            )),
          )}
          {voteSummary
            .filter((v) => v.objection)
            .map((v, i) => (
              <span key={"o" + i} className="gb-pill">
                ✎ {v.objection}
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
            onChange={(e) => setResolved(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <select
              className="gb-select"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              style={{ width: "auto" }}
            >
              <option value="">Outcome (optional)…</option>
              {OUTCOMES.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <button
              className="gb-btn primary sm"
              onClick={save}
              disabled={busy || !resolved.trim()}
              style={{ marginLeft: "auto" }}
            >
              {isResolved ? "Update" : "Mark resolved"}
            </button>
          </div>
        </>
      ) : (
        existingResolved && (
          <p className="gb-p" style={{ marginTop: 6 }}>
            <span className="gb-mute" style={{ marginRight: 6, fontSize: 10 }}>RESOLVED</span>
            {existingResolved}
            {existingOutcome ? ` (${existingOutcome})` : ""}
          </p>
        )
      )}
    </div>
  );
}

function safeParseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
