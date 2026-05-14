// Pure-function layout for the branch graph. Given a turn list + the active
// branch tip, returns where each turn sits in the (column, lane) grid plus
// connector geometry parent→child.
//
// Lane assignment is STRUCTURAL, not active-branch-relative. The first child
// of any node (by createdAt, then id) inherits its parent's lane; later
// siblings get fresh lanes. This means the original chain stays on lane 0
// forever and forks always grow downward — clicking around doesn't reshuffle
// the picture.
//
// `isActive` is reported on each node/connector for visual emphasis only.

export type TurnNode = {
  id: string;
  turnNumber: number;
  dateAtTurn: string;
  phase: string;
  closedAt: string | null;
  parentTurnId: string | null;
  createdAt: string;
};

export type LaidOutTurn = TurnNode & {
  lane: number;
  isActive: boolean;
  isCurrent: boolean;
  hasChildren: boolean;
  /** Number of other turns sharing this turn's parent (excluding self). */
  siblingCount: number;
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
  // Stable sibling order: createdAt ascending, id as tiebreaker. The first
  // child by this ordering keeps its parent's lane; siblings created later
  // fork into new lanes. This is independent of what the user is doing now
  // so the graph doesn't shift around when they switch branches.
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    });
  }

  const laneById = new Map<string, number>();
  let nextLane = 0;

  function assign(node: TurnNode, lane: number) {
    laneById.set(node.id, lane);
    const children = childrenByParent.get(node.id) ?? [];
    children.forEach((child, idx) => {
      // First-born sibling inherits the lane; the rest grow new branches.
      if (idx === 0) assign(child, lane);
      else assign(child, nextLane++);
    });
  }

  const roots = childrenByParent.get(null) ?? [];
  for (const root of roots) {
    assign(root, nextLane++);
  }

  // Active chain: walk parents up from currentTurnId. Visual flag only —
  // lanes are NOT swapped to put the active branch on top.
  const activeChain = new Set<string>();
  let cur: string | null = currentTurnId;
  while (cur) {
    activeChain.add(cur);
    cur = byId.get(cur)?.parentTurnId ?? null;
  }

  const numLanes = (Math.max(0, ...laneById.values()) + 1) || 1;
  const numCols = Math.max(...turns.map((t) => t.turnNumber)) || 1;

  const nodes: LaidOutTurn[] = turns.map((t) => {
    const allSameParent = childrenByParent.get(t.parentTurnId)?.length ?? 1;
    return {
      ...t,
      lane: laneById.get(t.id) ?? 0,
      isActive: activeChain.has(t.id),
      isCurrent: t.id === currentTurnId,
      hasChildren: (childrenByParent.get(t.id)?.length ?? 0) > 0,
      siblingCount: Math.max(0, allSameParent - 1),
    };
  });

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
