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
| tasks.md | ✅ | All checkboxes [x]; T-01–T-05 complete |
| design.md | ✅ | D1/D2/D3 fully realized in implementation |
| spec.md | ✅ | All requirements and scenarios satisfied by tests |
| request.md | ✅ | All 4 acceptance criteria met |

## Detail

### tasks.md
All 5 tasks (T-01 through T-05) have every checkbox marked `[x]`. No incomplete items.

### design.md — D1 (3-door README)
`README.md` adds `GH_TOKEN`/`GITHUB_TOKEN` rows to the Environment Variables table and a "GitHub Authentication" section with priority order and a three-row door table (interactive login / GitHub Actions / self-hosted·cron). Token kind, setup method, and fine-grained PAT 1-year expiry are documented. A `specrunner doctor` callout line is present. Consistent with D1.

### design.md — D2 (login overwrite protection)
`src/cli/login.ts` implements the two-tier guard:
- **env token**: warns via `logWarn` and continues (no block, as designed).
- **credentials token**: if `credentials.github.token` is non-empty and `force` is false, emits warning with `--force` guidance and exits 0 without calling `runDeviceFlow` or `saveCredentials`. With `force: true` the device flow proceeds normally.

`src/cli/command-registry.ts` registers `--force` as a boolean flag and passes it to `runLogin`. Consistent with D2.

### design.md — D3 (doctor env-var-name detail)
`src/core/doctor/checks/config/github-token-present.ts` inspects `ctx.env["GH_TOKEN"]` when `githubTokenSource === "env"` and appends `"Resolved via $GH_TOKEN"` or `"Resolved via $GITHUB_TOKEN"` as a `details` entry. Pass message format `GitHub token is available (source: env)` is preserved. Consistent with D3.

### spec.md — Requirement: login MUST NOT silently overwrite a stored token

| Scenario | Test |
|----------|------|
| stored token, no --force → device flow skipped, no write, warning, exit 0 | TC-LOGIN-010 ✅ |
| stored token, --force → device flow runs, token saved, exit 0 | TC-LOGIN-011 ✅ |
| no stored token → device flow runs, no warning, exit 0 | TC-LOGIN-001 ✅ |

### spec.md — Requirement: login SHALL warn when an environment token is active

| Scenario | Test |
|----------|------|
| GH_TOKEN active → warning contains "GH_TOKEN", device flow runs, exit 0 | TC-LOGIN-012 ✅ |
| GITHUB_TOKEN active → warning contains "GITHUB_TOKEN", device flow runs, exit 0 | TC-LOGIN-013 ✅ |

### spec.md — Requirement: doctor SHALL surface the resolved GitHub token source

| Scenario | Test |
|----------|------|
| source credentials → `(source: credentials)` in message | TC-05 ✅ |
| source gh → pass, no details (new regression test for gh) | TC-11 ✅ |
| source env, GH_TOKEN set → `(source: env)` + details `Resolved via $GH_TOKEN` | TC-09 ✅ |
| source env, GITHUB_TOKEN only → details `Resolved via $GITHUB_TOKEN` | TC-10 ✅ |

### request.md — Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| README lists interactive / GitHub Actions / self-hosted paths with token type and setup | ✅ |
| login with env token does not silently lose any token | ✅ |
| doctor shows resolved token source | ✅ |
| typecheck && test green | ✅ (build/typecheck/test/lint all passed; 4037 tests) |
