# Repository development

This is a pnpm TypeScript CLI library. There is no Convex application, example backend, persistent development service or port allocation.

Use the packageManager version in package.json. Run `pnpm run check:all` in CI; tests run with one worker. On shared agents use focused Node tests with `NODE_OPTIONS=--max-old-space-size=512`; leave full builds and typechecks to UbiCloud. Serialize every Node test suite and dependency installation with `flock -w 3600 /home/cloudagent/.cache/fantastic-heavy.lock pnpm install --frozen-lockfile`.

See docs/development.md for worktree operations and docs/pull-request-standard.md for PR metadata. Do not run head code with metadata workflow write credentials. Never reset, stash, discard work or merge a topic into the selected base during setup.
