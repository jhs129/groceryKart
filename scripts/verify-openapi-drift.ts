import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { openApiSpec } from "../lib/openapi/spec";

const REPO_ROOT = path.resolve(__dirname, "..");
const EXCLUDED_SEGMENTS = ["oauth", "auth", "mcp", "openapi.json"];

function toRoutePath(apiPath: string) {
  const segments = apiPath
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment.startsWith("{") ? `[${segment.slice(1, -1)}]` : segment));
  return `app/api/${segments.join("/")}/route.ts`;
}

function toApiPath(routeFilePath: string) {
  const segments = routeFilePath
    .replace(/^app\/api\//, "")
    .replace(/\/route\.ts$/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => (segment.startsWith("[") && segment.endsWith("]") ? `{${segment.slice(1, -1)}}` : segment));
  return `/${segments.join("/")}`;
}

function findRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findRouteFiles(fullPath));
    } else if (entry === "route.ts") {
      results.push(fullPath);
    }
  }
  return results;
}

let ok = true;

// Forward check: spec -> file
for (const apiPath of Object.keys(openApiSpec.paths)) {
  const relativeFilePath = toRoutePath(apiPath);
  const absoluteFilePath = path.join(REPO_ROOT, relativeFilePath);
  if (!existsSync(absoluteFilePath)) {
    console.log(`MISSING: ${apiPath} -> ${relativeFilePath}`);
    ok = false;
  }
}

// Reverse check: file -> spec
const apiDir = path.join(REPO_ROOT, "app", "api");
if (existsSync(apiDir)) {
  const routeFiles = findRouteFiles(apiDir);
  for (const absoluteRouteFile of routeFiles) {
    const relativeRouteFile = path.relative(REPO_ROOT, absoluteRouteFile).split(path.sep).join("/");
    const isExcluded = EXCLUDED_SEGMENTS.some((segment) => relativeRouteFile.split("/").includes(segment));
    if (isExcluded) continue;

    const apiPath = toApiPath(relativeRouteFile);
    if (!(apiPath in openApiSpec.paths)) {
      console.log(`UNDOCUMENTED: ${relativeRouteFile} -> ${apiPath}`);
      ok = false;
    }
  }
}

console.log(ok ? "PASS: spec and route.ts files match in both directions" : "FAIL: see MISSING/UNDOCUMENTED lines above");
process.exit(ok ? 0 : 1);
