# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/finding-provenance-carry/request.md` — 背景・要件・受け入れ基準
- `specrunner/changes/finding-provenance-carry/design.md` — 設計判断 D1–D6
- `specrunner/changes/finding-provenance-carry/tasks.md` — 実装タスク T-01–T-05
- `specrunner/changes/finding-provenance-carry/spec.md` — 要件定義（Requirement/Scenario）
- `specrunner/changes/finding-provenance-carry/test-cases.md` — テストケース TC-001–TC-021
- `src/core/decision/wontfix.ts` — 現状の `resolveWontfixDispositions` 実装（行 85-117）
- `src/core/pipeline/findings-ledger.ts` — `collectSpecReviewLedger` / `collectFindingsLedger` / `computeRegressionLedger`
- `src/core/port/report-result.ts` — `parseFindings` 実装
- `src/kernel/report-result.ts` — `Finding` 型定義
- `src/core/step/report-tool.ts` — `JUDGE_REPORT_TOOL` / `findingSchema`
- `src/core/step/regression-gate.ts` — `createRegressionGateStep` / `buildLedgerBlock`
- `src/prompts/regression-gate-system.ts` — regression-gate システムプロンプト
- `src/state/schema/types.ts` — `DispositionDecisionRecord` 型（行 302-321）
- `src/core/pipeline/reviewer-chain.ts` — `deriveImplReviewerChain`
- `src/core/decision/decision-ledger.ts` — `filterUndecidedFindings`
- `tests/unit/core/decision/wontfix.test.ts` — 既存テスト
- `src/core/step/__tests__/regression-gate-step.test.ts` — 既存テスト

### 検証した観点

#### 1. request.md ↔ design.md の整合性
- 確認バグ2件（title 言い換えによる fingerprint 不一致、spec-review 逆引き対象外）が design.md D1・D2・D4 で正確に対応されている ✓
- 要件4項（由来保持 / LLM 非依存 / 全発生元 / 後方互換）が D1–D6 でカバーされている ✓

#### 2. design.md ↔ spec.md の整合性
- Req 1（provenance ref 付与）← D1, D3, D5 ✓
- Req 2（gate が ref を echo）← D2, D5 ✓
- Req 3（paraphrase title でも解決可能）← D1, D2 ✓
- Req 4（spec-review 由来をカバー）← D4 ✓
- Req 5（unresolvable ref → exit 2）← D2 の fail-closed 保証 ✓
- Req 6（後方互換・機械尊重維持）← D5 ✓

#### 3. spec.md の記法適合性（rules.md 準拠）
- 全 Requirement に SHALL/MUST が含まれる ✓
- 全 Requirement に最低 1 つの Given/When/Then Scenario がある ✓
- Layer-1 振る舞いの記述 ✓

#### 4. spec.md ↔ test-cases.md のカバレッジ
- TC-001 → Req 1 Scenario 1 ✓
- TC-002 → Req 1 Scenario 2 ✓
- TC-003 → Req 2 Scenario 1 ✓
- TC-004 → Req 2 Scenario 2 ✓
- TC-005 → Req 3 (paraphrased title) ✓
- TC-006 → Req 4 (spec-review origin) ✓
- TC-007 → Req 5 (missing/unresolvable ref) ✓
- TC-008 → Req 6 (ledger exclusion) ✓
- TC-009 → Req 6 (approved+fixable guard) ✓
- TC-010–TC-021 → tasks.md 由来の実装レベル検証 ✓

#### 5. 現状コードの前提検証

- `wontfix.ts:85-117` — fingerprint index は `deriveImplReviewerChain` のみ。spec-review は含まない。実測エラー再現可能 ✓
- `findings-ledger.ts:36-70` — `collectFindingsLedger` は `filterUndecidedFindings` を各ステップで呼び出す ✓
- `findings-ledger.ts:138-162` — `collectSpecReviewLedger` は **`filterUndecidedFindings` を呼び出さない**（後述の Finding 参照）
- `computeRegressionLedger` は `collectSpecReviewLedger` + `collectFindingsLedger` をマージする ✓
- `JUDGE_REPORT_TOOL` はシングルトン。`isJudgeStep` は identity check（`=== JUDGE_REPORT_TOOL`）で確認 ✓
- `parseFindings` は `fixTarget`, `origin`, `fileMissing` の任意フィールドを field-by-field でキャプチャ。新フィールドは明示的追加が必要 ✓
- `DispositionDecisionRecord` フィールド確認: `kind`, `id`, `step`, `findingKey`, `finding`, `disposition`, `reason`, `decidedAt`, `source` — TC-019 に一致 ✓

#### 6. セキュリティレビュー
- `ledgerRef` は machine-computed（fingerprint のハッシュ）、LLM が書き換えても machine validation で fail-closed（exit 2）→ 改ざん耐性あり ✓
- `parseFindings` は non-string/absent ref をサイレント無視（injection 経路なし）✓
- 既存の all-or-nothing exit 2 は維持（不正 index, 未実行 gate, 欠落 reason は変わらず失敗）✓
- 新規 API surface・認証境界・外部 I/O なし。OWASP Top 10 適用対象外 ✓

## 検証できなかった項目

- `computeLedgerRef` の衝突耐性の具体的な実装（encoding は実装者に委ねられており、D3 の "deterministic, collision-resistant" 制約のみ確認）
- regression-gate の実際の LLM 動作（echo 品質はプロンプト設計依存。unit test はモックで代替する設計）

## Findings 詳細

### F-01: `collectSpecReviewLedger` に `filterUndecidedFindings` が欠落しており、タスクがこれを修正対象として列挙していない

**対象ファイル**: `specrunner/changes/finding-provenance-carry/tasks.md`（T-05）、`specrunner/changes/finding-provenance-carry/spec.md`（Req 6）

**観察内容**:

spec.md Req 6 は「wontfix 済み finding の機械尊重（ledger 除外）が新しい解決方式でも機能すること」を要求する。TC-008 は「disposed finding が regression-gate ledger から除外される」ことを検証する。

しかし、現状コード (`findings-ledger.ts:138-162`) において:
- `collectFindingsLedger`（impl reviewer chain 用）は各ステップで `filterUndecidedFindings` を呼び出す（行 55）
- `collectSpecReviewLedger`（spec-review 用）は **`filterUndecidedFindings` を呼び出さない**

TC-006 が spec-review 由来の finding を `step: "spec-review"` として dispose する DispositionDecisionRecord を生成した場合、その finding は:
- `computeRegressionLedger` → `collectSpecReviewLedger` 経路でフィルタされない
- よって merged ledger に残存する → TC-008 が spec-review 由来ケースで失敗する

T-05 の記述「excluded from the regression-gate ledger (`collectFindingsLedger` / `computeRegressionLedger` via `filterUndecidedFindings`)」は `collectFindingsLedger` を参照しており、impl chain 由来のケースには効くが、spec-review 由来には効かない。このため実装者がテストを impl chain 由来のみで書くと TC-008 のカバレッジが片面に留まる。

**修正指示**: `tasks.md` T-02 または T-05 に、`collectSpecReviewLedger` 内で `filterUndecidedFindings` を呼び出す旨を明示的に追加する（`collectFindingsLedger` の既存パターンを踏襲）。また T-05 の TC-008 テストは spec-review 由来の DispositionDecisionRecord を使用して `computeRegressionLedger` が除外することを確認するケースを含めることを明示する。

---

*その他の観察（finding ではなく情報記録）*:

- **TC-003 と TC-011 の重複**: TC-003 ("re-reported regression carries its ledger ref") は unit カテゴリだが、実質的に `parseFindings` の round-trip を検証する TC-011 と大部分が重複する。どちらも有効であり問題ではないが、TC-003 の "unit" テストは LLM 動作をモックして `parseFindings` 経路を検証する形になる想定で記述されている。
- **TC-021 の priority**: design D3 が位置独立性を correctness 要件として説明しているにもかかわらず、TC-021 ("ref stable under ledger membership changes") が "should" priority になっている。TC-010 ("deterministic for equal fingerprints") が "must" でほぼ同じ保証をカバーするため、構造上の重複は許容範囲。
- **T-02 の署名と spec-review 扱い**: T-02 helper の "do not derive the chain internally — avoid the documented import cycle" は `deriveImplReviewerChain` の呼び出しを指しており、spec-review の step 名 (`STEP_NAMES.SPEC_REVIEW`) は定数参照のためサイクルとならない。実装者は helper 内で spec-review を直接参照して良い。
