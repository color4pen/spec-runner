# Cross-Boundary Invariants Review — test-generation-type-gate — iter 001

**Reviewer**: cross-boundary-invariants
**Focus**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Summary

変更後のコードを手動で追跡し、以下の cross-boundary invariant を確認した。**Critical/High 違反は検出されなかった。** 指摘は 2 件（Medium 1 件、Low 1 件）で、いずれもコードバグではなくドキュメント/テストの欠缺。

---

## Verified Invariants

### INV-01: first-match-wins 順序の正確性

`pipeline.ts:363` の `transitions.find(...)` は最初にマッチした行で確定する。新しい guarded rows の挿入位置を確認:

| 挿入位置 | 確認結果 |
|---------|---------|
| `SPEC_REVIEW approved → SPEC_FIXER (specReviewHasRoutableFixables)` より**後**、`→ TEST_CASE_GEN` (unconditional) より**前** に `→ IMPLEMENTER (isTestGenExempt)` を挿入 | ✓ `types.ts:236-239` で確認 |
| `SPEC_FIXER approved → TEST_CASE_GEN (specFixerForwardsToTestGen)` より**前** に `→ IMPLEMENTER (specFixerForwardsToImplementer)` を挿入 | ✓ `types.ts:247-249` で確認 |
| `IMPLEMENTER success → BITE_EVIDENCE` より**前** に `→ VERIFICATION (isTestGenExempt)` を挿入 | ✓ `types.ts:254-255` で確認 |

TC-012 がインデックス比較でこの順序を機械的に固定している。

### INV-02: approved 再ルート補正（pipeline.ts:459）の chore 対応

budget 枯渇時の clean-approved-transition 探索ロジック:
```js
const cleanTransition = this.transitions.find(
  (t) =>
    t.step === currentStep && t.on === "approved" &&
    !fixerNamesForReroute.has(t.to) && t.to !== "end" && t.to !== "escalate" &&
    (!t.when || t.when(state)),
);
```

SPEC_FIXER の budget 枯渇で SPEC_REVIEW の `approved` 再ルートが発火する chore 状態:
- `fixerNamesForReroute` = `{spec-fixer, code-fixer, build-fixer}`
- Row 1 (`→ SPEC_FIXER`): spec-fixer は fixerNamesForReroute に含まれる → 除外
- Row 2 (`→ IMPLEMENTER when isTestGenExempt`): chore 状態で `isTestGenExempt = true` → **マッチ → IMPLEMENTER** ✓
- Row 3 (`→ TEST_CASE_GEN`): unconditional だが Row 2 が先にヒット → 到達しない

非 chore 状態では Row 2 の guard = false → Row 3 (TEST_CASE_GEN) にフォールスルー ✓。既存挙動は不変。

### INV-03: specFixerForwardsToImplementer の AND 合成

`specFixerForwardsToImplementer = specFixerForwardsToTestGen && isTestGenExempt` の真理値表:

| specFixerForwardsToTestGen | isTestGenExempt | specFixerForwardsToImplementer | 遷移先 |
|---|---|---|---|
| true (observation pass) | true (chore) | **true** | IMPLEMENTER ✓ |
| true (observation pass) | false (non-chore) | false | → Row 2 (TEST_CASE_GEN) ✓ |
| false (conformance context) | true (chore) | false | → Row 3 (SPEC_REVIEW) ✓ |
| false (conformance context) | false (non-chore) | false | → Row 3 (SPEC_REVIEW) ✓ |

chore でも conformance-triggered spec-fixer は SPEC_REVIEW に戻る。テスト生成免除が conformance 修正フローを短絡しない。✓

### INV-04: requestType 伝播チェーン

`verification.ts:51`:
```js
await runVerification(deps.slug, verificationCwd, effectiveVerification, deps.request.baseBranch, deps.request.type);
```
`ParsedRequest.type` は `string`（non-nullable）→ production 経路で `undefined` になることはない。

`runVerification → runVerificationCommands / runVerificationPhases → finalizeVerificationRun` の全経路で `requestType?: string` が末尾 optional 引数として正しく伝播されている。既存呼び出し側は引数 4 個以下で呼び出すため `requestType = undefined` → fail-closed（非免除）でレガシー挙動を維持 ✓。

### INV-05: coverage gate skip と anyFailed / allSkipped の相互作用

`finalizeVerificationRun` の verdict 判定:
```js
const nonSkipped = phases.filter((p) => p.status !== "skipped");
const anyFailed   = phases.some((p)   => p.status === "failed");
const allSkipped  = nonSkipped.length === 0;
```

免除 type の coverage gate skip は `status: "skipped"` として phases に push される。`nonSkipped` フィルタがこれを除外するため、coverage skip が `allSkipped = true` を誤発生させることはない。実際のコマンド実行結果が verdict に正確に反映される ✓。

また免除チェック（`args.requestType !== undefined && !isTestGenRequired(...)`）は `failed` チェックより前に評価されるため、前段コマンドが失敗していても coverage phase の skip 理由は「test-generation-exempt request type: chore」となる（TC-014 でアサート済み）✓。

### INV-06: lockfile-sync gate の chore 非影響

coverage gate を exempt-skip した場合、`failed` フラグは更新されない（exempt skip は `failed = true` を設定しない）。そのため `baseBranch` が指定されている場合、lockfile-sync gate は chore でも通常通り実行される。`chore` がロックファイル整合性を迂回することにはならない ✓。

### INV-07: FAST_TRANSITIONS の無変更

`FAST_TRANSITIONS` に新規 guarded row は挿入されていない（`types.ts:306-337` 確認）。FAST pipeline は元から全 type で test-gen を bypass するため無変更が正しい。TC-016 がこれをアサート済み ✓。

### INV-08: compose-reviewers.ts との相互作用

`composeReviewerDescriptor` が除去する遷移:
```js
t.step !== STEP_NAMES.CODE_REVIEW &&
t.step !== STEP_NAMES.CODE_FIXER &&
t.step !== REGRESSION_GATE_STEP_NAME &&
!snapshots.some((s) => t.step === s.name)
```

新規 guarded rows は `step = SPEC_REVIEW / SPEC_FIXER / IMPLEMENTER` を持ち、除去対象に含まれない。カスタムレビュアー合成後のディスクリプタでも test-gen 免除 rows は保持される ✓。

### INV-09: descriptor-input-completeness と chore での欠如耐性

`validateDescriptorInputCompleteness` はプローブ type `"spec-change"`（非免除）で全ステップを評価する。chore 実行時に生成されない `test-cases.md` は：
- `implementer.ts:157-159` で `required: false`（欠如耐性あり）
- `test-coverage.ts:305-317` で `status: "skipped"` として扱う（欠如耐性あり）

ディスクリプタ完全性バリデーターが chore 実行パスで violation を検出することはない ✓。

---

## Findings

### FINDING-01 [Medium] — specFixerForwardsToImplementer の JSDoc に conformance context 検出の invariant 文書化がない

**ファイル**: `src/core/pipeline/test-gen-exemption.ts:46`

`specFixerForwardsToImplementer` は `specFixerForwardsToTestGen` に AND 合成で依存しており、`specFixerForwardsToTestGen` は `getConformanceFixContext` の戻り値で conformance-triggered entry を判定する。

`fixer-helpers.ts:123-128` には重要な invariant が文書化されている:
> "test fixtures that represent a conformance-triggered entry MUST use distinct, ordered timestamps (predecessor.endedAt < conformance.endedAt) AND must provide toolResult.findings"

この条件が成立しない場合（`toolResult.findings` 欠落または同一タイムスタンプ）、`getConformanceFixContext` は null を返し、`specFixerForwardsToTestGen = true` となる。chore 状態では `specFixerForwardsToImplementer = true` となり、conformance-triggered spec-fixer entry が SPEC_REVIEW ではなく IMPLEMENTER にルーティングされる誤動作が生じる。

**重要**: この fragility は `spec-observation.ts` の `specFixerForwardsToTestGen` から継承された pre-existing issue であり、本変更が新たに導入したものではない。production では steps が sequential に実行されるためタイムスタンプは単調増加し、conformance StepRun には必ず findings が存在するため production での誤動作は生じない。

**Resolution**: `test-gen-exemption.ts:46` の JSDoc に `specFixerForwardsToTestGen` の conformance context 検出 invariant への参照を追記し、`fixer-helpers.ts:123-128` の caveat を継承していることを明記する。コードの変更は不要。

---

### FINDING-02 [Low] — TC-006 が conformance-triggered chore spec-fixer → SPEC_REVIEW 遷移をアサートしていない

**ファイル**: `src/core/pipeline/__tests__/test-gen-exemption.test.ts:117`

TC-006 は「chore の spec-fixer 観測修正は IMPLEMENTER へ forward される」を検証するが、観測修正パス（`specFixerForwardsToTestGen = true`）のケースのみカバーしている。conformance-triggered 経路（`specFixerForwardsToTestGen = false`、conformance context あり）で chore の `specFixerForwardsToImplementer = false` となり SPEC_REVIEW に戻ることを直接アサートするテストが存在しない。

TC-015（should）で `specFixerForwardsToTestGen = false` の AND 合成を間接的に検証しているが、conformance context が存在する場合の end-to-end 遷移は固定されていない。

**Resolution**: `specFixerForwardsToImplementer` が conformance-triggered chore 状態で `false` を返し `SPEC_FIXER approved → SPEC_REVIEW` にルーティングされることをアサートするテストケースを TC-015 に追加する（conformance StepRun に正しいタイムスタンプ順序と `toolResult.findings` を持つフィクスチャを使用）。

---

## Evidence

| Invariant | Checked files | Result |
|-----------|--------------|--------|
| first-match-wins 順序 | types.ts:236-261, test-gen-exemption.test.ts:161-231 | ✓ |
| approved 再ルート補正 | pipeline.ts:445-490 | ✓ |
| AND 合成真理値表 | test-gen-exemption.ts:46-48, spec-observation.ts:60-82 | ✓ |
| requestType 伝播 | verification.ts:51, runner.ts:441-504 | ✓ |
| anyFailed/allSkipped 相互作用 | runner.ts:320-422 | ✓ |
| lockfile-sync gate | runner.ts:376-394 | ✓ |
| FAST_TRANSITIONS 無変更 | types.ts:306-337, test-gen-exemption.test.ts:267-291 | ✓ |
| compose-reviewers 相互作用 | compose-reviewers.ts:60-66 | ✓ |
| descriptor input completeness | descriptor-input-completeness.ts:95-127, implementer.ts:157-159 | ✓ |
| getConformanceFixContext 条件 | fixer-helpers.ts:101-128, spec-observation.ts:60-82 | ✓（pre-existing caveat 継承を確認） |

---

## Observations

- **chore での SPEC_REVIEW → SPEC_FIXER → IMPLEMENTER 統合パス**: chore で spec-review が routable fixable findings を持つ場合、Row 1（`specReviewHasRoutableFixables`）が先にマッチして SPEC_FIXER へ遷移し、その後 `specFixerForwardsToImplementer = true` で IMPLEMENTER へ forward される。この 2 ステップのパスは TC-004（SPEC_REVIEW → IMPLEMENTER の直行）と TC-006（SPEC_FIXER → IMPLEMENTER）で部分的にカバーされているが、統合 end-to-end テストは存在しない。コードは正しく動作する。

- **archive minimumAssurance floor との相互作用**: design.md の Risks 節に文書化されている通り、chore で `minimumAssurance` の `testDerivation` 制約がある場合は archive がブロックされる（fail-closed）。これは仕様上の accepted trade-off であり、コード変更は不要。`achieved-assurance.ts:390-414` で biteEvidence の type gate（`FORWARD_TYPES`）が chore を除外済みのため biteEvidence 側の regression はない。
