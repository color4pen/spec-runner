# Implementation Notes: create-polish-and-resume

## Summary

- **result**: completed
- **tasks_completed**: 22/22

## Files Modified

| File | Operation | Description |
|------|-----------|-------------|
| `bin/specrunner.ts` | Modified | Added `--resume <slug>` / `--resume=<slug>` flag parsing in create case; description is now optional when `--resume` is provided |
| `src/cli/create.ts` | Modified | Added `resume?: string` to `CreateOptions`; `runCreate()` now handles `--resume` path (loadDraft → error if not found → executeCreate with resume); always delegates to `executeCreate()` |
| `src/core/command/create.ts` | Rewritten | Removed `extractRequestContent()`, removed 1-shot LLM path; `executeCreate()` is now a facade: `noLlm` → scaffold + write, else → `executeCreateDialog()`; added `resume?` to `CreateParams` |
| `src/core/command/create-dialog.ts` | Rewritten | Added `DialogParams.slug?` (optional), `DialogParams.run?`, `DialogParams.resume?`; added `detectSlugProposal()`; added SIGINT handler (D5); added slug proposal dialog loop (D2/D3) with 3-turn fallback; added hot resume + cold start logic (D1); changed `finalize()` to return `{ exitCode, requestMdPath? }`; added `--run` post-finalize dialog (D6) |
| `src/prompts/create-dialog.ts` | Modified | `buildDialogSystemPrompt()` now accepts `options?: { needSlugProposal?: boolean }`; `buildDialogInitialMessage()` has `slug?: string`; added `buildResumeInitialMessage()` |
| `src/prompts/create-system.ts` | Deleted | Removed `buildCreateSystemPrompt()` and `buildCreateUserMessage()` (dead code after 1-shot cleanup) |
| `tests/unit/core/command/create.test.ts` | Modified | Removed tests for `extractRequestContent()` (deleted function); updated `executeCreate --no-llm` tests; added test for executeCreate delegation |
| `tests/unit/core/command/create-dialog.test.ts` | Modified | Updated `finalize()` tests to match new `{ exitCode, requestMdPath? }` return type |
| `tests/unit/core/command/create-polish-and-resume.test.ts` | Created | 33 new tests covering: `detectSlugProposal`, slug validation, `buildResumeInitialMessage`, `buildDialogSystemPrompt({ needSlugProposal })`, hot resume, cold start fallback, draft-not-found, SIGINT draft save, 3-turn slug fallback |

## Blocked Tasks

None. All 22 tasks completed.

## Implementation Notes

### finalize() return type change

`finalize()` was changed from `Promise<number>` to `Promise<{ exitCode: number; requestMdPath?: string }>` to support passing the `requestMdPath` to `runRunCore()` for `--run` support. All callers and tests updated.

### Hot resume try-catch scope

Per design D1, the try-catch around hot resume wraps the `runtime.queryInteractive()` call itself. If the SDK throws synchronously during the call (e.g., invalid session), cold start is activated. If the SDK returns an iterable that throws during iteration, that error propagates to the outer try-finally (which closes readline and removes SIGINT handler). This matches the design intent and is tested with synchronous throw simulation.

### Slug proposal dialog (D2/D3)

The slug proposal flow activates only when `params.slug` is undefined (no `--slug` flag). When detected, `slugify()` validates format and `checkSlugCollision()` checks availability. The 3-turn fallback uses `slugify(description)` automatically. The `slugAlreadyKnown` variable correctly gates both slug collision check and the proposal UI.

### SIGINT handler cleanup

`process.removeListener('SIGINT', sigintHandler)` is called in the `finally` block after the dialog loop, ensuring cleanup even on error paths. The readline `close` event also triggers a best-effort draft save.
