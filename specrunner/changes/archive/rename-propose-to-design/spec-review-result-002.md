# Spec Review: rename-propose-to-design (iteration 2)

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-13

## Summary

前回 (iteration 1) の指摘 F1・F2 はすべて反映済み。design.md の影響範囲テーブルに `pipeline-run.ts` / `pipeline/index.ts` / `core/types.ts` が追加され、tasks.md に Task 15c が新設されている。

設計方針（D3 on-read remap / D4 config alias / D6 ハードコード対処）は合理的。18 タスクの分解は機能的参照をすべてカバーし、Task 16d の catch-all grep と Task 18 の検証ステップで漏れを防ぐ構造になっている。

## Findings

### F1 [completeness / INFO] コメント内のステップ名参照が影響範囲テーブルに含まれていない

以下のファイルにコメント/JSDoc でステップ名 `"propose"` を参照する箇所がある:

- `src/core/step/types.ts` L49 `"Used by propose, spec-fixer, ..."`, L63 `(e.g. "propose", "spec-review")`, L131 `(e.g., propose)`
- `src/core/port/session-client.ts` L22 `"pushed by propose"`, L55 `"propose-style steps"`, L64 `"Injected into the propose"`
- `src/core/step/spec-review.ts` L17 `"does NOT reuse the propose Agent"`
- `src/adapter/managed-agent/agent-runner.ts` L89, L97, L107, L111, L122 のコメント

いずれも機能的参照ではなくコメントのみ。受け入れ基準の除外条件（「コメント内の一般的な用法」）に該当するか微妙だが、Task 18 の grep 検証で implementer が判断できる。タスク追加は不要。

### F2 [architecture / OK] D3 on-read remap 方式

既存の `status === "success"` → `"awaiting-merge"` パターンと同一レイヤ。遷移テーブル汚染を回避する正しい設計判断。

### F3 [architecture / OK] D4 config 後方互換

`CAMEL_TO_KEBAB` に `propose: "design"` エイリアスを残す方式は、ディスク上の旧 config を in-memory でリマップする既存フローと整合。

### F4 [correctness / OK] `runProposeStyle` メソッド名のリネーム

Task 12a で `runProposeStyle` → `runDesignStyle` が明記されており、L98 の `role === "propose"` 分岐も対象。カバー済み。

### F5 [correctness / OK] StepName union 変更の型安全性

Task 4 で `StepName` から `"propose"` を除去すると、未更新の `"propose"` リテラルは即座に型エラーになる。Task 18 の `bun run typecheck` で全箇所が検出される。安全。

## Action Required

なし。
