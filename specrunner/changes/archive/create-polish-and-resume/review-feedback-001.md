# Code Review — create-polish-and-resume — Iteration 1

## Summary

全体的に設計に忠実な実装。1-shot コードの削除、`--resume` 2 層復帰、slug 対話生成、SIGINT ハンドリング、`--run` 対応の全要件が実装済み。テストは 33 ケースが green。1 件の MEDIUM correctness 問題（slug collision 時に LLM へのフィードバックが欠落）を除き、品質は良好。

## Scores

| Category | Score | Weight | Rationale |
|----------|-------|--------|-----------|
| correctness | 7 | 0.30 | slug collision ���の LLM フィードバック欠落。仕様準拠だが edge case のハンドリングが不完全 |
| security | 9 | 0.25 | 問題なし。ユーザー入力の slug は slugify でバリデーション済み |
| architecture | 8 | 0.15 | ファサードパターン適切。責務分離明確。create.ts → create-dialog.ts の委譲が clean |
| performance | 8 | 0.10 | 不要な処理なし。DynamicContext/patterns の並列取得も維持 |
| maintainability | 7 | 0.10 | SIGINT handler 内の DraftState 構築が 3 箇所に重複。関数抽出で改善可能 |
| testing | 8 | 0.10 | 全 must シナリオ網羅。TC-PR-010/011 は直接の SIGINT テストではなく間接検証だが許容範囲 |

**Total: 7.75** (pass threshold: 7.0)

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | src/core/command/create-dialog.ts:497-513 | slug collision 検出時に `collisionMsg` を構築するが `void collisionMsg` で破棄している。LLM は collision を知らないため、次ターンで同じ slug を再提案する可能性がある。stderr 通知はユーザーには見えるが LLM には届かない | collision 時は `textBuffer` に rejection メッセージを残す代わりに、rl.question でユーザーに「slug が衝突しています。LLM に別の slug を依頼してください」と表示するか、generator に inject 可能な仕組みを設ける。現状は 3 ターン fallback があるため致命的ではないが、UX が劣化する |
| 2 | MEDIUM | maintainability | src/core/command/create-dialog.ts:295-314,319-332,335-350 | DraftState 構築ロジックが sigintHandler、onExit、rl.close の 3 箇所に完全重複している | `buildCurrentDraftState()` ヘルパーを抽出し、3 箇所から呼び出す |
| 3 | LOW | correctness | src/core/command/create-dialog.ts:295-314 | SIGINT handler 内で `saveDraft()` の Promise が pending の間、2 回目の SIGINT が入ると handler が再入する。saveDraft が 2 回呼ばれ得る | handler 冒頭で `process.removeListener("SIGINT", sigintHandler)` を呼んで再入を防止する |
| 4 | LOW | maintainability | src/core/command/create-dialog.ts:370-389 | hot resume 用の `hotResumeGenerator` が `createPromptGenerator` と重複するユーザー入力ループを持つ。exit/quit 判定・onExit 呼び出しのロジックが 2 箇所に分散 | 共通のユーザー入力ループを抽出するか、createPromptGenerator に resume モード用の initialMessage を渡す形に統一する |
| 5 | LOW | correctness | bin/specrunner.ts:180 | `specrunner create --resume`（slug 値なし）の��合、`createResume` は undefined のまま。description も未指定だとエラーメッセージが「requires a \<description\> argument」になり、`--resume` の slug 忘れが分かりにくい | エラーメッセージに `--resume` の usage ヒントを含める（実装済みの 3 行目にあるが、description 未指定 + resume 未指定の場合にのみ表示される） |

## Verdict

- **verdict**: approved

CRITICAL: 0, HIGH: 0, Total: 7.75 ≥ 7.0

MEDIUM の 2 件は品質改善として推奨するが、機能としては正しく動作し、3 ターン fallback がセーフティネットとして機能するため承認を阻害しない。
