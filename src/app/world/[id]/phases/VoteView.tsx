"use client";
// Vote phase. Each submitted action gets a likelihood slider (0-100) + an
// optional free-text objection. We removed the tag chips — the slider is the
// signal, the textarea is the explanation.
//
// Voters cast one vote per action, regardless of how many roles they hold.
import { useEffect, useState } from "react";
import { RoleChip } from "@/components/RoleChip";
import type { WorldView } from "@/lib/world/state";

export function VoteView({
  view,
  you,
}: {
  worldId: string;
  view: WorldView;
  you: { id: string; displayName: string };
}) {
  const submitted = view.actions.filter((a) => a.submittedText);
  // Vote is one-per-player; voter_role_id is informational. Pick any seat
  // the player holds (first one) for the row; if they hold none, they're a
  // spectator and can't vote.
  const myVoterRoleId = view.myRoleIds[0] ?? null;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      {submitted.length === 0 && (
        <div className="gb-card">
          <p className="gb-p">No actions were submitted this turn.</p>
        </div>
      )}
      {submitted.map((a) => {
        const role = view.roles.find((r) => r.id === a.roleId)!;
        const myVote = view.votes.find(
          (v) => v.actionId === a.id && v.voterPlayerId === you.id,
        );
        const allVotes = view.votes.filter((v) => v.actionId === a.id);
        const avg =
          allVotes.length === 0
            ? null
            : Math.round(allVotes.reduce((s, v) => s + v.likelihood, 0) / allVotes.length);
        return (
          <ActionVoteCard
            key={a.id}
            actionId={a.id}
            actionText={a.submittedText!}
            role={role}
            disabled={!myVoterRoleId}
            voterRoleId={myVoterRoleId}
            myVote={
              myVote
                ? { likelihood: myVote.likelihood, objection: myVote.objection }
                : null
            }
            voteCount={allVotes.length}
            average={avg}
          />
        );
      })}
    </div>
  );
}

function ActionVoteCard({
  actionId,
  actionText,
  role,
  disabled,
  voterRoleId,
  myVote,
  voteCount,
  average,
}: {
  actionId: string;
  actionText: string;
  role: { id: string; name: string; color: string };
  disabled: boolean;
  voterRoleId: string | null;
  myVote: { likelihood: number; objection: string | null } | null;
  voteCount: number;
  average: number | null;
}) {
  const [likelihood, setLikelihood] = useState(myVote?.likelihood ?? 50);
  const [objection, setObjection] = useState(myVote?.objection ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Track whether the user has touched this card yet, so we don't auto-POST
  // a 50% vote on mount for everyone.
  const [touched, setTouched] = useState<boolean>(!!myVote);

  // Sync from upstream poll (when our row changes).
  useEffect(() => {
    if (myVote) {
      setLikelihood(myVote.likelihood);
      setObjection(myVote.objection ?? "");
      setTouched(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVote?.likelihood, myVote?.objection]);

  // Debounced upsert when the user has actually interacted.
  useEffect(() => {
    if (disabled || !voterRoleId || !touched) return;
    const t = setTimeout(async () => {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId,
          voterRoleId,
          likelihood,
          tags: [],
          objection: objection || null,
        }),
      });
      if (res.ok) setSavedAt(Date.now());
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likelihood, objection, touched]);

  return (
    <div className="gb-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <RoleChip role={role} />
        <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 10 }}>
          {voteCount} vote{voteCount === 1 ? "" : "s"}
          {average !== null ? ` · avg ${average}%` : ""}
        </span>
      </div>
      <p className="gb-p" style={{ marginBottom: 12 }}>
        {actionText}
      </p>

      {disabled ? (
        <p className="gb-p" style={{ color: "var(--muted)", fontSize: 11 }}>
          Spectators can't vote.
        </p>
      ) : (
        <>
          <div style={{ marginBottom: 6 }}>
            <span
              className="gb-mono"
              style={{
                color: "var(--muted)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Likelihood of success
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <input
              type="range"
              className="gb-range"
              min={0}
              max={100}
              value={likelihood}
              onChange={(e) => {
                setLikelihood(+e.target.value);
                setTouched(true);
              }}
            />
            <span
              className="gb-mono"
              style={{ color: "var(--accent)", minWidth: 36, textAlign: "right" }}
            >
              {likelihood}%
            </span>
          </div>
          <textarea
            className="gb-textarea"
            placeholder="Optional: why? (objection, support, missing context…)"
            value={objection}
            onChange={(e) => {
              setObjection(e.target.value);
              setTouched(true);
            }}
            style={{ minHeight: 50 }}
          />
          {savedAt && (
            <span
              className="gb-mono"
              style={{ color: "var(--muted)", fontSize: 10 }}
            >
              saved
            </span>
          )}
        </>
      )}
    </div>
  );
}
