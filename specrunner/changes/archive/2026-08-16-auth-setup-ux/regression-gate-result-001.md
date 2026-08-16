# Regression Gate Result — auth-setup-ux iteration 1

## Summary

6 findings verified. 5 fixed. 1 still present.

---

## F1 — PROVIDER_READINESS_HINTS subcommand test (TC-005 scope)

**Status: FIXED**

`tests/hint-command-existence.test.ts` now includes:

- `extractCommandVerbSubs()` extracts `specrunner <verb> <sub>` pairs (line 29–32).
- New TC-005 subcommand test (lines 80–99) applies `extractCommandVerbSubs` to PROVIDER_READINESS_HINTS string values and verifies each extracted subcommand exists in the parent command's `subcommands` map.

`COMMANDS.credentials.subcommands.set` is registered (command-registry.ts line 510), so the gate fires correctly.

---

## F2 — PROVIDER_READINESS_HINTS subcommand T-10 scope

**Status: FIXED**

TC-014 (lines 102–175) recursively reads all `.ts` files under `src/core/doctor/**` and applies both `extractCommandVerbs` and `extractCommandVerbSubs`, verifying top-level commands and subcommands. This covers `src/core/runtime/provider-readiness.ts` is NOT in scope for TC-014 (only `src/core/doctor/**`) — but TC-005 covers `PROVIDER_READINESS_HINTS` directly via its runtime values, so the gap is closed via complementary coverage.

---

## F3 — T-03 tasks.md Ctrl-C raw mode spec gap

**Status: FIXED**

`tasks.md` line 42 now explicitly specifies: "確定時および `\x03`(Ctrl-C) 中断時のいずれでも `setRawMode(false)` を呼んでから確定/中断すること（端末破壊防止）"

Implementation in `src/util/secret-input.ts` confirms: `cleanup()` is called at line 119 in the Ctrl-C handler before `reject()`, and `cleanup()` includes `setRawMode(false)` (lines 72–86).

---

## F4 — EventEmitter imported from `node:stream`

**Status: FIXED**

`tests/credentials.test.ts` line 15: `import { EventEmitter } from "node:events";`

Correct canonical import source.

---

## F5 — TTY raw mode not restored on SIGTERM

**Status: FIXED**

`src/util/secret-input.ts` registers `process.once("SIGTERM", onSigterm)` at line 106. The `onSigterm` handler (lines 93–97) calls `cleanup()` (which calls `setRawMode(false)`) then re-raises SIGTERM via `process.kill(process.pid, "SIGTERM")`. Handler is deregistered by `cleanup()` calling `process.off("SIGTERM", onSigterm)` at line 75 to prevent leaks.

---

## F6 — TC-014 hint regex silently skips `credentials set` in doctor hints

**Status: STILL PRESENT (regression)**

`tests/hint-command-existence.test.ts` lines 128 and 154 use the regex:

```
/hint\s*:\s*["'`]([^"'`]+)["'`]/g
```

The character class `[^"'\`]+` stops at the first single quote character. For the 5 doctor check hint strings that contain inner single quotes, e.g.:

```ts
hint: "Set SPECRUNNER_API_KEY env var, or run 'specrunner credentials set anthropic-api-key' to save it to credentials.json.",
```

The regex captures only `Set SPECRUNNER_API_KEY env var, or run ` (truncated at the `'` before `specrunner`). The `specrunner credentials set anthropic-api-key` command reference is never extracted or verified.

Affected files (all still contain inner-quoted command references):

| File | Line | Truncated portion |
|------|------|-------------------|
| `checks/config/managed-key-present.ts` | 22 | `'specrunner credentials set anthropic-api-key'` |
| `checks/auth/managed-key-valid.ts` | 22 | `'specrunner credentials set anthropic-api-key'` |
| `checks/agents/agent-provider-alive.ts` | 33 | `'specrunner credentials set anthropic-api-key'` |
| `checks/agents/environment-provider-alive.ts` | 22 | `'specrunner credentials set anthropic-api-key'` |
| `checks/config/claude-code-token-present.ts` | 28 | `'specrunner credentials set claude-code'` |

The machine gate for the acceptance criterion "doctor の hint に CLI コマンドが含まれる場合、それが現行 CLI に実在することを機械検証する" does not fire for these 5 hints. A future regression that breaks `credentials set` registration would pass TC-014.

**Fix options:**
1. Change the regex to handle double-quoted strings with inner single quotes: `/hint\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g` for double-quoted, separately for backtick-quoted strings.
2. Rewrite the 5 hint strings to not use inner single quotes (e.g., use backticks or reword).

---

## Evidence

| Finding | File verified | Verdict |
|---------|--------------|---------|
| F1 | tests/hint-command-existence.test.ts:80–99 | Fixed |
| F2 | tests/hint-command-existence.test.ts:102–175 | Fixed |
| F3 | specrunner/changes/auth-setup-ux/tasks.md:42, src/util/secret-input.ts:72–86,119 | Fixed |
| F4 | tests/credentials.test.ts:15 | Fixed |
| F5 | src/util/secret-input.ts:93–106 | Fixed |
| F6 | tests/hint-command-existence.test.ts:128,154; src/core/doctor/checks/**:multiple | **Regression** |
