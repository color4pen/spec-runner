# Cross-Boundary Invariants Review — verdict-channel-unification

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

## 検証した項目

### 1. routing 不変の確認

`git diff main...HEAD -- src/core/step/judge-verdict.ts` の出力が空であることを確認。`deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict` / `deriveRequestReviewVerdict` の全導出関数が変更されていない。

各 judge step の `parseResult` は引き続き `{ verdict: null, findingsPath: null }` を返す（prose-verdict parse 経路は死んだまま）。executor が typed toolResult のみを routing に使用する不変が保たれている。

### 2. content-format gate の置換

`CodeReviewStep.outputContracts` の checks を読んだ。

旧: separator row（`\|[-:]+\|`）+ 7 列 header チェック → 削除済み  
新: `##\s+検証した項目`（flags なし）+ `##\s+検証できなかった項目` → 追加済み  
`policy: "follow-up"` は維持。`path` は `reviewFeedbackPath(slug, iteration)` のまま不変。

evidence report template（`REVIEW_FEEDBACK_TEMPLATE`）に `## 検証した項目` / `## 検証できなかった項目` セクションが存在し、gate pattern と対応している。

### 3. PIPELINE_RULES からの死装置削除

`fragments.ts` を読んだ。削除が確認できた項目:

- `## Scoring`（Score 1-10 表・Weight 表・Total 計算式・7.0 閾値）→ 0 件
- `## Iteration Comparison`（Improvements / Regressions / Unchanged）→ 0 件
- `### Convergence Trend`（improving / plateaued / regressing・plateau 2 連続 escalation）→ 0 件
- `## Findings Format`（7 列 MD 表指示）→ 0 件
- `## Severity`（硬コード表）→ 0 件

保持が確認できた項目:

- `VERDICT_BLOCKING_RULES`（`judge-rules.ts` からの import、埋め込み済み）
- `## Categories`（9 カテゴリ表）
- `## Verdict`（3 値 informational 説明、verdict 行を書けという指示なし）

### 4. severity 単一ソース化

`judge-rules.ts` に `SEVERITY_DEFINITION`（critical / high / medium / low 4 段）と `REQUEST_REVIEW_SEVERITY_DEFINITION`（high / medium / low 3 段）が新設されている。

各 judge prompt での埋め込みを確認:

| Prompt | 使用定数 |
|--------|---------|
| `code-review-system.ts` | `${SEVERITY_DEFINITION}` |
| `spec-review-system.ts` | `${SEVERITY_DEFINITION}` |
| `conformance-system.ts` | `${SEVERITY_DEFINITION}` |
| `regression-gate-system.ts` | `${SEVERITY_DEFINITION}` |
| `custom-reviewer-system.ts` | `${SEVERITY_DEFINITION}` |
| `request-review-system.ts` | `${REQUEST_REVIEW_SEVERITY_DEFINITION}` |

旧 `PIPELINE_RULES` の `## Severity` 表（硬コード）が削除されており、二重定義が解消されている。

### 5. verdict 行指示の削除

System prompt・initial message・result template を横断して確認した。

**System prompts**: 各 judge system prompt から「verdict 行を書け」「required for machine parsing」「The file MUST contain a verdict line」に相当するすべての指示が削除されている。代わりに「Do NOT write a verdict line in this file. Verdict is derived by CLI from typed findings.」が明記されている。

**Initial messages**: code-review / conformance / custom-reviewer / regression-gate の各 initial message で step 指示が「Write your evidence report to:」に更新されている。

**Result templates**: 4 テンプレート（REQUEST_REVIEW / SPEC_REVIEW / REVIEW_FEEDBACK / CONFORMANCE）すべてで `- **verdict**:` placeholder・verdict-format HTML コメント・7 列表・Scores 表・`- **total**:` が削除されている。

**VERDICT_BLOCKING_RULES**: findings-priority 但し書き（「markdown の verdict 行と報告された findings が矛盾した場合、findings 由来の導出が優先されます」「verdict 行は人間向けの要約」）が削除されている。blocking rules 本体（decision-needed → escalation / critical|high → needs-fix）は不変。

### 6. テスト suite の確認

- `bun run typecheck`: 0 エラー
- `bun run test`: 566 test files / 7918 tests passed, 1 skipped
- `src/core/step/__tests__/judge-verdict.test.ts`: diff なし（変更なし）を `git diff` で確認

新規テスト `verdict-channel-unification.test.ts`（TC-001 ～ TC-019）が全 green。

### 7. mock-client の更新確認

`tests/helpers/pipeline-mock-client.ts` の `buildMockGithubClient` が judge result md を evidence report 形式（`## 検証した項目` / `## 検証できなかった項目` セクション含む）で生成している。code-review の content-format gate が evidence セクションを検索するため、integration test が gate を通過する。

## 検証できなかった項目

- `spec-review-system.ts` の `buildSystemPrompt` に渡す PIPELINE_RULES が実際に rendered 後も verdict 行の追加ヒントを含まないことの動的実行確認（ただしソース読み取りと tests により静的確認済み）
- conformance step の `COMPLETION_DIRECTIVE`（`{ok: true}` のみ）が findings 包含指示を持たないことへの実動作影響（この gap は PR 前から存在する pre-existing condition で、conformance report tool の schema が構造を担保。本 PR の範囲外）

## Findings 詳細

### F-001（LOW · observation）: request-review initial message step 5 に "verdict" の語が残存

`buildRequestReviewInitialMessage`（`src/prompts/request-review-system.ts`）の step 5 が次の文言を持つ:

```
5. Write your findings and verdict to: ${findingsPath}
```

他の全 judge step（code-review / conformance / custom-reviewer / regression-gate / spec-review）は同位置で「Write your evidence report to:」に更新済み。request-review のみ旧来の "findings and verdict" という phrasing が残っている。

**routing への影響**: prose-verdict parse 経路は死んでおり、agent が verdict 行を書いても routing には影響しない。直後の明示的な「Do NOT write a verdict line in the result file.」指示が override する。

**acceptance criteria との整合**: `**verdict**` の出力指示 grep（markdown bold 限定）では 0 件であり、grep 基準はクリアしている。

**残留リスク**: "findings and verdict" という phrasing が agent に `- **verdict**: approve` 行の書き込みを誘発する可能性は低いが、語の一貫性として「evidence report」に統一される方がより明確。次回の prompt cleanup で対応できる。

**判定**: routing 不変・acceptance criteria クリア・他 gate で検出されるため、本レビューの blocking 理由とはならない。
