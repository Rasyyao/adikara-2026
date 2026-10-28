import { memo } from "react";
import { MindmapElementView } from "./mindmap-view";
import { arrowHeadPath, boundsOf, FONT_FAMILY, freedrawPath, lineHeightOf } from "./geometry";
import type { BoardElement } from "./types";

/** One element as SVG. Memoised: a drag only changes the elements being dragged. */
export const ElementView = memo(function ElementView({ el }: { el: BoardElement }) {
  const stroke = { stroke: el.strokeColor, strokeWidth: el.strokeWidth, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
  switch (el.type) {
    case "rectangle": {
      const b = boundsOf(el);
      return <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(8, b.w / 6, b.h / 6)} {...stroke} fill={el.backgroundColor} />;
    }
    case "ellipse": {
      const b = boundsOf(el);
      return <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} {...stroke} fill={el.backgroundColor} />;
    }
    case "diamond": {
      const b = boundsOf(el);
      const points = `${b.x + b.w / 2},${b.y} ${b.x + b.w},${b.y + b.h / 2} ${b.x + b.w / 2},${b.y + b.h} ${b.x},${b.y + b.h / 2}`;
      return <polygon points={points} {...stroke} fill={el.backgroundColor} />;
    }
    case "line":
    case "arrow": {
      const d = el.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
      return (
        <g transform={`translate(${el.x} ${el.y})`}>
          <path d={d} {...stroke} />
          {el.type === "arrow" && <path d={arrowHeadPath(el)} {...stroke} />}
        </g>
      );
    }
    case "freedraw":
      return <path transform={`translate(${el.x} ${el.y})`} d={freedrawPath(el.points)} {...stroke} />;
    case "mindmap":
      return <MindmapElementView el={el} />;
    case "text": {
      const lineHeight = lineHeightOf(el.fontSize);
      return (
        <text x={el.x} y={el.y} fill={el.strokeColor} fontSize={el.fontSize} fontFamily={FONT_FAMILY} style={{ whiteSpace: "pre", userSelect: "none" }}>
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
