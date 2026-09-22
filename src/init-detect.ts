/** Read-only detection used by the initializer. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createRequire } from "node:module";
import { minVersion, satisfies, valid, validRange } from "semver";
import { parse } from "yaml";
import { DEFAULT_CONFIG } from "./config.ts";
import { matchesAny } from "./docs-coverage.ts";
import { walk } from "./lib/fs.ts";

export type Package = {
  name?: string;
  packageManager?: string;
  workspaces?: string[] | { packages?: string[] };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};
export type Project = { dir: string; pkg: Package };
export type Manager = "pnpm" | "npm" | "yarn" | "bun";
export const excluded = [
  ...DEFAULT_CONFIG.excludeDirSegments,
  ".git",
  ".worktrees",
  ".next",
  ".yarn",
  ".cache",
  "gates",
];
export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}
export function detectManager(cwd: string, pkg: Package): Manager {
  const declared = pkg.packageManager?.split("@")[0];
  if (declared) {
    if (["pnpm", "npm", "yarn", "bun"].includes(declared)) return declared as Manager;
    throw new Error(`Unsupported package manager: ${declared}`);
  }
  const locks: [string, Manager][] = [
    ["pnpm-lock.yaml", "pnpm"],
    ["pnpm-workspace.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ];
  return locks.find(([file]) => existsSync(join(cwd, file)))?.[1] ?? "npm";
}
export function discoverProjects(cwd: string, pkg: Package): Project[] {
  const workspaceFile = join(cwd, "pnpm-workspace.yaml");
  const workspace = existsSync(workspaceFile)
    ? parse(readFileSync(workspaceFile, "utf8"))
    : undefined;
  const patterns: string[] =
    workspace?.packages ??
    (Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages) ??
    [];
  // Fail explicitly instead of silently missing packages with unsupported syntax.
  if (patterns.some((p) => /[{}[\]?]/.test(p))) {
    throw new Error(
      "Workspace discovery supports literal paths, * and ** globs, and ! exclusions. Expand other workspace patterns before running init.",
    );
  }
  const included = patterns
    .filter((p) => !p.startsWith("!"))
    .map((p) => p.replace(/^\.\//, "").replace(/\/$/, ""));
  const omitted = patterns
    .filter((p) => p.startsWith("!"))
    .map((p) => p.slice(1).replace(/^\.\//, "").replace(/\/$/, ""));
  const projects: Project[] = [{ dir: ".", pkg }];
  if (included.length) {
    for (const file of walk(cwd, excluded)) {
      if (!file.endsWith(`${process.platform === "win32" ? "\\" : "/"}package.json`)) continue;
      const dir = relative(cwd, dirname(file)).replaceAll("\\", "/");
      if (dir && matchesAny(dir, included) && !matchesAny(dir, omitted))
        projects.push({ dir, pkg: readJson<Package>(file) });
    }
  }
  return projects.sort((a, b) => a.dir.localeCompare(b.dir));
}
export function dependency(pkg: Package, name: string): string | undefined {
  return pkg.devDependencies?.[name] ?? pkg.dependencies?.[name];
}
export function dependencyVersion(cwd: string, project: Project, name: string): string | undefined {
  const declared = dependency(project.pkg, name);
  if (!declared) return undefined;
  const workspaceFile = join(cwd, "pnpm-workspace.yaml");
  let range = declared;
  if (range.startsWith("catalog:") && existsSync(workspaceFile)) {
    const data = parse(readFileSync(workspaceFile, "utf8"));
    const catalog = range.slice("catalog:".length);
    range = (catalog ? data?.catalogs?.[catalog]?.[name] : data?.catalog?.[name]) ?? "";
  }
  try {
    const require = createRequire(join(cwd, project.dir, "package.json"));
    const version = readJson<{ version: string }>(require.resolve(`${name}/package.json`)).version;
    if (valid(version) && (!validRange(range) || satisfies(version, range))) return version;
  } catch {
    /* An uninstalled repo may still have an ordinary semver range. */
  }
  try {
    return minVersion(range)?.version;
  } catch {
    return undefined;
  }
}
export function requireCompatible(cwd: string, pkg: Package, name: string, range: string) {
  if (!dependency(pkg, name)) return;
  const version = dependencyVersion(cwd, { dir: ".", pkg }, name);
  if (!version || !satisfies(version, range)) {
    throw new Error(
      `${name} must satisfy ${range}. Upgrade or resolve the existing dependency before init, or use --no-design-system.`,
    );
  }
}
