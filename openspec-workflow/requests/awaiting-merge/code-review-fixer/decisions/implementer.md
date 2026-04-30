# Implementer Decisions — code-review-fixer

## Format: `決定 :: 理由`

---

`parseReviewVerdict` を `src/core/parser/review-verdict.ts` に pure 関数として抽出する :: spec-review と code-review の 2 ヶ所で同一 regex が必要になり rule of three を満たすため。wrapper `parseSpecReviewVerdict` は 1 行に縮小し call site 互換を保つ。

`CODE_FIXER_NO_REVIEW_RESULT` を `src/core/step/code-fixer.ts` に export 定数として定義する :: `BUILD_FIXER_NO_VERIFICATION_RESULT` が `build-fixer.ts` 内で定義されているパターンと完全対称にするため。`src/errors.ts` への集約は既存パターンに倣わないので採用しない。

`STANDARD_TRANSITIONS` の `verification --passed→ end` を `verification --passed→ code-review` に置き換える :: design.md の「verification passed の後段に code-review loop を追加する」要件を満たすため。既存 pipeline.test.ts / pipeline-integration.test.ts の期待値を code-review 経由の新フローに合わせて更新。

`Pipeline` constructor の `loopNames` 既定値を `run.ts` 側で `["spec-review", "verification", "code-review"]` に設定する :: `Pipeline` クラス自体のデフォルトは `[this.loopName]` のままにして変更を最小限にする。配線は `run.ts` で行い、設計 D8 と整合。

`buildMockPipeline` テストヘルパーに code-review / code-fixer ステップを追加する :: STANDARD_TRANSITIONS に code-review が含まれるようになったため、mock pipeline が `Step not found: code-review` エラーを出すのを防ぐ。code-review は常に approved を返すデフォルト実装を追加。

`pipeline-integration.test.ts` の `createSession` 呼び出し回数期待値を 3 → 4 に変更する :: verification 後に code-review セッションが追加されるため。code-review agent が session を 1 回消費する。

`tests/init.test.ts` の TC-059 / TC-041 を 7 agent 対応に更新する :: `init.ts` が code-review / code-fixer を含む 7 steps で registry を構築するようになったため。既存 5 roles のみ pre-populate していたテストが create を期待しなかったが、2 新 roles の create が発生する。

`computeCodeReviewIteration` を `code-review.ts` の private 関数として置く :: `spec-review.ts:50-52` の `computeSpecReviewIteration` と完全対称。module-analysis.md で「YAGNI — 抽出不要」と判断されており採用。

`completionVerdict: "approved"` を `CodeFixerStep` に明示的に書く :: `types.ts` のデフォルト挙動（`resultFilePath === null` の場合に `"approved"` が返る）に依存せず、将来のデフォルト変更からの breakage を防ぐ。module-analysis.md R6 の推奨を採用。
