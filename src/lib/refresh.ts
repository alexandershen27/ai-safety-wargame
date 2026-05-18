// Tiny pub/sub for the state-sync dance around mutations.
//
// THE RACE WE'RE FIGHTING:
//
//   t=0.0  background poll P1 starts (will return at 0.5 with stale data)
//   t=0.2  user clicks "Join role"; POST fires
//   t=0.5  P1 returns → setView(stale) → UI shows "not joined"   ← bug
//   t=0.7  POST returns → requestRefresh() → P2 fires
//   t=0.9  P2 returns with the seat → UI shows "joined"
//
// Between 0.5 and 0.9 the user sees their click "revert." The fix is to
// signal the WorldShell BEFORE the POST goes out so it can:
//   1. Abort any in-flight poll (so P1 never reaches setView), and
//   2. Stamp a `lastMutationAt` timestamp as a backstop — if an aborted
//      response somehow leaks through, the commit check drops it.
//
// Two events, called as a pair around every mutation:
//   markMutationStart()    BEFORE await fetch(...)
//   requestRefresh()       AFTER the POST resolves OK
export const REFRESH_EVENT = "wg:state-refresh";
export const MUTATION_START_EVENT = "wg:mutation-start";

/** Fire before a mutation POSTs. Aborts the WorldShell's in-flight poll. */
export function markMutationStart() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MUTATION_START_EVENT));
  }
}

/** Fire after a mutation POST returns OK. Triggers an immediate refetch. */
export function requestRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REFRESH_EVENT));
  }
}

/**
 * Convenience wrapper. Use this around any mutating fetch:
 *   const res = await mutate(() => fetch("/api/foo", { method: "POST" }));
 * It marks the start so polls get cancelled, runs the fetch, and on a 2xx
 * response fires the refresh event. Returns the Response so callers can
 * still read the body / status.
 */
export async function mutate(fn: () => Promise<Response>): Promise<Response> {
  markMutationStart();
  const res = await fn();
  if (res.ok) requestRefresh();
  return res;
}
