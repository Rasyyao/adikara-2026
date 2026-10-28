// The mindmap's look and tree layout, shared by the materials page (Konva) and the class whiteboard (SVG),
// so a mindmap looks the same in both. Pure functions: no React, no canvas.

export interface MindmapNodeItem {
  id: string;
  parent_id: string | null;
  label: string;
  text: string;
  source?: string | null;
}

export interface MindmapPayload {
  title: string;
  nodes: MindmapNodeItem[];
}

export interface LayoutNode extends MindmapNodeItem {
  depth: number;
  branchIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  childCount: number;
  isCollapsed: boolean;
}

export interface AnimatedNodeState {
  x: number;
  y: number;
  opacity: number;
  scale: number;
}

export const ROOT_PALETTE = {
  bg: "#1F1B2E",
  selectedBg: "#3B0764",
  text: "#FFFFFF",
  badgeBg: "#6D28D9",
  line: "#6D28D9",
};

const BRANCH_PALETTES = [
  // Royal Violet (--primary #6d28d9)
  { l1: "#6D28D9", l2: "#7C3AED", selected: "#5B21B6", badge: "#4C1D95", line: "#7C3AED" },
  // Deep Indigo
  { l1: "#4338CA", l2: "#4F46E5", selected: "#3730A3", badge: "#312E81", line: "#4F46E5" },
  // Orchid Amethyst
  { l1: "#9333EA", l2: "#A855F7", selected: "#7E22CE", badge: "#581C87", line: "#9333EA" },
  // Teal Emerald (--success harmony)
  { l1: "#0F766E", l2: "#0D9488", selected: "#115E59", badge: "#134E4A", line: "#0D9488" },
  // Berry Plum
  { l1: "#A21CAF", l2: "#C026D3", selected: "#86198F", badge: "#701A75", line: "#C026D3" },
  // Warm Amber (--warning #b45309)
  { l1: "#B45309", l2: "#D97706", selected: "#92400E", badge: "#78350F", line: "#D97706" },
];

export function getNodePalette(depth: number, branchIndex: number) {
  if (depth === 0) return ROOT_PALETTE;
  const branch = BRANCH_PALETTES[Math.abs(branchIndex) % BRANCH_PALETTES.length];
  return {
    bg: depth === 1 ? branch.l1 : branch.l2,
    selectedBg: branch.selected,
    text: "#FFFFFF",
    badgeBg: branch.badge,
    line: branch.line,
  };
}

export const HORIZONTAL_GAP = 104;
export const VERTICAL_GAP = 22;
export const NODE_PADDING_X = 16;
export const NODE_PADDING_Y = 12;

export function measureNodeBox(label: string, depth: number): { width: number; height: number } {
  const maxWidth = depth === 0 ? 235 : depth === 1 ? 215 : 225;
  const minWidth = depth === 0 ? 175 : 148;
  const charWidth = depth === 0 ? 8.2 : 7.4;
  const estimatedSingleLine = Math.ceil(label.length * charWidth) + NODE_PADDING_X * 2 + 24;
  const width = Math.max(minWidth, Math.min(maxWidth, estimatedSingleLine));
  const innerTextWidth = width - NODE_PADDING_X * 2 - 18;
  const lines = Math.max(1, Math.ceil((label.length * charWidth) / Math.max(80, innerTextWidth)));
  const lineHeight = depth === 0 ? 20 : 18;
  const height = Math.max(46, lines * lineHeight + NODE_PADDING_Y * 2);
  return { width, height };
}

export function cubicBezierPoint(
  t: number,
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
): { x: number; y: number } {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0x + 3 * uu * t * p1x + 3 * u * tt * p2x + ttt * p3x,
    y: uuu * p0y + 3 * uu * t * p1y + 3 * u * tt * p2y + ttt * p3y,
  };
}

/** parent id -> children (null = the roots). A parent that does not exist counts as no parent. */
export function buildChildrenMap(nodes: MindmapNodeItem[]): Map<string | null, MindmapNodeItem[]> {
  const map = new Map<string | null, MindmapNodeItem[]>();
  const validIds = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    const pid = node.parent_id && validIds.has(node.parent_id) ? node.parent_id : null;
    const list = map.get(pid) ?? [];
    list.push(node);
    map.set(pid, list);
  }
  return map;
}

/** Horizontal left-to-right tree (NotebookLM style): one column per depth, parents centred on their children. */
export function layoutMindmap(
  nodes: MindmapNodeItem[],
  collapsedIds: ReadonlySet<string>,
  manualPositions: Record<string, { x: number; y: number }> = {},
): { layoutNodes: LayoutNode[]; layoutNodeById: Map<string, LayoutNode> } {
  const childrenMap = buildChildrenMap(nodes);
  const roots = childrenMap.get(null) ?? (nodes[0] ? [nodes[0]] : []);
  const computedNodes: LayoutNode[] = [];
  const nodeById = new Map<string, LayoutNode>();

  const colWidths = new Map<number, number>();
  const visitMeasure = (node: MindmapNodeItem, depth: number) => {
    const box = measureNodeBox(node.label, depth);
    colWidths.set(depth, Math.max(colWidths.get(depth) ?? 0, box.width));
    if (collapsedIds.has(node.id)) return;
    for (const kid of childrenMap.get(node.id) ?? []) visitMeasure(kid, depth + 1);
  };
  for (const r of roots) visitMeasure(r, 0);

  const colX = new Map<number, number>();
  let runningX = 0;
  for (let d = 0; d <= 10; d++) {
    colX.set(d, runningX);
    runningX += (colWidths.get(d) ?? 200) + HORIZONTAL_GAP;
  }

  let leafCursorY = 0;

  const placeSubtree = (node: MindmapNodeItem, depth: number, branchIndex: number): LayoutNode => {
    const box = measureNodeBox(node.label, depth);
    const kids = childrenMap.get(node.id) ?? [];
    const isCollapsed = collapsedIds.has(node.id);
    const x = colX.get(depth) ?? depth * (210 + HORIZONTAL_GAP);

    let y = 0;
    if (kids.length === 0 || isCollapsed) {
      y = leafCursorY;
      leafCursorY += box.height + VERTICAL_GAP;
    } else {
      const placedKids = kids.map((k, idx) => placeSubtree(k, depth + 1, depth === 0 ? idx : branchIndex));
      const firstKid = placedKids[0];
      const lastKid = placedKids[placedKids.length - 1];
      const subtreeCenter = (firstKid.y + lastKid.y + lastKid.height) / 2;
      y = subtreeCenter - box.height / 2;
    }

    const manual = manualPositions[node.id];
    const layoutNode: LayoutNode = {
      ...node,
      depth,
      branchIndex,
      x: manual ? manual.x : x,
      y: manual ? manual.y : y,
      width: box.width,
      height: box.height,
      childCount: kids.length,
      isCollapsed,
    };
    computedNodes.push(layoutNode);
    nodeById.set(node.id, layoutNode);
    return layoutNode;
  };

  roots.forEach((r, idx) => placeSubtree(r, 0, idx));
  return { layoutNodes: computedNodes, layoutNodeById: nodeById };
}
