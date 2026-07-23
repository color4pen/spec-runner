# Spec Review: spec-review-fixer-routing

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

- `request.md` — 背景・要件・受け入れ基準・architect 評価済み設計判断を精読
- `design.md` — D1〜D6 全判断を精読し、根拠・代替案却下理由を確認
- `spec.md` — 全 Requirement・Scenario を精読し、tasks との対応を照合
- `tasks.md` — T-01〜T-06 の実装指示・受け入れ基準を精読
- 現状コードの前提事項を直接検証:
  - `src/core/step/canon-escalation.ts` — `judgeEffectiveFixer`（常に `"code-fixer"` を返す）・`conformanceEffectiveFixer`・`selectUnroutableCanonFindings`・`buildCanonEscalationReason` の実装を確認
  - `src/core/step/judge-verdict.ts` — `deriveJudgeVerdict`（L53: canon 判定が critical|high 判定より前段）・`deriveConformanceVerdict`（L111: `conformanceEffectiveFixer` 使用）・`deriveRegressionGateVerdict`・`deriveRequestReviewVerdict` の実装を確認。`deriveSpecReviewVerdict` と `selectRoutableCanonFindings` は未定義（実装待ち）を確認
  - `src/core/step/spec-review.ts` — `SpecReviewStep` が `reportTool: JUDGE_REPORT_TOOL`・`judgeVerdictFn` 未定義であることを確認
  - `src/core/step/step-completion.ts` — L306: `lastIsConformancePath ? conformanceEffectiveFixer : judgeEffectiveFixer` による resolver 選択確認。L148: `canonScope` を常時構築して verdict 関数の第 4 引数として渡すことを確認（L201）
  - `src/core/step/canon-write-scope.ts` — spec-fixer の書込集合が `{spec.md, design.md}`、code-fixer が ∅ であることを確認
  - `src/core/step/write-scope.ts` — `protectedCanonPaths` が 6 種（request.md / spec.md / design.md / tasks.md / test-cases.md / attestation）を返すことを確認
  - `src/core/pipeline/types.ts` — L234: `spec-review needs-fix → spec-fixer`、L241: `spec-fixer approved → spec-review` の遷移が既存であることを確認
  - `src/core/pipeline/registry.ts` — `loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER` が既存であることを確認
  - `src/core/port/step-types.ts` — `AgentStep.judgeVerdictFn` の型シグネチャ確認（`findings, ok, evidence?, canonScope? → "approved" | "needs-fix" | "escalation"`）。`deriveSpecReviewVerdict` が代入可能であることを型レベルで確認
  - `src/core/step/regression-gate.ts` — `judgeVerdictFn: deriveRegressionGateVerdict` 配線パターン（D3 の参照先）を確認
  - `src/kernel/step-names.ts` — leaf モジュール（src/core/step/ への依存なし）であることを確認。T-04 で `step-completion.ts` から import しても import cycle が発生しないことを確認
  - `src/errors.ts` — `SPEC_REVIEW_RETRIES_EXHAUSTED` が既存の error code であることを確認
  - `src/core/step/__tests__/judge-verdict.test.ts` — TC-021 の inline spec-review step（judgeVerdictFn 未設定）テストと assertion 内容を確認
- スコープ外に設計変更がないことを確認:
  - 遷移表・`loopFixerPairs`・spec-fixer 書込集合に変更がないこと
  - conformance / code-review / regression-gate / request-review の verdict 導出コードが変更対象外であること
- セキュリティ検討: 本変更は純粋な内部 routing ロジック変更（外部入力処理・認証・I/O 変更なし）であり、OWASP Top 10 の適用対象外であることを確認

## 検証できなかった項目

- T-05 で追加予定のテストコード（未実装のため）の正確な assert 内容
- ADR の最終文面（adr-gen step に委任するため）

## Findings 詳細

### F-001

- **severity**: low
- **resolution**: fixable
- **file**: specrunner/changes/spec-review-fixer-routing/tasks.md
- **title**: T-05 に `SpecReviewStep.judgeVerdictFn === deriveSpecReviewVerdict` の identity assertion が明示されていない
- **rationale**: T-03 の受け入れ基準に「`SpecReviewStep.judgeVerdictFn === deriveSpecReviewVerdict`」の確認が含まれているが、T-05 のテスト一覧にはこれを直接検証する identity assertion ケースが記載されていない。regression-gate の先例（`judge-verdict.test.ts` L217-222）では `createRegressionGateStep().judgeVerdictFn === deriveRegressionGateVerdict` という import → identity check が専用ケースとして存在する。T-05 の記述では escalation テスト・drift-guard テストが `deriveStepCompletion（spec-review step）` を対象としているが、inline step を使う場合は `SpecReviewStep` への配線（T-03 本体）が機械的に確認されない。T-05 に「`SpecReviewStep.judgeVerdictFn` が `deriveSpecReviewVerdict` と参照一致することをテストで固定する」1 行を追加するか、escalation/drift-guard テストで実 `SpecReviewStep` を import して使うことで対応できる。

### F-002

- **severity**: low
- **resolution**: fixable
- **file**: specrunner/changes/spec-review-fixer-routing/spec.md
- **title**: coexistence シナリオ（unroutable + routable 共存）に `escalationReason` の検証が含まれていない
- **rationale**: spec.md「Scenario: escalation-and-routable coexistence prefers escalation」は verdict が `escalation` になることのみを検証している。このケースでは step-completion の escalationReason 計算ブロックが `selectUnroutableCanonFindings`（request.md → 1 件）を検出し `escalationReason` を設定するはずだが、その有無と内容がシナリオで確認されていない。単一 unroutable ケース（「fixable finding on request.md escalates with reason」）では `escalationReason` 検証が含まれているため非対称になっている。共存シナリオにも `And escalationReason is set and contains CANON_FINDING_ESCALATION` を追記するか、T-05 drift-guard テストに共存ケースの escalationReason アサーションを追加することで対称性を担保できる。

### F-003

- **severity**: low
- **resolution**: fixable
- **file**: specrunner/changes/spec-review-fixer-routing/tasks.md
- **title**: T-04: `lastCanonResolver` 参照時の TypeScript null-safety 実装パターンが未指定
- **rationale**: T-04 は `lastCanonResolver: ((f: Finding) => FixTarget) | null` を導入し、escalationReason ブロック内での参照時に「null の場合は計算しない」という不変条件を文書化している。`lastUndecidedFindings !== null` が成立するときは必ず `lastCanonResolver` も非 null という invariant は設計上正しいが、TypeScript コンパイラにはこの invariant が見えない。escalationReason 計算内で `lastCanonResolver` を関数として呼び出す際、non-null assertion（`lastCanonResolver!`）か明示的 null ガード（`if (lastCanonResolver !== null)`）のどちらかが必要になるが、tasks はパターンを指定していない。non-null assertion は invariant 違反を silent にするため、`if (lastCanonResolver !== null)` ガードを用いて安全に no-op にするパターンを tasks に 1 行明記することで実装者の判断を統一できる。
