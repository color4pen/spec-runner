# Conformance Result — auth-setup-ux (Iteration 2)

## Evidence Base

- `specrunner/changes/auth-setup-ux/request.md` — normative source (13 acceptance criteria)
- `specrunner/changes/auth-setup-ux/spec.md` — 8 Requirements, 18 Scenarios (normative)
- `specrunner/changes/auth-setup-ux/design.md` — D1–D10 (plan context)
- `specrunner/changes/auth-setup-ux/tasks.md` — T-01–T-10 (all checkboxes checked)
- `git diff main...HEAD --stat` — 53 files changed
- `bun run typecheck` — exit 0 (clean)
- `bun run test` — 779 test files, 11443 passed | 1 skipped | 2 todo

---

## Requirement-by-Requirement Verification

### R1: login SHALL be GitHub-only and reject the removed `--provider` flag

**Spec Scenarios**: `--provider absent from help`, `legacy login --provider claude migration`

**Implementation checked**:
- `src/cli/login.ts` — `LoginOpts` has no `provider` field; only `force`, `env`, `runDeviceFlow`, `verifyTokenScopes`.
- `src/cli/command-registry.ts` (line 486–499) — `provider` registered as **deprecated** flag with a value-sensitive message function: `"claude"` → names `credentials set claude-code`; `"github"` → names that `--provider` is no longer needed; other → generic GitHub-only message.
- `LOGIN_USAGE` (line 275–290) — no `--provider` mention, no Claude Code section.
- Tests: `src/cli/__tests__/login.test.ts` TC-001 (`LOGIN_USAGE` does not contain `--provider`), TC-002 (`parseFlags(["--provider","claude"],…)` throws `FlagParseError` mentioning `credentials set claude-code`). `tests/unit/cli/removed-commands.test.ts` pins dispatch-level per-value migration messages.

**Verdict**: Satisfied.

---

### R2: login SHALL decide the Device Flow by the validity of the runtime-resolved token

**Spec Scenarios**: valid skip, invalid env/gh fails, invalid credentials proceeds, no token proceeds, unknown fails, `--force` runs

**Implementation checked**:
- `src/cli/login.ts` `runLogin()`:
  - Calls `resolveGitHubToken(env, { host })` (same resolution order as runtime: GH_TOKEN → GITHUB_TOKEN → gh auth token → credentials.json).
  - HTTP 200 → logInfo source, return 0 (no Device Flow). HTTP 401 + source `credentials` → fall through to Device Flow. HTTP 401 + source `env`/`gh` → logError remediation, return 1. Any other status or throw → logError connectivity, return 1.
  - On `resolveGitHubToken` throw (no token) → Device Flow.
  - `--force` → skips resolution/verification, unconditional Device Flow.
- Tests: `src/cli/__tests__/login.test.ts` TC-003 through TC-008 pin each branch. `tests/unit/cli/login.test.ts` mirrors selected branches with a separate mock setup.

**Verdict**: Satisfied.

---

### R3: `credentials set <name>` SHALL store secrets to credentials.json without echoing input

**Spec Scenarios**: `claude-code` stores token, `anthropic-api-key` stores key, input not echoed, existing credentials preserved

**Implementation checked**:
- `src/cli/credentials.ts` `runCredentialsSet()`:
  - Validates name against `["claude-code", "anthropic-api-key"]`.
  - Calls `readSecret({ isTTY, input, output })` — TTY path uses raw mode, non-TTY reads stdin to EOF.
  - `claude-code` → `saveClaudeCodeOAuthToken(value)` → `saveCredentials({ anthropic: { claudeCodeOAuthToken: value } })`.
  - `anthropic-api-key` → `saveSpecRunnerApiKey(value)` → `saveCredentials({ anthropic: { apiKey: value } })`.
  - Both use `saveCredentials` deep-merge path → existing keys (e.g. github.token) are preserved.
  - Secret value never passed to logger.
- `src/util/secret-input.ts` `readSecret()`: TTY uses `setRawMode(true)`, char-by-char, no echo to output stream. Always restores `setRawMode(false)` on confirm/abort/exit/SIGTERM.
- `credentials` registered in `COMMANDS` as parent with `set` subcommand.
- Tests: `tests/credentials.test.ts` TC-009 (0600 file, anthropic.claudeCodeOAuthToken stored), TC-010 (anthropic.apiKey stored), TC-011 (secret not in captured output stream), TC-012 (existing github token preserved), TC-020 (unknown name → non-0), TC-021 (empty input → non-0).

**Verdict**: Satisfied.

---

### R4: guidance MUST reference only real, current commands

**Spec Scenarios**: no dead `login --provider anthropic`, doctor hints reference registered commands

**Implementation checked**:
- `src/` grep for `login --provider anthropic` → **0 matches**. All 5 production locations replaced with `credentials set anthropic-api-key` / `SPECRUNNER_API_KEY`.
- `src/` grep for `login --provider claude` → 0 matches in production files (match in `src/cli/__tests__/login.test.ts` is a test file excluded by dead-guidance scanner per `entry.name !== "__tests__"` and `!entry.name.endsWith(".test.ts")`).
- `src/core/credentials/anthropic.ts` `ANTHROPIC_KEY_MISSING_HINT` — references `specrunner credentials set anthropic-api-key`.
- `src/core/credentials/claude-code.ts` `CLAUDE_CODE_TOKEN_MISSING_HINT` — references `specrunner credentials set claude-code`.
- `src/core/runtime/provider-readiness.ts` `PROVIDER_READINESS_HINTS` — `auth-missing` and `auth-invalid` reference `specrunner credentials set claude-code`.
- `src/core/doctor/checks/config/managed-key-present.ts` and `src/core/doctor/checks/agents/agent-provider-alive.ts` — updated to reference `specrunner credentials set anthropic-api-key`.
- Tests: `tests/dead-guidance.test.ts` TC-013 scans all production `.ts` files under `src/`. `tests/hint-command-existence.test.ts` TC-014 verifies every `specrunner <verb>` and `specrunner <verb> <sub>` in doctor hints against `COMMANDS` registry.

**Verdict**: Satisfied.

---

### R5: doctor SHALL treat headless Claude credential absence as a warning, not a failure

**Spec Scenario**: unset headless Claude credential is warn with cron/inbox note

**Implementation checked**:
- `src/core/doctor/checks/config/claude-code-token-present.ts`:
  - `required: false`
  - Returns `status: "warn"` when `ctx.resolvedClaudeCodeOAuthToken === null`.
  - `hint: "Only needed for cron / inbox (headless) runs. Run 'claude setup-token', then 'specrunner credentials set claude-code'."` — contains "cron / inbox" and "credentials set claude-code".
- Tests: `tests/doctor-readiness.test.ts` TC-015: `result.status === "warn"`, hint contains `credentials set claude-code`, hint matches `/cron|inbox|headless/i`.

**Verdict**: Satisfied.

---

### R6: doctor readiness SHALL be determined by fail == 0

**Spec Scenarios**: warnings remain but no failures shows Ready plus next step, failing check suppresses Ready

**Implementation checked**:
- `src/core/doctor/formatter.ts` `formatHuman()`:
  - After summary line: if `fail === 0` → appends `"Ready to run."` and `"  Next: specrunner request new <slug>"`.
  - If `fail > 0` → runs existing `deriveNextSteps` block, no `Ready to run.`.
- Tests: `tests/doctor-readiness.test.ts` TC-016 (all-pass → contains `Ready to run.`), TC-016 (pass+warn → contains `Ready to run.`), TC-016 (next step contains `specrunner request new`), TC-017 (fail → does not contain `Ready to run.`).

**Verdict**: Satisfied.

---

### R7: init MUST NOT silently ignore the provider flag when a global config exists

**Spec Scenario**: provider flag under existing global config emits a notice

**Implementation checked**:
- `src/cli/init.ts` `runInit()` (lines 79–83): when `configExists === true && flagProvider !== undefined`:
  - `logInfo("Note: --provider flag ignored because global config already exists (${configPath}).")`
  - `logInfo("To change the provider defaults, edit the config file directly: ${configPath}")`
  - Config is not overwritten (falls through to per-repo scaffold only).
- `Run 'specrunner login'` replaced by `Run 'specrunner doctor' to see what's still needed.'` (line 143).
- Tests: `tests/init-provider-notice.test.ts` TC-018: exit 0, stderr captures notice text, config file content unchanged.

**Verdict**: Satisfied.

---

### R8: README Quick Start SHALL present a doctor-centered setup flow

**Spec Scenario**: Quick Start centers on doctor

**Implementation checked**:
- `README.md` Quick Start (lines 9–69):
  - Step 2: `npx specrunner doctor` — "Check what's needed (doctor is the source of truth)".
  - Step 3: conditional setup — `specrunner login` appears only inside a comment (`# Otherwise:`) block, not as a standalone required step.
  - Closing note names `gh auth login` / env as sufficient; notes Device Flow is skipped automatically.
  - No bare `npx specrunner login` or `specrunner login` on its own line.
- Tests: `tests/readme-quickstart.test.ts` TC-019: Quick Start contains `specrunner doctor`; no line matching `/^npx specrunner login\s*$/` or `/^specrunner login\s*$/`.

**Verdict**: Satisfied.

---

## Acceptance Criteria Checklist

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `--provider` absent from login flags/help; `login --provider claude` migration captured, non-0 | ✅ |
| 2 | Valid token → no Device Flow, source displayed | ✅ |
| 3 | Invalid + env/gh source → no Device Flow, non-0, remediation | ✅ |
| 4 | Invalid + credentials → Device Flow | ✅ |
| 5 | `credentials set claude-code` / `anthropic-api-key` → credentials.json 0600 | ✅ |
| 6 | Input not echoed (TTY silent / non-TTY stdin) | ✅ |
| 7 | No `login --provider anthropic` in `src/` | ✅ |
| 8 | Doctor hints reference registered commands only | ✅ |
| 9 | Claude credential absence → warn + cron/inbox note | ✅ |
| 10 | Doctor readiness = fail == 0 | ✅ |
| 11 | Init provider flag with existing config → notice, not silent | ✅ |
| 12 | README Quick Start is doctor-centered | ✅ |
| 13 | `typecheck && test` green | ✅ (779 files, 11443 tests) |

---

## Plan Divergences (non-normative)

None. Implementation follows D1–D10 faithfully. All T-01 through T-10 tasks checked.

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

（何をどう確認したか。確認した tasks.md・design.md・spec.md・request.md の項目を記載する）

## 検証できなかった項目

（確認できなかった項目と理由。無ければ None と明記する）

## Findings 詳細

（typed findings の補足説明。指摘がない場合は None と明記する）
