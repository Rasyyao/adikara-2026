import { formatRouteTable, toRows } from "./format-routes.js";
import { loadRouteGroupsForTooling } from "./route-groups.js";

// pnpm routes [--feature auth] [--access admin] [--json] [--no-color]
const USAGE = "Usage: pnpm routes [--feature <name>] [--access <public|authenticated|student|staff|admin>] [--json] [--no-color]";

function main(argv: string[]) {
  const options: { feature?: string; access?: string; json: boolean; color: boolean } = {
    json: false,
    color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--no-color") options.color = false;
    else if (arg === "--feature" || arg === "--access") {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} needs a value`);
      options[arg === "--feature" ? "feature" : "access"] = value;
    } else if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      return;
    } else {
      throw new Error(`Unknown option: ${arg}\n${USAGE}`);
    }
  }

  const groups = loadRouteGroupsForTooling();
  if (options.feature && !groups.some((group) => group.feature === options.feature)) {
    throw new Error(`Unknown feature "${options.feature}". Available: ${groups.map((g) => g.feature).join(", ")}`);
  }

  console.log(options.json ? JSON.stringify(toRows(groups, options), null, 2) : formatRouteTable(groups, options));
}

try {
  main(process.argv.slice(2));
  process.exit(0);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
