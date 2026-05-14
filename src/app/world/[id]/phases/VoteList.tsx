"use client";
// Reusable list of vote-on-an-action cards. Used in two places:
//   - DISCUSSION view, below your drafts, after you've submitted everything
//   - VOTE view, as the whole page
//
// Each card has a 0-100 likelihood slider, an optional objection textarea,
// vote count + average readout, and a saved indicator. One vote per player
// per action (regardless of how many roles they're seated at).
import { useEffect, useState } from "react";
import { RoleChip } from "@/components/RoleChip";
import type { WorldView } from "@/lib/world/state";

export function VoteList({
  view,
  you,
  emptyMessage = "No actions submitted yet.",
}: {
  view: WorldView;
  you: { id: string; displayName: string };
  emptyMessage?: string;
}) {
  const submitted = view.actions.filter((a) => a.submittedText);
  const myVoterRoleId = view.myRoleIds[0] ?? null;

  if (submitted.length === 0) {
    return (
      <p className="gb-p" style={{ color: "var(--muted)" }}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {submitted.map((a) => {
        const role = view.roles.find((r) => r.id === a.roleId)!;
        const myVote = view.votes.find(
          (v) => v.actionId === a.id && v.voterPlayerId === you.id,
        );
        const allVotes = view.votes.filter((v) => v.actionId === a.id);
        const avg =
          allVotes.length === 0
            ? null
            : Math.round(
                allVotes.reduce((s, v) => s + v.likelihood, 0) / allVotes.length,
              );
        const isOwn = a.authorPlayerId === you.id;
        return (
          <ActionVoteCard
            key={a.id}
            actionId={a.id}
            actionText={a.submittedText!}
            role={role}
            isOwn={isOwn}
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
  isOwn,
  disabled,
  voterRoleId,
  myVote,
  voteCount,
  average,
}: {
  actionId: string;
  actionText: string;
  role: { id: string; name: string; color: string };
  isOwn: boolean;
  disabled: boolean;
  voterRoleId: string | null;
  myVote: { likelihood: number; objection: string | null } | null;
  voteCount: number;
  average: number | null;
}) {
  const [likelihood, setLikelihood] = useState(myVote?.likelihood ?? 50);
  const [objection, setObjection] = useState(myVote?.objection ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Only persist after the user actually touches the card, so we don't write
  // a default 50% vote on mount for everyone who renders the list.
  const [touched, setTouched] = useState<boolean>(!!myVote);

  useEffect(() => {
    if (myVote) {
      setLikelihood(myVote.likelihood);
      setObjection(myVote.objection ?? "");
      setTouched(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVote?.likelihood, myVote?.objection]);

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
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <RoleChip role={role} />
          {isOwn && (
            <span
              className="gb-mono"
              style={{ color: "var(--accent)", fontSize: 10, letterSpacing: "0.08em" }}
            >
              YOUR ACTION
            </span>
          )}
        </div>
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 10,
            }}
          >
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
