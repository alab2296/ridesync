# ADR 0001: Monorepo with pnpm workspaces
Status: Accepted
Context: Apps, API and tools share types and validation.
Decision: One repository with pnpm workspaces and a shared `packages/shared`.
Consequences: Single CI, atomic changes across apps; slightly heavier tooling.
