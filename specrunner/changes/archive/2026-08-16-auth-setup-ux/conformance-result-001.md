# Conformance Result — auth-setup-ux — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Evidence Summary

| Checked | Skipped | Unverified |
|---------|---------|------------|
| 20 | 0 | 0 |

Checked: 13 request.md acceptance criteria + 7 spec requirements (14 scenarios).

---

## Normative Items Verified

### Req: login SHALL be GitHub-only and reject the removed `--provider` flag

| Scenario | File(s) | Result |
|----------|---------|--------|
| `--provider` absent from login help surface | `src/cli/command-registry.ts` `LOGIN_USAGE`; `src/cli/__tests__/login.test.ts` TC-001 | PASS |
| `login --provider claude` captured with migration guidance | `src/cli/flag-parser.ts`; `src/cli/command-registry.ts` login.flags.provider; `src/cli/__tests__/login.test.ts` TC-002; `tests/unit/cli/removed-commands.test.ts` | PASS |

**Evidence:**
- `LOGIN_USAGE` (command-registry.ts:275–290) contains no `--provider` and no Claude Code section. TC-001 pins this.
- `login.flags.provider` is registered as `{ type: "string", deprecated: { message: (value?) => ... } }` — a deprecated marker, not a normal flag. The message for `value === "claude"` includes `"specrunner credentials set claude-code"`. TC-002 and dispatch tests pin exit 2 + correct message.
- `provider` is NOT listed in `LOGIN_USAGE`, satisfying "not in help surface". The deprecated flag mechanism (D2) rejects it before the handler, satisfying "command registry に通常 flag として残す形は不可".

---

### Req: login SHALL decide the Device Flow by the validity of the runtime-resolved token

| Scenario | File(s) | Result |
|----------|---------|--------|
| valid top-priority token skips Device Flow (source displayed) | `src/cli/login.ts` lines 82–87; `src/cli/__tests__/login.test.ts` TC-003; `tests/unit/cli/login.test.ts` TC-LOGIN-010/012/013 | PASS |
| invalid token from env/gh fails without Device Flow | `src/cli/login.ts` lines 89–113; `src/cli/__tests__/login.test.ts` TC-004 | PASS |
| invalid token from credentials.json proceeds to Device Flow | `src/cli/login.ts` lines 91–93; `src/cli/__tests__/login.test.ts` TC-005 | PASS |
| no resolvable token proceeds to Device Flow | `src/cli/login.ts` lines 57–64; `src/cli/__tests__/login.test.ts` TC-006 | PASS |
| validity cannot be confirmed → fail non-0, no Device Flow | `src/cli/login.ts` lines 75–79 (catch) and 109–112 (non-200/401); `src/cli/__tests__/login.test.ts` TC-007 | PASS |
| `--force` always runs the Device Flow | `src/cli/login.ts` lines 52, 120–127; `src/cli/__tests__/login.test.ts` TC-008; `tests/unit/cli/login.test.ts` TC-LOGIN-011 | PASS |

**Evidence:**
- `runLogin` uses `resolveGitHubToken(env, { host })` — same function used at runtime — to get the highest-priority token and its source.
- `verifyTokenScopes()` is injected as a seam; production path calls `createGitHubClient(fetch, token, apiBaseUrl).verifyTokenScopes()`.
- Branches: 200 → log source, return 0, no Device Flow; 401 + credentials → fall through to Device Flow; 401 + env/gh → log remediation, return 1; catch → log connectivity error, return 1; non-200/non-401 → log HTTP status, return 1.
- `describeSource` shows the concrete env var name (GH_TOKEN vs GITHUB_TOKEN) or "gh auth token" or "credentials.json".
- `--force` skips the resolve/verify block entirely (`if (!force)` at line 52).
- `LoginOpts` has no `provider` field (verified by TC-008 type-level check).

---

### Req: `credentials set <name>` SHALL store secrets to credentials.json without echoing input

| Scenario | File(s) | Result |
|----------|---------|--------|
| `credentials set claude-code` stores token (0600) | `src/cli/credentials.ts`; `src/core/credentials/claude-code.ts`; `tests/credentials.test.ts` TC-009 | PASS |
| `credentials set anthropic-api-key` stores API key (0600) | `src/cli/credentials.ts`; `src/core/credentials/anthropic.ts`; `tests/credentials.test.ts` TC-010 | PASS |
| secret input is not echoed (TTY silent / non-TTY stdin) | `src/util/secret-input.ts`; `tests/credentials.test.ts` TC-011 | PASS |
| storing one secret preserves other credentials | `src/core/credentials/credentials-io.ts` (deep-merge); `tests/credentials.test.ts` TC-012 | PASS |

**Evidence:**
- `runCredentialsSet` validates the name, calls `readSecret({ isTTY, input, output })`, then `saveClaudeCodeOAuthToken(secret)` or `saveSpecRunnerApiKey(secret)`.
- `readSecret` (secret-input.ts): TTY branch uses `setRawMode(true)` and accumulates chars without writing to `output`; non-TTY branch reads stdin to EOF and trims.
- `saveCredentials` in credentials-io.ts performs a deep-merge with the existing file and writes mode 0600 (enforced by the existing I/O layer).
- Tests use injected fake streams; the output capture verifies the secret is never written to `output`.

---

### Req: guidance MUST reference only real, current commands

| Scenario | File(s) | Result |
|----------|---------|--------|
| no `login --provider anthropic` in `src/` | `tests/dead-guidance.test.ts` | PASS |
| doctor hints reference registered commands only | `tests/hint-command-existence.test.ts` TC-014 | PASS |

**Evidence:**
- Grep over production `src/` for `login --provider anthropic` returns no results in non-test files. The `dead-guidance.test.ts` correctly excludes `__tests__/` directories and `.test.ts` files from the scan.
- All 5 previously-offending files replaced their hints:
  - `managed-key-present.ts` → `"specrunner credentials set anthropic-api-key"`
  - `managed-key-valid.ts` → `"specrunner credentials set anthropic-api-key"`
  - `environment-provider-alive.ts` → `"specrunner credentials set anthropic-api-key"`
  - `agent-provider-alive.ts` → `"specrunner credentials set anthropic-api-key"`
  - `prereqs.ts` → `"specrunner credentials set anthropic-api-key"`
- `anthropic.ts` `ANTHROPIC_KEY_MISSING_HINT` now reads `"specrunner credentials set anthropic-api-key"` with no "future `login --provider anthropic`" comment.
- `claude-code-token-present.ts`, `provider-readiness.ts` (auth-missing/auth-invalid), `claude-code.ts`, and `LOGIN_USAGE` Claude Code section replaced with `"specrunner credentials set claude-code"`.
- `tests/hint-command-existence.test.ts` TC-014 scans all `.ts` files under `src/core/doctor/` and checks both top-level verb and subcommand existence against `COMMANDS`. `credentials` is registered as a `ParentCommandDef` with `set` as a subcommand. Verification confirms TC-014 passes.
- `PROVIDER_READINESS_HINTS` auth-missing/auth-invalid hints reference `specrunner credentials set claude-code`; TC-005 in hint-command-existence.test.ts verifies subcommand-level existence.

---

### Req: doctor SHALL treat headless Claude credential absence as a warning, not a failure

| Scenario | File(s) | Result |
|----------|---------|--------|
| unset headless Claude credential is `warn` with cron/inbox note | `src/core/doctor/checks/config/claude-code-token-present.ts`; `tests/doctor-readiness.test.ts` TC-015 | PASS |

**Evidence:**
- `claudeCodeTokenPresentCheck.check()` returns `{ status: "warn", hint: "Only needed for cron / inbox (headless) runs. Run 'claude setup-token', then 'specrunner credentials set claude-code'." }`.
- `required: false` confirms this is not a hard prerequisite.
- TC-015 asserts status === "warn", hint includes "credentials set claude-code", and hint matches `/cron|inbox|headless/i`.

---

### Req: doctor readiness SHALL be determined by fail == 0

| Scenario | File(s) | Result |
|----------|---------|--------|
| warn present but fail=0 → "Ready to run." + next step | `src/core/doctor/formatter.ts` lines 82–85; `tests/doctor-readiness.test.ts` TC-016 | PASS |
| any fail → no "Ready to run." | `src/core/doctor/formatter.ts`; `tests/doctor-readiness.test.ts` TC-017 | PASS |

**Evidence:**
- `formatHuman`: after Summary line, `if (fail === 0)` outputs `"\nReady to run."` and `"  Next: specrunner request new <slug>"`. The `else` branch shows `deriveNextSteps` output with no "Ready" text.
- TC-016 asserts "Ready to run." appears when fail=0 (with or without warns). TC-017 asserts "Ready to run." is absent when fail>0.

---

### Req: init MUST NOT silently ignore the provider flag when a global config exists

| Scenario | File(s) | Result |
|----------|---------|--------|
| provider flag + existing config → emits notice, config unchanged | `src/cli/init.ts` lines 79–83; `tests/init-provider-notice.test.ts` TC-018 | PASS |

**Evidence:**
- `runInit` checks `if (configExists && flagProvider !== undefined)` and calls `logInfo` twice: once naming the flag as ignored and once naming the config file path.
- Provider resolution is only called inside `if (!configExists)`, so the existing config is never overwritten.
- TC-018 asserts: stderr matches `/provider.*flag.*ignored|--provider.*ignored|.../i`, config is unchanged, exit code is 0.

---

### Req: README Quick Start SHALL present a doctor-centered setup flow

| Scenario | File(s) | Result |
|----------|---------|--------|
| Quick Start centers on doctor | `README.md` Quick Start section; `tests/readme-quickstart.test.ts` TC-019 | PASS |

**Evidence:**
- README Quick Start presents: init → doctor → "set up only what's missing" → doctor → first job.
- `specrunner doctor` appears at steps 2 and 4.
- No bare `npx specrunner login` or `specrunner login` line appears as an unconditional required step; login is inside a conditional comment block.
- TC-019 asserts Quick Start contains `"specrunner doctor"` and no unconditional login line.

---

### typecheck && test green

Verification result (verification-result.md):

| Phase | Status |
|-------|--------|
| build | passed |
| typecheck | passed |
| test | passed |
| lint | passed |
| changed-line-coverage | passed |

---

## 検証できなかった項目

None

## Findings 詳細

None — no normative violations found.
