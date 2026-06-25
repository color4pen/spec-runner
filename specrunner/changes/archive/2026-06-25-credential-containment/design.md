# Design: credential-containment

## Context

Five independent call-sites bypass the `stripSecrets` seam, allowing credentials to reach child processes or external SDKs. An additional denylist and log-masking bug further reduce containment coverage. The B-6 architecture test only scans `src/core/`, so these leaks compile and CI stays green.

### Vulnerable call-sites (baseline)

| # | File | L# | Bug |
|---|------|----|-----|
| 1 | `src/adapter/codex/agent-runner.ts` | 267 | `new sdk!.Codex()` passes no `env`; codex subprocess inherits full `process.env`, leaking cross-provider keys to another vendor |
| 2 | `src/util/git-exec.ts` | 15 | `spawnFn(bin, args, { cwd, stdio })` passes no `env`; every `git` subprocess sees raw `process.env` including all secrets |
| 3 | `src/core/verification/runner.ts` | 183-184 | `spawn("git", ["show", …], { cwd, shell: false })` inside `checkPackageJsonScriptsIntegrity` passes no `env` |
| 4 | `src/util/env-filter.ts` | 12-18 | `SECRET_DENYLIST` has 5 fixed keys; misses `*_TOKEN` / `*_API_KEY` / `*_SECRET` patterns and GitHub Enterprise host tokens |
| 5 | `src/logger/stdout.ts` | 141-164 | `MASK_PATTERNS` lacks `i` flag; replacement helper cuts at first `_` in full match body, leaking the remainder of `_`-containing secrets |
| 6 | `tests/unit/architecture/core-invariants.test.ts` | 338-353 | B-6 grep scans `src/core/` only; `src/adapter/` and `src/util/` spawn call-sites are unchecked |

### Pre-existing safe call-sites (reference implementations)

- `src/adapter/claude-code/agent-runner.ts:268` — already passes `env: stripSecrets(process.env)` to the Claude SDK (reference for D2).
- `src/util/spawn.ts:46-47` — already passes `stripSecrets(process.env)` to general-purpose subprocess helper.
- `src/core/verification/runner.ts:77-79` (spawnScript) and `commands.ts:70` (spawnCommand) — already use `stripSecrets`.
- `src/git/transport-auth.ts` — git remote auth uses `http.<scope>.extraheader` injection, not env tokens, so removing secrets from git-exec env does not break push/fetch.

## Goals / Non-Goals

**Goals**:

1. All subprocess spawn and external SDK invocations pass `stripSecrets`-filtered env.
2. `SECRET_DENYLIST` coverage extended with pattern-based stripping (`*_TOKEN`, `*_API_KEY`, `*_SECRET`, case-insensitive).
3. `maskSensitive` correctly masks `_`-containing key bodies and is case-insensitive.
4. B-6 architecture guard scans `src/adapter/` and `src/util/` to detect future regressions at CI.

**Non-Goals**:

- B-5 / B-8 / B-9 architectural guard extensions (separate request).
- Closing FS-level reads of `credentials.json` via Bash tool (sandbox scope, not env hygiene).
- `credentials.json` file-permission enforcement.
- GitHub API client next-URL same-origin check.
- findings-parse-soundness.

## Decisions

### D1 — Strip env in `runSubprocess`, not at call-sites

`runSubprocess(spawnFn, bin, args, { cwd })` in `src/util/git-exec.ts` is the single choke-point for all git subprocesses spawned via the injectable `spawnFn`. Stripping here ensures that every `gitExec` / `gitExecExitCode` call benefits automatically, regardless of how many callers exist now or in the future.

`stripSecrets` is imported from `./env-filter.js` (same layer, no circular dependency). The injected `spawnFn` in tests is a mock that receives and ignores `env`; test assertions on which env was passed are added via spy wrappers in the unit tests.

**Alternative rejected**: strip at each call-site (`gitExec`, `gitExecExitCode`) — DRY violation; brittle to future callers.

### D2 — Codex SDK: pass `env` option + explicit `apiKey`

`@openai/codex-sdk` v0.130 exposes `CodexOptions.env?: Record<string, string>` (when provided, the SDK does not inherit `process.env`) and `apiKey?: string`. The default codex factory is updated to:

```
new sdk!.Codex({ env: stripSecrets(process.env), apiKey: process.env["OPENAI_API_KEY"] })
```

Because the extended denylist (`*_API_KEY`, D3) strips `OPENAI_API_KEY` from the filtered env, the codex SDK would lose its own auth key if it relied on env alone. Passing `apiKey` explicitly restores codex auth while preventing cross-provider leakage.

`src/adapter/codex/sdk-loader.ts` — the `CodexSdk` interface's `Codex` constructor signature is updated to `new (opts?: { env?: Record<string, string>; apiKey?: string }) => CodexInstance`.

The injectable `_codexFactory?: () => CodexInstance` in `CodexAgentRunnerDeps` is **not changed** — it already returns a `CodexInstance` and tests inject a fully-constructed mock.

**Alternative rejected**: delete secret keys from `process.env` before construction — global mutation is racy when pipeline executes multiple steps concurrently.

### D3 — Pattern-based denylist extension in `stripSecrets`

`stripSecrets` is extended to, after removing fixed keys, iterate `Object.keys(result)` and delete any key matching `/_TOKEN$/i`, `/_API_KEY$/i`, or `/_SECRET$/i`. No change to the fixed list (existing keys are redundant with patterns but kept for explicitness).

The patterns do **not** match benign variables (`PATH`, `HOME`, `XDG_*`, `LANG`, `SPECRUNNER_DEBUG`, `NODE_ENV`, `SPECRUNNER_LOG_LEVEL`), so agent shell / tool usage is unaffected.

The function signature is unchanged.

**Alternative rejected**: from-scratch allowlist — `PATH`, `XDG_*`, `LANG` enumeration is error-prone and breaks agent shell/tool usage when any env var is missed.

### D4 — `maskSensitive`: capture-group prefix + `i` flag

`MASK_PATTERNS` is refactored from `RegExp[]` to `Array<[RegExp, string]>` where the second element is the replacement string using capture group `$1` for the recognizable fixed prefix:

```
[/\b(sk-ant-)[A-Za-z0-9_-]+/gi, "$1..."]
[/\b(gh[oprsu]_)[A-Za-z0-9]+/gi, "$1..."]
...
```

This fixes both bugs simultaneously: the `i` flag makes matching case-insensitive, and `$1` always replaces to the recognizable prefix (e.g. `sk-ant-`) rather than the potentially deep first `_` in the token body.

The `maskSensitive` function's public signature is unchanged.

### D5 — B-6 test scope extension + allowlist for benign reads

The B-6 `it` block is extended to also grep `src/adapter/` and `src/util/`. The existing exemption (`!m.content.includes("stripSecrets")`) already exempts all compliant call-sites after the fixes in D1–D2.

Three call-sites in `src/util/` and one in `src/adapter/claude-code/` read single non-secret env vars and must be allowlisted:

| File | Pattern (content substring) | Reason |
|------|-----------------------------|--------|
| `src/util/env-filter.ts` | `SPECRUNNER_DEBUG` | Diagnostic subsystem read; not a secret |
| `src/util/xdg.ts` | `XDG_CONFIG_HOME` | XDG path read; not a secret |
| `src/util/xdg.ts` | `XDG_STATE_HOME` | XDG path read; not a secret |
| `src/adapter/claude-code/agent-runner.ts` | `resolveClaudeCodeOAuthTokenFn` | Token resolver reads env to extract CLAUDE_CODE_OAUTH_TOKEN; result is explicitly injected into already-stripped `sdkEnv`; not passed to subprocess as-is |

The allowlist entries carry `invariant: "B-6"` and a tracking id `B6-xxx`.

## Risks / Trade-offs

**Extended pattern denylist strips OPENAI_API_KEY** — mitigated by D2 (codex receives `apiKey` explicitly). Any other tool that reads `OPENAI_API_KEY` from the stripped env passed to a subprocess will lose it, which is the intended behaviour for cross-provider isolation.

**Pattern denylist is broader than explicit list** — any env var ending in `_TOKEN`, `_API_KEY`, or `_SECRET` is stripped, including app-specific keys. Acceptable: these suffixes signal secrets by convention; legitimate benign vars rarely use them.

**maskSensitive `[RegExp, string][]` internal change** — no external callers; internal refactor only.

## Open Questions

None — all design decisions are architect-approved per the request.
