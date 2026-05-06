## Why

PR #80/84 で導入した local runtime の初回 dogfood（2026-05-05）で 3 件のインフラバグと 1 件の既知 issue（#77）が表面化した。応急処置を全テストなしで main に push した結果 TC-003 fail 状態で dogfood が走り PR #88 が汚染された。応急処置は revert 済み（364cc45）であり、正しい形で再実装する必要がある。

## What Changes

- **executor.ts local runtime path**: `resultContent === null` のとき `step.completionVerdict` を verdict として使用する fallback を追加（managed runtime path には影響しない）
- **AgentStep に `setsBranch` フラグ追加**: propose 完了後に `state.branch` を設定するロジックを step 名ハードコードではなく宣言的フラグで汎化する
- **review-verdict parser の寛容化**: `**Verdict**:` (大文字 V)、`- ` prefix なし、bold なし等のフォーマット揺れに対応する
- **finish preflight MERGED bypass**: Phase 0 check 4 で `mergeStateStatus=UNKNOWN` かつ `state=MERGED` の場合に UNKNOWN retry をスキップして成功を返す

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `step-execution-architecture`: AgentStep に `setsBranch?: boolean` フィールドを追加し、executor の local runtime path で `step.setsBranch && !jobState.branch` のとき branch を自動設定する。completionVerdict fallback ロジックも追加
- `cli-finish-command`: Phase 0 check 4 に MERGED PR 例外を追加（MERGED 時は UNKNOWN retry をスキップ）

## Impact

- **src/core/step/types.ts**: `AgentStep` interface に `setsBranch` フィールド追加
- **src/core/step/executor.ts**: local runtime path に completionVerdict fallback + setsBranch ロジック追加
- **src/core/step/propose.ts**: `ProposeStep` に `setsBranch: true` と `completionVerdict: "success"` を設定
- **src/core/parser/review-verdict.ts**: regex を拡張して複数フォーマットにマッチ
- **src/core/finish/preflight.ts**: check 4 の UNKNOWN retry 前に MERGED 判定を挿入
- **既存テスト**: TC-003（step 名ハードコードなし）が green であること必須。finish-orchestrator.test.ts の MERGED モック修正
