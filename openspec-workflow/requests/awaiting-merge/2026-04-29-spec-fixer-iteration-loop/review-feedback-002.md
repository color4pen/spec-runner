## Code Review Result

**Verdict**: approved
**Score**: 7.80 / 10.0 (pass threshold: 7.0)
**Iteration**: 2/2
**Trend**: improving (+0.35 from 7.45)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **7.80** |

CRITICAL: 0, HIGH: 0 → verdict is `approved` per the auto-approve rule (Total ≥ 7.0 AND no CRITICAL/HIGH).

### Verification Summary

| Phase | Result | Details |
|-------|--------|---------|
| Build | PASS | tsc emit succeeded |
| Type Check | PASS | 0 errors |
| Lint | SKIP | no lint script defined in package.json |
| Tests | PASS | 168/168 (25 files) |
| Security | PASS | 0 vulnerabilities (npm audit) |

**Overall**: READY

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | security | src/core/steps/spec-fixer.ts:12-35 | (Carry-over from iter 1 #6, deferred). `<user-request>` で囲んだ initial message に `slug` / `branch` / `findingsPath` が直接埋め込まれる。`branch` 名や `slug` に閉じタグ `</user-request>` 文字列・改行・XML 特殊文字が含まれた場合 prompt injection が成立しうる。Git の branch 名は通常改行を含めないが、API レイヤで明示検証していない。 | `slug` / `branch` / `findingsPath` を XML 埋め込み前に validate するヘルパを `src/core/sanitize.ts` に追加（改行・XML 特殊文字・`</user-request>` 文字列を含むものは reject）。同様の検証を spec-review.ts にも適用。 |
| 2 | MEDIUM | testing | tests/spec-review-step.test.ts | 新たに追加された fail-fast path（`getAgentId` 例外で `failJobState` + `pushStepResult` + rethrow）に対するユニットテストが無い。iter 1 #1 の修正で挙動が変わったが、回帰テストで保護されていない。 | tests/spec-review-step.test.ts に「config に agent.id も agents.propose.id も無い場合、`runSpecReviewStep` が CONFIG_INCOMPLETE を投げ、err.state.steps['spec-review'] に error 付き StepResult が記録される」テストを追加。 |
| 3 | MEDIUM | testing | tests/init.test.ts vs tasks.md 3.6/3.7 | (Carry-over from iter 1 #7, deferred). tasks 3.3-3.7（init.ts の post-init 不変条件チェック追加、spec-fixer Agent の冪等作成・update テスト）が `[ ]` 未完了。3.6/3.7 は unit/integration レベル（モックされた Anthropic API で検証可能）。 | tests/init.test.ts に「spec-fixer Agent が新規作成される」「ハッシュ不一致で update される」「retrieve 404 で再作成される」の 3 ケースを追加。 |
| 4 | MEDIUM | consistency | openspec/changes/spec-fixer-iteration-loop/test-cases.md (TC-001/002/003 etc.) | (Carry-over from iter 1 #8, deferred). test-cases.md は `[iter 1/2] spec-review verdict: approved → done` 形式で stdout 検証を要求しているが、design.md D10 の正式仕様は「verdict 行は `[iter N]`、開始/exhaust 行は `[iter N/MAX]`」で実装が design に従っている。test-cases.md の方が誤り。 | test-cases.md の TC-001/002/003 等の THEN 文字列から verdict 行の `/2` を削除。 |
| 5 | LOW | maintainability | src/core/steps/spec-fixer.ts:92 | (Carry-over from iter 1 #9, deferred). `const effectiveBranch = branch ?? "main";` — propose 成功後は branch が必ず登録されているはずなので、ここの "main" フォールバックは事実上 dead path。発火した場合 spec-fixer が main を直接 push することになり危険。 | `if (!branch) throw new SpecRunnerError("BRANCH_NOT_REGISTERED", ...);` で fail-fast。 |
| 6 | LOW | maintainability | src/core/steps/spec-fixer.ts:180-184 | (Carry-over from iter 1 #10, deferred). `wrappedErr` を素 `Error` で組み立てている。プロジェクト規約は `SpecRunnerError` を投げて runRunCore で `instanceof` チェック。この箇所だけ素 Error なので runRunCore の `if (err instanceof SpecRunnerError)` 分岐に乗らず、fallback パスへ落ちる。 | `throw new SpecRunnerError(errorInfo.code, errorInfo.message, errorInfo.hint)` に置換し、state は `(err as Record<string, unknown>)["state"] = state` 方式（spec-review.ts と同じ）に統一。 |
| 7 | LOW | testing | openspec/changes/spec-fixer-iteration-loop/test-cases.md TC-054 | (Carry-over from iter 1 #11, deferred). TC-054 は `must` priority だが `manual` category で未実装。形式上「must かつ未実装」が残る。 | TC-054 の priority を `should` に下げる、または「manual must」が許容される旨を summary に明記。 |
| 8 | LOW | maintainability | src/core/completion.ts:45 | (Carry-over from iter 1 #12, deferred). `tsc --noUnusedParameters` で `'attempt' is declared but its value is never read.` 検出。本 PR の責務外だが variant チェックで露出。 | `_attempt` にリネームするか、引数自体を削除。本 PR の責務外なら follow-up issue として記録（推奨）。 |

### Iteration Comparison

#### Improvements (前回から改善)

| Prev # | Severity | Category | Description | Status |
|--------|----------|----------|-------------|--------|
| 1 | HIGH | correctness | spec-review.ts の `getAgentId` catch で空文字 fallback | **Fixed**. catch で `failJobState` + `pushStepResult(error)` + persist + rethrow に変更。他の error handler（SESSION_CREATE_FAILED 等）と対称になり、CONFIG_INCOMPLETE が surface される。 |
| 2 | HIGH | architecture | pipeline.ts onExceeded の in-place mutation | **Fixed**. `state.steps[...]` への直接代入、`state.error` / `state.updatedAt` への直接代入を削除。spread + 新規配列構築で純粋関数パターンに統一。MEDIUM #4（nnn が maxIterations を参照していた問題）も同時修正。 |
| 3 | HIGH | consistency | propose.ts に残っていた `appendStepResult` × 4 箇所 | **Fixed**. propose.ts の 4 箇所を `pushStepResult` に置換、import 元を `helpers.ts` に切り替え、schema.ts から `appendStepResult` export を削除、TC-024 を `pushStepResult` 用に書き換え。design D7 / tasks 2.3 に完全準拠。 |
| 4 | MEDIUM | correctness | onExceeded の nnn が maxIterations を参照 | **Fixed**. #2 修正と同時に対応。`specReviewResults[last].iteration` を参照するよう変更。 |
| 5 | MEDIUM | maintainability | spec-review-system.ts の未使用 export | **Fixed**. `SPEC_REVIEW_SYSTEM_PROMPT` を非 export 化（`const` のみ）、`buildSpecReviewSystemPrompt` は将来の専用 Agent 化向けにコメント付きで保留。出力先パスのハードコードも「user message が指定するパスへ書け」に修正。 |

#### Regressions (前回から悪化)

なし。修正による副作用は検出されなかった。test 168/168 PASS、build/typecheck PASS、security 0 vulns。

#### Unchanged Issues (前回 must-fix で未対応)

| Prev # | Severity | Category | Reason for Defer |
|--------|----------|----------|------------------|
| 6 | MEDIUM (security) | XML インジェクション (spec-fixer.ts) | code-fixer により deferred（sanitize.ts 追加は設計議論を要する） |
| 7 | MEDIUM (testing) | init.test.ts 3.6/3.7 テスト追加 | code-fixer により deferred（src 側実装変更を伴う可能性） |
| 8 | MEDIUM (consistency) | test-cases.md `/2` 削除 | code-fixer により deferred（openspec/changes/ 配下、code-fixer のスコープ外） |
| 9 | LOW (maintainability) | spec-fixer.ts "main" fallback | code-fixer により deferred（LOW、HIGH 集中のため） |
| 10 | LOW (maintainability) | spec-fixer.ts SpecRunnerError 統一 | code-fixer により deferred（LOW、HIGH 集中のため） |
| 11 | LOW (testing) | TC-054 priority 変更 | code-fixer により deferred（設計ドキュメント、スコープ外） |
| 12 | LOW (maintainability) | completion.ts 未使用 param | code-fixer により deferred（本 PR の変更対象外ファイル） |

これらはすべて MEDIUM/LOW で承認阻止条件に該当しない。code-fixer の deferred 判断は妥当（特に test-cases.md と completion.ts はファイルスコープ外）。残った MEDIUM 3 件は本 PR とは別 follow-up または次 iteration での対応が現実的。

### Summary

- **収束**: 3 件の HIGH（spec-review.ts silent fallback / pipeline.ts mutation / propose.ts appendStepResult 残置）が iter 1 → iter 2 ですべて解消。MEDIUM #4 も付随修正された。Total スコア 7.45 → 7.80（+0.35、improving）。
- **修正の質**: 単なる patch ではなく構造的に正しい方向への修正。spec-review.ts の error handler は他の handler と対称、pipeline.ts の onExceeded は project の immutable pattern に統一、appendStepResult 完全削除で design D7 と一致。
- **残留事項**: MEDIUM 3 件（spec-fixer.ts の XML 検証、init.test.ts の 3.6/3.7 テスト、test-cases.md の `/2` 不整合）と LOW 4 件。すべて承認阻止条件外で、本 PR では deferred / follow-up とすることが妥当。特に spec-fixer.ts 関連の 3 件（#1/#5/#6）は branch/slug 検証と SpecRunnerError 統一を含めて単一の小 PR にまとめる follow-up が望ましい。
- **承認理由**: HIGH/CRITICAL なし、Total ≥ pass threshold (7.0)、improving trend、no regressions。verdict は `approved`。
