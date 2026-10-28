"use client";

import { useEffect, useRef, useState } from "react";
import { cubicBezierPoint, getNodePalette, type AnimatedNodeState } from "../../materials/mindmap-layout";
import { FONT_FAMILY, mindmapLayoutOf } from "./geometry";
import type { MindmapElement } from "./types";

const LINE_HEIGHT = { root: 20, node: 18 };

/** Greedy word wrap by an estimate of the character width, like the node sizing in the layout. */
function wrapLabel(label: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of label.split(/\s+/)) {
    if (line && (line + " " + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [label];
}

/**
 * A mindmap on the whiteboard, animated like the one on the materials page: every node starts at its parent and
 * fans out to its place, folding or unfolding a branch glides the nodes, and a dot flows along each connector.
 * The fold buttons carry `data-mm-toggle="<element id>|<node id>"`; the board handles the click.
 */
export function MindmapElementView({ el }: { el: MindmapElement }) {
  const layout = mindmapLayoutOf(el);
  const root = useRef<SVGGElement>(null);
  const working = useRef<Record<string, AnimatedNodeState>>({}); // the animation's own state; only the effect touches it
  const [frame, setFrame] = useState<{ nodes: Record<string, AnimatedNodeState>; pulse: number }>({ nodes: {}, pulse: 0 });

  useEffect(() => {
    let raf = 0;
    let count = 0;
    let pulse = 0;
    const step = () => {
      raf = requestAnimationFrame(step);
      // hidden board tab or background tab: nothing to draw
      if (document.visibilityState !== "visible" || !root.current?.ownerSVGElement?.getClientRects().length) return;
      const map = working.current;
      pulse = (pulse + 0.012) % 1;
      for (const node of layout.nodes) {
        const current = map[node.id];
        if (!current) {
          // a new or unfolded node starts at its parent's current place and fans out
          const parent = (node.parent_id && (map[node.parent_id] ?? layout.byId.get(node.parent_id))) || null;
          map[node.id] = { x: parent ? parent.x + 40 : node.x - 24, y: parent ? parent.y : node.y, opacity: 0.15, scale: 0.86 };
        } else {
          current.x += (node.x - current.x) * 0.22;
          current.y += (node.y - current.y) * 0.22;
          current.opacity += (1 - current.opacity) * 0.2;
          current.scale += (1 - current.scale) * 0.24;
        }
      }
      for (const id of Object.keys(map)) if (!layout.byId.has(id)) delete map[id]; // folded away
      count += 1;
      if (count % 2 === 0) setFrame({ nodes: Object.fromEntries(Object.entries(map).map(([id, state]) => [id, { ...state }])), pulse }); // 30 redraws a second is plenty
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [layout]);

  // until the first frame a node is drawn invisible at its place, so nothing flashes
  const stateOf = (id: string, x: number, y: number): AnimatedNodeState => frame.nodes[id] ?? { x, y, opacity: 0, scale: 0.86 };
  const pulse = frame.pulse;

  return (
    <g ref={root} transform={`translate(${el.x} ${el.y}) scale(${el.scale})`}>
      {layout.nodes.map((node, index) => {
        const parent = node.parent_id ? layout.byId.get(node.parent_id) : undefined;
        if (!parent) return null;
        const from = stateOf(parent.id, parent.x, parent.y);
        const to = stateOf(node.id, node.x, node.y);
        const startX = from.x + parent.width + 14;
        const startY = from.y + parent.height / 2;
        const endX = to.x;
        const endY = to.y + node.height / 2;
        const offset = Math.max(40, Math.abs(endX - startX) * 0.5);
        const color = getNodePalette(node.depth, node.branchIndex).line;
        const dot = cubicBezierPoint((pulse + index * 0.17) % 1, startX, startY, startX + offset, startY, endX - offset, endY, endX, endY);
        const opacity = Math.min(from.opacity, to.opacity);
        return (
          <g key={`edge-${node.id}`} opacity={opacity}>
            <path d={`M ${startX} ${startY} C ${startX + offset} ${startY} ${endX - offset} ${endY} ${endX} ${endY}`} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.65} />
            <circle cx={dot.x} cy={dot.y} r={3} fill={color} opacity={0.75} />
          </g>
        );
      })}

      {layout.nodes.map((node) => {
        const palette = getNodePalette(node.depth, node.branchIndex);
        const state = stateOf(node.id, node.x, node.y);
        const isRoot = node.depth === 0;
        const charWidth = isRoot ? 8.2 : 7.4;
        const lines = wrapLabel(node.label, Math.max(8, Math.floor((node.width - 32 - 18) / charWidth)));
        const lineHeight = isRoot ? LINE_HEIGHT.root : LINE_HEIGHT.node;
        const firstY = (node.height - lines.length * lineHeight) / 2 + lineHeight / 2;
        return (
          <g
            key={node.id}
            opacity={state.opacity}
            transform={`translate(${state.x + node.width / 2} ${state.y + node.height / 2}) scale(${state.scale}) translate(${-node.width / 2} ${-node.height / 2})`}
          >
            <rect width={node.width} height={node.height} rx={14} fill={palette.bg} />
            <text fill={palette.text} fontFamily={FONT_FAMILY} fontSize={isRoot ? 15 : 13} fontWeight={isRoot ? 700 : 600} style={{ userSelect: "none" }}>
              {lines.map((line, i) => (
                <tspan key={i} x={16} y={firstY + i * lineHeight} dominantBaseline="central">
                  {line}
                </tspan>
              ))}
            </text>
            {node.childCount > 0 && (
              <g data-mm-toggle={`${el.id}|${node.id}`} style={{ cursor: "pointer" }}>
                <circle data-mm-toggle={`${el.id}|${node.id}`} cx={node.width + 7} cy={node.height / 2} r={11} fill="#ffffff" stroke={palette.line} strokeWidth={2} />
                <text
                  data-mm-toggle={`${el.id}|${node.id}`}
                  x={node.width + 7}
                  y={node.height / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={node.isCollapsed ? 11 : 15}
                  fontWeight={700}
                  fontFamily={FONT_FAMILY}
                  fill={palette.line}
                  style={{ userSelect: "none" }}
                >
                  {node.isCollapsed ? node.childCount : "−"}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
