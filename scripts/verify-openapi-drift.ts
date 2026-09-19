import { existsSync } from "node:fs";
import { openApiSpec } from "../lib/openapi/spec";

function toRoutePath(apiPath: string) {
  const segments = apiPath
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment.startsWith("{") ? `[${segment.slice(1, -1)}]` : segment));
  return `app/api/${segments.join("/")}/route.ts`;
}

let ok = true;
for (const apiPath of Object.keys(openApiSpec.paths)) {
  const filePath = toRoutePath(apiPath);
  if (!existsSync(filePath)) {
    console.log(`MISSING: ${apiPath} -> ${filePath}`);
    ok = false;
  }
}
console.log(ok ? "PASS: every documented path has a route.ts" : "FAIL: see MISSING lines above");
process.exit(ok ? 0 : 1);
