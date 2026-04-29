# Code Fixer Decisions

## Fix History (iteration 1 → review-feedback-001.md)

### #1 HIGH — spec-review.ts silent fallback to empty agent ID

`getAgentId` の catch で空文字 fallback を削除し、例外をキャッチして `failJobState` + `pushStepResult` + `persistJobState` を呼び出した後に再スローする形に変更する :: `""` を渡すと API がエラーを返すまでサイレントに進むため、CONFIG_INCOMPLETE を明示的に surface させる必要がある。spec-review.ts の他のエラーハンドリングパターン（SESSION_CREATE_FAILED 等）と対称に揃える。

### #2 HIGH — pipeline.ts onExceeded in-place mutation

`s.steps["spec-review"]` 配列要素への直接代入、`s.error`、`s.updatedAt` の直接代入をすべて削除し、spread operator で新しいオブジェクトを構築して返す形に変更する :: プロジェクト全体が pushStepResult / updateJobState / failJobState による pure function パターンで一貫している。in-place mutation はスナップショットを保持する呼び出し元（テスト・persist後の retain）で潜在バグになる。また MEDIUM #4（nnn が maxIterations を参照していた問題）も同時に修正し、実際の最終 iteration 番号を使うよう変更した。

### #3 HIGH — propose.ts appendStepResult → pushStepResult 移行

propose.ts の 4 箇所の `appendStepResult` 呼び出しをすべて `pushStepResult` に置換し、import を `schema.ts` から `helpers.ts` に切り替える :: design.md D7 / tasks.md 2.3 の設計合意に従う。propose は単一実行なので機能上の影響はないが、設計との不整合を解消する。

### #3 付随 — schema.ts appendStepResult export 削除、TC-024 移行

`appendStepResult` を src/ の全呼び出し元が `pushStepResult` に移行済みになったため、schema.ts から export を削除する :: 残置すると将来の誰かが deprecated 関数を再利用するリスクがある。tests/schema.test.ts の TC-024 は `pushStepResult` を使ったテストに書き換えた。

### #4 MEDIUM — onExceeded の nnn が maxIterations を参照していた問題

`#2` の修正内で同時対応。実際の最終 iteration 番号（`specReviewResults[last].iteration`）を使うよう変更 :: maxIterations=3 で iter=2 にエスカレーションした場合、ヒントが spec-review-result-003.md を指すが実際のファイルは 002.md になる問題を防ぐ。

### #5 MEDIUM — spec-review-system.ts 未使用 export

`SPEC_REVIEW_SYSTEM_PROMPT` を非 export（`const` のみ）に変更し、`buildSpecReviewSystemPrompt` は export を維持しつつ「現状未使用、将来専用 Agent 化時に wired up」のコメントを追加する。出力先パスのハードコードも「user message が指定するパスへ書け」に修正する :: 削除よりもコメント付き保留のほうが将来の実装者への意図が明確になる。export を残すことで import エラーを起こさず、かつ意図が伝わる。

## Deferred

- **#6 MEDIUM (security)**: spec-fixer.ts の branch/slug/findingsPath の XML インジェクション検証 — スコープ外ファイル（spec-fixer.ts）への変更になるが、今回の review-feedback-001 の修正対象ファイルとして列挙されているため次 iteration で対応可能。ただし本 PR の主題（iteration loop）との直接関係が薄く、sanitize.ts 追加は設計議論を要する。
- **#7 MEDIUM (testing)**: init.test.ts への 3.6/3.7 テスト追加 — 実装（src/core/init.ts 等）の変更を伴う可能性があり、code-fixer の「スコープ外変更なし」制約に抵触する可能性がある。
- **#8 MEDIUM (consistency)**: test-cases.md の `/2` 削除 — `openspec/changes/` 配下の設計ドキュメントへの変更であり code-fixer のスコープ外。
- **#9 LOW**: spec-fixer.ts の "main" フォールバック削除 — LOW severity、今回の HIGH 3 件の修正に集中。
- **#10 LOW**: spec-fixer.ts の SpecRunnerError 統一 — LOW severity、同上。
- **#11 LOW**: test-cases.md TC-054 priority 変更 — 設計ドキュメントへの変更でスコープ外。
- **#12 LOW**: completion.ts の `attempt` 未使用パラメータ — 本 PR の変更対象外ファイル。
