# Design: chore type のテスト生成免除 — TYPE_CONFIG によるテスト生成工程の宣言的 skip

## Context

現在、STANDARD pipeline は全 request type で test-case-gen → test-materialize →
bite-evidence を必ず通す。テスト生成は最重量工程（直近 55 job で約 7 万行）だが、
振る舞い変更の無い chore（CI / 依存更新 / ドキュメント）ではこの出力が成果に結びつかない。

`TYPE_CONFIG`（`src/config/type-config.ts`）は request type の単一正典であり、既に
type 別免除の前例を持つ: `specRequired: false` で chore は spec 免除される
(`isSpecRequired`)。unknown type は `?? true` で fail-closed。同じ型でテスト生成免除を導入する。

現状コード確認（本 request の attestation 済み + 追加確認）:

- **遷移解決は first-match-wins**（`src/core/pipeline/pipeline.ts:363` —
  `transitions.find(t => t.step===cur && t.on===outcome && (!t.when||t.when(state)))`）。
  guarded row を既存 unconditional row の**前**に置けば、既存 row の挙動は非免除 type で不変。
- **`when` guard は純関数** `(state: JobState) => boolean`。`state.request.type` から type を読める
  (`RequestInfo.type`, `src/state/schema/types.ts`)。前例: `specReviewHasRoutableFixables` /
  `specFixerForwardsToTestGen`（`src/core/pipeline/spec-observation.ts`）、
  `reverificationNeeded`（`reverification.ts`）。
- **approved 再ルート補正**（`pipeline.ts:459`）も `when` guard を尊重して clean approved row を
  探すため、免除 type でも IMPLEMENTER に正しく倒れる。
- **custom reviewer 合成**（`compose-reviewers.ts:60`）は code-review / code-fixer /
  regression-gate / member 行のみ除去・再生成し、SPEC_REVIEW / SPEC_FIXER / IMPLEMENTER 行は保持する。
- **coverage gate は `finalizeVerificationRun`**（`src/core/verification/runner.ts:320-361`）内で実行され、
  `verification.coverage` 未設定時のみ skip note を出す。type 連動は無い。verification step
  (`src/core/step/verification.ts`) は `deps.request.type` を保持している。
- **test-coverage phase（TC-ID 走査）は test-cases.md 欠如で既に `status:"skipped"`**
  （`test-coverage.ts:305-317`、skip 理由 stdout 付き）。implementer の test-cases.md 入力も
  `required:false`（`implementer.ts:157-159`）。→ 生成工程を skip しても欠如耐性は成立済み。

## Goals / Non-Goals

**Goals**:

- `TYPE_CONFIG` にテスト生成要否フラグを追加し、chore を免除・他 4 type を非免除にする。参照関数は
  `isSpecRequired` と同型、unknown type は fail-closed（非免除）。
- 免除 type で STANDARD pipeline が `SPEC_REVIEW → IMPLEMENTER → VERIFICATION` に直行し、
  test-case-gen / test-materialize / bite-evidence を通らない。`SPEC_FIXER approved` の再入経路も同分岐。
- 免除 type で changed-line coverage gate を skip し、skip 理由を result に明示する。
- 免除 type でも build / typecheck / lint / test suite の実行は無変更で走る。
- 非免除 type の遷移・挙動は完全に不変（既存テストが無改変で green）。

**Non-Goals**:

- profile 概念・新設定キー・workflow options による request 単位 opt-out の導入。
- chore 以外の type 免除、docs 専用 type の新設。
- テスト実行（既存 suite）の免除。
- conformance / regression-gate の挙動変更。
- FAST pipeline の変更（design → implementer → verification で既にテスト生成を通らない）。

## Decisions

### D1: `TYPE_CONFIG` にテスト生成要否フラグ `testGenRequired` を追加

`TypeConfigEntry` に `testGenRequired: boolean` を足す。chore: `false`、new-feature /
spec-change / refactoring / bug-fix: `true`。参照関数 `isTestGenRequired(type): boolean` を
`isSpecRequired` と同型で追加し、`TYPE_CONFIG[type]?.testGenRequired ?? true`（unknown は fail-closed）。

- **Rationale**: `specRequired` の前例に完全準拠。type は起票時に必須選択されるため追加の宣言・設定・
  概念が不要で、走行中の agent 判断を挟まない。免除の判断が起票時の 1 選択に集約される。
- **Alternatives considered**:
  - assurance profile（ADR-20260716 R6）: 宣言の間接層が増え、既存 type 選択と二重管理になる → 却下。
  - workflow options による request 単位 opt-out: request ごとに繰り返し書く運用になり契約が一貫しない → 却下。
  - フラグ名 `testGenerationRequired` 等の冗長名: `specRequired` の簡潔さと非対称になる → `testGenRequired` を採用。

### D2: 遷移分岐は既存 `when` guard パターンで実装（新 predicate モジュール）

pipeline predicate を新規モジュール（`src/core/pipeline/` 配下、spec-observation.ts / reverification.ts
と同じ pure-predicate 配置）に置く:

- `isTestGenExempt(state) = !isTestGenRequired(state.request.type)`

`STANDARD_TRANSITIONS`（`src/core/pipeline/types.ts`）に guarded row を既存 row の**前**に挿入する。
既存 row は step/on/to/when を一切変更しない（追加のみ）:

- `SPEC_REVIEW approved → IMPLEMENTER when isTestGenExempt`
  — 既存の `approved → SPEC_FIXER when specReviewHasRoutableFixables` の**後**、
  `approved → TEST_CASE_GEN`（unconditional）の**前**に置く。
- `IMPLEMENTER success → VERIFICATION when isTestGenExempt`
  — 既存 `IMPLEMENTER success → BITE_EVIDENCE` の**前**に置く。

- **Rationale**: first-match-wins（`pipeline.ts:363`）+ approved 再ルート補正（`pipeline.ts:459`）が
  ともに `when` guard を尊重するため、guarded row を先に置くだけで免除 type のみ分岐し、非免除 type は
  既存 unconditional row に落ちて無変更。テーブル駆動の既存思想（Step as data）に沿う。
- **Alternatives considered**:
  - chore 専用 PipelineDescriptor / 別 transition table: テーブル全体を複製し保守二重化 → 却下。
  - executor / agent 側での分岐: 走行中判断を挟み宣言性を失う（原則違反）→ 却下。

### D3: `SPEC_FIXER approved` 再入経路は合成 predicate で分岐

spec-review が routable fixable を持つ免除 type では `approved → SPEC_FIXER` を経由し、
spec-fixer 完了後に本来 test-case-gen へ forward される（`specFixerForwardsToTestGen`）。免除 type では
これを IMPLEMENTER へ倒す。合成 predicate を追加:

- `specFixerForwardsToImplementer(state) = specFixerForwardsToTestGen(state) && isTestGenExempt(state)`

行順:

- `SPEC_FIXER approved → IMPLEMENTER when specFixerForwardsToImplementer`（新規・最前）
- `SPEC_FIXER approved → TEST_CASE_GEN when specFixerForwardsToTestGen`（既存・不変）
- `SPEC_FIXER approved → SPEC_REVIEW`（既存・不変）

- **Rationale**: 既存 `specFixerForwardsToTestGen` を再利用し、免除条件を AND 合成するだけ。免除 type は
  合成 true で IMPLEMENTER、非免除 type は合成 false で既存 TEST_CASE_GEN 行に落ちる（無変更）。
- **Alternatives considered**: `specFixerForwardsToTestGen` に免除条件を埋め込む → 非免除の既存行の意味が
  変わり「既存 row 不変」を崩す → 却下。orthogonal な predicate 合成を採用。

### D4: changed-line coverage gate の type 連動（明示 skip）

`runVerification` に requestType を渡し、`finalizeVerificationRun` まで plumb する
（`runVerification → runVerificationCommands / runVerificationPhases → finalizeVerificationRun`、
いずれも optional 末尾引数で後方互換）。verification step は `deps.request.type` を渡す。

`finalizeVerificationRun` の coverage 分岐で、`coverage !== undefined` かつ免除 type のとき gate を実行せず、
`CHANGED_LINE_COVERAGE_PHASE` の `status:"skipped"` PhaseResult を push する。stdout に免除理由と type 名を残す
（例: `_(skipped — test-generation-exempt request type: chore)_`）。skipped phase は verdict 判定
（`anyFailed` / `allSkipped`）に影響しない。

- **Rationale**: 生成を免除して coverage で fail する矛盾を防ぐ。skip を result の phase 表と `## Phase:` 節に
  明示することで「黙って通さない」を満たす。type-config が唯一の判断点であり、runner は type を受け取って
  `isTestGenRequired` を引くだけ。requestType 未指定（legacy / 既存テスト）は fail-closed で非免除 → gate は従来通り。
- **Alternatives considered**:
  - step 側で `verification.coverage` を剥がして渡す: skip 理由が「config 未設定」に化け、免除と区別できない → 却下。
  - step 側で result を後処理: runner の責務を step に漏らす → 却下。
- TC-ID 走査（test-coverage phase）は test-cases.md 欠如で既に skipped（`test-coverage.ts` の
  `test-cases.md not found` stdout が result に残る）。追加変更は不要で、skip 理由の残存を確認するのみ。

### D5: 既存テスト実行の維持

verification の command / phase 実行ループ（build / typecheck / test / lint / security）は一切触らない。
免除は生成側の遷移と coverage gate のみに閉じる。

- **Rationale**: 「壊していない」ことの床を全 request に残す（architect 判断）。トークン消費の主因は生成側で、
  実行維持のコストは許容範囲。
- **Alternatives considered**: 免除 type で test suite も skip する → 「壊していない」機械確認が消える → 却下。

## Risks / Trade-offs

- **[archive minimumAssurance floor gate が免除 type で fail-closed]**
  `src/core/archive/achieved-assurance.ts` は `testDerivation` を test-materialize の provenance
  （baseOid・test-cases.md freeze）から導出する。免除 type は test-materialize / test-case-gen を通らず
  baseOid が null → `testDerivation` は absent → floor に `testDerivation` 制約があれば `satisfiesFloor` が
  false（fail-closed）で archive がブロックされる。これは chore が minimumAssurance の protectedPaths に
  マッチする変更を含む場合のみ発火する（floor gate 自体が opt-in・path scoped、`merge-then-archive.ts:361`）。
  → **Mitigation**: 挙動は正しい fail-closed。テスト生成を免除した以上、frozen な testDerivation は実証できない。
  assurance 制約下の protected path に触れる作業は chore ではない（振る舞い変更）ので、type を再分類すべき。
  コード変更不要。biteEvidence は既に type gate（FORWARD_TYPES = bug-fix / new-feature、
  `achieved-assurance.ts:408`）で chore を除外済みのため biteEvidence 側の regression は無い。
  本 request のスコープ外（profile は non-goal）だが、運用者が認識すべき trade-off として明記する。

- **[guarded row の順序依存]** guarded row を unconditional row の後に置くと免除 type が誤って TEST_CASE_GEN に
  落ちる。→ **Mitigation**: 遷移テーブル順序をテストで固定（chore が IMPLEMENTER/VERIFICATION に直行し、
  test-case-gen / test-materialize / bite-evidence を通らないことを assert）。

- **[runVerification 呼び出し側の後方互換]** requestType を末尾 optional 引数で追加。既存呼び出し（テスト含む）は
  requestType undefined → `isTestGenRequired(undefined) === true`（fail-closed）→ 非免除で従来挙動。→
  **Mitigation**: undefined を非免除に倒す fail-closed で担保。

## Open Questions

- 将来 `docs` 専用 type を新設する場合、本フラグ（`testGenRequired: false`）を再利用できるが、現時点では chore の
  description が docs を包含するため新設しない（スコープ外）。type 拡張時に本フラグの再利用可否を再検討する。
