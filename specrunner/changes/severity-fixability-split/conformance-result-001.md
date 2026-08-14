# Conformance Result — severity-fixability-split (Iteration 1)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Requirement: Fixer routing targets all fixable findings regardless of severity

`selectFixerTargetFindings` (src/core/step/judge-verdict.ts:201-203) が `collectFixableFindings(findings)` を直接返すよう変更済み。`severity !== "low"` フィルタは除去されている。

テストで固定:
- TC-001 (severity-fixability-split.test.ts): LOW + HIGH + MEDIUM が全件返ることを確認
- TC-002: only-LOW 入力が空でなく全件返ることを確認
- TC-003: decision-needed は除外されること（非 fixable は不変）
- regression-gate-false-loop.test.ts TC-008: 同上

### Requirement: Code-fixer instructions treat every routed finding as a mandatory fix regardless of severity

`src/core/step/code-fixer.ts` の buildMessage 全 5 分岐に `"regardless of severity (LOW/MEDIUM/HIGH/CRITICAL), every finding above is a mandatory fix target"` または同等の文言が含まれていることを確認。旧来の `"Fix all HIGH and CRITICAL severity findings"` は全分岐から除去されている。

テストで固定:
- TC-004 (severity-fixability-split.test.ts): LOW finding が `[LOW]` ラベル・title・file・rationale とともにプロンプトに現れる
- TC-005: `"regardless of severity"` が含まれ、旧文言が含まれないことを確認
- TC-FF-C-005 (fixer-findings.test.ts): LOW も MEDIUM も埋め込まれることを確認
- code-fixer.test.ts 全 5 分岐の severity contract テスト: TC-001〜005

### Requirement: Fixer prompts contain no severity-based re-filter

`src/prompts/code-fixer-system.ts` の旧 format fallback 行（"LOW は無視"）が除去され、"severity による選別はしない" に置き換えられていることを確認。`SPEC_FIXER_SYSTEM_PROMPT` は変更なし（severity 文言を持たない）。

テストで固定:
- TC-006 (severity-fixability-split.test.ts): `CODE_FIXER_SYSTEM_PROMPT` に "LOW は無視" が含まれないことを確認
- TC-014: `SPEC_FIXER_SYSTEM_PROMPT` が severity-neutral であることを確認

### Requirement: Critical/high fixable findings retain the fix-plus-re-review path

`deriveJudgeVerdict` は変更なし。critical|high fixable → `needs-fix` の経路は不変。

テストで固定:
- TC-007 (severity-fixability-split.test.ts): high fixable → needs-fix
- TC-013: critical fixable → needs-fix (D6 不変確認)

### Requirement: Low/medium fixable findings are fixed without re-review

`deriveJudgeVerdict` は low/medium fixable に対して `"approved"` を返すことを確認（不変）。`STANDARD_TRANSITIONS` のファーストマッチで code-fixer → approved が conformance に遷移することを確認（code-review への再入なし）。

テストで固定:
- TC-008 (severity-fixability-split.test.ts): low/medium fixable → approved
- TC-009: STANDARD_TRANSITIONS first-match が conformance を指す（code-review ではない）

### Requirement: Regression-gate verifies the entire findings ledger

`excludeKnownUnfixedRegressions` が `src/core/pipeline/findings-ledger.ts` から削除されていることを grep で確認（production code に 0 件）。`src/core/step/step-completion.ts` の regression-gate 分岐で同関数の呼び出しが除去され、`verdictFindings = undecidedFindings` のみになっていることを確認。

テストで固定:
- TC-010 (severity-fixability-split.test.ts): `deriveRegressionGateVerdict([low+fixable], true)` → `"needs-fix"`

### Requirement: A code-fixer no-op on a routed target is not silently accepted

`codeReviewFindingsRoutingActive` が `src/core/pipeline/reviewer-chain.ts` から削除されていることを grep で確認（production code に 0 件）。`findingsRoutingApproved` が `src/core/step/no-op-detect.ts:detectNoOp` から削除されていることを確認。`executor.ts` が `findingsRoutingApproved` を渡していないことを確認。`findingTargetPaths` / `pipelineManagedPaths` 免除ロジックは保存されていることを確認。

テストで固定:
- TC-011 (severity-fixability-split.test.ts): approved + fixable + artifact-only 変更 → needs-fix（抑止除去の確認）
- TC-012: finding が名指しした変更フォルダ doc への変更 → verdict 上書きなし（免除保存の確認）
- executor-no-op.test.ts Req 1 / TC-008: 同様の抑止除去確認

### Write-scope guards preserved (T-03)

全 5 分岐に "Do NOT add new features or make specification changes" が残っていることを確認。

テストで固定:
- TC-015 (severity-fixability-split.test.ts): standard embedded / findingsPath fallback 分岐でガード行の存在を確認

### typecheck && test

- `bun run typecheck` (tsc --noEmit): エラー 0 件
- `bun run test`: 765 test files passed, 11417 tests passed (1 skipped), 0 failures

### Existing Test Update Ledger (design.md) の遵守確認

design.md に列挙された全更新対象テストが更新されていること、「不変」とされたテストが変更されていないことを確認。

更新済み:
- regression-gate-false-loop.test.ts: TC-001/002/003/004/009/010 削除、TC-005/008 LOW 包含前提に更新
- fixer-findings.test.ts: TC-FF-C-005 が LOW も埋め込まれる前提に更新
- code-fixer.test.ts: severity contract テストが新文言（"regardless of severity"）に更新
- executor-no-op.test.ts: Req 1 / TC-008 が needs-fix 期待に更新
- no-op-detect-exemption.test.ts: TC-011（抑止）削除、findingsRoutingApproved 引数行除去
- reviewer-chain.test.ts: codeReviewFindingsRoutingActive describe 削除、import 除去; regressionGateActive approved+fixable テスト削除（構造的到達不能）

不変確認済み:
- src/core/step/__tests__/judge-verdict.test.ts: verdict 意味論テスト（不変）
- tests/unit/step/judge-verdict.test.ts: collectVerdictAffectingFindings テスト（不変）
- tests/unit/prompts/fragments.test.ts: PIPELINE_RULES テスト（不変）
- tests/unit/core/pipeline/spec-observation-autofix.test.ts: low/medium → approved テスト（不変）

## 検証できなかった項目

None

## Findings 詳細

None
