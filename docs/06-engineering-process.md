# Engineering process

## Branching
Trunk-based with short-lived branches: `feat/<issue>-<slug>`, `fix/...`, `docs/...`. `main` is always releasable and protected.

## Commits
Conventional Commits: `feat(api): add atomic accept`, `fix(driver): ...`, `docs: ...`, `test: ...`, `chore: ...`.

## Pull requests
One issue per PR, small diffs. PR template must be filled. CI must be green. Self-review before merging; squash merge.

## Definition of done
- Acceptance criteria met and demonstrated
- Tests added and passing; typecheck and lint clean
- Docs/OpenAPI updated if behaviour changed
- No secrets, no debug code
- Issue closed with a short note

## Testing
Unit tests for logic, integration tests against real Postgres/Redis in Docker, one concurrency test for accept, load tests with k6. Mobile: manual device checklist in docs.

## Releases
Semantic Versioning. Tag `v0.1.0` after M4, `v1.0.0` after M6. CHANGELOG kept per release.

## Architecture decisions
Significant choices go in `docs/decisions/` as short ADRs (context, decision, consequences).

## Security basics
Dependabot on, no secrets in git, `.env.example` only, input validation, rate limiting, least-privilege roles.
