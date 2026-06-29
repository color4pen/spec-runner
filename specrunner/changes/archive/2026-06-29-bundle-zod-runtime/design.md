# Design: bundle-zod-runtime

## Context

`dist/specrunner.js` is produced by tsup (esbuild under the hood). The current
`tsup.config.ts` lists only `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`,
and `@openai/codex-sdk` in `external`. Because tsup's default behavior is to
externalize every package listed in `dependencies`, `zod` is also left as a bare
external import in the bundle.

At runtime, Node's ESM resolver must locate `zod` in the consumer's
`node_modules`. When that resolution fails — observed in practice as bunx cache
partial-expansion — Node falls back to directory resolution and throws
`ERR_UNSUPPORTED_DIR_IMPORT: zod/v4-mini`. The only workaround is a cache purge.

All zod usage in `src/` is via static subpath imports (`zod/v4-mini`, `zod/v4`);
there are no top-level `from "zod"` imports and no third-party packages that
depend on zod at runtime. The six affected files are:

- `src/config/schema.ts` — `zod/v4-mini`
- `src/core/port/report-result.ts` — `zod/v4` (type-only import)
- `src/core/step/report-tool.ts` — `zod/v4-mini`
- `src/adapter/codex/agent-runner.ts` — `zod/v4-mini`
- `src/adapter/codex/__tests__/agent-runner-completion-report.test.ts` — `zod/v4-mini`
- `src/adapter/codex/__tests__/completion-contract-injection.test.ts` — `zod/v4-mini`

## Goals / Non-Goals

**Goals**:

- Inline zod (all subpaths) into `dist/specrunner.js` so no external zod
  resolution is required at runtime.
- Move `zod` from `dependencies` to `devDependencies` to signal to consumers
  that zod need not be installed separately.
- Provide a build-time assertion that no zod bare import survives in the bundle.

**Non-Goals**:

- Changing the external status of `@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`,
  or `@openai/codex-sdk`.
- Upgrading or downgrading zod.
- Introducing `zod-to-json-schema` or other zod companion libraries.
- Replacing tsup/esbuild with another bundler.

## Decisions

### D1: Use `noExternal: ['zod']` in tsup.config.ts

**Rationale**: tsup exposes `noExternal` precisely to override the default
"externalize all dependencies" behavior for specific packages. Adding `'zod'` to
`noExternal` tells esbuild to bundle zod and all its subpaths (`zod/v4-mini`,
`zod/v4`, etc.) inline, eliminating runtime resolution entirely.

**Alternatives considered**:

- `bundleDependencies` in package.json: only affects npm pack/install, does not
  change what esbuild does at build time.
- Rewriting imports to relative paths: brittle and defeats the purpose of the
  package manager.

### D2: Move `zod` from `dependencies` to `devDependencies`

**Rationale**: Once zod is bundled, consumer projects gain nothing from
installing it. Keeping it in `dependencies` would cause spurious installs and
contradict the "minimal-deps North Star" principle. Moving to `devDependencies`
reflects the true nature of the relationship: zod is a build-time tool.

No sub-dependency of the package depends on a consumer-side zod at runtime
(verified by inspection: only direct imports in `src/`), so this move is safe.

### D3: Add a post-build grep assertion to the build script

**Rationale**: Prevents silent regression where a future change re-externalizes
zod. The check is a single `grep` command that exits non-zero if any
`from "zod`, `from 'zod`, or `require("zod` pattern appears in
`dist/specrunner.js`.

A package.json `postbuild` script is the lightest-weight option — no additional
tooling required, runs automatically after `bun run build`.

## Risks / Trade-offs

[Risk] Bundle size increase — Mitigation: zod v4-mini is ~15 KB minified; the
total bundle grows by roughly that amount. Given that `dist/specrunner.js` is
already a large single-file bundle, this is acceptable.

[Risk] esbuild cannot resolve a zod subpath at build time — Mitigation:
`node_modules/zod` 4.4.3 already exposes `./v4-mini` and `./v4` in its
`exports` map, so esbuild resolution will succeed. If resolution fails, the
build itself fails (fast feedback).

[Risk] Future introduction of a zod-dependent runtime sub-dep — Mitigation:
The post-build grep assertion (D3) will catch any zod import that sneaks back
in; it does not distinguish internal vs. external, so it must be updated
consciously if intentional external zod is ever re-added.

## Open Questions

None. The design is fully determined by the architect-approved decisions in the
request.
