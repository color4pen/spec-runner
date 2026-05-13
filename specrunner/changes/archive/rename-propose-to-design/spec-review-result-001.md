# Spec Review: rename-propose-to-design (iteration 1)

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-13

## Summary

設計方針は的確。on-read remap (D3) による後方互換、config エイリアス (D4) の backward compat、遷移テーブルの汚染回避判断はすべて合理的。18 タスクのリネーム分解は丁寧。

ただし影響範囲テーブルとタスク分解に 1 件の **漏れファイル** がある。

## Findings

### F1 [correctness / HIGH] `src/core/command/pipeline-run.ts` が設計・タスクの両方から漏れている

design.md の「変更対象ファイル」テーブルと tasks.md のどちらにも `src/core/command/pipeline-run.ts` が記載されていない。このファイルには以下の step 名参照がある:

- **L46**: `logInfo("Starting propose pipeline for: ...")` — ログメッセージ
- **L74**: `startStep: "propose"` — StepName 型の文字列リテラル（機能的参照）

`startStep: "propose"` は Task 4 で StepName union から `"propose"` を削除した時点で型エラーになる。typecheck (Task 18) で検出はされるが、タスク分解に含まれていないため implementer が設計書に従って作業すると漏れる。

**修正案**: design.md の影響範囲テーブルに追加し、tasks.md に専用タスクまたは既存タスク（Task 15 のエラーメッセージ系が適切）に行を追加する。

### F2 [completeness / LOW] `src/core/pipeline/index.ts` の re-export がタスクで明示されていない

Task 6 で `runProposePipeline` → `runDesignPipeline` にリネームするが、`src/core/pipeline/index.ts` L5 の re-export:

```ts
export { runPipeline, runProposePipeline, createStandardPipeline } from "./run.js";
```

が明示的タスクとして記載されていない。Task 17 の `grep -r "runProposePipeline" src/` で暗黙的にカバーされるため実害は低いが、design.md の影響範囲テーブルには記載すべき。

同様に `src/core/types.ts` L52 のコメント内 `runProposePipeline` 参照もテーブルに含めると網羅的になる。

### F3 [architecture / OK] D3 の on-read remap 方式

`validateJobState()` での on-read remap は既存の `status === "success"` → `"awaiting-merge"` パターンと整合しており、遷移テーブル汚染を避ける正しい判断。問題なし。

### F4 [architecture / OK] D4 の config 後方互換

`CAMEL_TO_KEBAB` に `propose: "design"` エイリアスを残す方式は backward compat として適切。

## Action Required

- **F1**: design.md の影響範囲テーブルと tasks.md に `src/core/command/pipeline-run.ts` を追加する
- **F2**: design.md のテーブルに `src/core/pipeline/index.ts` と `src/core/types.ts` を追加する（タスクは Task 17 でカバー済み）
