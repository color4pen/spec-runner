# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだ spec ファイル

- `specrunner/changes/typed-evidence-gate/request.md` — 要件・背景・受け入れ基準・architect 評価済み設計判断
- `specrunner/changes/typed-evidence-gate/design.md` — D1〜D7 の設計判断とコードベース検証済み前提
- `specrunner/changes/typed-evidence-gate/spec.md` — 4 要件・15 Scenario
- `specrunner/changes/typed-evidence-gate/tasks.md` — T-01〜T-09 の実装タスク

### 辿った Scenario

spec.md の全 15 Scenario を読んだ。 request.md 要件 1〜6・スコープ外・architect 決定との対応を確認した。

### 確認した実コード（コードベース前提の検証）

| ファイル | 確認内容 | 結果 |
|---|---|---|
| `src/core/step/judge-verdict.ts` | `deriveJudgeVerdict(findings, ok)` のシグネチャとロジック（severity/resolution のみ）。vacuous 概念なし | ✅ 前提と一致 |
| `src/core/port/report-result.ts` | `parseJudgeReportInput`: `ok=true` で findings 必須、evidence 不要の現状。`parseCodeReviewReportInput` / `parseConformanceReportInput` が委譲構造 | ✅ 前提と一致 |
| `src/core/step/report-tool.ts` | `JUDGE_REPORT_TOOL` が singleton、`spec-review` / `regression-gate` / `custom-reviewer` が同一オブジェクトを使用。identity 比較パスが `step-completion.ts` にある | ✅ 前提と一致 |
| `src/core/step/step-completion.ts` | `isConformanceStep` → `deriveConformanceVerdict(undecidedFindings, tr.ok)`（evidence 未受け渡し）。`isJudgeStep` → `verdictFn(undecidedFindings, tr.ok)`（同）| ✅ 変更箇所として T-05 が正確に特定している |
| `src/kernel/report-result.ts` | `Finding` / `Observation` 型があり `Evidence` はまだ存在しない。層の位置は正確 | ✅ 前提と一致 |
| `src/state/helpers.ts:71` | `toolResult?: (BaseReportResult & { findings?: Finding[]; observations?: Observation[] }) \| null` — evidence フィールドなし | ✅ 前提と一致 |
| `src/state/schema/types.ts:132` | `StepOutcome.toolResult` 型も evidence なし | ✅ 前提と一致 |
| `src/prompts/fragments.ts` | `EVIDENCE_DISCIPLINE` が存在、「空集合は判定不能」の文言確認 | ✅ 前提と一致 |
| `src/prompts/judge-rules.ts` | `SEVERITY_DEFINITION` / `OBSERVATION_DEFINITION` / `VERDICT_BLOCKING_RULES` のパターン確認（`EVIDENCE_COUNTS_DEFINITION` 新設先として適切） | ✅ 確認済み |
| `src/core/port/step-types.ts` | `judgeVerdictFn` の型（2 引数）。TypeScript の関数割当規則により 3 引数オプション型へ拡張後も `deriveRegressionGateVerdict` は代入可能 | ✅ 設計 D4 が正確 |
| `tests/helpers/pipeline-mock-client.ts` | spec-review approved 入力が `{ ok: true, approved: true, findings: [] }` — evidence なし。evidence 必須化後に parse 失敗する | ✅ T-08 が正確に特定している |
| `src/core/step/__tests__/judge-verdict.test.ts` | TC-021 mock runner が `toolResult: { ok: true, findings: [...] }` を直接セット（parseJudgeReportInput を迂回）。evidence=undefined は legacy path に落ちる | ✅ T-08 で更新対象として特定されている |
| `src/prompts/__tests__/fragment-coverage.test.ts` | `allPromptSymbols` に conformance / code-review / spec-review / regression-gate / custom-reviewer が含まれる。新 fragment の provider-neutral チェックは自動カバー | ✅ 確認済み |

### 設計判断の妥当性確認

| 判断 | 確認内容 |
|---|---|
| D1: Evidence を kernel 層に置く | `Finding` / `Observation` と同じ場所に置くことを確認。`src/kernel/report-result.ts` に既存パターンあり ✅ |
| D2: parse 強制を `parseJudgeReportInput` に置く | 委譲構造により code-review・conformance が自動継承することをコードで確認。`parseRequestReviewReportInput` は委譲しない（変更不要）✅ |
| D3: vacuous チェックを `deriveJudgeVerdict` に置く | `evidence === undefined` の legacy path が D5（後方互換）に対応することを確認 ✅ |
| D4: regression-gate の導出ロジックを変更しない | `skipWhen` により ledger 非空でのみ実行される。`deriveRegressionGateVerdict` は 2 引数のまま、型上 3 引数 optional 型に代入可能であることを確認 ✅ |
| D5: 過去 record は再評価しない | verdict は `state.steps[].outcome.verdict` から読む（再導出しない）ことを `step-completion.ts` で確認 ✅ |
| D6: EVIDENCE_COUNTS_DEFINITION を judge-rules.ts に新設 | fragment は「判定不能」に留め escalation を断定しない（regression-gate と共有）。既存 neutrality test でカバーされることを確認 ✅ |
| D7: 診断出力で理由を surfacing | 既存の null-verdict 警告パターン（`stderrWrite`）と整合することを確認 ✅ |

## 検証できなかった項目

- **`tests/unit/core/step/judge-verdict-conformance.test.ts`（T-08 追随対象）の実コード**: ファイル存在を glob で確認できなかった（ファイルが別パスかまたは存在しない可能性）。T-08 に列挙されているが、このファイルが本当に存在するか・evidence 追加が必要かは実装フェーズで確認が必要。
- **`tests/unit/step/executor-verdict.test.ts` / `tests/unit/core/step/scope-escalation.test.ts`（T-08 追随対象）**: 同上、ファイル存在と内容の詳細確認ができていない。
- **`tests/unit/contract/golden-cases.test.ts`**: tool schema snapshot の有無確認が未実施。

## Findings 詳細

### Finding 1: regression-gate の checked=0 非 escalation を executor 経由で固定するテストがない

**対象**: `tasks.md` T-04 および T-08 の受け入れ基準

spec.md の "regression-gate verdict derivation is unaffected by evidence" は `deriveRegressionGateVerdict` 単体での動作を記述している。しかし、`step-completion.ts` の `isJudgeStep` ブランチでは T-05 後に `verdictFn(undecidedFindings, tr.ok, tr.evidence)` と 3 引数で呼ばれ、`verdictFn = deriveRegressionGateVerdict` の場合は第 3 引数が無視される。

この「executor 経由で regression-gate に `checked: 0` の evidence を渡しても vacuous escalation にならない」というパスを executor 統合テストで明示的に固定するテストが T-08 の受け入れ基準に含まれていない。実装上は JavaScript の extra-args-ignored 動作と TypeScript 型互換性で保証されるが、回帰を防ぐための機械的な歯がない。

T-04 の受け入れ基準には「`deriveRegressionGateVerdict` の既存テストが無改変で緑」しかない。既存テストは 2 引数での呼び出しのみで、`checked: 0` を渡した 3 引数呼び出しの挙動を固定していない。

（補足）regression-gate の `isJudgeStep === true` かつ `judgeVerdictFn === deriveRegressionGateVerdict` という条件で実行される executor 経路のテストは TC-021 が既に存在するが、TC-021 は medium fixable finding を使っており、`checked: 0` の vacuous ルール非適用の証明にはなっていない。
