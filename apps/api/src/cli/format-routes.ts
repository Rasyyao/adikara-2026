import { labelOf } from "../http/middleware/label.js";
import { API_PREFIX } from "../routes/index.js";
import type { RouteGroup } from "../routes/types.js";

export interface FormatOptions {
  color?: boolean;
  feature?: string;
  access?: string;
}

const COLORS = { reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m", red: "\x1b[31m", cyan: "\x1b[36m" };

const METHOD_COLOR: Record<string, keyof typeof COLORS> = { get: "green", post: "yellow", put: "blue", patch: "blue", delete: "red" };
const ACCESS_COLOR: Record<string, keyof typeof COLORS> = { public: "green", authenticated: "cyan", student: "yellow", staff: "yellow", admin: "red" };

export interface RouteRow {
  feature: string;
  method: string;
  uri: string;
  access: string;
  middleware: string;
  summary: string;
}

export function toRows(groups: RouteGroup[], filter: Pick<FormatOptions, "feature" | "access"> = {}): RouteRow[] {
  return groups
    .filter((group) => !filter.feature || group.feature === filter.feature)
    .flatMap((group) =>
      group.routes
        .filter((route) => !filter.access || route.access === filter.access)
        .map((route) => ({
          feature: group.feature,
          method: route.method.toUpperCase(),
          uri: `${API_PREFIX}${route.path}`,
          access: route.access,
          middleware: (route.middleware ?? []).map(labelOf).join(", ") || "-",
          summary: route.doc.summary,
        })),
    );
}

/** Plain-text route list grouped by feature, like `php artisan route:list`. */
export function formatRouteTable(groups: RouteGroup[], options: FormatOptions = {}): string {
  const rows = toRows(groups, options);
  if (rows.length === 0) return "No routes found.";

  const paint = (text: string, color?: keyof typeof COLORS) =>
    options.color && color ? `${COLORS[color]}${text}${COLORS.reset}` : text;
  const width = (pick: (row: RouteRow) => string) => Math.max(...rows.map((row) => pick(row).length));
  const w = { method: width((r) => r.method), uri: width((r) => r.uri), access: width((r) => r.access), mw: width((r) => r.middleware) };

  const lines: string[] = [];
  const features = [...new Set(rows.map((row) => row.feature))];
  for (const feature of features) {
    const description = groups.find((group) => group.feature === feature)?.description ?? "";
    lines.push("", `  ${paint(feature, "bold")}  ${paint(description, "dim")}`);
    for (const row of rows.filter((r) => r.feature === feature)) {
      lines.push(
        "    " +
          [
            paint(row.method.padEnd(w.method), METHOD_COLOR[row.method.toLowerCase()]),
            row.uri.padEnd(w.uri),
            paint(row.access.padEnd(w.access), ACCESS_COLOR[row.access]),
            paint(row.middleware.padEnd(w.mw), "dim"),
            row.summary,
          ].join("  "),
      );
    }
  }
  lines.push("", `  ${rows.length} route${rows.length === 1 ? "" : "s"} in ${features.length} feature${features.length === 1 ? "" : "s"}`, "");
  return lines.join("\n");
}
