import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildOpenApi } from "../docs/openapi.js";
import { loadRouteGroupsForTooling } from "./route-groups.js";

// pnpm openapi [output-path]   (default: docs/openapi.json). Import the file into Postman or Insomnia.
const output = process.argv[2] ?? "docs/openapi.json";

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(buildOpenApi(loadRouteGroupsForTooling()), null, 2)}\n`);
console.log(`OpenAPI spec written to ${output}`);
process.exit(0);
