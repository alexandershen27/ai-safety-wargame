"use client";
// Unified action list with inline voting. Used by DISCUSSION (below the
// drafts) and the legacy VOTE phase. One vote per player per action.
//
// Skipped actions (submittedAt set + submittedText empty) render as a
// single muted line — no slider, no objection field. There's nothing to
// vote on.
import { useEffect, useState } from "react";
import { RoleChip } from "@/components/RoleChip";
import type { WorldView } from "@/lib/world/state";
import { markMutationStart, requestRefresh } from "@/lib/refresh";

export function VoteList({
  view,
  you,
  emptyMessage = "No actions submitted yet.",
}: {
  view: WorldView;
  you: { id: string; displayName: string };
  emptyMessage?: string;
}) {
  const submitted = view.actions.filter((a) => a.submittedAt);
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
        const text = (a.submittedText ?? "").trim();
        const isSkipped = text.length === 0;
        const isOwn = a.authorPlayerId === you.id;

        if (isSkipped) {
          return <SkippedCard key={a.id} role={role} isOwn={isOwn} />;
        }

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
        return (
          <ActionVoteCard
            key={a.id}
            actionId={a.id}
            actionText={text}
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

function SkippedCard({
  role,
  isOwn,
}: {
  role: { id: string; name: string; color: string };
  isOwn: boolean;
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
      <span className="gb-p" style={{ color: "var(--muted)", flex: 1 }}>
        no action this turn
      </span>
      {isOwn && (
        <span
          className="gb-mono"
          style={{ color: "var(--muted)", fontSize: 10 }}
        >
          YOUR ACTION
        </span>
      )}
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
      // Mark so the WorldShell aborts any in-flight poll that would echo
      // back the pre-vote state and briefly reset the voteProgress counter.
      markMutationStart();
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
      if (res.ok) {
        setSavedAt(Date.now());
        requestRefresh();
      }
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
              style={{
                color: "var(--accent)",
                fontSize: 10,
                letterSpacing: "0.08em",
              }}
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
              style={{
                color: "var(--accent)",
                minWidth: 36,
                textAlign: "right",
              }}
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
