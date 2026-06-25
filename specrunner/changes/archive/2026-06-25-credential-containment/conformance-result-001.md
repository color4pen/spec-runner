# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | All T-01 through T-11 checkboxes marked [x] |
| design.md | ✓ | D1–D5 all implemented as specified |
| spec.md | ✓ | All 5 requirements and 10 scenarios satisfied |
| request.md | ✓ | All 6 acceptance criteria satisfied; typecheck && test green |

---

## Judgment Detail

### J1 — Tasks completeness

T-01 through T-11: all checkboxes `[x]`. No incomplete items.

---

### J2 — Spec conformance

**Req: codex subprocess MUST NOT inherit cross-provider credential keys**

`buildDefaultCodexFactory` in `src/adapter/codex/agent-runner.ts` passes `env: strippedEnv` (output of `stripSecrets(process.env)`) to `new sdk.Codex(...)`. `OPENAI_API_KEY` is forwarded as an explicit `apiKey` option. Tests in `agent-runner-env.test.ts` assert `GH_TOKEN`, `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `SPECRUNNER_API_KEY` absent from `opts.env`; `opts.apiKey` equals `OPENAI_API_KEY` when set, omitted when unset. ✓

**Req: git-exec spawn MUST use stripped env**

`runSubprocess` in `src/util/git-exec.ts` passes `env: stripSecrets(process.env …) as Record<string, string>` to `spawnFn`. Applies transitively to all `gitExec` / `gitExecExitCode` callers. Tests in `git-exec.test.ts` verify secrets absent; `PATH` preserved. ✓

**Req: verification `git show` MUST use stripped env**

`checkPackageJsonScriptsIntegrity` in `src/core/verification/runner.ts` includes `env: stripSecrets(process.env …)` in the `spawn` options. Tests in `runner-git-show-env.test.ts` confirm `GH_TOKEN`, `GITHUB_TOKEN` absent; `PATH` preserved. ✓

**Req: `SECRET_DENYLIST` MUST cover wildcard patterns**

`SECRET_PATTERNS: RegExp[] = [/_TOKEN$/i, /_API_KEY$/i, /_SECRET$/i]` added in `env-filter.ts`. Two-pass loop: fixed-key removal then pattern removal. Original object not mutated (shallow copy). Tests (e) and (f) in `env-filter.test.ts` cover wildcard removal and benign-variable preservation. ✓

**Req: `maskSensitive` MUST fully mask `_`-containing token bodies**

`MASK_PATTERNS` refactored to `Array<[RegExp, string]>` with `gi` flags and `$1` capture-group replacers. `gi` provides case-insensitive matching; `$1` preserves original prefix casing while replacing the body with `...`. Tests in `stdout-mask.test.ts` verify underscore-body sk-ant- key, uppercase `SK-ANT-` variant (prefix case preserved), sk-proj with underscores, non-secret passthrough, and gho_/ghr_/github_pat_/sk-svcacct- regression guards. ✓

**Req: B-6 architecture test MUST scan `src/adapter/` and `src/util/`**

`core-invariants.test.ts` B-6 describe block greps all three directories (`src/core`, `src/adapter`, `src/util`). Five B-6 allowlist entries cover known-safe raw reads (XDG paths, diagnostic flag, claude oauth token resolver input, codex OPENAI_API_KEY forwarding). Both spec scenarios (unguarded spawn detected; stripSecrets-guarded call-site exempt) are exercised by the existing `filterViolations` regression-guard it-blocks. ✓

---

### J3 — Design decision conformance

| Decision | Conformant |
|----------|-----------|
| D1: strip in `runSubprocess`, not at call-sites | ✓ Single choke-point in `git-exec.ts:runSubprocess` |
| D2: codex SDK `env` option + explicit `apiKey`; `injectedCodexFactory` unchanged | ✓ `buildDefaultCodexFactory` helper exported; `CodexSdk` interface updated |
| D3: pattern-based denylist (`*_TOKEN` / `*_API_KEY` / `*_SECRET`, `i` flag) | ✓ `SECRET_PATTERNS` second-pass in `stripSecrets` |
| D4: `maskSensitive` capture-group prefix + `i` flag | ✓ `MASK_PATTERNS` as `Array<[RegExp, string]>` with `gi` |
| D5: B-6 test scope extended + allowlist for benign reads | ✓ 5 allowlist entries with `invariant: "B-6"` |

---

### J4 — Acceptance criteria

| Criterion | Evidence |
|-----------|----------|
| codex subprocess env: no GH_TOKEN / GITHUB_TOKEN / ANTHROPIC_API_KEY / SPECRUNNER_API_KEY | `agent-runner-env.test.ts` ✓ |
| git-exec and verification git show: stripSecrets env | `git-exec.test.ts`, `runner-git-show-env.test.ts` ✓ |
| `*_TOKEN` / `*_API_KEY` / `*_SECRET` stripped; benign vars preserved | `env-filter.test.ts` (e)(f) ✓ |
| maskSensitive: no body leakage for `_`-containing keys or uppercase prefix variants | `stdout-mask.test.ts` ✓ |
| B-6 scans src/adapter/ and src/util/; detects unguarded spawn | `core-invariants.test.ts` B-6 describe block ✓ |
| typecheck && test green | verification-result.md: build 1.1s ✓, typecheck 3.4s ✓, test 15.6s ✓, lint 4.2s ✓ |

---

## Observations (non-blocking)

- The design (D5) lists 4 allowlisted sites (3 util + 1 claude-code adapter), but the implementation correctly adds a 5th for `codex/agent-runner.ts` `OPENAI_API_KEY` read, consistent with D2. No discrepancy.
- `ANTHROPIC_BASE_URL` remains in the fixed denylist but is not covered by the new patterns (`_URL` does not match `_TOKEN/_API_KEY/_SECRET`). It is uniquely covered by the fixed list only — intentional and correct.
