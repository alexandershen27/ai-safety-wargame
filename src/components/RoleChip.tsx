// Generic role chip — accepts free name+color so it works for any user-defined role.
import type { Role } from "@/lib/db/schema";

export function RoleChip({
  role,
  short,
}: {
  role: Pick<Role, "name" | "color">;
  short?: boolean;
}) {
  const initials = role.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="gb-role">
      <span className="swatch" style={{ background: role.color }}>
        {initials}
      </span>
      {!short && role.name}
    </span>
  );
}
