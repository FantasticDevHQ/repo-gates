import * as childProcess from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseInitOptions, runInit } from "./init.ts";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

const dirs: string[] = [];
function fixture(pkg: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "repo-gates-init-"));
  dirs.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", ...pkg }));
  return dir;
}
function read(dir: string, file: string) {
  return JSON.parse(readFileSync(join(dir, file), "utf8"));
}
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("init", () => {
  it("parses opt-outs and floors and rejects unknown flags", () => {
    expect(parseInitOptions(["--skip-install", "--no-shadscan", "--shadscan-floor=65"])).toEqual({
      install: false,
      shadscan: false,
      shadscanFloor: 65,
    });
    expect(() => parseInitOptions(["--skip-instal"])).toThrow("Unknown init option");
    expect(() => parseInitOptions(["--shadscan-floor"])).toThrow("integer");
  });

  it("preserves existing design-system configs and scripts", () => {
    const dir = fixture({
      dependencies: { tailwindcss: "4.0.0" },
      scripts: { "check:design-system": "custom-lint" },
    });
    const original = "export default [];\n";
    writeFileSync(join(dir, "eslint.config.mjs"), original);
    writeFileSync(join(dir, "eslint.design-system.config.mjs"), original);
    expect(runInit(dir, { install: false })).toBe(0);
    expect(readFileSync(join(dir, "eslint.design-system.config.mjs"), "utf8")).toBe(original);
    expect(readFileSync(join(dir, "eslint.config.mjs"), "utf8")).toBe(original);
    expect(read(dir, "package.json").scripts["check:design-system"]).toBe("custom-lint");
  });

  it("enables configured policy gates and agent docs without seeding secret exceptions", () => {
    const dir = fixture();
    writeFileSync(join(dir, "AGENTS.md"), "# Agent instructions\n");
    writeFileSync(
      join(dir, "repo-gates.config.json"),
      JSON.stringify({
        docsCoverage: { surfaces: [{ label: "api", glob: "src/api/**", on: "changed" }] },
        bundleSize: {
          targets: [{ name: "web", filter: "web", distDir: "dist", buckets: { js: [".js"] } }],
        },
      }),
    );
    expect(runInit(dir, { install: false })).toBe(0);
    const scripts = read(dir, "package.json").scripts;
    expect(scripts["check:docs-coverage"]).toBe("repo-gates check-docs-coverage");
    expect(scripts["check:bundle-size"]).toBe("repo-gates check-bundle-size");
    expect(scripts["check:agents"]).toBe("repo-gates check-agents");
    expect(existsSync(join(dir, "gates/secrets-allowlist.json"))).toBe(false);
  });

  it("resolves pnpm catalogs and excludes opted-out workspace packages", () => {
    const dir = fixture();
    writeFileSync(
      join(dir, "pnpm-workspace.yaml"),
      'packages: ["apps/*", "!apps/ignored"]\ncatalog:\n  tailwindcss: ^4.0.0\n',
    );
    for (const name of ["web", "ignored"]) {
      mkdirSync(join(dir, `apps/${name}`), { recursive: true });
      writeFileSync(
        join(dir, `apps/${name}/package.json`),
        JSON.stringify({ devDependencies: { tailwindcss: "catalog:" } }),
      );
    }
    expect(runInit(dir, { install: false })).toBe(0);
    expect(read(dir, "repo-gates.config.json").runner).toBe("pnpm run");
    const config = readFileSync(join(dir, "eslint.design-system.config.mjs"), "utf8");
    expect(config).toContain("apps/web/**");
    expect(config).not.toContain("apps/ignored/**");
  });

  it("does not lint Tailwind v3 packages through a Tailwind v4 root scope", () => {
    const dir = fixture({ workspaces: ["apps/*"], devDependencies: { tailwindcss: "4.0.0" } });
    mkdirSync(join(dir, "node_modules/tailwindcss"), { recursive: true });
    writeFileSync(
      join(dir, "node_modules/tailwindcss/package.json"),
      JSON.stringify({ name: "tailwindcss", version: "4.0.0" }),
    );
    mkdirSync(join(dir, "apps/legacy"), { recursive: true });
    writeFileSync(
      join(dir, "apps/legacy/package.json"),
      JSON.stringify({ devDependencies: { tailwindcss: "3.4.0" } }),
    );
    expect(runInit(dir, { install: false })).toBe(0);
    const config = readFileSync(join(dir, "eslint.design-system.config.mjs"), "utf8");
    expect(config.split("files:")[0]).toContain("apps/legacy/**");
  });

  it("installs tools by default and reports failure with a retryable setup", () => {
    const dir = fixture({ dependencies: { tailwindcss: "4.0.0" } });
    const spawn = vi.spyOn(childProcess, "spawnSync").mockReturnValue({
      pid: 1,
      output: [],
      stdout: "",
      stderr: "",
      status: 1,
      signal: null,
    });
    expect(runInit(dir)).toBe(1);
    expect(spawn).toHaveBeenCalledWith("npm", ["install"], expect.objectContaining({ cwd: dir }));
    expect(read(dir, "package.json").devDependencies["@shadcn/lint"]).toBe("0.1.5");
    spawn.mockReturnValue({ pid: 1, output: [], stdout: "", stderr: "", status: 0, signal: null });
    expect(runInit(dir)).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid floors without writes", () => {
    const dir = fixture();
    expect(runInit(dir, { install: false, shadscanFloor: NaN })).toBe(1);
    expect(existsSync(join(dir, "repo-gates.config.json"))).toBe(false);
  });

  it("wires core gates, preserves scripts, seeds baselines, and is repeatable", () => {
    const dir = fixture({ scripts: { lint: "custom-lint", test: "custom-test" } });
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/app.ts"), "// TODO: existing debt\nexport const x = 1;\n");
    expect(runInit(dir, { install: false })).toBe(0);
    const pkg = read(dir, "package.json");
    expect(pkg.scripts.lint).toBe("custom-lint");
    expect(pkg.scripts["check:all"]).toBe("repo-gates check-all");
    expect(pkg.scripts["check:secrets"]).toBe("repo-gates check-secrets");
    expect(pkg.scripts["check:circular"]).toBe("repo-gates check-circular");
    const cfg = read(dir, "repo-gates.config.json");
    expect(cfg.runner).toBe("npm run");
    expect(cfg.scanRoots).toContain(".");
    expect(cfg.gates.map((g: { name: string }) => g.name)).not.toContain("format:check");
    const baseline = readFileSync(join(dir, "gates/debt-marker-allowlist.json"), "utf8");
    expect(baseline).toContain("src/app.ts:1");
    writeFileSync(join(dir, "src/app.ts"), "// TODO: existing debt\n// TODO: new debt\n");
    expect(runInit(dir, { install: false })).toBe(0);
    expect(readFileSync(join(dir, "gates/debt-marker-allowlist.json"), "utf8")).toBe(baseline);
  });

  it("configures all design rules and Shadscan for a Tailwind v4 shadcn app", () => {
    const dir = fixture({
      packageManager: "pnpm@10.0.0",
      dependencies: { tailwindcss: "^4.0.0", react: "^19.0.0" },
    });
    writeFileSync(join(dir, "components.json"), "{}");
    expect(runInit(dir, { install: false })).toBe(0);
    const pkg = read(dir, "package.json");
    expect(pkg.devDependencies["@shadcn/lint"]).toBe("0.1.5");
    expect(pkg.devDependencies["@shadscan/cli"]).toBe("0.7.0");
    expect(pkg.scripts["check:design-system"]).toContain("eslint.design-system.config.mjs");
    expect(pkg.scripts["check:shadscan"]).toContain("--fail-under 80");
    expect(readFileSync(join(dir, "eslint.design-system.config.mjs"), "utf8")).toContain(
      "designSystemRules",
    );
  });

  it("finds workspace UI packages and uses Oxlint when that is the existing linter", () => {
    const dir = fixture({ workspaces: ["apps/*"], devDependencies: { oxlint: "1.80.0" } });
    mkdirSync(join(dir, "apps/web"), { recursive: true });
    writeFileSync(
      join(dir, "apps/web/package.json"),
      JSON.stringify({ dependencies: { tailwindcss: "4.0.0", react: "19.0.0" } }),
    );
    writeFileSync(join(dir, "apps/web/components.json"), "{}");
    expect(runInit(dir, { install: false })).toBe(0);
    const pkg = read(dir, "package.json");
    expect(pkg.scripts["check:design-system"]).toContain("oxlint");
    expect(pkg.scripts["check:shadscan"]).toContain("apps/web");
    expect(Object.keys(read(dir, ".oxlintrc.design-system.json").overrides[0].rules)).toHaveLength(
      6,
    );
    expect(pkg.devDependencies.eslint).toBeUndefined();
  });

  it("respects opt-outs and existing policies", () => {
    const dir = fixture({
      dependencies: { tailwindcss: "4.0.0" },
      scripts: { "check:size": "custom-size" },
    });
    writeFileSync(join(dir, "components.json"), "{}");
    writeFileSync(
      join(dir, "repo-gates.config.json"),
      JSON.stringify({
        runner: "yarn run",
        fileSize: { threshold: 900 },
        gates: [{ name: "lint", conditional: true }],
      }),
    );
    expect(runInit(dir, { install: false, designSystem: false, shadscan: false })).toBe(0);
    const pkg = read(dir, "package.json");
    expect(pkg.scripts["check:size"]).toBe("custom-size");
    expect(pkg.scripts["check:design-system"]).toBeUndefined();
    expect(pkg.scripts["check:shadscan"]).toBeUndefined();
    expect(read(dir, "repo-gates.config.json").fileSize.threshold).toBe(900);
    expect(read(dir, "repo-gates.config.json").runner).toBe("yarn run");
  });

  it("does not create UI gates for a backend and wires existing coverage", () => {
    const dir = fixture({ scripts: { "test:coverage": "vitest run --coverage" } });
    expect(runInit(dir, { install: false })).toBe(0);
    const pkg = read(dir, "package.json");
    expect(pkg.scripts["check:design-system"]).toBeUndefined();
    expect(pkg.scripts["check:shadscan"]).toBeUndefined();
    expect(pkg.scripts["check:coverage"]).toBe("repo-gates check-coverage");
    expect(read(dir, "repo-gates.config.json").coverage.summaryGlobs).toContain(
      "coverage/coverage-summary.json",
    );
  });

  it("rejects incompatible linters before changing files", () => {
    const dir = fixture({
      dependencies: { tailwindcss: "4.0.0" },
      devDependencies: { eslint: "8.57.1" },
    });
    const before = readFileSync(join(dir, "package.json"), "utf8");
    expect(runInit(dir, { install: false })).toBe(1);
    expect(readFileSync(join(dir, "package.json"), "utf8")).toBe(before);
  });
});
