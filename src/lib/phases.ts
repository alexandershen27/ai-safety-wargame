// Phase state machine. Adding RESEARCH or splitting a phase later = edit this file.
export type Phase = "DISCUSSION" | "VOTE" | "RESOLVE" | "CLOSED";

export const NEXT_PHASE: Record<Phase, Phase | null> = {
  DISCUSSION: "VOTE",
  VOTE: "RESOLVE",
  RESOLVE: "CLOSED",
  CLOSED: null,
};

export const PHASE_LABEL: Record<Phase, string> = {
  DISCUSSION: "Discussion",
  VOTE: "Voting",
  RESOLVE: "Resolution",
  CLOSED: "Closed",
};
