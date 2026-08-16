# Cross-Boundary Invariants Review — auth-setup-ux (iteration 1)

## Scope

Reviewer: cross-boundary-invariants
Branch: change/auth-setup-ux-701673a2
Files examined: 46 changed files (3801 ins / 374 del). Focus: unchanged mechanisms whose implicit invariants may be silently broken by new behavior.

---

## Finding 1 — Medium / Fixable

**TTY raw mode not restored on SIGTERM during `credentials set` input**

`src/util/secret-input.ts:83-84` calls `input.setRawMode(true)` to suppress echo in TTY mode. Raw mode is restored only via in-band stdin data events: Ctrl-C (0x03), Enter/EOT, or an error event on the stream. There is no `process.on('SIGTERM', ...)` or `process.on('exit', ...)` guard.

The **unchanged mechanism**: `bin/specrunner.ts` dispatches the `credentials set` handler without any signal or exit listeners. The implicit invariant of the OS TTY subsystem is that processes restore the terminal to cooked mode before exiting; if a SIGTERM arrives while `readSecret` is blocked on a data event, this invariant is violated. The terminal is left in raw mode and the user's session is unusable until they manually run `stty sane` or `reset`.

`SIGKILL` is unhandleable by definition, but `SIGTERM` (the default sent by `kill` and many process managers) can be caught.

**Reproduction path**:
1. Run `specrunner credentials set claude-code` in a real terminal (TTY).
2. From another shell: `kill <pid>` (SIGTERM).
3. Terminal is left in raw mode; all subsequent typed characters disappear.

**Fix path**: In `readTTY` (or in `runCredentialsSet`), register a `process.on('SIGTERM')` handler that calls `input.setRawMode(false)` before re-raising or exiting. Since the stream is injected via seam, the handler would need access to the injected `input`. Simplest fix is to register it inside `readTTY` and deregister on resolve/reject.

---

## Finding 2 — Medium / Decision-needed

**`--provider github` deprecated flag triggers migration message intended for `--provider claude` users**

`src/cli/command-registry.ts:488-491` registers `provider` as a single deprecated flag with the message:

> "specrunner login is GitHub-only now. To store a Claude Code token for headless runs, use: specrunner credentials set claude-code"

Before this PR, `specrunner login --provider github` was valid and equivalent to `specrunner login` (ran GitHub Device Flow). After this PR, the deprecated flag fires immediately for any value — including `github`. The **unchanged mechanism** `bin/specrunner.ts` lines 141-148 writes `e.message + "\n"` then `entry.usage` (LOGIN_USAGE) to stderr when FlagParseError is caught.

A user who previously ran `specrunner login --provider github` now receives:
```
specrunner login is GitHub-only now. To store a Claude Code token for headless runs, use: specrunner credentials set claude-code
[LOGIN_USAGE follows]
```

The message tells them to run `credentials set claude-code`, but that is wrong — they just need `specrunner login` (no flag). The LOGIN_USAGE that follows does show the correct syntax, so the user can recover, but the error message itself gives incorrect guidance.

The implicit invariant of the FlagParseError dispatch mechanism: "the error message provides accurate remediation for the specific input that triggered it." This invariant is broken for the `--provider github` case.

Design D2 (design.md:76-87) chose a single deprecated message for all `--provider` values deliberately ("generic dispatcher を login 固有ロジックで汚さずに済む"). This is an explicit trade-off: simpler implementation vs. imprecise guidance for `--provider github` users.

**Options**:

A. **Keep current behavior** — accept the imprecision. The LOGIN_USAGE following the message shows the correct syntax; `--provider github` users are uncommon (most existing docs show just `specrunner login`). Low actual impact.

B. **Add a sentence for `github` case** — Append to the deprecated message: "If you previously used `--provider github`, just run: `specrunner login` with no flag." This keeps D2's single-message approach while removing the wrong guidance.

---

## Finding 3 — Low / Observation

**`next-steps.ts` RULES not covered by hint-command-existence machine test**

`src/core/doctor/next-steps.ts` (unchanged) holds a RULES array with step prescriptions including `"specrunner login"` and `"specrunner init"`. The `tests/hint-command-existence.test.ts` TC-014 scans `src/core/doctor/**` only for `hint:` string fields. The RULES step strings are not scanned.

Both commands are still registered and real (no current bug). This is a pre-existing test gap, not introduced by this PR. Noted because the PR adds a similar command-existence test for doctor hints and provider-readiness hints but does not close the gap for next-steps prescriptions.

---

## Verified as Sound

- `resolveGitHubToken` return type (`{ token, source }`) was already the existing contract; all callers (`bootstrap.ts`, `job ls` handler, `login.ts`) destructure correctly.
- `FlagDef.deprecated` is additive (optional field); all existing flag definitions satisfy the updated interface without changes.
- `formatHuman` change (adds "Ready to run." when `fail === 0`): existing tests pin only `toContain("Next steps")` and `toContain("Summary:")`, not negative assertions about "Ready to run.", so no existing test breaks.
- `--provider claude` deprecated flag interaction with `--help` pre-scan in `bin/specrunner.ts`: help flag is pre-scanned before `parseFlags`, so `--help` always wins; no ordering issue.
- `credentials set` not guarded by `requiresRepo` or `guardedSubcommands`: correct (parity with `doctor`, which is also repo-optional).
- Dead guidance removal (`login --provider anthropic` / `login --provider claude`): confirmed absent from `src/` by `tests/dead-guidance.test.ts` scan logic.
- Doctor next-steps RULES still reference `specrunner login` (GitHub login still valid) and `specrunner init` (unchanged): no regression.

---

## Evidence

| Item | Checked | Note |
|------|---------|------|
| `resolveGitHubToken` callers (`bootstrap.ts`, `job ls`, `login.ts`) | ✓ | All destructure `{ token }` correctly |
| `FlagDef.deprecated` type compatibility | ✓ | Optional field, no breaking change |
| `formatHuman` existing tests (`formatter.test.ts`, `next-steps.test.ts`) | ✓ | All assertions use `toContain`, not negative |
| `readSecret` signal handling | ✓ | No SIGTERM/exit handler found |
| Deprecated flag + dispatcher interaction | ✓ | Help pre-scan takes precedence; `--provider github` message is misleading |
| `next-steps.ts` RULES command references | ✓ | Both `login` and `init` remain registered |
| Dead guidance strings in `src/` | ✓ | Verified absent |
| `credentials set` dispatch path | ✓ | No `requiresRepo`, no `guardedSubcommands`, consistent with `doctor` |
