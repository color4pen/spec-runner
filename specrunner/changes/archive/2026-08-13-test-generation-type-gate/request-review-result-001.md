# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードベース事前条件の確認

**`src/config/type-config.ts`**
- 28行目: `TYPE_CONFIG: Record<string, TypeConfigEntry>` の export を確認 ✅
- `TypeConfigEntry` インターフェースに `specRequired: boolean` フィールドが既に存在 ✅
- 61-68行目: `chore` エントリで `specRequired: false`、他の4 type は `true` ✅
- 105行目: `isSpecRequired()` の実装確認 — `TYPE_CONFIG[type]?.specRequired ?? true`（fail-closed、unknown=true）✅

**`src/core/pipeline/types.ts`**
- 235行目: `SPEC_REVIEW approved → SPEC_FIXER when specReviewHasRoutableFixables`（guarded、unconditional より前）✅
- 236行目: `SPEC_REVIEW approved → TEST_CASE_GEN`（unconditional fallback）✅
- 239行目: `TEST_CASE_GEN success → TEST_MATERIALIZE` ✅
- 241行目: `TEST_MATERIALIZE success → IMPLEMENTER` ✅
- 244行目: `SPEC_FIXER approved → TEST_CASE_GEN when specFixerForwardsToTestGen`（guarded）✅
- 248行目: `IMPLEMENTER success → BITE_EVIDENCE` ✅
- 251-252行目: `BITE_EVIDENCE passed|strategy-deferred → VERIFICATION` ✅
- `when` guard のシグネチャ `(state: JobState) => boolean` を確認 ✅

**`src/core/step/implementer.ts`**
- 157-159行目: test-cases.md の IoRef が `required: false` — 欠如耐性あり ✅

**`src/core/verification/test-coverage.ts`**
- 305-317行目: `readFile` catch ブロックで `status: "skipped"` を返す実装 ✅

**`src/core/verification/runner.ts`**
- 359-360行目: `coverage !== undefined` の else ブロックで `coverageSkipNote` を設定 ✅
- `coverageSkipNote` が `writeVerificationResult` に渡され、result ファイルに `> Note —` として出力される仕組みを確認 ✅
- `runVerification(slug, cwd, verificationConfig?, baseBranch?)` のシグネチャ確認 — `requestType` パラメータは現在存在しない ✅

**`src/core/step/verification.ts`**
- `CliStepDeps` から `deps.request.baseBranch` が既に参照されている ✅
- `state.request.type: string` が `RequestInfo` に存在 → `deps.request.type` でアクセス可能 ✅
- 実装者が `runVerification` に型情報を渡す拡張経路が存在することを確認 ✅

**`src/core/pipeline/spec-observation.ts`**
- `specFixerForwardsToTestGen` の実装確認:
  1. conformance-triggered entry でない（`getConformanceFixContext` が null）かつ
  2. 最後の spec-review verdict が "approved"
  の両方で true ✅
- この guard は SPEC_FIXER が observation auto-fix path から入った場合のみ true になる ✅

### `when` guard と既存行の相互作用分析

`SPEC_REVIEW approved` に新たに exempt-type 行を追加する際、既存の `specReviewHasRoutableFixables` guard との順序が重要になる。

- 現在の行順: guarded(SPEC_FIXER) → unconditional(TEST_CASE_GEN)
- chore + routable fixables が存在する場合、exempt 行が `specReviewHasRoutableFixables` 行より後に置かれると SPEC_FIXER が誤って起動する
- request が "SPEC_REVIEW approved → (免除時) IMPLEMENTER **直行**" と明記しているため intent は明確
- 実装上は exempt 行を `specReviewHasRoutableFixables` 行より前に置く、または既存 guard に `!isTestGenExempt` を compound する必要がある

### テスト構造の確認

- `tests/config/type-config.test.ts`、`src/config/__tests__/type-config.test.ts` 双方を確認 — 現在 `isSpecRequired` のテストは存在しない（ただし `specRequired` 値は `TYPE_CONFIG` の specific values テストで間接的に確認される）
- `src/core/pipeline/__tests__/standard-transitions.test.ts` を確認 — 遷移テーブルの構造テストが存在 ✅

## 検証できなかった項目

- `runVerification` への `requestType` 追加後の changed-line coverage skip が result に明示されるかの実行確認（実装未存在のため）

## Findings 詳細

### Finding 1: AC に SPEC_FIXER 再入経路のテストが欠落

Requirement 2 は「SPEC_FIXER approved → TEST_CASE_GEN (specFixerForwardsToTestGen) の再入経路も同じ分岐に従う」と明記しているが、受け入れ基準にこの経路のテストが含まれていない。

現状分析: chore は `specRequired: false` のため spec.md が不在になることが多く、`specReviewHasRoutableFixables` が true になるケースは稀。また SPEC_REVIEW → IMPLEMENTER が正しく実装されていれば SPEC_FIXER はこの経路では到達しない。さらに conformance-triggered の SPEC_FIXER では `specFixerForwardsToTestGen` が false になるため TEST_CASE_GEN には進まない。

リスク: 将来の変更で SPEC_FIXER が chore の経路に入り込んだ場合に guard が未検証のまま残る。

### Finding 2: `specReviewHasRoutableFixables` と exempt guard の順序制約が未明示

Requirement 2 の「直行」という表現で意図は明確だが、実装レベルでの guard 行の順序制約（または compound guard の必要性）が tasks.md に書き起こされるべき実装ガイダンスがリクエスト本文に存在しない。design step が正しく判断できれば問題ないが、誤った行順序実装（exempt 行を after specReviewHasRoutableFixables 行に置く）では chore+routable-fixables が SPEC_FIXER に誤ってルーティングされる。
