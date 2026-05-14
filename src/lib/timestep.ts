// Deterministic date math for advancing the world clock. Pure functions; unit-testable.
export type TimestepUnit = "day" | "week" | "month" | "year";

export function advanceDate(
  isoDate: string,
  unit: TimestepUnit,
  amount: number,
): string {
  const d = new Date(isoDate + "T00:00:00Z");
  switch (unit) {
    case "day":
      d.setUTCDate(d.getUTCDate() + amount);
      break;
    case "week":
      d.setUTCDate(d.getUTCDate() + amount * 7);
      break;
    case "month":
      d.setUTCMonth(d.getUTCMonth() + amount);
      break;
    case "year":
      d.setUTCFullYear(d.getUTCFullYear() + amount);
      break;
  }
  return d.toISOString().slice(0, 10);
}

export function formatDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Adaptive date format for the turn ribbon. Picks precision based on timestep
 * so we don't show redundant info (e.g. "May 14 2026" when the step is a
 * month — that day is meaningless).
 *
 *   day, week  -> "May 14"        (year inferred from context)
 *   month      -> "May 2026"
 *   year       -> "2026"
 */
export function formatTurnDate(isoDate: string, unit: TimestepUnit): string {
  const d = new Date(isoDate + "T00:00:00Z");
  if (unit === "year") return `${d.getUTCFullYear()}`;
  if (unit === "month")
    return d.toLocaleDateString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
    });
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}
