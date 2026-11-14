# Development and worktrees

Use pnpm as pinned in package.json. Dependencies, dist and coverage are checkout-local. No environment files or credentials are required. There are no existing service lifecycle commands to preserve and no Convex backend to install.

`pnpm worktree:setup` fetches the live origin default branch and fast-forwards this checkout when safe. It preserves the topic branch and local commits. Dirty trees, fetch failures and divergence stop with recovery instructions. Commit your work and integrate the fetched base manually if a merge decision is needed, then retry. An unoccupied local base is advanced using an atomic compare-and-swap; other checked-out branches are preserved.

For a new checkout, fetch origin first, resolve `origin/HEAD`, then use `git worktree add -b <topic> <path> <fresh-origin-base-sha>`. Never create from stale local main. Run setup before installing dependencies in the new checkout. Setup serializes concurrent operations using `flock` in the common git directory. Pass `<new-path> <new-branch>` to setup to create a new worktree from the fetched immutable base.

`pnpm worktree:start`, `pnpm worktree:stop` and `pnpm worktree:teardown` are repeatable backend-free operations: no processes or ports are allocated and data is preserved. `pnpm worktree:cleanup` explicitly deletes only this checkout's dist and coverage and refuses symlink targets. It preserves dependencies, environment files, source and sibling checkouts. To remove a checkout, commit its work and use `git worktree remove <path>` without force; use `git worktree prune --dry-run` before explicit administrative pruning.

`pnpm test:standard` exercises metadata and lifecycle regressions without installing dependencies. `pnpm check:all` runs the full suite, typecheck and build on UbiCloud. All CI and release jobs must use `ubicloud-standard-2-ubuntu-2404`. A queued job is not proof of runner integration: inspect its actual runner identity and labels and link the successful current-head run in the PR. Metadata enforcement first activates when trusted scripts and workflow reach the base branch; required-status protection must be checked independently, without billing changes.

The canonical `Repository quality gates` job requires the existing `build` job to succeed. It runs even when that dependency fails, cancels or skips, and rejects every result except success. Keep `build` for existing branch protection consumers. Required checks are `PR standard` and `Repository quality gates`; preserve any additional required statuses and review policies. For this backend-free library there is no backend isolation status. Only require `PR standard` after its trusted workflow/scripts reach base and the context has actually emitted; verify both protection and GitHub App identity by API readback.

## npm release recovery

See [npm publishing and recovery](npm-release-recovery.md) for the approved
publishing runner exception, verification requirements and existing-tag recovery.
