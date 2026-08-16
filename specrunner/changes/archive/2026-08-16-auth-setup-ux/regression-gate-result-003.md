# Regression Gate Result — Iteration 003

## Evidence

### F1 & F2: PROVIDER_READINESS_HINTS subcommand verification missing

**Status: Fixed**

`tests/hint-command-existence.test.ts` (lines 29–99) now has:
- `extractCommandVerbSubs` helper that parses `specrunner <verb> <sub>` patterns
- TC-005 second test ("every specrunner <verb> <sub> in PROVIDER_READINESS_HINTS has a registered subcommand") that iterates `PROVIDER_READINESS_HINTS`, extracts verb+sub pairs, and asserts each sub is registered under the parent command's `subcommands` map

`PROVIDER_READINESS_HINTS` in `src/core/runtime/provider-readiness.ts` references `specrunner credentials set claude-code`; `credentials.set` is a registered subcommand per `src/cli/command-registry.ts`.

### F3: T-03 raw mode not restored on Ctrl-C

**Status: Fixed**

`src/util/secret-input.ts` lines 117–122: the `0x03` (Ctrl-C) branch calls `cleanup()` (which calls `setRawMode(false)`) before calling `reject(...)`. `tasks.md` line 42 explicitly states "確定時および Ctrl-C 中断時のいずれでも `setRawMode(false)` を呼んでから確定/中断すること".

### F4: EventEmitter imported from node:stream

**Status: Fixed**

`tests/credentials.test.ts` line 15: `import { EventEmitter } from "node:events";` — correct module.

### F5: TTY raw mode not restored on SIGTERM

**Status: Fixed**

`src/util/secret-input.ts` lines 88–106:
- `onExit` and `onSigterm` handlers are registered with `process.once("exit", onExit)` and `process.once("SIGTERM", onSigterm)` immediately after enabling raw mode.
- `onSigterm` calls `cleanup()` (restores raw mode) then re-raises `SIGTERM` with `process.kill(process.pid, "SIGTERM")`.
- `cleanup()` also removes these handlers to avoid leaks after the raw-mode window closes.

### F6: TC-014 hint regex truncates at inner single quotes

**Status: Fixed**

`tests/hint-command-existence.test.ts` lines 128–133 and 159–164 now use three separate regex patterns:
```ts
const hintMatches = [
  ...content.matchAll(/hint\s*:\s*"([^"]*)"/g),
  ...content.matchAll(/hint\s*:\s*`([^`]*)`/g),
  ...content.matchAll(/hint\s*:\s*'([^']*)'/g),
];
```

Double-quoted hints (e.g. `"...run 'specrunner credentials set anthropic-api-key'..."`) are captured in full by the first pattern without truncating at the inner single quote. The five doctor check files all use double-quoted hint strings, so `credentials set` is now extracted and verified.

## Summary

All 6 ledger findings are resolved in the current code. No regressions detected.
