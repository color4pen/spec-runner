# Spec Review Result — Round 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/finding-provenance-carry/request.md` — 背景・要件・受け入れ基準
- `specrunner/changes/finding-provenance-carry/design.md` — 設計判断 D1–D6
- `specrunner/changes/finding-provenance-carry/tasks.md` — 実装タスク T-01–T-05（Round 2 更新後）
- `specrunner/changes/finding-provenance-carry/spec.md` — 要件定義（Requirement/Scenario）
- `specrunner/changes/finding-provenance-carry/test-cases.md` — テストケース TC-001–TC-021
- `src/core/decision/wontfix.ts` — 現状の `resolveWontfixDispositions` 実装（全体）
- `src/core/pipeline/findings-ledger.ts` — `collectSpecReviewLedger` / `collectFindingsLedger` / `computeRegressionLedger`
- `src/core/port/report-result.ts` — `parseFindings` 実装（全体）
- `src/kernel/report-result.ts` — `Finding` 型定義
- `src/core/step/report-tool.ts` — `JUDGE_REPORT_TOOL` / `findingSchema` / `conformanceFindingSchema`
- `src/core/step/regression-gate.ts` — `createRegressionGateStep` / `buildLedgerBlock` / `buildFindingsBlock` の呼び出し箇所
- `src/prompts/regression-gate-system.ts` — regression-gate システムプロンプト（finding 形式記述を含む）
- `src/state/schema/types.ts` — `DispositionDecisionRecord` 型（行 302–321）
- `src/core/pipeline/reviewer-chain.ts` — `deriveImplReviewerChain` / `buildReviewerChainTransitions` / `buildParallelReviewerTransitions`
- `src/core/decision/decision-ledger.ts` — `filterUndecidedFindings` / `computeFindingKey`
- `src/core/step/fixer-helpers.ts` — `buildFindingsBlock` の呼び出し元一覧（code-fixer, spec-fixer, implementer, regression-gate）
- `tests/unit/core/decision/wontfix.test.ts` — 既存テスト（TC コメント番号確認）
- `src/core/step/__tests__/regression-gate-step.test.ts` — 既存テスト（out-of-scope assertions 確認）

### 前周 finding の解消確認

**F-01: `collectSpecReviewLedger` に `filterUndecidedFindings` 追加がタスクに明示されていない（前周 high）**

→ **解消済み**。tasks.md T-02 に以下が追加されている:
> `Update collectSpecReviewLedger to call filterUndecidedFindings per StepRun (mirroring the per-run exclusion already applied in collectFindingsLedger at line 55). Without this, a spec-review-origin finding disposed via wontfix (step="spec-review") would still appear in computeRegressionLedger → merged ledger, causing TC-008 to fail for spec-review-origin cases.`

tasks.md T-05 にも:
> `the TC-008 ledger-exclusion test MUST include a spec-review-origin DispositionDecisionRecord (step="spec-review") to verify the collectSpecReviewLedger path`

が明示されており、実装者・テスト作成者いずれも漏れなく対応できる記述になっている。再指摘不要。

### 検証した観点（今回 Round 2）

#### 1. design.md ↔ tasks.md 整合性（T-02 `filterUndecidedFindings` 追加の整合性）

- `collectSpecReviewLedger` の現行実装（`findings-ledger.ts:138-162`）は `filterUndecidedFindings` を呼ばない。T-02 の修正タスクにより `state.decisions` へのアクセスが必要となるが、`collectSpecReviewLedger(state: JobState, canonScope?)` は既に `state` を受け取っており、追加引数不要。✓
- `collectFindingsLedger` の既存パターン（`filterUndecidedFindings(stepName, fixable, state.decisions)`）を踏襲することで spec-review の step 名 `STEP_NAMES.SPEC_REVIEW` を使えば一貫性が保たれる。✓

#### 2. T-02 provenance index builder のシグネチャと import cycle 回避

- T-02 helper は `(reviewerChain: string[], state: JobState) → Map<ref, Map<stepName, Finding>>` を定義し、`findings-ledger.ts` 内に置く。`deriveImplReviewerChain` は `reviewer-chain.ts` 経由になるが、`findings-ledger.ts` から呼ぶと `findings-ledger → reviewer-chain → regression-gate → findings-ledger` の循環が発生する。
- T-02 の `"do not derive the chain internally"` 制約が正確にこの循環を防ぐ。`wontfix.ts` は既に `reviewer-chain.ts` に依存しており、caller 側で chain を渡すことで cycle が回避される。設計整合。✓
- spec-review の step 名 `STEP_NAMES.SPEC_REVIEW` は定数参照であり cycle にならない。T-02 の補足注（`T-02 の署名と spec-review 扱い`）は前周レビューで確認済み。✓

#### 3. `buildFindingsBlock` 呼び出し箇所と T-03 の分離設計

- `buildFindingsBlock` は `code-fixer.ts`、`spec-fixer.ts`、`implementer.ts`、`regression-gate.ts` の 4 箇所で呼ばれる。
- T-03 は「`buildLedgerBlock`（または per-entry rendering）を更新する」と明示し、`buildFindingsBlock` 自体の変更は不要とする設計。`regression-gate-step.test.ts` の assertions（title/files 存在、empty-ledger notice、result path）が out-of-scope で変更禁止であることも T-03 Acceptance Criteria に明記されている。
- `buildLedgerBlock` が独自のレンダリングで ref を追記するか、新 helper を呼び出す形で対応することが実装者に委ねられており、他 caller への影響なし。✓

#### 4. `DispositionDecisionRecord` のスナップショットに gate の paraphrase が混入しないことの確認

- T-04 の実装指示: `DispositionDecisionRecord.finding` は `actualFinding`（source step の actual finding）のフィールドで構成される。gate finding の paraphrase title ではなく source finding の title が記録される。
- 現行コード（`wontfix.ts:133-143`）の snapshot 生成パターンが維持されるため、ledger-exclusion フィルタ（`filterUndecidedFindings` → `computeFindingKey`）は source finding の fields で照合し続ける。✓

#### 5. 全 spec Requirement と tasks/test-cases の coverage 再確認

| Requirement | Design | Tasks | Test Cases |
|------------|--------|-------|------------|
| Req 1: ledger に ref を付与 | D1, D3, D5 | T-01, T-02, T-03 | TC-001, TC-002, TC-010, TC-021 |
| Req 2: gate が ref を echo | D2, D5 | T-01, T-03 | TC-003, TC-004, TC-011, TC-012, TC-013 |
| Req 3: paraphrase title でも解決 | D1, D2 | T-04 | TC-005 |
| Req 4: spec-review 発生元をカバー | D4 | T-02, T-04 | TC-006, TC-014, TC-015 |
| Req 5: unresolvable ref → exit 2 | D2（fail-closed） | T-04, T-05 | TC-007, TC-018 |
| Req 6: 後方互換・機械尊重維持 | D5 | T-04, T-05 | TC-008, TC-009, TC-019, TC-020 |

全 Requirement がカバーされている。✓

#### 6. spec.md の記法適合性（rules.md）

- 全 6 Requirement に SHALL / MUST が含まれる ✓
- 全 6 Requirement に Given/When/Then Scenario が 1 つ以上ある ✓
- Layer-1 振る舞いの記述（`computeLedgerRef` の実装詳細は TC/tasks に委ねる） ✓

#### 7. セキュリティレビュー（全件）

- `ledgerRef` は machine-computed（finding fingerprint のハッシュ）。LLM が ref を改ざんしても machine validation（provenance index 照合）で fail-closed（exit 2, zero records）→ 改ざん耐性あり ✓
- `parseFindings` は non-string/absent `ledgerRef` をサイレント無視（injection 経路なし）。TC-012 でカバー ✓
- 既存の all-or-nothing exit 2 は維持。不正 index、未実行 gate、欠落 reason、empty element は変わらず失敗。TC-018 でカバー ✓
- gate finding が valid ref を echo しつつ「意味上は別の finding を指している」ケースは LLM reasoning error。pipeline 内の trusted actor（オペレーター制御の LLM）が対象であり、OWASP Top 10 の意味での攻撃経路ではない ✓
- 新規 API surface・認証境界・外部 I/O なし ✓

## 検証できなかった項目

- `computeLedgerRef` の具体的な衝突耐性（encoding は D3 の "deterministic, collision-resistant" 制約のみ定義され、実装者に委ねられている）
- regression-gate の LLM 実際のecho品質（unit test はゲート finding を直接構築してモック。TC-003 の "re-reported" シナリオは LLM 動作をモックで代替する設計）
- `conformanceFindingSchema` への `ledgerRef` 追加の要否（T-01 が "if needed" と記述しており未確定）

## Findings 詳細

None — 前周指摘（F-01）は tasks.md T-02 / T-05 への明示追加により解消済み。今回の Round 2 レビューで新たな critical / high / medium 指摘は見つからなかった。

---

*参考: 低優先度 Observations（fixing 不要）*

- **TC コメント番号のずれ（`wontfix.test.ts`）**: 既存テストファイルのコメント（TC-006, TC-007, TC-008…）は旧世代の TC 番号であり、新 `test-cases.md` の TC 番号と一致しない（例: `wontfix.test.ts` の TC-015 ≈ `test-cases.md` TC-007）。T-05 で "title 文字列照合 pin ケースのみ更新" と明確に範囲定義されているため実装者は判断できる。コメント番号の不一致は機能上の問題ではなく観察のみ。
- **`findingSchema` に `ledgerRef` を追加すると全 judge tool の JSON schema に露出する**: D5 の設計通り、指示は gate prompt にスコープされており、非 gate の LLM agent は tool description text に `ledgerRef` が記載されないため誤って populate することは起こりにくい。既存の `origin`, `fileMissing` フィールドも同じパターンで共有 schema に追加されており、additive 追加の先例に沿う。
