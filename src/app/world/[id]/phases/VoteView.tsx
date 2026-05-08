"use client";
// Vote phase: each submitted action shows up with a slider + tag chips per voter.
// Voters can change their vote freely while VOTE phase is open.
import { useState, useEffect } from "react";
import { RoleChip } from "@/components/RoleChip";
import type { WorldView } from "@/lib/world/state";

const TAGS = ["unrealistic", "needs source", "2nd-order", "strong"] as const;

export function VoteView({
  worldId: _worldId,
  view,
  you,
}: {
  worldId: string;
  view: WorldView;
  you: { id: string; displayName: string };
}) {
  const submitted = view.actions.filter((a) => a.submittedText);
  const myFirstRoleId = view.myRoleIds[0];

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
            disabled={!myFirstRoleId}
            voterRoleId={myFirstRoleId ?? null}
            myVote={myVote ?? null}
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
  myVote: {
    likelihood: number;
    tags: string;
    objection: string | null;
  } | null;
  voteCount: number;
  average: number | null;
}) {
  const [likelihood, setLikelihood] = useState(myVote?.likelihood ?? 50);
  const [tags, setTags] = useState<string[]>(() =>
    myVote ? safeParseTags(myVote.tags) : [],
  );
  const [objection, setObjection] = useState(myVote?.objection ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sync from upstream when poll yields newer state for OUR vote.
  useEffect(() => {
    if (myVote) {
      setLikelihood(myVote.likelihood);
      setTags(safeParseTags(myVote.tags));
      setObjection(myVote.objection ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVote?.likelihood, myVote?.tags, myVote?.objection]);

  // Debounced upsert.
  useEffect(() => {
    if (disabled || !voterRoleId) return;
    const t = setTimeout(async () => {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId,
          voterRoleId,
          likelihood,
          tags,
          objection: objection || null,
        }),
      });
      if (res.ok) setSavedAt(Date.now());
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likelihood, tags, objection]);

  function toggleTag(tag: string) {
    setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  }

  return (
    <div className="gb-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <RoleChip role={role} />
        <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 10 }}>
          {voteCount} vote{voteCount === 1 ? "" : "s"}
          {average !== null ? ` · avg ${average}%` : ""}
        </span>
      </div>
      <p className="gb-p" style={{ marginBottom: 12 }}>{actionText}</p>

      {disabled ? (
        <p className="gb-p" style={{ color: "var(--muted)", fontSize: 11 }}>
          Spectators can't vote. Sit down at a role to vote.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <input
              type="range"
              className="gb-range"
              min={0}
              max={100}
              value={likelihood}
              onChange={(e) => setLikelihood(+e.target.value)}
            />
            <span className="gb-mono" style={{ color: "var(--accent)", minWidth: 36, textAlign: "right" }}>
              {likelihood}%
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className={"gb-pill" + (tags.includes(t) ? " active" : "")}
                onClick={() => toggleTag(t)}
                style={{ cursor: "pointer" }}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            className="gb-textarea"
            placeholder="Optional objection / note"
            value={objection}
            onChange={(e) => setObjection(e.target.value)}
            style={{ minHeight: 50 }}
          />
          {savedAt && (
            <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 10 }}>
              saved
            </span>
          )}
        </>
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
