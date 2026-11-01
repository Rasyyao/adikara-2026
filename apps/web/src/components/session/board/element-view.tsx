import { memo, type CSSProperties, type SVGProps } from "react";
import { MindmapElementView } from "./mindmap-view";
import { QuizCard } from "./quiz-card";
import { arrowHeadPath, boundsOf, FONT_FAMILY, freedrawPath, labelFontOf, labelWidthOf, lineHeightOf, wrapToWidth } from "./geometry";
import type { BoardElement, BoxElement } from "./types";

/** Delay between the parts of a diagram fanning in, one step after the other. */
const ENTER_STEP_MS = 90;

const CODE_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
/** A line of code in a code simulation, written in a code font so it reads as what a program says. */
const isCodeLine = (el: BoxElement) => el.diagram?.kind === "trace" && Boolean(el.diagram.node?.startsWith("L")) && !el.diagram.deco && !el.diagram.changed;

/** The text in the middle of a shape, wrapped to the room the shape has and sized to fit it. */
function BoxLabel({ el }: { el: BoxElement }) {
  if (!el.label) return null;
  const b = boundsOf(el);
  const fontSize = labelFontOf(el);
  const lines = wrapToWidth(el.label, fontSize, labelWidthOf(el));
  const lineHeight = lineHeightOf(fontSize);
  const top = b.y + b.h / 2 - (lines.length * lineHeight) / 2;
  const strong = el.diagram && !el.diagram.deco && el.diagram.kind !== "comparison";
  return (
    <text
      fill={el.strokeColor}
      fontSize={fontSize}
      fontWeight={strong || el.diagram?.deco ? 600 : undefined}
      fontFamily={isCodeLine(el) ? CODE_FONT : FONT_FAMILY}
      textAnchor="middle"
      style={{ whiteSpace: "pre", userSelect: "none", pointerEvents: "none" }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={b.x + b.w / 2} y={top + i * lineHeight} dominantBaseline="hanging">
          {line || " "}
        </tspan>
      ))}
    </text>
  );
}

/** The outline of a box shape, as the SVG element that draws it. */
export function BoxShape({ el, ...props }: { el: BoxElement } & SVGProps<SVGElement>) {
  const b = boundsOf(el);
  if (el.type === "ellipse") return <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} {...(props as SVGProps<SVGEllipseElement>)} />;
  if (el.type === "diamond") {
    const points = `${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y + b.h / 2} ${b.x + b.w / 2},${b.y + b.h} ${b.x},${b.y + b.h / 2}`;
    return <polygon points={points} {...(props as SVGProps<SVGPolygonElement>)} />;
  }
  return <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(el.diagram ? 12 : 8, b.w / 6, b.h / 6)} {...(props as SVGProps<SVGRectElement>)} />;
}

/**
 * One element as SVG. Memoised: a drag only changes the elements being dragged. `still` draws it without the entrance
 * animation and the travelling dots (a copy drawn again over the playback's veil).
 */
export const ElementView = memo(function ElementView({ el, still = false }: { el: BoardElement; still?: boolean }) {
  const animated = Boolean(el.diagram) && !still;
  const enterDelay = (e: BoardElement): CSSProperties | undefined => (animated ? { animationDelay: `${(e.diagram?.step ?? 0) * ENTER_STEP_MS}ms` } : undefined);
  const stroke = { stroke: el.strokeColor, strokeWidth: el.strokeWidth, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
  switch (el.type) {
    case "rectangle":
    case "ellipse":
    case "diamond": {
      // a diagram's shapes sit on a soft shadow and pop in one after the other
      const lifted = el.diagram && !el.diagram.deco && el.backgroundColor !== "transparent";
      return (
        <g className={animated ? "diagram-enter" : undefined} style={enterDelay(el)}>
          {lifted && <BoxShape el={el} transform="translate(3 4)" fill="rgb(15 23 42 / 0.12)" stroke="none" />}
          <BoxShape el={el} {...stroke} fill={el.backgroundColor} />
          <BoxLabel el={el} />
        </g>
      );
    }
    case "line":
    case "arrow": {
      const d = el.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
      const flowArrow = animated && el.diagram?.kind === "flow" && el.diagram.from;
      return (
        <g transform={`translate(${el.x} ${el.y})`}>
          <path d={d} {...stroke} pathLength={animated ? 1 : undefined} className={animated ? "diagram-draw" : undefined} style={enterDelay(el)} />
          {el.type === "arrow" && <path d={arrowHeadPath(el)} {...stroke} className={animated ? "diagram-fade" : undefined} style={enterDelay(el)} />}
          {flowArrow && (
            // a dot that keeps travelling the arrow, so the direction of the flow reads at a glance
            <circle r={Math.max(3, el.strokeWidth * 1.6)} fill={el.strokeColor} opacity={0.55} className="diagram-dot" pointerEvents="none">
              <animateMotion dur="2.4s" repeatCount="indefinite" path={d} />
            </circle>
          )}
        </g>
      );
    }
    case "freedraw":
      return <path transform={`translate(${el.x} ${el.y})`} d={freedrawPath(el.points)} {...stroke} />;
    case "mindmap":
      return <MindmapElementView el={el} />;
    case "quiz":
      return <QuizCard el={el} />;
    case "text": {
      const lineHeight = lineHeightOf(el.fontSize);
      return (
        <text
          x={el.x}
          y={el.y}
          fill={el.strokeColor}
          fontSize={el.fontSize}
          fontWeight={el.diagram?.node === "title" ? 700 : undefined}
          fontFamily={el.diagram?.node === "program" ? CODE_FONT : FONT_FAMILY}
          className={animated ? "diagram-enter" : undefined}
          style={{ whiteSpace: "pre", userSelect: "none", ...enterDelay(el) }}
        >
          {el.text.split("\n").map((line, i) => (
            <tspan key={i} x={el.x} y={el.y + i * lineHeight} dominantBaseline="hanging">
              {line || " "}
            </tspan>
          ))}
        </text>
      );
    }
  }
});
