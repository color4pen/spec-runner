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
| tasks.md | ✓ | All checkboxes [x] (T-01 through T-07) |
| design.md | ✓ | D1–D6 each implemented as specified |
| spec.md | ✓ | All 9 scenarios have test coverage |
| request.md | ✓ | All 5 acceptance criteria met; typecheck && test green (387 files / 5008 tests) |

## Detail

### tasks.md

All tasks T-01 through T-07 are fully checked. No open items.

### design.md

| Decision | Implementation |
|----------|---------------|
| D1: credential key `anthropic.claudeCodeOAuthToken` | `src/core/credentials/types.ts`, `requirements.ts`, `credentials-io.ts` validation |
| D2: dedicated resolver with env-first chain | `src/core/credentials/claude-code.ts` |
| D3: inject at adapter boundary only; no `process.env` mutation | `src/adapter/claude-code/agent-runner.ts` lines 268–277; `local.ts` wires resolver via `_resolveClaudeCodeOAuthTokenFn` |
| D4: bare `specrunner login` unchanged; `--provider claude` added | `src/cli/login.ts` — default provider is "github" |
| D5: local requirements without unconditional preflight failure | `src/core/runtime/prereqs.ts` — `{ optional: true }` for claudeCodeOAuthToken |
| D6: doctor source without token value | `src/core/doctor/checks/config/claude-code-token-present.ts` — source label only |

### spec.md

| Scenario | Test |
|----------|------|
| login stores the Claude Code token | `src/cli/__tests__/login.test.ts` |
| login does not overwrite without force | `src/cli/__tests__/login.test.ts` |
| credentials token injected when env absent | `src/adapter/claude-code/__tests__/credential-injection.test.ts` TC-003 |
| environment token has precedence | TC-004 / TC-011 |
| process environment is not mutated | TC-005 |
| local runtime requirements include claudeCodeOAuthToken | `tests/core/credentials/requirements.test.ts` |
| managed runtime requirements unchanged | same file |
| doctor reports env source | TC-008 in `src/core/doctor/checks/config/__tests__/claude-code-token-present.test.ts` |
| doctor reports credentials source | TC-009 |
| doctor reports unset source | TC-010 |
| existing crontab env continues to work | TC-004 / TC-011 |

Token value is absent from all DoctorResult messages and details. ✓

### request.md

| Acceptance criterion | Status |
|----------------------|--------|
| login token injected when env unset (test) | ✓ TC-003 |
| env takes precedence when set (test) | ✓ TC-004/TC-011 |
| doctor shows resolution source (test) | ✓ TC-008/009/010 |
| credentials.json permission + atomic write contract maintained | ✓ T-06 tests |
| `typecheck && test` green | ✓ 387 test files / 5008 tests passed |

### Architecture

- Dependency direction correct: adapter imports from core via injected function; core does not import adapter. ✓
- `saveCredentials` deep-merges with existing file; saving Claude token preserves `github.token` and `anthropic.apiKey`. ✓
- `LocalRuntime.buildSdkOptions()` (lightweight one-shot `query()`) does not inject the token; consistent with D3's explicit scope and spec's "agent run" wording. ✓
