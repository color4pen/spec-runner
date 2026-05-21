# Spec Review Result: centralize-step-name-constants (Round 2)

- **reviewer**: spec-reviewer
- **date**: 2026-05-13
- **verdict**: approved

## Summary

Review-001 の 6 件の指摘がすべて反映されている。design.md に D10（agent.role 定数化）を追加、File Impact Map に `pipeline.ts` / `pipeline-run.ts` を追加、Task 3 の scope を拡大、Task 5 に `runDesignPipeline` を追記、Task 10 に `result["design"]` を追記。実コードベースの grep 結果（26 ファイル）と spec のカバレッジが一致している。

## Architecture (verify)

**判定: pass**

- D1: `src/core/step/step-names.ts` の配置は step 定義の凝集地であり適切
- D2: `as const` + `typeof STEP_NAMES[keyof typeof STEP_NAMES]` による型導出は TypeScript の標準パターン。手動 union 廃止は正しい
- D3-D8: computed property、制御値 `"end"`/`"escalate"` の除外、後方互換 `"propose"` の除外はすべて妥当
- D10（新規）: `agent.role` が step name と同値であることを明示し、定数化対象に含める方針は grep 網羅性と整合
- 依存方向: `step-names.ts` は leaf module。全ファイルが一方向に import。循環リスクなし

## Correctness (verify)

**判定: pass**

### Review-001 指摘の反映確認

| # | Finding | 判定 |
|---|---------|------|
| 1 | `pipeline.ts` 欠落 | ✓ design.md File Impact Map + Task 11 に追加済み |
| 2 | `pipeline-run.ts` 欠落 | ✓ design.md File Impact Map + Task 11 に追加済み |
| 3 | Task 5 の `runDesignPipeline` 未カバー | ✓ Task 5 に追記済み |
| 4 | Task 3 の scope が `name:` のみ | ✓ 追加スコープ（role, state.steps, getLatestStepResult, branchNotSetError）を明記 |
| 5 | Task 10 の `result["design"]` キーアクセス | ✓ Task 10 に追記済み |
| 6 | `agent-runner.ts` の role 比較 | ✓ D10 + Task 11 でカバー |

### コードベースとの照合

`src/` 内の全 `.ts` ファイルに対して step-name 文字列リテラルを grep し、26 ファイルがヒット。design.md File Impact Map + tasks.md のカバレッジと照合した結果:

- **24 ファイル**: File Impact Map + Tasks でカバー済み
- **2 ファイル**: `src/core/step/types.ts` と `src/config/step-config.ts` — JSDoc コメント内のみ（`e.g. "design"` 等）。プログラム的な文字列リテラルなし。コード変更不要のため tasks から正しく除外されている

### 軽微な注記（non-blocking）

Task 12 の grep 検証で上記 2 ファイルの JSDoc コメントが false positive としてヒットする。implementer はコメント行として識別して除外できるため、タスク分解の問題ではない。

## Completeness (simplified — task decomposition coverage only)

**判定: pass**

- Task 1-12 が全 24 対象ファイルをカバー
- Task 3 の追加スコープにより、step 定義ファイル内の全パターン（name, role, state.steps, getLatestStepResult, branchNotSetError）が明記されている
- Task 11 の「Scan and update remaining files」が catch-all として機能し、Task 12 の grep safety net で未置換を検出可能
- スコープ除外（テストファイル、`"propose"` 後方互換リマップ、`"end"`/`"escalate"` 制御値）が明確に定義されている

## Required Actions

なし。
