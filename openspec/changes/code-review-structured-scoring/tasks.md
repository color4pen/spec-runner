## 1. スコアテーブルパーサーの実装

- [x] 1.1 `src/core/parser/review-scores.ts` を新規作成。`ReviewScores` interface と `parseReviewScores(content: string): ReviewScores | null` を実装する。パースロジック: `## Scores` セクション配下の markdown テーブルから Category / Score / Weight を抽出し、`- **total**: <number>` 行から total を抽出する。テーブルまたは total が見つからない場合は null を返す
- [x] 1.2 `tests/unit/parser/review-scores.test.ts` を新規作成。正常パース、テーブルなし、total なし、不正な Score 値、カテゴリ欠落のケースをテスト
- [x] 1.3 `bun run typecheck` が通ることを確認

## 2. Findings severity カウンターの実装

- [x] 2.1 `src/core/parser/review-findings.ts` を新規作成。`FindingSeverityCounts` interface と `parseFindingSeverityCounts(content: string): FindingSeverityCounts` を実装する。パースロジック: `## Findings` セクション配下の markdown テーブルから Severity 列を読み取り、CRITICAL / HIGH / MEDIUM / LOW の件数をカウントする。テーブルがない場合は全カウント 0 を返す
- [x] 2.2 `tests/unit/parser/review-findings.test.ts` を新規作成。正常カウント、テーブルなし、mixed severity、CRITICAL のみ、severity 値の大文字小文字バリエーションのケースをテスト
- [x] 2.3 `bun run typecheck` が通ることを確認

## 3. ParsedStepResult の拡張

- [x] 3.1 `src/core/step/types.ts` に `ReviewScores` と `FindingSeverityCounts` を import し、`ParsedStepResult` に `scores?: ReviewScores & { criticalCount: number; highCount: number }` フィールドを追加する
- [x] 3.2 既存の `NULL_PARSE_RESULT` は変更不要（`scores` は optional のため）
- [x] 3.3 `bun run typecheck` が通ることを確認

## 4. CodeReviewStep.parseResult() の拡張

- [x] 4.1 `src/core/step/code-review.ts` に `parseReviewScores` と `parseFindingSeverityCounts` を import する
- [x] 4.2 `parseResult()` 内で `parseReviewScores(content)` と `parseFindingSeverityCounts(content)` を呼び出し、スコアが取得できた場合は `determineVerdict()` で CLI verdict を判定する
- [x] 4.3 `determineVerdict()` を `src/core/step/code-review.ts` 内の非公開関数として実装する。ロジック: escalation はそのまま採用、スコアなしは agent verdict にフォールバック、スコアありは CLI verdict と agent verdict の厳しい方を採用
- [x] 4.4 `ParsedStepResult.scores` に `ReviewScores` + severity カウントをセットする
- [x] 4.5 `bun run typecheck` が通ることを確認

## 5. code-review system prompt の拡張

- [x] 5.1 `src/prompts/code-review-system.ts` の Output Format セクションに Scores テーブルのフォーマット例を追加する。review-standards.md の default weight（correctness: 0.30, security: 0.25, architecture: 0.15, performance: 0.10, maintainability: 0.10, testing: 0.10）を記載する
- [x] 5.2 既存の Findings テーブルフォーマットは変更しない

## 6. verdict 判定のテスト

- [x] 6.1 `tests/unit/step/code-review-verdict.test.ts` を新規作成。以下のケースをテスト:
  - スコア >= 7.0 + CRITICAL=0 + HIGH=0 + agent approved → approved
  - スコア >= 7.0 + CRITICAL=0 + HIGH=0 + agent needs-fix → needs-fix（厳しい方）
  - スコア < 7.0 + agent approved → needs-fix（CLI が上書き）
  - CRITICAL >= 1 + agent approved → needs-fix（CLI が上書き）
  - HIGH >= 1 + agent approved → needs-fix（CLI が上書き）
  - agent escalation → escalation（スコアに関係なく）
  - スコアテーブルなし + agent approved → approved（フォールバック）
  - スコアテーブルなし + agent needs-fix → needs-fix（フォールバック）
  - スコアテーブルなし + verdict 行なし → escalation（既存の挙動）

## 7. 最終検証

- [x] 7.1 `bun run typecheck` が green
- [x] 7.2 `bun run test` で全テスト pass
- [x] 7.3 `grep -r "parseReviewScores\|parseFindingSeverityCounts" src/` で import が正しく配線されていることを確認
