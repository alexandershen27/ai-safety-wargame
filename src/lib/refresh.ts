// Tiny pub/sub for "the user just did something — refetch state now."
//
// Polling at 2s is fine for picking up OTHER players' changes, but feels
// laggy when YOU just submitted/voted/advanced — your own actions would
// take up to 2s to appear committed in the UI. After a mutation, fire
// requestRefresh() and the active WorldShell will refetch immediately.
export const REFRESH_EVENT = "wg:state-refresh";

export function requestRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REFRESH_EVENT));
  }
}
