# Regression Gate Result — iteration 001

- **verdict**: needs-fix
- **iteration**: 001

## Ledger Verification

### Finding 1 — TC-010: pipeline-run prepare() designLayerEnabled wiring test

- **Original severity**: medium
- **File**: tests/unit/core/command/pipeline-run.test.ts
- **Status**: verified-fixed

`tests/unit/core/command/pipeline-run.test.ts` was added by the code-fixer commit (`fd1ce55c2`). It contains TC-010-a, TC-010-b, TC-010-c, which verify that `PipelineRunCommand.prepare()` sets `workspaceOpts.designLayerEnabled` to the correct value for each of: `designLayer.enabled: true`, `designLayer.enabled: false`, and `designLayer` absent from config. Finding is fixed and still present.

---

### Finding 2 — TC-008: diverged scenario (behind > 0 かつ ahead > 0) 両警告テスト

- **Original severity**: low
- **File**: tests/unit/core/runtime/local.test.ts
- **Status**: regression
- **Severity**: high
- **Resolution**: fixable

TC-LR-017 describe ブロックは implementer によって追加されたが、`behindCount > 0` かつ `aheadCount > 0` を同時に指定するテストケースが存在しない。追加された 6 件のテストはすべて aheadCount のみ（または aheadExitCode: 1）のシナリオであり、diverged 状態（`behindCount: 1, aheadCount: 2` 相当）で behind-warning と ahead-warning の両方が独立して出力されることを自動検証するケースが欠落している。

**修正方法**: TC-LR-017 に `buildMockSpawnFn({ behindCount: 1, aheadCount: 2 })` を使用したテストケースを追加し、`behind origin/main` と `ahead of origin/main` の両方が stderr に含まれることをアサートする。

---

### Finding 3 — TC-011: resume path workspaceOpts に designLayerEnabled が含まれないことのテスト

- **Original severity**: low
- **File**: tests/unit/core/command/resume.test.ts
- **Status**: regression
- **Severity**: high
- **Resolution**: fixable

`tests/unit/core/command/resume.test.ts` はこのブランチで変更されていない（`git diff main...HEAD -- tests/unit/core/command/resume.test.ts` は空）。`designLayerEnabled` に関するアサーションはファイル内に一切存在せず、resume path の `prepare()` が生成する `workspaceOpts` に `designLayerEnabled` が含まれない（`undefined`）ことを自動検証するテストが未実装のまま。

**修正方法**: `resume.test.ts`（または相当するファイル）に TC-011 を追加する。`ResumeCommand.prepare()` が返す `workspaceOpts.designLayerEnabled` が `undefined` であることをアサートするケース。`resume.ts` は変更されていないため実装は正しいが、Non-Goal を回帰から保護するテストが欠けている。

---

## Summary

| # | Finding | Status | Severity |
|---|---------|--------|----------|
| 1 | TC-010: pipeline-run prepare() wiring test | verified-fixed | — |
| 2 | TC-008: diverged 両警告テスト | regression | high |
| 3 | TC-011: resume path designLayerEnabled=undefined テスト | regression | high |

TC-010 は code-fixer によって修正済みで現在も存在する。TC-008 と TC-011 は ledger に「fixed」と記録されているが、現在のコードに対応するテストが存在しないため regression として報告する。
