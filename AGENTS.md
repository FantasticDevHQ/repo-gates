# Repository development

This is a pnpm TypeScript CLI library. There is no Convex application, example backend, persistent development service or port allocation.

Use the packageManager version in package.json. Run `pnpm run check:all` in CI; tests run with one worker. On shared agents use focused Node tests with `NODE_OPTIONS=--max-old-space-size=512`; leave full builds and typechecks to UbiCloud. Serialize every Node test suite and dependency installation with `flock -w 3600 /home/cloudagent/.cache/fantastic-heavy.lock pnpm install --frozen-lockfile`.

See docs/development.md for worktree operations and docs/pull-request-standard.md for PR metadata. Do not run head code with metadata workflow write credentials. Never reset, stash, discard work or merge a topic into the selected base during setup.

All local Node suites, toolkit checks, installs, codegen and backend integration must hold the same shared lock for their entire subprocess lifetime. Use `flock -w 3600 /home/cloudagent/.cache/fantastic-heavy.lock env NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 <specific-test-files>`. Never nest locks or retry queued jobs. No full lint/typecheck/build locally. Verification stays on UbiCloud; the owner-approved npm provenance exception uses GitHub-hosted ubuntu-24.04 for build/publish only. No macOS CI is required; local Mac compatibility is unverified. Preserve other sessions and stop only owned services.
