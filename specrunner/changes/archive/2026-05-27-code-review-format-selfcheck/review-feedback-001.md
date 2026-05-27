# Code Review: code-review-format-selfcheck

- **verdict**: approved

## Summary

`CodeReviewStep` への `followUpPrompt` 追加は正確に実装されており、受け入れ基準を全て満たしている。out-of-scope な変更が 2 件あるが、いずれも MEDIUM 以下。

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | ScopeCreep | specrunner/specs/cli-commands/spec.md, specrunner/specs/verbose-execution-log/spec.md | delta-spec-fixer が authority baseline spec を直接編集した。rules.md「`specrunner/specs/` の PR 内での直接編集は全 step で禁止」に違反。これらの内容は既に main (#434/#435) に存在するため、マージ時にコンフリクトが発生する可能性がある | `specrunner finish` 時の `mergeSpecsForChange` に委ねるのが正規経路。ただし同一内容が main にすでに存在するため、コンフリクト解消は diff 確認後にどちらを採用するかを判断すれば足りる | no |
| 2 | LOW | ScopeCreep | src/cli/managed.ts | `stderrWrite` → `logResult` へ変更（build-fixer による）。本 request のスコープ外だが、テスト `5-h` が `process.stdout.write` を期待していたため必要な修正。セマンティクス（result メッセージ → stdout）も正しい | 変更不要 | no |

## Acceptance Criteria Check

| # | 受け入れ基準 | 結果 |
|---|------------|------|
| 1 | code-review step 定義に `followUpPrompt` が追加されている | ✅ `src/core/step/code-review.ts` L115–136 |
| 2 | テーブル形式 / 必須カラム / Fix カラム / verdict 整合性を確認する指示を含む | ✅ 5 項目すべて網羅 |
| 3 | 違反時に出力ファイルを修正し、違反なしなら end_turn する指示がある | ✅ L134–136 |
| 4 | `bun run typecheck && bun run test` が green | ✅ 269 test files passed |

## Test Case Coverage (must scenarios)

| TC | Category | Result |
|----|----------|--------|
| TC-001 | followUpPrompt プロパティ存在 | ✅ string 型で定義済み |
| TC-002 | テーブル形式確認指示 | ✅ L119–120 |
| TC-003 | 必須カラム確認指示（7 カラム） | ✅ L121–122 |
| TC-004 | Fix カラム yes/no 確認指示 | ✅ L123–124 |
| TC-005 | verdict 整合性チェック指示 | ✅ L125–128 |
| TC-006 | severity 定義準拠チェック指示 | ✅ L129–133 |
| TC-007 | 違反時修正指示 | ✅ L134 |
| TC-008 | 違反なし時 end_turn 指示 | ✅ L135–136 |
| TC-011 | typecheck green | ✅ |
| TC-012 | test green | ✅ |

## Review Notes

### 実装品質

- `followUpPrompt` の内容は tasks.md の仕様と完全一致
- `[...].join("\n")` 形式で design.ts パターンを踏襲
- executor L138 の `step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt` チェーンで自動ピックアップされる（executor 変更不要）

### スコープ制限遵守

- `src/prompts/fragments.ts`: 変更なし ✅
- `src/prompts/code-review-system.ts`: 変更なし ✅
- `parseFixableFindings` ロジック: 変更なし ✅
- verdict CLI 側再計算: なし ✅

### finding #1 補足

delta-spec-fixer が `specrunner/specs/` 直下を編集したのはパイプライン動作上の既知課題。`cli-commands/spec.md` の追加内容（exit 2 変更、ログレベル要件）および `verbose-execution-log/spec.md` は PR #434/#435 で main に取り込み済みのため、マージ時の内容重複によるコンフリクトが予想される。マージ前に `git merge-base` 差分を確認してコンフリクト解消することを推奨する。コア機能（code-review followUpPrompt）には影響なし。
