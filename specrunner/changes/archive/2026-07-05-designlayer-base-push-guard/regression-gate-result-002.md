# Regression Gate Result — Iteration 002

- **verdict**: approved

## Ledger Verification (3 items)

### [MEDIUM] TC-010（must 優先度）: pipeline-run prepare() の designLayerEnabled wiring テスト

- **File**: tests/unit/core/command/pipeline-run.test.ts
- **Status**: fixed ✅
- **Evidence**: ファイル全体が TC-010 専用テストで構成されている。TC-010-a（enabled: true → true）、TC-010-b（enabled: false → false）、TC-010-c（designLayer absent → false）の 3 ケースが実装済み。`prepare()` が `resolveDesignLayerConfig(config).enabled` を `workspaceOpts.designLayerEnabled` に正しく詰めることを自動検証している。

### [LOW] TC-008（should 優先度）: diverged シナリオで両警告が出ることのテスト

- **File**: tests/unit/core/runtime/local.test.ts
- **Status**: fixed ✅
- **Evidence**: TC-LR-017 describe ブロック内（line 1049–1068）に `TC-008: emits BOTH behind-warning and ahead-warning when diverged` テストが追加されている。`behindCount: 1, aheadCount: 2, designLayerEnabled: true` の組み合わせで両警告（"behind origin/main" と "ahead of origin/main"）が stderr に出ることをアサートしている。

### [LOW] TC-011（should 優先度）: resume path の workspaceOpts に designLayerEnabled が含まれないことのテスト

- **File**: tests/unit/core/command/resume.test.ts
- **Status**: fixed ✅
- **Evidence**: ファイル末尾（line 343–361）に `TC-011: ResumeCommand.prepare() の workspaceOpts.designLayerEnabled は undefined` describe が追加されている。`ResumeCommand.prepare()` が返す `workspaceOpts.designLayerEnabled` が `undefined` であることをアサートし、Non-Goal（resume では ahead 検出しない）を自動固定している。

## Summary

全 3 件の修正が現在のコードで確認済み。regression なし。矛盾なし。
