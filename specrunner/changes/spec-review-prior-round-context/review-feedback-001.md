# Review Feedback — spec-review-prior-round-context (Iteration 1)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ基準 (6 項目)

| AC | 内容 | 結果 |
|----|------|------|
| AC-1 | iteration ≥ 2 の spec-review message に前周 findings と fixer 変更 file 集合が含まれることをテストで固定 | ✓ (TC-001, TC-002, TC-015, TC-020) |
| AC-2 | iteration 1 では注入されないことをテストで固定 | ✓ (TC-003, TC-013, TC-021) |
| AC-3 | OID 解決不能・diff unavailable の場合、注入が省略され step が正常続行 | ✓ (TC-004, TC-005, TC-014, TC-030) |
| AC-4 | 再指摘プロトコル文言（読み直し・不十分理由・全量列挙維持）が注入ブロックに含まれる | ✓ (TC-006, TC-025) |
| AC-5 | 既存テスト（spec-review prompt / routing / finding-recency 系 / step-context-builder）が無改変で green | ✓ 56 tests, 0 fail |
| AC-6 | `typecheck && test` が green | ✓ typecheck: 0 errors; new tests: 45 pass, 0 fail |

### テストケース対応 (31 件)

- **must (24 件)**: TC-001〜008, TC-010〜016, TC-020〜027, TC-028 — 全件 pass
- **should (7 件)**: TC-009, TC-017〜019, TC-029〜031 — 全件 pass

### 設計判断への準拠

| 設計決定 | 実装確認 |
|---------|---------|
| D1: core 層 buildStepContext での導出 | `step-context-builder.ts` ステップ 8 で hook 呼び出し ✓ |
| D2: 宣言的 hook `prepareRoundContext` を AgentStep に追加 | `step-types.ts` に optional method 追加、doc comment で enrichContext との層区別を明示 ✓ |
| D3: `priorRoundContext` を DynamicContext の inline 型で運ぶ | `dynamic-context.ts` に inline 構造型で追加、domain 型 import なし ✓ |
| D4: 3 層分解（純関数 + 配線 + seam）| `prior-round-context.ts` に resolvePriorFixerOid / buildPriorRoundContextBlock / derivePriorRoundContext として実装 ✓ |
| D5: 導出不能なら丸ごと null | iteration<2, OID 欠落, runtimeStrategy 不在, unavailable の 4 パスすべてで null 返却を確認 ✓ |
| D6: 全量列挙規律を弱めない | ブロック内に「免除なし」明記、TC-006 が免除文言の不在を assert ✓ |
| D7: `{{PRIOR_ROUND_CONTEXT}}` placeholder 配線 | テンプレートへの placeholder 追加と `.replace()` 置換を確認 ✓ |

### 寿命（one-shot）検証

`DynamicContext` は `JobState` に含まれない（メモリ上の per-round オブジェクト）ことを確認。TC-007 が state/StepRun への永続化がないことを assert。✓

### 自己申告排除の検証

TC-002 が sentinel ファイルを `listCommitChangedFiles` mock に返させ、`priorRoundContext.changedFiles` が mock の返値と完全一致することを assert（commit diff 由来の機械導出のみ）。✓

## 検証できなかった項目

None。全 AC および全 TC カバレッジを確認済み。

## Findings 詳細

### 全体テストスイートの pre-existing failures

フルスイート（`bun test`）では 1805 failures が報告されるが、本ブランチで変更されたファイル（`git diff main...HEAD --name-only` 21 件）のいずれとも重複しない。finding-recency 系の 4 失敗（`tests/unit/core/step/finding-recency.test.ts` の `vi.mocked` API 問題）は本ブランチに変更なし（`git log --oneline main..HEAD -- tests/unit/core/step/finding-recency.test.ts` = 空）。pre-existing の環境問題であり本 request のスコープ外。

### 観察事項（非ブロッキング）

**`priorRoundContextBlock` 不在時のテンプレートに余白行が残る（cosmetic）**

`SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` 内で `{{PRIOR_ROUND_CONTEXT}}` が独立行にあり、不在時は空文字置換で `<user-request>` 前に空行が残る。LLM への機能的影響はなし。

**`buildStepContext` の dynamicContext guard が正しく機能している**

`if (step.prepareRoundContext && dynamicContext)` — `deps.dynamicContext` が `undefined` の場合 hook を呼ばない。`{ ...undefined, ...extra }` では required な `gitLog` / `diffStat` / `changesList` が欠落した不完全 DynamicContext になるため、この guard は正当。通常パイプラインでは `collectDynamicContext` が完全な `DynamicContext` を返すため実運用での影響なし。
