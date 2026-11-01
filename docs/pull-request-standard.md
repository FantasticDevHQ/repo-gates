# Pull request standard

Adopted from JibHQ/jib-factory at fae094712705fc1baba55fb4b3cfaaef78041b3a. The workflow, template, validator, enforcer and regression tests retain their canonical layout. Local changes add best-effort infrastructure failure publication and repository-specific checks.

Use `type(scope): FANT-123 description` or `type: FANT-123 description`, with the owning Linear issue immediately after the colon. Include exactly one each of the h2 Summary, What, Why, Evidence and Agent sections in that order, then an acceptance checklist. Summary declares exactly one matching Fixes, Refs or Relates to issue.

Evidence states `UI changes: Yes/No` and links actual reviewer-accessible proof. UI changes require inline GitHub screenshot/video attachments. Keep run logs and rollout evidence in the PR, not developer documentation. Agent identifies the actual creator and real session/thread, with its available link; never invent an identity. Reviewers assess evidence quality beyond syntactic validation.

The pull_request_target workflow checks out the trusted base SHA and never installs or executes PR-head code with its write token. Full tests execute separately with read-only permissions. The first adoption PR cannot activate its own trusted metadata workflow; after merge validate real metadata with workflow_dispatch and separately configure required status protection where supported.
