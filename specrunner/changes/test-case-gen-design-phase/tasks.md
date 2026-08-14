# Tasks: test-case-gen を design phase の最終工程へ移動

> 実装順の目安: T-01（FixTarget/scope/resolver の土台）→ T-02（verdict）→ T-03（guard）→
> T-04（遷移表）→ T-05（spec-review 入力）→ T-06（test-case-gen 注入）→ T-07/T-08（prompt）→
> T-09（pin テスト更新）→ T-10（新規テスト）→ T-11（フローテスト再検証）。
> interface（FixTarget / scope / resolver / guard シグネチャ）が固まる T-01〜T-03 の後に
> テスト本体を書く（scenario は spec.md、code は interface 確定後）。

## T-01: FixTarget に test-case-gen を追加し canon scope / resolver を拡張する

- [ ] `src/kernel/report-result.ts`: `FixTarget` union に `"test-case-gen"` を追加する（additive）。
- [ ] `src/core/step/canon-write-scope.ts` `buildScopeForSlug`: `writableByFixer` に
      `["test-case-gen", new Set([`<folder>/test-cases.md`])]` を追加する。他 fixer のエントリと
      docstring の single-source-of-truth 記述を新エントリ込みに更新する。
- [ ] `src/core/step/canon-escalation.ts`: `testCaseGenEffectiveFixer: (f: Finding) => FixTarget = () => "test-case-gen"`
      を追加・export する。`specReviewEffectiveFixer` は変更しない。
- [ ] `report-tool.ts` の conformance fixTarget enum（3 literal）は**変更しない**ことを確認する
      （conformance は test-case-gen を emit しない）。`aggregateFixTarget` も変更しない。

**Acceptance Criteria**:
- `typecheck` が green（FixTarget 拡張で exhaustiveness エラーが出ない）。
- `buildCanonWriteScope(...).writableByFixer.get("test-case-gen")` が `{<folder>/test-cases.md}` を返す。
- 既存 canon-write-scope.test.ts の TC-017/018/019 が無変更で green。

## T-02: deriveSpecReviewVerdict に TC routable 分岐を追加する

- [ ] `src/core/step/judge-verdict.ts` `deriveSpecReviewVerdict` を design D3-4 の優先順に更新する:
      unroutable = (fixable ∩ canonPaths) − TC-routable − spec-fixer-routable を escalation（4a）、
      TC-routable ≥ 1 を needs-fix（4b, severity 問わず）、spec-fixer-routable critical/high を needs-fix（4c）、
      low/medium spec-fixer-routable は approved へ fall-through（観察 pass）。
- [ ] `deriveConformanceVerdict` / `deriveJudgeVerdict` / `deriveRegressionGateVerdict` は**変更しない**
      （承認後の test-cases.md 保護 = escalation を維持）。

**Acceptance Criteria**:
- `deriveSpecReviewVerdict(test-cases.md fixable finding, canonScope)` === `"needs-fix"`。
- `deriveSpecReviewVerdict(request.md fixable finding, canonScope)` === `"escalation"`（不変）。
- request.md + test-cases.md fixable 共存時 === `"escalation"`（4a 優先, 不変）。
- `deriveConformanceVerdict(test-cases.md fixable)` === `"escalation"`（不変）。
- `deriveJudgeVerdict(test-cases.md fixable, canonScope)` === `"escalation"`（不変）。
- 既存 spec-fixer routable の critical/high → needs-fix、low/medium → approved が不変。

## T-03: spec-fixer forward / needs-fix 分岐 guard を再編する

- [ ] `src/core/pipeline/spec-observation.ts`: 既存 `specFixerForwardsToTestGen` を
      `specFixerObservationForward` にリネームする（挙動は不変: not conformance-triggered AND
      最新 spec-review verdict === approved）。docstring を「観察 pass 検出（forward 先は遷移表側が決定）」に更新。
- [ ] `src/core/pipeline/spec-observation.ts`: `specFixerNeedsFixForward(state)` を追加する
      = not conformance-triggered AND 最新 spec-review verdict === "needs-fix"。
- [ ] `src/core/pipeline/spec-observation.ts`: `specReviewNeedsFixIsTcOnly(state)` を追加する（design D4 のロジック）。
      `testCaseGenEffectiveFixer` / `specReviewEffectiveFixer` / `buildCanonWriteScopeFromState` /
      `getLatestJudgeFindings` を用いる。
- [ ] `src/core/pipeline/test-gen-exemption.ts`: `specFixerForwardsToImplementer` を
      `specFixerObservationForward` 参照に追随させる（= `specFixerObservationForward(state) && isTestGenExempt(state)`）。
      import 名も更新する。

**Acceptance Criteria**:
- `specFixerObservationForward` は最新 spec-review approved かつ非 conformance で true、それ以外 false。
- `specFixerNeedsFixForward` は最新 spec-review needs-fix かつ非 conformance で true、
      conformance-triggered（`getConformanceFixContext` 非 null）で false。
- `specReviewNeedsFixIsTcOnly` は TC finding のみで true、spec/design/tasks or 非 canon critical/high 混在で false、
      TC finding 無しで false。
- `specFixerForwardsToImplementer` は免除 type の観察 pass でのみ true。
- `typecheck` が green（旧名 `specFixerForwardsToTestGen` の参照残存なし）。

## T-04: STANDARD_TRANSITIONS を組み替える（design → test-case-gen → spec-review → test-materialize）

- [ ] `src/core/pipeline/types.ts` STANDARD_TRANSITIONS の design/spec-review/test-case-gen/spec-fixer
      ブロックを design D1 の 17 行に置き換える。import を新 guard 名（`specFixerObservationForward` /
      `specFixerNeedsFixForward` / `specReviewNeedsFixIsTcOnly`）へ更新する。
- [ ] first-match-wins の順序を厳守する:
      DESIGN: `success[isTestGenExempt]→SPEC_REVIEW` を `success→TEST_CASE_GEN` より前に。
      SPEC_REVIEW approved: `[specReviewHasRoutableFixables]→SPEC_FIXER` → `[isTestGenExempt]→IMPLEMENTER`
      → `→TEST_MATERIALIZE`。
      SPEC_REVIEW needs-fix: `[specReviewNeedsFixIsTcOnly]→TEST_CASE_GEN` → `→SPEC_FIXER`。
      TEST_CASE_GEN: `success→SPEC_REVIEW` / `error→escalate`。
      SPEC_FIXER approved: `[specFixerForwardsToImplementer]→IMPLEMENTER`
      → `[specFixerObservationForward]→TEST_MATERIALIZE` → `[specFixerNeedsFixForward]→TEST_CASE_GEN`
      → `→SPEC_REVIEW`。
- [ ] `FAST_TRANSITIONS` は変更しない。
- [ ] コメント（各 row の意図）を新モデルに更新する。

**Acceptance Criteria**:
- `STANDARD_TRANSITIONS.length` === 52。
- `design success[isTestGenExempt] → spec-review` と `design success → test-case-gen` が存在し、前者が先。
- `test-case-gen success → spec-review` が存在し、`test-case-gen success → test-materialize` は存在しない。
- `spec-review approved → test-materialize`（無 when）が存在し、`spec-review approved → test-case-gen` は存在しない。
- `spec-fixer approved → test-materialize`（when あり）と `spec-fixer approved → test-case-gen`（when あり）が
      両方存在し、`spec-fixer approved → spec-review`（無 when fallback）が最後に存在する。
- `FAST_TRANSITIONS` に spec-review / spec-fixer / test-case-gen row が無い（不変）。

## T-05: spec-review の入力に test-cases.md を条件付きで追加する

- [ ] `src/core/step/spec-review.ts` reads(): `isTestGenRequired(state.request.type)`
      （`config/type-config.js` から import）が真のとき `<folder>/test-cases.md` を追加する。
      既存入力（request/spec/design/tasks）は不変。

**Acceptance Criteria**:
- 非免除 type の reads() が `specrunner/changes/<slug>/test-cases.md` を含む。
- 免除 type の reads() が test-cases.md を含まない。
- 既存 spec-review-reads.test.ts が無変更で green。

## T-06: test-case-gen 再生成時に spec-review の TC finding を注入する

- [ ] `src/core/step/test-case-gen.ts` buildMessage: `getLatestJudgeFindings(state, SPEC_REVIEW)` を読み、
      test-cases.md（`buildCanonWriteScopeFromState` の test-case-gen writable set）への finding があれば
      `buildFindingsBlock` で本文に埋め込み、解消対象として指示する。初回生成（finding 無し）は従来メッセージ。
- [ ] `writes()` は {test-cases.md} のまま変更しない（要件 4）。pipeline 位置 doc コメントを
      `design → test-case-gen → spec-review` に更新する。

**Acceptance Criteria**:
- 最新 spec-review run に test-cases.md finding がある state で buildMessage が当該 finding 本文を含む。
- spec-review run が無い（初回）state で buildMessage は従来どおり finding 埋め込みなし。
- `writes()` が {test-cases.md} のみを返す。

## T-07: spec-review prompt に test-cases.md 照合観点を追加する

- [ ] `src/prompts/spec-review-system.ts`: Contract の入力に test-cases.md を追記する。
- [ ] Method に照合観点 3 点を追加する: (a) TC↔spec の Scenario/Requirement 網羅、(b) tasks↔TC の実装計画の穴、
      (c) TC の抽象度逸脱（実装の API・内部構造・assertion 形式への踏み込み）検査。
- [ ] initial message の「Review all spec files（request/design/tasks/spec）」に test-cases.md を追記する。

**Acceptance Criteria**:
- `SPEC_REVIEW_SYSTEM_PROMPT` が TC↔spec / TC↔tasks / TC 抽象度逸脱 の照合指示を含む。
- initial message テンプレートが test-cases.md を参照する。

## T-08: test-case-gen prompt を振る舞いレベル化し責務を固定する

- [ ] `src/prompts/test-case-gen-system.ts`: TC は「何を確認できればよいか」を記述し、特定の関数呼び出し手順・
      内部状態の具体値・assertion の形式を GIVEN/WHEN/THEN に書かない（検証手段は実装側の裁量）という指示を追加する。
- [ ] tasks.md を編集せず、tasks と TC の不整合は test-cases.md 内の申し送り注記として記録し判定を spec-review に
      委ねる、という責務固定の指示を追加する。pipeline 位置コメントを `design → test-case-gen → spec-review` に更新する。

**Acceptance Criteria**:
- `TEST_CASE_GEN_SYSTEM_PROMPT` が振る舞いレベル指示（実装構造へ踏み込まない）を含む。
- `TEST_CASE_GEN_SYSTEM_PROMPT` が tasks/TC 不整合の申し送り注記指示を含む。
- 既存 test-case-gen-step.test.ts TC-007 のキーワード（Category/Source/Summary/blocked_reasons/Result）が残存し green。

## T-09: 既存 pin テストを新遷移に更新する（design の全列挙に対応）

- [ ] `tests/unit/core/pipeline/pipeline.transitions.test.ts`: TC-012 requiredEdges の
      `spec-review approved→test-case-gen`→`test-materialize`、`test-case-gen success→test-materialize`→`spec-review`、
      `design success→test-case-gen` 追加。TC-030 length 49→52。
- [ ] `tests/unit/pipeline/transition-when.test.ts`: TC-WHEN-02 length 49→52（コメント更新）。
- [ ] `tests/unit/core/pipeline/spec-observation-autofix.test.ts`: TC-007（→test-materialize）、
      TC-008（→test-materialize, guard `specFixerObservationForward`）、TC-009/TC-027（needs-fix spec-fixer→test-case-gen）、
      TC-010（conformance→spec-review 維持）、TC-013（新順序で再構成）、TC-026（改名追随）、TC-029 length 49→52、
      `makeCanonScope()` に test-case-gen エントリ追加。
- [ ] `src/core/pipeline/__tests__/test-gen-exemption.test.ts`: TC-007（非免除 →test-materialize）、
      TC-012（unconditional 先を test-materialize に、design 免除 row 先行 assertion 追加）。
- [ ] `tests/test-case-gen-step.test.ts`: TC-004（design→test-case-gen + design[exempt]→spec-review）、
      TC-005（test-case-gen success→spec-review、→implementer 不在は維持）。
- [ ] `tests/core/pipeline/pipeline.test.ts`: TC-067 の spec-review approved / test-case-gen success /
      spec-fixer 行を新モデルへ更新。
- [ ] `tests/unit/step/test-materialize-boundary.test.ts`: TC-TMB-18 を新 entry（spec-review approved /
      spec-fixer 観察 pass）に書き換え。
- [ ] `tests/unit/core/step/canon-write-scope.test.ts`: drift-guard に test-case-gen ケース
      （writes() ∩ canon = {test-cases.md}）を追加。

**Acceptance Criteria**:
- 上記 pin テストが新遷移で green。
- design で列挙した「無変更」テスト（spec-review-reads / fast-descriptor / pipeline-roles /
      spec-observation TC-015 / test-gen-exemption TC-016）が無変更で green。

## T-10: 受け入れ基準を直接固定する新規テストを追加する

- [ ] 通常経路 `design → test-case-gen → spec-review → test-materialize` を transition 解決で固定。
- [ ] needs-fix ループ `spec-fixer → test-case-gen → spec-review` を固定（`specFixerNeedsFixForward` 経路）。
- [ ] 観察 pass 後に spec-review が再実行されないこと（stop gate）を固定。
- [ ] 免除 type `design → spec-review 直行`・test-case-gen を通らないことを固定。
- [ ] spec-review reads() が test-cases.md を含む（非免除）/ 含まない（免除）ことを固定。
- [ ] spec-review prompt に TC↔spec / TC↔tasks / TC 抽象度の照合観点が含まれることを固定。
- [ ] test-case-gen prompt に振る舞いレベル指示が含まれることを固定。
- [ ] `deriveSpecReviewVerdict`(test-cases.md fixable) === needs-fix（escalation でない）を固定。
- [ ] TC-only needs-fix → test-case-gen（spec-fixer skip）/ 混在 → spec-fixer を固定（`specReviewNeedsFixIsTcOnly`）。
- [ ] TC finding + medium/low severity spec finding の混在ケースで `specReviewNeedsFixIsTcOnly=false` → spec-fixer を固定（severity 問わず spec routable が 1 件でもあれば TC-only にならない）。
- [ ] `deriveConformanceVerdict` / `deriveJudgeVerdict`(test-cases.md fixable) === escalation（承認後保護）を固定。
- [ ] test-case-gen buildMessage が再生成時に spec-review の TC finding を注入することを固定。

**Acceptance Criteria**:
- 上記 11 項がテストで固定され green。
- 各テストが scenario（spec.md）に対応し、TC ID を frozen scenario ID として一意採番する。
- TC + medium/low spec 混在ケースは `specReviewNeedsFixIsTcOnly=false` を直接 assert するテストで固定される。

## T-11: フローテストを再検証し必要なら fixture を更新する

- [ ] `tests/pipeline-integration.test.ts`（TC-010/011/012）を実行し、test-case-gen の走行位置変化
      （design phase 先頭 + needs-fix ループ内）で session count / sessionIds 配列がずれる場合のみ fixture を更新する。
      spec-review / spec-fixer の run 数 assertion 意図は保つ。
- [ ] `tests/unit/core/pipeline/pipeline.conformance-routing.test.ts`（TC-CONFRT-07）を実行し、
      spec-fixer#3 が spec-review へ戻る（conformance-triggered）ことを維持しつつ、needs-fix ループへの
      test-case-gen 挿入で run 数がずれる場合のみ更新する。
- [ ] `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts` を実行し、spec phase 通過フローの回帰を確認する。

**Acceptance Criteria**:
- 上記フローテストが green（更新した場合は observable 挙動が新遷移と一致することを確認）。
- 更新は最小限（意図しない挙動変更を混入しない）。

## T-12: 最終検証

- [ ] `typecheck && test` が green。
- [ ] `STANDARD_TRANSITIONS.length` === 52 が全 length pin と一致する。
- [ ] design で「無変更 green」と列挙したテストが実際に無変更で green である。

**Acceptance Criteria**:
- `typecheck` が green。
- `test` が green。
