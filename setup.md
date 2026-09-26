# Set up repo-gates

Set up `@fantastic.dev/repo-gates` in the user's repository so developers and
coding agents can run the same quality checks locally and in CI. Use `init`
to configure applicable gates, then review and verify the result.

Read the [initialization reference](https://github.com/FantasticDevHQ/repo-gates#quickstart)
before making changes. Follow the repository's own contribution and agent
instructions. Preserve existing scripts, configuration, and policy choices.

## Inspect the repository

- Find the repository root containing `package.json`. Detect the package manager
  from `packageManager` and the lockfile; keep using it throughout setup.
- Inspect workspace definitions, source directories, existing checks, CI jobs,
  and `repo-gates.config.json` if present. Identify which package owns root tooling.
- Look for Tailwind v4, `components.json`, ESLint or Oxlint, UI component paths,
  aliases, and app-specific themes. Do not migrate Tailwind or replace a working
  linter just to install repo-gates.
- Check Node compatibility. The core CLI requires Node 18 or newer. Generated
  ESLint design-system tooling needs Node 20.19+; Oxlint needs Node 20.19.x or
  22.12+. Match local and CI versions to the tooling actually installed.

## Install and initialize

Install the package as a development dependency at the repository root using
its package manager. For pnpm workspaces, use `pnpm add -Dw` for the install.

| Package manager | Install | Initialize | Run checks |
| --- | --- | --- | --- |
| npm | `npm install -D @fantastic.dev/repo-gates` | `npx repo-gates init` | `npm run check:all` |
| pnpm | `pnpm add -D @fantastic.dev/repo-gates` | `pnpm exec repo-gates init` | `pnpm run check:all` |
| Yarn | `yarn add -D @fantastic.dev/repo-gates` | `yarn exec repo-gates init` | `yarn run check:all` |
| Bun | `bun add -d @fantastic.dev/repo-gates` | `bunx repo-gates init` | `bun run check:all` |

Use the installed CLI. `init` writes scripts and configuration and installs
applicable UI dependencies. It seeds missing file-size, debt-marker, and
circular-import baselines. It preserves existing scripts, lint configs, explicit
policy values, and baselines. Installing the package alone does not initialize it.

Keep applicable gates enabled by default. Use `--skip-install` only when dependency
installation must happen separately, and run the package manager's install command
before verification. `--no-design-system` and `--no-shadscan` skip setup when the
user requests it or a documented compatibility constraint requires it; they do
not remove existing gates. Report any gate you could not configure.

## Review the configuration

Review the diff before running the complete suite:

- Check `scanRoots`, exclusions, source extensions, and the ordered `gates`
  manifest in `repo-gates.config.json`. Include the intended apps and shared
  packages without scanning generated output or dependencies.
- Preserve real lint, format, typecheck, and test commands. `init` includes
  recognized existing scripts but does not invent missing checks. Wire missing
  commands only when the project's tools support them. Never add success-only
  placeholder scripts. If an existing `check:all` was preserved, make sure it
  reaches `repo-gates check-all` without calling itself recursively.
- For Tailwind v4, review `eslint.design-system.config.mjs` or
  `.oxlintrc.design-system.json`. Fresh configs enable all six
  [@shadcn/lint rules](https://github.com/shadcn-ui/lint) as errors. Component
  definitions are exempt from `no-restyle` so they can define their styling;
  the other rules still apply. Verify component scopes, aliases, theme discovery,
  and exclusions for non-v4 workspaces. Existing configs retain their policy.
  See [rule customization](https://github.com/FantasticDevHQ/repo-gates#update-the-rules)
  before editing rule options or overrides.
- For detected shadcn projects, review `check:shadscan`. The default initial floor
  is 80, a policy choice that can fail on the first run. Fix findings rather than
  lowering an established floor to hide regressions.
- Keep secret scanning enabled without automatically allowlisting findings.
  `init` deliberately does not seed a secrets allowlist. Secret scanning reads
  Git-tracked files, so newly created, untracked files are not covered yet.
- If `test:coverage` exists, ensure it emits `json-summary` reports and initialize
  missing coverage floors with `repo-gates check-coverage --init` through the
  installed CLI. Configure docs-coverage surfaces or bundle targets only where
  applicable, using the [policy reference](https://github.com/FantasticDevHQ/repo-gates#how-to-use-it).

Do not overwrite baselines, relax rules, or remove failing gates just to get a
passing result. Distinguish setup errors from existing code findings and report
remaining work accurately.

## Wire CI and agent instructions

Update the existing CI workflow to install development dependencies with the
repository's lockfile and run its root `check:all` script. Preserve other required
jobs, credentials, services, and build prerequisites. Keep the command identical
to the local check entry point; do not make it continue on failure. See the
[CI examples](https://github.com/FantasticDevHQ/repo-gates/tree/main/examples/github-actions)
for repository-specific wiring, including PR docs coverage.

Add a short instruction to the repository's existing agent guidance telling
agents to run the appropriate `check:all` command before handing off changes and
to fix failures without weakening policy. If adding a root `AGENTS.md` for the
first time, rerun `init` so it can detect and enable the agent-docs gate.

## Verify and hand off

Run the root `check:all` command. Investigate configuration or dependency errors,
then rerun affected checks. If there are existing findings, report the failing
gates and next steps rather than claiming setup is green. Check that CI invokes
the same manifest and that the lockfile matches the dependency changes.

Summarize what was installed, files changed, gates enabled or omitted and why,
the exact local/CI command, verification results, and where policy is configured.
Include package metadata, the lockfile, generated lint configs,
`repo-gates.config.json`, baseline files, and CI/agent guidance in the proposed
change. Follow the repository's normal PR workflow for landing it.
