// Phase state machine. The user-facing model has two active phases:
// DISCUSSION (drafting + inline voting) and RESOLVE (Reality writes outcomes).
// VOTE is kept in the type for legacy DB rows but is no longer reachable from
// the advance endpoint — those rows render identically to DISCUSSION.
export type Phase = "DISCUSSION" | "VOTE" | "RESOLVE" | "CLOSED";

export const NEXT_PHASE: Record<Phase, Phase | null> = {
  DISCUSSION: "RESOLVE",
  VOTE: "RESOLVE", // legacy; never produced
  RESOLVE: "CLOSED",
  CLOSED: null,
};

export const PHASE_LABEL: Record<Phase, string> = {
  DISCUSSION: "Discussion",
  VOTE: "Discussion", // legacy VOTE turns appear as Discussion in the topbar
  RESOLVE: "Resolution",
  CLOSED: "Closed",
};
