# Tasks: spec フェーズの observation auto-fix

## T-01: `deriveSpecReviewVerdict` の 4b を routable critical/high のみ needs-fix に絞る

- [ ] `src/core/step/judge-verdict.ts` の `deriveSpecReviewVerdict` の判定 4b を変更する。
      現行の「`selectRoutableCanonFindings(...).length > 0` → `needs-fix`」を、
      `selectRoutableCanonFindings(findings, canonScope, specReviewEffectiveFixer)` のうち
      `severity === "critical" || severity === "high"` のものが ≥ 1 のときのみ `needs-fix` に変更する。
      低位（low / medium）のみのときは fall-through する。
- [ ] 4a（`selectUnroutableCanonFindings(..., specReviewEffectiveFixer).length > 0` → `escalation`）・
      判定 1（`!ok` → escalation）・判定 2（vacuous → escalation）・判定 3（decision-needed → escalation）・
      判定 5（非 canon critical|high → needs-fix）・判定 6（`approved`）は変更しない。
- [ ] 関数 doc コメントの優先順位記述（4b が severity-independent）を新挙動に更新する。
      `selectRoutableCanonFindings` の import は 4b で引き続き使用する。
- [ ] `deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict` /
      `deriveRequestReviewVerdict` / `collectFixableFindings` は変更しない。

**Acceptance Criteria**:
- medium/low fixable on `spec.md` / `design.md` / `tasks.md`（routable、他に blocking なし）→ `approved`。
- high/critical fixable on `spec.md`（routable）→ `needs-fix`。
- fixable on `request.md` / `test-cases.md` / attestation（unroutable）→ `escalation`。
- 非 canon medium fixable → `approved`、非 canon critical|high → `needs-fix`、decision-needed / `ok:false` /
  vacuous → `escalation`。
- unroutable + routable 共存 → `escalation`（4a 優先、不変）。
- `typecheck` が green。

## T-02: state から canonScope を導出する `buildCanonWriteScopeFromState` を追加する

- [ ] `src/core/step/canon-write-scope.ts` に `buildCanonWriteScopeFromState(state: JobState): CanonWriteScope`
      を追加する。slug は `getJobSlug(state)`（`src/state/job-slug.ts`）から導出する。
- [ ] 内部の scope 構築を private helper（例 `buildScopeForSlug(slug: string): CanonWriteScope`）に切り出し、
      既存 `buildCanonWriteScope(state, deps)`（`deps.slug` 使用）と `buildCanonWriteScopeFromState(state)` の
      両方が同一 helper に委譲する。`buildCanonWriteScope(state, deps)` の外部挙動は不変。
- [ ] `canonPaths` / `writableByFixer` の内容（code-fixer=∅ / implementer={tasks.md} /
      spec-fixer={spec.md,design.md,tasks.md}）は不変。

**Acceptance Criteria**:
- `buildCanonWriteScopeFromState(state)` が `buildCanonWriteScope(state, { slug: getJobSlug(state) })` と同一の
  `CanonWriteScope` を返す。
- 既存 `canon-write-scope.test.ts`（drift-guard TC-029）が無変更で green。
- `typecheck` が green。

## T-03: spec observation 遷移 predicate モジュールを追加する

- [ ] `src/core/pipeline/spec-observation.ts`（純関数）を新設し、次の 2 関数を export する。
  - `specReviewHasRoutableFixables(state: JobState): boolean` —
    `getLatestJudgeFindings(state, STEP_NAMES.SPEC_REVIEW)` の findings に対し
    `selectRoutableCanonFindings(findings, buildCanonWriteScopeFromState(state), specReviewEffectiveFixer).length > 0`。
    spec-review run が無い / findings 無しのときは `false`。
  - `specFixerForwardsToTestGen(state: JobState): boolean` —
    `getConformanceFixContext(state, STEP_NAMES.SPEC_FIXER) === null` かつ
    最新 spec-review run の `outcome.verdict === "approved"`（spec-review run が無ければ `false`）。
- [ ] import 元: `getLatestJudgeFindings` / `getConformanceFixContext`（`step/fixer-helpers.js`）、
      `selectRoutableCanonFindings` / `specReviewEffectiveFixer`（`step/canon-escalation.js`）、
      `buildCanonWriteScopeFromState`（`step/canon-write-scope.js`）、`STEP_NAMES`（`step/step-names.js`）。
- [ ] 循環 import が生じないことを確認する（`types.ts` を import しない。predicate は `(state) => boolean` のみ）。

**Acceptance Criteria**:
- `specReviewHasRoutableFixables`: 最新 spec-review に routable canon fixable（spec/design/tasks）があれば `true`、
  非 canon fixable のみ・findings 無しなら `false`。
- `specFixerForwardsToTestGen`: 最新 spec-review verdict `approved` かつ conformance context null → `true`；
  最新 spec-review verdict `needs-fix` → `false`；conformance `needs-fix:spec-fixer` context あり → `false`。
- `typecheck` が green。

## T-04: STANDARD_TRANSITIONS に guarded 行を 2 本追加する

- [ ] `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` に次を追加する。順序は既存無条件行より**前**。
  - 既存 `{ SPEC_REVIEW, "approved", TEST_CASE_GEN }`（:233）の直前に
    `{ step: SPEC_REVIEW, on: "approved", to: SPEC_FIXER, when: specReviewHasRoutableFixables }`。
  - 既存 `{ SPEC_FIXER, "approved", SPEC_REVIEW }`（:241）の直前に
    `{ step: SPEC_FIXER, on: "approved", to: TEST_CASE_GEN, when: specFixerForwardsToTestGen }`。
- [ ] `spec-observation.js` から 2 predicate を import する。
- [ ] `SPEC_REVIEW needs-fix → SPEC_FIXER`・`SPEC_FIXER error → escalate`・その他既存行は不変。
- [ ] `FAST_TRANSITIONS` は不変（spec-review / spec-fixer / test-case-gen 行を持たない）。

**Acceptance Criteria**:
- 最新 spec-review が `approved` かつ routable fixable ≥ 1 → 遷移解決で `spec-review` on `approved` = `spec-fixer`。
- 最新 spec-review が `approved` かつ routable fixable 0 → `spec-review` on `approved` = `test-case-gen`。
- observation-pass context（spec-review approved・conformance context null）で `spec-fixer` on `approved` = `test-case-gen`。
- needs-fix context（spec-review verdict needs-fix）・conformance context（needs-fix:spec-fixer）で
  `spec-fixer` on `approved` = `spec-review`。
- `FAST_TRANSITIONS` 無変更。

## T-05: findings ledger に spec-review 由来 fixable finding を載せる

- [ ] `src/core/pipeline/findings-ledger.ts` に
      `collectSpecReviewLedger(state: JobState, canonScope?: CanonWriteScope): Finding[]` を追加する。
      `state.steps[STEP_NAMES.SPEC_REVIEW]` の全 StepRun を走査し `collectFixableFindings` で fixable を集め、
      `dedupeFindings` する。canonScope 指定時は `specReviewEffectiveFixer` 基準で
      `selectUnroutableCanonFindings` に該当するものを除外する（spec/design/tasks は保持、
      request.md / test-cases.md / attestation は除外）。canonScope 省略時は除外なし。
- [ ] `src/core/step/regression-gate.ts` の `buildMessage` と `skipWhen` の 2 箇所で、既存
      `collectFindingsLedger(deriveImplReviewerChain(state), state, canonScope)` の結果に
      `collectSpecReviewLedger(state, canonScope)` を合流させ、`dedupeFindings([...spec, ...impl])` を台帳とする。
      `skipWhen` は合流後の台帳が空のときのみ skip する。
- [ ] `collectFindingsLedger` / `collectParallelFixerFindings` / `deriveImplReviewerChain` /
      `deriveRegressionGateVerdict` は変更しない。

**Acceptance Criteria**:
- spec-review run に `medium` fixable on `spec.md` があるとき、regression-gate の台帳計算にその finding が含まれる。
- spec-review 由来のみの台帳（impl chain 空）で regression-gate が skip されない。
- request.md / test-cases.md への spec-review fixable finding は canonScope 付きで台帳から除外される。
- 既存 `findings-ledger.test.ts` / `findings-ledger-canon.test.ts` が無変更で green。
- `typecheck` が green。

## T-06: 受け入れ基準を固定する新規テストを追加する

- [ ] verdict 単体テスト: medium/low fixable on spec.md/design.md/tasks.md → `approved`；
      high fixable on spec.md → `needs-fix`；request.md fixable → `escalation` + `escalationReason`。
- [ ] 遷移テスト（observation pass）: 最新 spec-review が `approved` + `medium` fixable on spec.md の state で、
      標準遷移表が `spec-review` on `approved` → `spec-fixer`、続いて（conformance context なし）
      `spec-fixer` on `approved` → `test-case-gen` に解決し、spec-review が再実行されないことを固定する。
- [ ] 遷移テスト（needs-fix 往復不変）: high fixable on spec.md → `needs-fix` → `spec-fixer` →
      （最新 spec-review verdict needs-fix のため）`spec-fixer` on `approved` → `spec-review` を固定する。
      critical fixable on spec.md も同様に `needs-fix` → `spec-review` 往復となることを確認する。
- [ ] 遷移テスト（conformance reverification 不変）: conformance `needs-fix:spec-fixer`（最新 spec-review より新しい）
      起点の spec-fixer が `spec-fixer` on `approved` → `spec-review`（`test-case-gen` に直行しない）を固定する。
- [ ] ledger テスト: observation pass で消化された spec-review の fixable finding が
      `collectSpecReviewLedger` / regression-gate の台帳入力に含まれることを固定する。
- [ ] escalation 不変テスト: request.md への fixable finding（unroutable）が `escalation` + `escalationReason` で
      あることを **既存テスト無変更**で維持する（`spec-review-fixer-routing.test.ts` TC-003 / TC-006）。
- [ ] 予算テスト: observation pass で spec-review が 1 回だけ実行され、ループ反復カウントが増えないことを固定する
      （`spec-review-fixer-routing.test.ts` TC-009 の Pipeline 駆動構成を流用し、spec-review approved+fixable →
      spec-fixer → test-case-gen で spec-review 実行回数 = 1 を assert する）。

**Acceptance Criteria**:
- 上記各テストが green。
- TC ID を採番する場合は既存 TC と重複しない番号を用いる。

## T-07: 期待値を更新した既存テストを列挙し implementation-notes に記録する

- [ ] `#913` の「severity 不問 needs-fix」を期待する既存単体テストを、新挙動（routable low/medium → approved）に
      合わせて更新する。少なくとも次を確認・更新する（実際に赤くなるものを実行で確定させる）:
  - `src/core/step/__tests__/spec-review-fixer-routing.test.ts`
    - TC-001: `deriveSpecReviewVerdict(medium fixable on spec.md)` の期待を `needs-fix` → `approved`。
      2 番目のサブテスト（`STANDARD_TRANSITIONS` に `spec-review needs-fix → spec-fixer` 行がある）は不変で保持。
    - TC-002: `deriveSpecReviewVerdict(low fixable on design.md)` の期待を `needs-fix` → `approved`。
    - TC-005: spec.md medium fixable の `deriveStepCompletion` verdict を `needs-fix` → `approved`
      （`escalationReason` 未設定は不変）。
    - TC-013: `deriveSpecReviewVerdict(medium fixable on tasks.md)` の期待を `needs-fix` → `approved`。
      test-cases.md → `escalation` のサブテストは不変で保持。
    - TC-015: `checked>0 with spec.md fixable (medium)` の期待を `needs-fix` → `approved`。
      vacuous（checked=0）→ `escalation` サブテストは不変。
    - TC-016（非 canon critical/high → needs-fix）・TC-007（非 canon medium → approved）・
      TC-003 / TC-004 / TC-006 / TC-008 / TC-010〜012 / TC-017〜020 は不変で green を確認する。
  - `tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts`
    - TC-003: 2 つのサブテストの `deriveSpecReviewVerdict` / `deriveStepCompletion` verdict 期待を
      `needs-fix` → `approved`（`escalationReason` 未設定は不変）。TC-004（needs-fix → spec-fixer 行）は不変。
  - `tests/unit/core/pipeline/pipeline.transitions.test.ts`
    - TC-030: `STANDARD_TRANSITIONS.length` の期待を `44` → `46`（guarded 行 +2）に更新し、コメントを更新する。
  - `tests/unit/core/pipeline/pipeline.conformance-routing.test.ts`
    - TC-CONFRT-07: すべてのステップに同一タイムスタンプ（`'2026-01-01T00:00:00.000Z'`）を使用する。
      guarded 遷移追加後、conformance 起動の spec-fixer#3 において `getConformanceFixContext` の
      recency check（`>=` 条件：同一タイムスタンプ → equal → null）が null を返すため、
      `specFixerForwardsToTestGen` が true となり spec-fixer#3 は spec-review reverification をスキップして
      test-case-gen へ直行する。最終アサーション（specFixerCallCount===3 / awaiting-archive）は通過するため
      テストは赤くならないが、本来の conformance→spec-fixer→spec-review reverification フローは検証されなくなる。
      T-06 の新規テストが proper timestamps で reverification 不変条件をカバーしていることを実装時に確認する。
      **期待値変更は不要。ただし上記フロー変化をこのリストに記録する（implementation-notes にも転記すること）。**
- [ ] 上記の「期待値を更新した既存テスト」の最終リスト（ファイル・TC ID・変更内容）を
      `specrunner/changes/spec-observation-autofix/implementation-notes.md` に列挙する。

**Acceptance Criteria**:
- `implementation-notes.md` が更新した既存テストを漏れなく列挙している。
- 更新は期待値のみで、観測挙動を変えないテスト（escalation / vacuous / decision-needed / 非 canon）の assertion は
  書き換えない。

## T-08: 検証とスコープ確認

- [ ] `typecheck && test` が green。
- [ ] 変更が次に限定されることを確認する: `deriveSpecReviewVerdict` の 4b、`canon-write-scope.ts` の state 入口追加、
      `spec-observation.ts` の追加、`STANDARD_TRANSITIONS` の guarded 行 2 本、`findings-ledger.ts` の
      `collectSpecReviewLedger` 追加、`regression-gate.ts` の台帳合流、テスト更新。
- [ ] 次に変更が無いことを確認する: impl 側 observation auto-fix（reviewer-chain / 並列遷移）、`FAST_TRANSITIONS`、
      spec-review / spec-fixer prompt、spec-fixer 書込集合・buildMessage・reads、conformance fixTarget routing、
      他 step の verdict 導出（judge / conformance / regression-gate / request-review）。

**Acceptance Criteria**:
- `typecheck && test` が green。
- スコープ外（unroutable minor の扱い / FAST / conformance fixTarget routing / 即時 LLM 再レビュー）への変更なし。
