/** Configure applicable gates without replacing consumer scripts, policies, or baselines. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { satisfies } from "semver";
import { DEFAULT_CONFIG, loadContext, type GateSpec } from "./config.ts";
import { runFileSizes } from "./file-sizes.ts";
import { runDebtMarkers } from "./debt-markers.ts";
import { runCircularImports } from "./circular-imports.ts";
import {
  dependency,
  dependencyVersion,
  detectManager,
  discoverProjects,
  excluded,
  readJson,
  requireCompatible,
  type Package,
} from "./init-detect.ts";
import { ESLINT_CONFIG, OXLINT_CONFIG, eslintConfig, oxlintConfig } from "./init-design-system.ts";

export type InitOptions = {
  install?: boolean;
  designSystem?: boolean;
  shadscan?: boolean;
  shadscanFloor?: number;
};

export function parseInitOptions(args: string[]): InitOptions {
  const options: InitOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--skip-install") options.install = false;
    else if (arg === "--no-design-system") options.designSystem = false;
    else if (arg === "--no-shadscan") options.shadscan = false;
    else if (arg === "--shadscan-floor" || arg.startsWith("--shadscan-floor=")) {
      const raw = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[++i];
      if (!raw || !/^\d+$/.test(raw) || Number(raw) > 100) {
        throw new Error("--shadscan-floor must be an integer from 0 to 100.");
      }
      options.shadscanFloor = Number(raw);
    } else throw new Error(`Unknown init option: ${arg}`);
  }
  return options;
}

type Overlay = {
  runner?: string;
  gates?: GateSpec[];
  scanRoots?: string[];
  sourceExtensions?: string[];
  excludeDirSegments?: string[];
  coverage?: { summaryGlobs?: string[] };
  agents?: { targets?: string[]; runnerCommand?: string };
  docsCoverage?: { surfaces?: unknown[] };
  bundleSize?: { targets?: unknown[] };
  [key: string]: unknown;
};

function writeJson(file: string, value: unknown) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function shellQuote(value: string): string {
  // Double quotes work in both POSIX package-script shells and Windows cmd.
  // Refuse shell expansion characters rather than executing a workspace path as code.
  if (!/^[a-zA-Z0-9_./ @+-]+$/.test(value)) {
    throw new Error(
      "A Shadscan workspace path contains shell-special characters. Define check:shadscan manually or use --no-shadscan.",
    );
  }
  return `"${value === "." ? "." : `./${value}`}"`;
}

export function runInit(cwd: string, options: InitOptions = {}): number {
  try {
    return initialize(cwd, options);
  } catch (error) {
    console.error(`repo-gates init: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function initialize(cwd: string, options: InitOptions): number {
  const packagePath = join(cwd, "package.json");
  if (!existsSync(packagePath))
    throw new Error("Run init from a repository root containing package.json.");
  const floor = options.shadscanFloor ?? 80;
  if (!Number.isInteger(floor) || floor < 0 || floor > 100)
    throw new Error("--shadscan-floor must be an integer from 0 to 100.");
  const pkg = readJson<Package>(packagePath);
  const configPath = join(cwd, "repo-gates.config.json");
  const config: Overlay = existsSync(configPath) ? readJson<Overlay>(configPath) : {};
  const manager = detectManager(cwd, pkg);
  const projects = discoverProjects(cwd, pkg);
  const scripts = { ...pkg.scripts };
  const added: string[] = [];
  const addScript = (name: string, command: string) => {
    if (scripts[name] !== undefined) return;
    scripts[name] = command;
    added.push(name);
  };
  const devDependencies = { ...pkg.devDependencies };
  const addDependency = (name: string, version: string) => {
    if (!dependency(pkg, name)) devDependencies[name] = version;
  };
  const filesToWrite = new Map<string, string>();
  const notices: string[] = [];
  const tailwindProjects = projects.filter((project) => {
    const own = dependencyVersion(cwd, project, "tailwindcss");
    const root = dependencyVersion(cwd, { dir: ".", pkg }, "tailwindcss");
    return (own ?? root)?.startsWith("4.");
  });
  const shadcnProjects = projects.filter((project) =>
    existsSync(join(cwd, project.dir, "components.json")),
  );
  const useDesign = options.designSystem !== false && tailwindProjects.length > 0;
  const useShadscan = options.shadscan !== false && shadcnProjects.length > 0;

  if (useDesign && !scripts["check:design-system"]) {
    if (!satisfies(process.versions.node, ">=20.19"))
      throw new Error(
        "Design-system setup requires Node >=20.19. Upgrade Node or use --no-design-system.",
      );
    const useOxlint =
      Boolean(dependency(pkg, "oxlint") || existsSync(join(cwd, ".oxlintrc.json"))) &&
      !dependency(pkg, "eslint");
    requireCompatible(cwd, pkg, "@shadcn/lint", ">=0.1.5 <0.2.0");
    if (useOxlint) {
      if (!satisfies(process.versions.node, "^20.19.0 || >=22.12.0"))
        throw new Error("Oxlint requires Node ^20.19.0 or >=22.12.0.");
      requireCompatible(cwd, pkg, "oxlint", ">=1.80.0");
      addDependency("oxlint", "1.80.0");
    } else {
      requireCompatible(cwd, pkg, "eslint", ">=9.30.0");
      requireCompatible(cwd, pkg, "@typescript-eslint/parser", ">=8.40.0");
      addDependency("eslint", "9.39.4");
      addDependency("@typescript-eslint/parser", "8.40.0");
    }
    addDependency("@shadcn/lint", "0.1.5");
    const scopes = tailwindProjects.map(({ dir }) =>
      dir === "." ? "**/*.{js,jsx,ts,tsx}" : `${dir}/**/*.{js,jsx,ts,tsx}`,
    );
    const componentScopes = tailwindProjects.flatMap(({ dir }) => {
      const prefix = dir === "." ? "" : `${dir}/`;
      return [
        `${prefix}src/components/ui/**`,
        `${prefix}components/ui/**`,
        ...(basename(dir) === "ui" ? [`${prefix}src/components/**`] : []),
      ];
    });
    const ignoredProjects = projects
      .filter((p) => p.dir !== "." && !tailwindProjects.includes(p))
      .map((p) => `${p.dir}/**`);
    const file = useOxlint ? OXLINT_CONFIG : ESLINT_CONFIG;
    if (!existsSync(join(cwd, file)))
      filesToWrite.set(
        file,
        useOxlint
          ? oxlintConfig(scopes, componentScopes, ignoredProjects)
          : eslintConfig(scopes, componentScopes, ignoredProjects),
      );
    else
      notices.push(
        `Preserved ${file}; verify its rule policy and component scopes. Existing rules were not changed.`,
      );
    addScript(
      "check:design-system",
      `${useOxlint ? "oxlint" : "eslint"} --config ${file} . --max-warnings 0`,
    );
    if (filesToWrite.has(file))
      notices.push(
        `Design-system rules: all six enabled in ${file}. Check component-directory scopes and theme discovery. https://github.com/shadcn-ui/lint`,
      );
  }
  if (useShadscan && !scripts["check:shadscan"]) {
    if (dependency(pkg, "@shadscan/cli") && dependency(pkg, "@shadscan/cli") !== "0.7.0") {
      throw new Error(
        "Existing @shadscan/cli differs from the supported pin 0.7.0. Define your own check:shadscan script or use --no-shadscan.",
      );
    }
    addDependency("@shadscan/cli", "0.7.0");
    addScript(
      "check:shadscan",
      shadcnProjects
        .map(
          ({ dir }) =>
            `shadscan ${shellQuote(dir)} --json --fail-under ${floor} --no-roast --no-interactive`,
        )
        .join(" && "),
    );
    notices.push(
      `Shadscan floor: ${floor}/100 for ${shadcnProjects.map((p) => p.dir).join(", ")}. This is a starting policy, not a measured baseline; raise it as findings are fixed.`,
    );
  }

  addScript("check:all", "repo-gates check-all");
  for (const [name, command] of Object.entries({
    "check:size": "check-size",
    "check:debt": "check-debt",
    "check:circular": "check-circular",
    "check:secrets": "check-secrets",
    "check:ci-parity": "check-ci-parity",
  }))
    addScript(name, `repo-gates ${command}`);
  const agents = projects
    .map(({ dir }) => (dir === "." ? "AGENTS.md" : `${dir}/AGENTS.md`))
    .filter((path) => existsSync(join(cwd, path)));
  if (agents.length || config.agents?.targets?.length)
    addScript("check:agents", "repo-gates check-agents");
  if (scripts["test:coverage"]) addScript("check:coverage", "repo-gates check-coverage");
  if (config.docsCoverage?.surfaces?.length)
    addScript("check:docs-coverage", "repo-gates check-docs-coverage");
  if (config.bundleSize?.targets?.length)
    addScript("check:bundle-size", "repo-gates check-bundle-size");

  config.runner ??= `${manager} run`;
  config.scanRoots ??= ["."];
  config.sourceExtensions ??= [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
  config.excludeDirSegments ??= excluded;
  config.coverage = {
    summaryGlobs: projects.map(({ dir }) =>
      dir === "." ? "coverage/coverage-summary.json" : `${dir}/coverage/coverage-summary.json`,
    ),
    ...config.coverage,
  };
  config.agents = { targets: agents, runnerCommand: manager, ...config.agents };
  if (config.gates) {
    // Keep deliberate omissions in an existing custom manifest; append newly wired scripts only.
    const known = new Set(config.gates.map((g) => g.name));
    const additions = DEFAULT_CONFIG.gates
      .filter((g) => added.includes(g.name) && !known.has(g.name))
      .map((g) => ({ ...g, conditional: false }));
    const parityIndex = config.gates.findIndex((g) => g.name === "check:ci-parity");
    config.gates.splice(parityIndex < 0 ? config.gates.length : parityIndex, 0, ...additions);
  } else {
    config.gates = DEFAULT_CONFIG.gates
      .filter((g) => scripts[g.name] !== undefined)
      .map((g) => ({ ...g, conditional: false }));
  }

  pkg.scripts = scripts;
  if (Object.keys(devDependencies).length) pkg.devDependencies = devDependencies;
  // Preflight is complete before any write. Never replace existing linter configs.
  for (const [file, content] of filesToWrite) writeFileSync(join(cwd, file), content);
  writeJson(packagePath, pkg);
  writeJson(configPath, config);
  mkdirSync(join(cwd, "gates"), { recursive: true });
  const ctx = loadContext(cwd);
  for (const [script, command, path, seed] of [
    ["check:size", "repo-gates check-size", ctx.config.fileSize.budgetsPath, runFileSizes],
    ["check:debt", "repo-gates check-debt", ctx.config.debt.allowlistPath, runDebtMarkers],
    [
      "check:circular",
      "repo-gates check-circular",
      ctx.config.circular.allowlistPath,
      runCircularImports,
    ],
  ] as const) {
    const absolute = resolve(cwd, path);
    if (scripts[script] === command && !existsSync(absolute)) {
      mkdirSync(dirname(absolute), { recursive: true });
      if (seed(ctx, true) !== 0)
        throw new Error(`Could not seed ${path}. Fix the error and rerun init.`);
    }
  }

  console.log(
    `Configured ${added.length} new script(s). Existing scripts, lint configs, and baselines were preserved.`,
  );
  for (const notice of notices) console.log(notice);
  const missing = ["lint", "format:check", "typecheck", "test"].filter((name) => !scripts[name]);
  if (missing.length)
    console.log(
      `Not configured: ${missing.join(", ")}. Add real project commands and entries to repo-gates.config.json to enable them.`,
    );
  if (scripts["check:coverage"])
    console.log(
      "Coverage is enabled. Ensure test:coverage writes json-summary reports; run repo-gates check-coverage --init to seed floors.",
    );
  console.log(
    "Secret scanning is enabled with no automatic allowlist. Review any findings from check:all.",
  );

  if (options.install !== false && (useDesign || useShadscan)) {
    // Install from the saved manifest, including on a retry after a failed installation.
    console.log(`Installing dependencies with ${manager} install...`);
    const result = spawnSync(manager, ["install"], {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.error || result.status !== 0) {
      console.error(
        `Dependency installation failed. Files were saved; run ${manager} install or rerun init. ${result.error?.message ?? ""}`,
      );
      return 1;
    }
  } else if (options.install === false && (useDesign || useShadscan)) {
    console.log(
      `Dependencies were recorded but not installed. Run ${manager} install before checking.`,
    );
  }
  if (scripts["check:all"] !== "repo-gates check-all") {
    console.log(
      "Existing check:all was preserved. Ensure it invokes repo-gates check-all so the new gates run.",
    );
  }
  console.log(
    `Run ${config.runner} check:all locally and in CI. Commit package.json, the lockfile, generated lint config, repo-gates.config.json, and gates/.`,
  );
  return 0;
}
