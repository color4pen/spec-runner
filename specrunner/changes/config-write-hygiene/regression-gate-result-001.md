# Regression Gate Result — Iteration 1

- **verdict**: approved

## Findings

No regressions found. All 3 ledger items verified fixed.

## Verification Details

### [HIGH] TC-001 / TC-002 unit tests — FIXED

`tests/config/store.test.ts` now exports `saveConfig` and includes:
- TC-001: writes `github` field (GHES host config survives `saveConfig`)
- TC-002: strips legacy `agent` / `timeout` / `anthropic` fields

`src/config/store.ts`: `delete toSave["github"]` removed. Both tests pass (15/15).

### [MEDIUM] login.ts malformed-config overwrite — FIXED

`src/cli/login.ts:80` now uses `fs.access(configPath)` for existence check. A malformed config file causes `fs.access` to succeed → scaffold is skipped → existing file not overwritten. 14/14 login tests pass.

### [LOW] loadConfig() called twice in login.ts — FIXED

The second `loadConfig()` call (scaffold existence check) was replaced with `fs.access()`. Only one `loadConfig()` call remains (line 61, best-effort GitHub host resolution).

## Test Results

```
tests/config/store.test.ts   15/15 passed
tests/unit/cli/login.test.ts 14/14 passed
```
