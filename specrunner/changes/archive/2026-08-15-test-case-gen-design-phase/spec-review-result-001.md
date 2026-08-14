# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/test-case-gen-design-phase/request.md` — 要件・背景・制約・受け入れ基準
- `specrunner/changes/test-case-gen-design-phase/design.md` — D1〜D7（7 決定）
- `specrunner/changes/test-case-gen-design-phase/spec.md` — 6 Requirement・14 Scenario
- `specrunner/changes/test-case-gen-design-phase/tasks.md` — T-01〜T-12（12 タスク）
- `src/core/pipeline/types.ts`（L225-252）— 現行 STANDARD_TRANSITIONS
- `src/core/pipeline/spec-observation.ts` — `specReviewHasRoutableFixables` / `specFixerForwardsToTestGen`
- `src/core/pipeline/test-gen-exemption.ts` — `isTestGenExempt` / `specFixerForwardsToImplementer`
- `src/core/step/judge-verdict.ts` — `deriveSpecReviewVerdict` / `deriveConformanceVerdict` / `deriveJudgeVerdict`
- `src/core/step/canon-write-scope.ts` — `buildScopeForSlug` / `buildCanonWriteScopeFromState`
- `src/core/step/canon-escalation.ts` — `selectUnroutableCanonFindings` / `selectRoutableCanonFindings` / effective fixer resolvers
- `src/core/step/spec-review.ts`（reads()）
- `src/core/step/test-case-gen.ts`（reads() / writes() / buildMessage）
- `src/core/step/fixer-helpers.ts` — `getLatestJudgeFindings` / `buildFindingsBlock`
- `src/prompts/spec-review-system.ts`
- `src/prompts/test-case-gen-system.ts`
- `src/kernel/report-result.ts`（FixTarget union）
- `src/core/step/report-tool.ts`（conformance fixTarget enum）
- `tests/unit/core/pipeline/pipeline.transitions.test.ts`（TC-012 / TC-030 ピン）
- `tests/unit/core/pipeline/spec-observation-autofix.test.ts`（TC-026 等）
- `src/core/pipeline/__tests__/test-gen-exemption.test.ts`（TC-007 / TC-012）
- `tests/test-case-gen-step.test.ts`（TC-004 / TC-005）
- `tests/core/pipeline/pipeline.test.ts`（TC-067）
- `tests/unit/step/test-materialize-boundary.test.ts`（TC-TMB-18）

### 確認した Requirement / Scenario

#### Requirement: 通常 type は test-case-gen を spec-review の前に実行する

- Scenario「通常 type は design から test-case-gen へ進む」: D1 遷移表の `DESIGN success → TEST_CASE_GEN`（unconditional、isTestGenExempt guard が先行）で実現。✓
- Scenario「通常 type は test-case-gen から spec-review へ進む」: D1 `TEST_CASE_GEN success → SPEC_REVIEW`。現行 `→ TEST_MATERIALIZE` から変更。✓
- Scenario「通常 type は spec-review 承認後に test-materialize へ進む」: D1 `SPEC_REVIEW approved → TEST_MATERIALIZE`（無 when fallback）。現行 `→ TEST_CASE_GEN` から変更。✓

#### Requirement: 免除 type は design から spec-review へ直行する

- Scenario「免除 type は design から spec-review へ直行する」: D1 `DESIGN success [isTestGenExempt] → SPEC_REVIEW`（guarded、無条件行より前）。✓
- Scenario「免除 type は test-case-gen を通らない」: 遷移表に `[isTestGenExempt]` bypass row が先行するため TEST_CASE_GEN に到達しない。✓

#### Requirement: needs-fix 後は test-case-gen を常時再生成する

- Scenario「spec-fixer 修正後は test-case-gen を再生成する」: D1 `SPEC_FIXER approved [specFixerNeedsFixForward] → TEST_CASE_GEN`。D2 で `specFixerNeedsFixForward` を新規追加（not conformance-triggered AND 最新 spec-review === needs-fix）。✓
- Scenario「再生成後に spec-review へ戻る」: `TEST_CASE_GEN success → SPEC_REVIEW`（D1）。✓

#### Requirement: TC のみの needs-fix は spec-fixer を経由しない

- Scenario「TC のみの needs-fix は test-case-gen へ直行する」: D1 `SPEC_REVIEW needs-fix [specReviewNeedsFixIsTcOnly] → TEST_CASE_GEN`（guarded、spec-fixer row より前）。D4 で predicate 定義。✓
- Scenario「TC と spec の混在 needs-fix は spec-fixer を経由する」: `specReviewNeedsFixIsTcOnly` が false → fallthrough → `SPEC_REVIEW needs-fix → SPEC_FIXER`。✓

#### Requirement: 観察 pass の意味論を維持する

- Scenario「観察 pass の spec-fixer は test-materialize へ継続する」: D1 `SPEC_FIXER approved [specFixerObservationForward] → TEST_MATERIALIZE`（旧 TEST_CASE_GEN）。✓
- Scenario「観察 pass 後に spec-review は再実行されない」: `specFixerObservationForward` が true のときは TEST_MATERIALIZE へ直行（SPEC_REVIEW に戻らない）。✓

#### Requirement: spec-review は test-cases.md を照合対象に含める

- Scenario「通常 type の spec-review 入力に test-cases.md が含まれる」: D6 `spec-review.ts reads()` に `isTestGenRequired` 条件付き追加。✓
- Scenario「免除 type の spec-review 入力に test-cases.md が含まれない」: 条件付き add なので免除 type では追加されない。✓
- Scenario「spec-review prompt に TC 照合観点が含まれる」: D6 `spec-review-system.ts` に (a)/(b)/(c) 3 観点を追記。✓

#### Requirement: test-case-gen は振る舞いレベルで記述し tasks.md を編集しない

- Scenario「test-case-gen prompt に振る舞いレベル指示が含まれる」: D7 `test-case-gen-system.ts` に追記。✓
- Scenario「test-case-gen の write 宣言は test-cases.md のみ」: 現行 writes() が {test-cases.md} であり D7 は変更しない。✓

#### Requirement: 承認前の test-cases.md finding は test-case-gen 再生成で解消する

- Scenario「spec-review の test-cases.md fixable finding は needs-fix になる」: D3 で `testCaseGenEffectiveFixer` を追加し `writableByFixer` に `["test-case-gen", {test-cases.md}]` を登録。`deriveSpecReviewVerdict` の優先順を更新（D3-4 の 4a/4b/4c）。現行では test-cases.md finding → unroutable → escalation だったが、`testCaseGenEffectiveFixer` で routable になり 4b → needs-fix。✓
- Scenario「再生成時に TC finding が test-case-gen へ渡される」: D5 `test-case-gen.ts buildMessage` で `getLatestJudgeFindings(state, SPEC_REVIEW)` を読み `buildFindingsBlock` で埋め込む。既存パターン（spec-fixer）の踏襲。✓
- Scenario「承認後の test-cases.md finding は operator 保護される」: D3-5 の分析：`deriveConformanceVerdict` は `conformanceEffectiveFixer`（fixTarget ?? implementer）を使用。test-cases.md の fixTarget が null → implementer → implementer は test-cases.md を書けない → unroutable → escalation。`deriveJudgeVerdict` は `judgeEffectiveFixer`（常時 code-fixer）。code-fixer は test-cases.md を書けない → escalation。コード変更なしで維持される。✓
- Scenario「request.md finding は承認前でも escalation のまま」: D3-4a：unroutable = canon fixable − TC-routable − spec-routable。request.md はどちらにも属さない → escalation が 4b/4c より優先。✓

### 遷移テーブル

D1 の 17 行（+3 行）と first-match-wins の順序を現行コード（L225-252）と照合した。

| guard | 現行 | 新設 |
|-------|------|------|
| DESIGN success [isTestGenExempt] → SPEC_REVIEW | なし | 新規（免除直行） |
| DESIGN success → TEST_CASE_GEN | なし（SPEC_REVIEW） | 変更 |
| TEST_CASE_GEN success → SPEC_REVIEW | なし（TEST_MATERIALIZE） | 変更 |
| SPEC_REVIEW approved → TEST_MATERIALIZE | なし（TEST_CASE_GEN） | 変更 |
| SPEC_REVIEW needs-fix [specReviewNeedsFixIsTcOnly] → TEST_CASE_GEN | なし | 新規 |
| SPEC_FIXER approved [specFixerObservationForward] → TEST_MATERIALIZE | [specFixerForwardsToTestGen] → TEST_CASE_GEN | 変更（名前・先） |
| SPEC_FIXER approved [specFixerNeedsFixForward] → TEST_CASE_GEN | なし | 新規 |

### FixTarget / CanonWriteScope 整合性

- `report-result.ts` の `FixTarget` union（現: `"implementer" | "code-fixer" | "spec-fixer"`）に `"test-case-gen"` を追加（additive）。
- `report-tool.ts` の conformance literal enum（3 値）は変更しない。conformance は test-case-gen を fixTarget として emit しないため正しい。
- `canon-write-scope.ts` の `writableByFixer` に `["test-case-gen", {<folder>/test-cases.md}]` を追加。
- `canon-escalation.ts` に `testCaseGenEffectiveFixer: () => "test-case-gen"` を export。
- `deriveSpecReviewVerdict` の内部ロジックを 2 resolver 方式（tc + spec）に更新。unroutable = canon fixable − tc-routable − spec-routable。

### セキュリティ確認

- test-case-gen-system.ts のセキュリティ制約（`<user-request>` XML delimiter + 役割逸脱指示への拒否）は既存で維持される。
- D5 の findings 注入（`buildFindingsBlock`）は spec-fixer の既存パターン踏襲。findings はユーザー入力ではなく spec-review agent の report_result tool 出力（構造化 JSON）から来るため prompt injection リスクは低い。
- `<user-request>` XML 区切りの使用が D5 に明示されていないが、design が「spec-fixer の findings 注入パターンに倣う」と記述しているため実装で踏襲される前提。

### pin テスト列挙

design.md の更新必須 8 件（TC-012/030/007/008/009/027/010/013/026/029 等）、再検証 3 件（pipeline-integration/conformance-routing/bite-evidence）、無変更 4 件を確認。現行テストコードの参照（`specFixerForwardsToTestGen`、`spec-review approved → test-case-gen`、length 49 等）が design の列挙と一致している。

## 検証できなかった項目

- フローテスト（`tests/pipeline-integration.test.ts`, `tests/core/pipeline/pipeline.conformance-routing.test.ts`, `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts`）の実行後の fixture 整合：実行環境がないため静的確認のみ。design が「再確認必須」と明示しており、T-11 で対応予定。
- `typecheck && test` の green 確認：実行できないため受け入れ基準の充足は静的推論のみ。

## Findings 詳細

### Finding 1（medium / fixable）: TC + low/medium spec 混在時の `specReviewNeedsFixIsTcOnly` 挙動が spec.md に未記述

**対象**: `specrunner/changes/test-case-gen-design-phase/spec.md`

`specReviewNeedsFixIsTcOnly` は `spec.length === 0`（severity 問わず）を条件とする（D4）。TC finding が存在し、かつ spec に medium/low fixable finding がある場合：
- `spec.length > 0` → `specReviewNeedsFixIsTcOnly = false` → SPEC_FIXER 経由
- SPEC_FIXER が medium/low spec finding を消費 → `specFixerNeedsFixForward` → TEST_CASE_GEN → TC finding 注入 → SPEC_REVIEW

この経路は設計的に正しい（TC と spec を 2 工程で解消）が、spec.md の Scenario が「TC と spec の混在 needs-fix は spec-fixer を経由する」にある Given 条件「spec.md（または design/tasks）への項目が少なくとも 1 件含まれる」の severity 非記述（medium/low を含む）との整合性を T-10 の新規テストで明示的に固定することが望ましい。

現状、`specReviewNeedsFixIsTcOnly` の severity-agnostic な spec ルーティングが TC + medium/low spec 混在ケースで spec-fixer を呼ぶ挙動はテスト未固定。spec-fixer の observation pass ロジックとの意味論的境界が不明確になるリスクがある。

**修正方法**: spec.md の該当 Scenario に Given 補記（severity 問わずの `spec ≥ 1` → spec-fixer 経由）を追加、またはこの具体的エッジケースを T-10 の受け入れ基準として tasks.md に追記する。

### Finding 2（low / fixable）: D5 の TC finding 注入に `<user-request>` XML 区切り明示がない

**対象**: `specrunner/changes/test-case-gen-design-phase/design.md`（D5 節）

D5 は「spec-fixer の findings 注入パターンに倣う」と記述しているが、`buildFindingsBlock` の出力を `<user-request>` / `</user-request>` 等の XML タグで囲むか否かが明示されていない。spec-fixer.ts では buildMessage 全体を `<user-request>` 区切りで包んでいる。test-case-gen.ts の buildMessage は現状その区切りを使用していない。

findings はユーザー入力でなく agent 生成の構造化データのため直接の injection リスクは低いが、D5 の実装記述を「buildFindingsBlock の出力を `<user-request>` XML 区切りで囲む（または spec-fixer の buildMessage に倣い全体を囲む）」と明示することで実装担当者の解釈ゆらぎを排除できる。

**修正方法**: design.md D5 節に「既存の buildMessage（全体 XML 区切りなし）に findings ブロックを追記する形式、または spec-fixer パターンと同様に全体を XML 区切りで包む形式を選択し、実装方針を明記する」を 1 行追記する。
