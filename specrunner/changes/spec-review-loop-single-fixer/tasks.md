# Tasks: spec-review loop の単一 fixer 化

実装順序は T-01 → T-06（production）→ T-07/T-08（tests）→ T-09（gate）。
各 production 変更は対応する test 更新まで含めて 1 単位。

## T-01: spec-fixer の write scope に test-cases.md を追加する (D1)

- [ ] `src/core/step/canon-write-scope.ts` の `writableByFixer` の `"spec-fixer"` エントリに `` `${folder}/test-cases.md` `` を追加する（spec.md/design.md/tasks.md/test-cases.md の 4 要素にする）。`"test-case-gen"` エントリ（= {test-cases.md}）は producer 宣言として**そのまま残す**。
- [ ] 同ファイルの doc コメント（先頭 header 10-13行 / `buildScopeForSlug` の 26-30行 / `buildCanonWriteScope` の 57-61行）の「spec-fixer: {spec.md, design.md, tasks.md}」を「{spec.md, design.md, tasks.md, test-cases.md}」に更新する。
- [ ] `src/core/step/spec-fixer.ts` の `writes()`（99-106行）に `` { path: `${folder}/test-cases.md` } `` を追加する（drift-guard TC-029 が map と writes() の一致を要求するため必須）。
- [ ] `src/prompts/spec-fixer-system.ts` の Contract の「入力」「出力」「write-set」に `specrunner/changes/<slug>/test-cases.md` を追記し、Method に「test-cases.md を修正する場合は**既存の TC を尊重した targeted 修正**を行い、**再生成はしない**（finding が指す TC のみを最小限に変更し、無関係な TC・operator 編集には触れない）」旨を追記する。

**Acceptance Criteria**:
- `buildCanonWriteScope(state, deps).writableByFixer.get("spec-fixer")` が `test-cases.md` を含む。
- `SpecFixerStep.writes()` が `test-cases.md` / `spec.md` / `design.md` / `tasks.md` を返す。
- drift-guard `tests/unit/core/step/canon-write-scope.test.ts`（TC-029）が green（spec-fixer map == writes() ∩ canonPaths）。
- `SPEC_FIXER_SYSTEM_PROMPT` に `test-cases.md` と「再生成しない / targeted」の趣旨の文字列が含まれる。

## T-02: deriveSpecReviewVerdict から TC 分岐を削除する (D2)

- [ ] `src/core/step/judge-verdict.ts` の `testCaseGenEffectiveFixer` import（16行）を削除する。
- [ ] `deriveSpecReviewVerdict`（86-118行）から `tcRoutable` の算出（97行）と 4b 分岐（`if (tcRoutable.length > 0) return "needs-fix";`、107-108行）を削除する。
- [ ] 4a の二重不能判定を `!specRoutableFiles.has(f.file) && !tcRoutableFiles.has(f.file)` から `!specRoutableFiles.has(f.file)` に単純化し、`tcRoutableFiles` の生成を削除する。
- [ ] 関数 doc コメント（63-85行）から test-case-gen / 4b の記述を削除し、「fixable canon findings は spec-fixer に route。spec-fixer 非 writable（request.md / attestation）のみ escalation」に更新する。

**Acceptance Criteria**:
- `deriveSpecReviewVerdict([medium fixable on test-cases.md], true, evidence, canonScope)` === `"approved"`（low/medium → observation auto-fix fall-through）。
- `deriveSpecReviewVerdict([high fixable on test-cases.md], ...)` === `"needs-fix"`。
- `deriveSpecReviewVerdict([fixable on request.md], ...)` === `"escalation"`（維持）。
- `deriveSpecReviewVerdict` が `testCaseGenEffectiveFixer` を参照しない。

## T-03: testCaseGenEffectiveFixer を削除し dual-resolver を単純化する (D3)

- [ ] `src/core/step/canon-escalation.ts` の `testCaseGenEffectiveFixer` export（58-63行、doc コメント含む）を削除する。
- [ ] `src/core/step/step-completion.ts` の `testCaseGenEffectiveFixer` import（45行）を削除する。
- [ ] 同ファイルの spec-review 用 dual-resolver（211-218行）を `lastCanonResolver = specReviewEffectiveFixer;` に単純化する（`else` 分岐の `judgeEffectiveFixer` はそのまま）。関連コメント（212-214行）を更新する。

**Acceptance Criteria**:
- `testCaseGenEffectiveFixer` が src/ 配下のどこにも存在しない（grep で 0 件、テスト/成果物を除く）。
- spec-review の escalationReason は `specReviewEffectiveFixer`（= spec-fixer）で解決され、test-cases.md 宛 fixable finding は unroutable として escalation reason に含まれない。
- `bun run typecheck` が canon-escalation / step-completion / judge-verdict で型エラーを出さない。

## T-04: TC-only / TC 再生成の述語と transition を削除する (D3)

- [ ] `src/core/pipeline/spec-observation.ts` から `specReviewNeedsFixIsTcOnly`（112-142行）と `specFixerNeedsFixForward`（87-110行）を削除する。`testCaseGenEffectiveFixer` import（19行）を削除する。`specReviewHasRoutableFixables` / `specFixerObservationForward` は**維持**する。
- [ ] `src/core/pipeline/types.ts` の import（9-12行）から `specReviewNeedsFixIsTcOnly` と `specFixerNeedsFixForward` を除く。
- [ ] `STANDARD_TRANSITIONS` から TC-only needs-fix 行（261-262行: `SPEC_REVIEW needs-fix → TEST_CASE_GEN` guarded by `specReviewNeedsFixIsTcOnly`）を削除する。
- [ ] `STANDARD_TRANSITIONS` から TC 再生成行（269-270行: `SPEC_FIXER approved → TEST_CASE_GEN` guarded by `specFixerNeedsFixForward`）を削除する。
- [ ] 残す行を確認: `SPEC_REVIEW needs-fix → SPEC_FIXER`（263行、unconditional）、`SPEC_FIXER approved → IMPLEMENTER`（268行、`specFixerObservationForward` guarded）、`SPEC_FIXER approved → SPEC_REVIEW`（272行、unconditional）、`DESIGN → TEST_CASE_GEN`（254行）、`TEST_CASE_GEN → SPEC_REVIEW`（265行）、exempt bypass（253行）。
- [ ] 削除に伴い不要になったコメント（256-264行あたり）を整理する。

**Acceptance Criteria**:
- `specReviewNeedsFixIsTcOnly` / `specFixerNeedsFixForward` が src/ 配下に存在しない（grep 0 件）。
- `STANDARD_TRANSITIONS` に `to === TEST_CASE_GEN` の行は `DESIGN → TEST_CASE_GEN`（1 本、`when: isTestGenExempt` の逆側）のみ。`SPEC_REVIEW → TEST_CASE_GEN` と `SPEC_FIXER → TEST_CASE_GEN` は 0 本。
- `SPEC_FIXER` の transition 行は {approved→implementer(guarded), approved→spec-review(unconditional), error→escalate} の 3 本。
- `DESIGN → TEST_CASE_GEN → SPEC_REVIEW` の初回経路と exempt bypass 行は不変。

## T-05: loopIntermediateSteps パラメータを全削除する (D4)

- [ ] `src/core/pipeline/registry.ts` の STANDARD_DESCRIPTOR から `loopIntermediateSteps: new Set([STEP_NAMES.TEST_CASE_GEN])`（87行）とその上のコメント（85-86行）を削除する。
- [ ] `src/core/pipeline/types.ts` の `PipelineDescriptor` から `loopIntermediateSteps?` field（141-156行、doc コメント含む）を削除する。
- [ ] `src/core/pipeline/run.ts` の Pipeline 構築（72行）から `loopIntermediateSteps: descriptor.loopIntermediateSteps` を削除する。
- [ ] `src/core/pipeline/pipeline.ts` から `loopIntermediateSteps` の private field（95-99行）、constructor param（113行）、代入（126行）を削除する。
- [ ] 同ファイルの newEpisode 判定（527行）を `let newEpisode = currentStep !== pairedFixerForNext && !this.loopIntermediateSteps.has(currentStep);` から `let newEpisode = currentStep !== pairedFixerForNext;` に変更し、関連コメント（523-526行）を整理する。

**Acceptance Criteria**:
- `loopIntermediateSteps` が src/ 配下に存在しない（grep 0 件、テスト/成果物を除く）。
- spec-review ⇄ spec-fixer が透過化なしで正しく same-episode 判定される（`currentStep === pairedFixerForNext` で newEpisode=false）。
- fast / design-only pipeline のビルド・実行が回帰しない（元々 loopIntermediateSteps を未使用）。

## T-06: test-case-gen.ts の needs-fix finding 注入を除去する (D5)

- [ ] `src/core/step/test-case-gen.ts` の `selectRoutableCanonFindings, testCaseGenEffectiveFixer` import（8行）と `buildCanonWriteScope` / `getLatestJudgeFindings` の未使用化した import を削除する。
- [ ] `buildMessage`（83-104行）の spec-review findings 注入分岐（`allFindings` / `canonScope` / `tcFindings` / `specReviewFindingsBlock`）を削除し、`return buildTestCaseGenInitialMessage({ slug: deps.slug, branch: state.branch, requestContent: deps.request.content });` にする（`specReviewFindingsBlock` は optional なので省略）。

**Acceptance Criteria**:
- `test-case-gen.ts` が `testCaseGenEffectiveFixer` / `selectRoutableCanonFindings` を参照しない。
- test-case-gen の初回生成メッセージが従来の first-run（findings なし）と同一。
- `bun run typecheck` green。

## T-07: #1015 の歯と routing pin を追加する (受け入れ基準の核)

- [ ] **#1015 の歯（integration）**: operator が test-cases.md に「finding と無関係の行」を含む状態で、spec-review needs-fix（test-cases.md 宛の finding）→ spec-fixer → spec-review を一巡させる pin を追加する。mock spec-fixer は「finding 対象 TC のみを変更し無関係行を残す」targeted 修正を模し、一巡後に test-cases.md の無関係行が保存されていることを assert する。合わせて**ループ中に test-case-gen step が一度も実行されない**ことを step 実行列で assert する（wholesale 再生成経路の不在＝#1015 の根本原因の消滅を pin）。
- [ ] **routing pin（unit）**: `deriveStepCompletion`（または `deriveSpecReviewVerdict` + escalationReason 経路）で、spec-review の test-cases.md 宛 fixable finding が escalation にならず spec-fixer に route されることを pin する（canon-finding escalation の対象から test-cases.md が外れる）。
- [ ] **transition pin（unit）**: needs-fix 一巡（spec-review needs-fix → spec-fixer approved → spec-review）が transition 表上で成立し、その一巡に `TEST_CASE_GEN` が現れないことを pin する。
- [ ] **budget pin（unit/integration）**: spec-review ⇄ spec-fixer の収束予算（episode 検出）が `loopIntermediateSteps` なしで正しく数えられ、needs-fix 継続時に `SPEC_REVIEW_RETRIES_EXHAUSTED` に到達することを pin する（既存 `tests/pipeline-integration.test.ts` TC-012 の維持/更新で満たしてよい）。

**Acceptance Criteria**:
- 上記 4 pin が green で、いずれも新挙動（single-fixer / no-regeneration-in-loop）に依拠している。
- 歯テストは「test-case-gen がループ中に起動しない」ことを observable な step 実行列で検証する（agent の内部判断に依存しない）。

## T-08: 旧挙動を pin する既存テストの期待を更新する（default-pin 列挙）

意図的な挙動変更のため、以下の旧挙動 pin を新挙動へ更新する（削除ではなく期待の付け替えを基本とし、対象が消滅した pin のみ削除）。

- [ ] `tests/unit/core/pipeline/registry-invariants.test.ts` T-06-6（153-165行）: 「loopIntermediateSteps が TEST_CASE_GEN を含む」→「`STANDARD_DESCRIPTOR.loopIntermediateSteps` が `undefined`（field 削除）」に反転。
- [ ] `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts`:
  - TC-002（224-229行）「spec-fixer は test-cases.md を含まない」→「含む」に反転。
  - TC-001 に writes() が test-cases.md を含む assertion を追加。
  - TC-005（316-353行）「test-cases.md fixable → needs-fix（test-case-gen へ）」→「medium test-cases.md fixable → approved（observation auto-fix）かつ escalation にならない」に更新。
  - TC-006（request.md escalation）は不変で green を確認。
- [ ] `tests/unit/core/pipeline/spec-observation-autofix.test.ts`:
  - TC-009 / TC-010（448-599行付近）: `spec-fixer → test-case-gen`（`specFixerNeedsFixForward`）前提の pin を「spec-fixer approved(needs-fix path) → spec-review（unconditional）」に更新。`specFixerNeedsFixForward` 参照を除去。
  - TC-015（FAST に test-case-gen 行なし）は不変で green を確認。
- [ ] `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts`:
  - `specReviewNeedsFixIsTcOnly` 依存 pin（TC-008 / TC-028 等）: 述語削除に伴い削除。
  - `specFixerNeedsFixForward` 依存 pin（TC-009 系 / TC-022 等）: 削除または「→ spec-review」へ更新。
  - TC-017（test-cases.md fixable → needs-fix）: 「low/medium → approved、high/critical → needs-fix」へ更新。
  - TC-019（承認後 test-cases.md finding の operator 保護）: 「spec-fixer targeted 修正で保護（再生成しない）」へ更新。
  - `SPEC_FIXER → TEST_CASE_GEN` transition を探す pin（550/561/595/777行付近）: 削除。
  - 不変で残す: TC-002（DESIGN→TEST_CASE_GEN→SPEC_REVIEW）、TC-012/TC-013（spec-review reads の test-cases.md）、TC-014/TC-015（prompts）、TC-016（test-case-gen writes test-cases.md）。
- [ ] `tests/unit/pipeline/transition-when.test.ts`: `specReviewNeedsFixIsTcOnly` / `specFixerNeedsFixForward` / 削除 transition を参照する assertion を除去・更新する。
- [ ] 上記以外に削除シンボル（`testCaseGenEffectiveFixer` / `specReviewNeedsFixIsTcOnly` / `specFixerNeedsFixForward` / `loopIntermediateSteps`）を参照する test が残っていないか grep で確認し、残存を解消する。

**Acceptance Criteria**:
- 削除シンボルを import/参照する test ファイルが 0 件（grep）。
- 更新した pin はすべて新挙動を根拠に green。
- `design → test-case-gen` 初回経路と exempt bypass の既存テストが**無改変**で green（transition 表の変更対象外であることの確認）。

## T-09: gate

- [ ] `bun run typecheck` green。
- [ ] `bun run test` green。

**Acceptance Criteria**:
- typecheck / test が両方 green。
- 削除対象（`specReviewNeedsFixIsTcOnly` / `testCaseGenEffectiveFixer` / `specFixerNeedsFixForward` / TC 再生成・TC-only transition / `loopIntermediateSteps`）が src/ に存在しないことを grep で確認できる。
