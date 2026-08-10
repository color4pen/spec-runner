# Regression Gate Result — Iteration 1

**Change**: resume-operator-guidance
**Branch**: change/resume-operator-guidance-861572f6

## Findings Verification

### Finding 1: T-02 が buildAdoptionHaltMessage に渡す slug 変数を特定していない

**Status**: FIXED

**Evidence**:
- `tasks.md` T-02 (line 22) now explicitly states: `buildAdoptionHaltMessage を呼ぶ際、slug 引数には resolvedSlug（getJobSlug(state) で得られる正規 slug）を渡す。Gate 2 が buildAdoptEscalationMessage に渡す変数（resume.ts:434）と同一であり、this.slug（ユーザー入力 slug、short Job ID prefix の可能性あり）は使用しない。`
- Implementation confirmed in `resume.ts`: `haltWithCanonPreflight` function (line 77) accepts `slug: string` as first parameter. Both call sites (lines 425, 431) pass `resolvedSlug` (defined at line 269 as `const resolvedSlug = getJobSlug(state)`), not `this.slug`.

### Finding 2: TC-010 (should): exit 128 preflight → empty range not specifically tested

**Status**: FIXED

**Evidence**:
- `src/core/command/__tests__/resume-operator-guidance.test.ts` lines 864–936 now contain TC-010 test suite: `"TC-010: preflight exit 128 の adopt 検出は空扱い（非 git 環境 carve-out）"`
- Tests verify:
  - `prepare()` throws (pipeline does not start)
  - `buildAdoptionHaltMessage` is called with `commitDetectionFailed: false` and empty `unadoptedCommits` when exit 128 occurs
  - Output does NOT contain detection-failure note ("detection of unadopted commits failed" / "Unknown commit detection failed")
  - Output contains `--apply-canon` only; does NOT contain `--adopt-commits`

### Finding 3: TC-016 (should): mutual exclusion pairs and --from valid values not asserted in help test

**Status**: FIXED

**Evidence**:
- `tests/unit/cli/resume-help.test.ts` lines 205–240 now contain TC-016 test suite: `"TC-016: job resume --help の出力に相互排他対と --from 有効値が含まれる"`
- Tests assert:
  - Output contains `"Mutually exclusive"` text
  - Output contains `--detach` and `--json` with mutual-exclusion pattern (`--detach / --json` or equivalent)
  - Output contains `--prompt / --prompt-file` or "Mutually exclusive with --prompt"
  - Output contains `"Valid steps:"` for --from valid values enumeration
  - Output contains `"composite step"` for the --from exclusion note

## Verdict

No regressions. All 3 findings from the ledger are resolved in the current code.
