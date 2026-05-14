// Pure-function layout for the branch graph. Given a turn list + the active
// branch tip, returns where each turn sits in the (column, lane) grid plus
// the connector line geometry parent→child.
//
// Active branch always sits on lane 0. Inactive branches get assigned lanes
// in DFS order. This is generic over arbitrary depth — branches of branches
// are handled by recursive lane assignment.

export type TurnNode = {
  id: string;
  turnNumber: number;
  dateAtTurn: string;
  phase: string;
  closedAt: string | null;
  parentTurnId: string | null;
};

export type LaidOutTurn = TurnNode & {
  lane: number;
  isActive: boolean;
  isCurrent: boolean;
  hasChildren: boolean;
};

export type Connector = {
  fromId: string;
  toId: string;
  fromCol: number;
  toCol: number;
  fromLane: number;
  toLane: number;
  /** True if both endpoints are on the currently-active branch. */
  isActive: boolean;
};

export type GraphLayout = {
  nodes: LaidOutTurn[];
  connectors: Connector[];
  numLanes: number;
  numCols: number;
};

export function layoutBranchGraph(
  turns: TurnNode[],
  currentTurnId: string | null,
): GraphLayout {
  if (turns.length === 0) {
    return { nodes: [], connectors: [], numLanes: 0, numCols: 0 };
  }

  const byId = new Map(turns.map((t) => [t.id, t]));
  const childrenByParent = new Map<string | null, TurnNode[]>();
  for (const t of turns) {
    const key = t.parentTurnId;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(t);
    childrenByParent.set(key, arr);
  }
  // Stable child order: by turnNumber, then by id (so layout is deterministic).
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.turnNumber - b.turnNumber || a.id.localeCompare(b.id));
  }

  // Walk from currentTurnId up to root to build the active-chain set.
  const activeChain = new Set<string>();
  let cur: string | null = currentTurnId;
  while (cur) {
    activeChain.add(cur);
    cur = byId.get(cur)?.parentTurnId ?? null;
  }

  // DFS from each root, assigning lanes. The active child of a node keeps the
  // parent's lane; siblings get fresh lanes.
  const laneById = new Map<string, number>();
  let nextLane = 0;
  function takeLane(): number {
    return nextLane++;
  }

  function assign(node: TurnNode, lane: number) {
    laneById.set(node.id, lane);
    const children = childrenByParent.get(node.id) ?? [];
    // Find the active child, if any — it inherits the parent's lane.
    const activeChild = children.find((c) => activeChain.has(c.id));
    for (const child of children) {
      if (child.id === activeChild?.id) {
        assign(child, lane);
      } else {
        assign(child, takeLane());
      }
    }
  }

  const roots = childrenByParent.get(null) ?? [];
  for (const root of roots) {
    const lane = activeChain.has(root.id) ? takeLane() : takeLane();
    assign(root, lane);
  }
  // Ensure the active lane is 0 by remapping: find the lane the active root
  // ended up on and swap.
  if (currentTurnId) {
    const activeRoot = roots.find((r) => activeChain.has(r.id)) ?? roots[0];
    const activeLane = laneById.get(activeRoot.id) ?? 0;
    if (activeLane !== 0) {
      for (const [id, lane] of laneById) {
        if (lane === 0) laneById.set(id, activeLane);
        else if (lane === activeLane) laneById.set(id, 0);
      }
    }
  }

  const numLanes = (Math.max(0, ...laneById.values()) + 1) || 1;
  const numCols = Math.max(...turns.map((t) => t.turnNumber)) || 1;

  const nodes: LaidOutTurn[] = turns.map((t) => ({
    ...t,
    lane: laneById.get(t.id) ?? 0,
    isActive: activeChain.has(t.id),
    isCurrent: t.id === currentTurnId,
    hasChildren: (childrenByParent.get(t.id)?.length ?? 0) > 0,
  }));

  const connectors: Connector[] = [];
  for (const t of turns) {
    if (!t.parentTurnId) continue;
    const parent = byId.get(t.parentTurnId);
    if (!parent) continue;
    connectors.push({
      fromId: parent.id,
      toId: t.id,
      fromCol: parent.turnNumber,
      toCol: t.turnNumber,
      fromLane: laneById.get(parent.id) ?? 0,
      toLane: laneById.get(t.id) ?? 0,
      isActive: activeChain.has(parent.id) && activeChain.has(t.id),
    });
  }

  return { nodes, connectors, numLanes, numCols };
}
