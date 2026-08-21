# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 参照ドキュメント

- `specrunner/changes/tamper-provenance-baseline/design.md` — D1〜D5 の設計判断（全文）
- `specrunner/changes/tamper-provenance-baseline/tasks.md` — T-01〜T-05 の実装タスク
- `specrunner/changes/tamper-provenance-baseline/spec.md` — 4 要件・6 シナリオ
- `specrunner/changes/tamper-provenance-baseline/test-cases.md` — TC-001〜TC-028（28 件）
- `specrunner/changes/tamper-provenance-baseline/review-feedback-001.md` — 前回指摘 F-001〜F-004
- `specrunner/changes/tamper-provenance-baseline/verification-result.md` — typecheck + test passed ✓

### 参照した実装ファイル

- `src/core/step/bite-evidence/tamper.ts` — `checkTamperStatus` / `parseCommitToken`
- `src/core/step/bite-evidence/step.ts` — provenance 入力計算・配線ブロック
- `src/core/step/bite-evidence/gate.ts` — tamper reason 文字列
- `src/core/resume/canon-provenance.ts` — `authorizedCanonWriterSteps` helper
- `src/core/port/runtime-strategy.ts` — `lastCommitTouchingPath` port 定義
- `src/core/runtime/local.ts` — `lastCommitTouchingPath` local 実装
- `src/core/runtime/managed.ts` — `lastCommitTouchingPath` managed 実装
- `src/core/types.ts` — `PipelineDeps.authorizedCanonWriters` フィールド
- `src/core/port/step-types.ts` — `CliStepDeps.authorizedCanonWriters` フィールド
- `src/core/pipeline/run.ts` — `buildPipelineForJob` / `runPipeline` の注入処理
- `src/core/step/bite-evidence/__tests__/gate.test.ts` — TC-012〜TC-028 / TC-032
- `src/core/runtime/__tests__/last-commit-touching-path.test.ts` — TC-007〜TC-011
- `src/core/resume/__tests__/authorized-canon-writer-steps.test.ts` — TC-017

### Iteration 1 → Iteration 2 の差分確認

iteration 1（escalation）で指摘した F-001〜F-004 を提出コードと照合した。
本 iteration（iteration 2）の提出コードは iteration 1 から変更がなく、全 4 件が残存している。

### 受け入れ基準の確認

| 受け入れ基準 | 対応テスト | 充足 |
|------------|---------|-----|
| spec-fixer 正規編集 → tamper 扱いにならない | TC-001 / TC-032/TC-015 | ✅ conforming commit |
| operator 適用 → tamper 扱いにならない | TC-002 | ✅ |
| 非所有 step 帰属変更 → failed | TC-003 (conforming format のみ) | ⚠️ 非準拠 subject は inconclusive になる (F-001) |
| 証跡外未 commit 書き換え → failed | TC-004 / TC-032/TC-013 | ✅ |
| 証跡欠落シナリオ → 偽陽性なし | TC-025 / TC-005 | ✅ |
| 既存テスト（evidence-base-gate 等）無変更 green | TC-023 / verification | ✅ |
| typecheck && test green | verification-result.md | ✅ |

### 設計適合性の確認

- **D1 (provenance 移行)**: `checkTamperStatus` は pure な 5 分岐関数として正しく実装 ✅
- **D2 (durable 証跡)**: `lastCommitTouchingPath` port method が git 履歴から取得 ✅
- **D3 (inconclusive proceed)**: evidenceAvailable=false → inconclusive → proceed ✅
- **D4 (TamperStatus 安定)**: union `"match"|"mismatch"|"inconclusive"` と gate routing 不変 ✅
- **D5 (port method 追加)**: `lastCommitTouchingPath` が RuntimeStrategy (optional) / RealRuntimeStrategy (required) に正しく追加 ✅
- **circular import 回避**: `authorizedCanonWriterSteps` を `canon-provenance.ts` に配置、`buildPipelineForJob` 経由で注入 ✅
- **D1 Risk — 非準拠 subject は mismatch**: **❌ 現実装では inconclusive になる** (F-001)

## 検証できなかった項目

- managed runtime での実際の git 履歴照会失敗時の挙動（テストは fake で確認済み）
- `step.ts` 内部の型キャスト（`deps as { authorizedCanonWriters?: ReadonlySet<string> }` 等）の型安全性（型チェックは green だが、構造的型付けに依存しているため型乖離リスクがある）

## Findings 詳細

### F-001（HIGH）: 非準拠 commit subject が `mismatch` ではなく `inconclusive` になる（前回 F-001 未解決）

**箇所**: `src/core/step/bite-evidence/step.ts:80-85`

`lastCommitTouchingPath` が `kind: "found"` を返した場合、`parseCommitToken(commitResult.subject, slug)` の戻り値をそのまま `lastCanonCommitToken` に代入している:

```typescript
} else {
  // Parse token from commit subject: "<token>: <slug>"
  lastCanonCommitToken = parseCommitToken(commitResult.subject, slug);
  // Note: null here means non-conforming subject → treated as unauthorized → mismatch
  // (evidenceAvailable stays true so the mismatch branch fires)
}
```

`parseCommitToken` が `null` を返す（non-conforming subject / cross-slug / 空トークン）場合、`lastCanonCommitToken = null` となる。しかし `checkTamperStatus` は:

```typescript
// 3. No git history for the path → inconclusive (cannot attribute; proceed)
if (lastCanonCommitToken === null) {
  return { status: "inconclusive" };
}
```

を持つため、**branch 3（`null → inconclusive`）が発火し、branch 5（`not in authorizedWriters → mismatch`）にはならない**。コメントの「treated as unauthorized → mismatch」は実際の動作と正反対であり誤解を招く。

**影響**:
- 非準拠 commit message（"initial commit"、"merge branch 'main'" 等）が `test-cases.md` を変更した場合、tamper 検出をすり抜けて `inconclusive`（proceed）になる
- cross-slug commit（`spec-fixer: other-slug`）も同様にすり抜ける
- design.md Risks セクション「非準拠 subject → mismatch（fail-closed）」に明示的に違反
- tasks.md T-02「トークン抽出失敗と「commit 不在」は区別すること」の要件に違反

**修正案**:
```typescript
} else {
  // Parse token from commit subject: "<token>: <slug>"
  const token = parseCommitToken(commitResult.subject, slug);
  // token is null for non-conforming subjects (no ": ", cross-slug, empty token).
  // Non-conforming is unauthorized (≠ no git history); use sentinel to trigger mismatch.
  lastCanonCommitToken = token ?? "__non-conforming-subject__";
}
```

---

### F-002（MEDIUM）: BiteEvidenceStep.run レベルの wiring テストが欠如（前回 F-002 未解決）

**箇所**: `src/core/step/bite-evidence/__tests__/gate.test.ts`

`BiteEvidenceStep.run` の wiring（`deps.runtimeStrategy.lastCommitTouchingPath` →
`parseCommitToken` → `checkTamperStatus` の連鎖）を実際に通すテストが存在しない。
TC-001 は `checkTamperStatus` pure function テストと
`runBiteEvidenceGate` への `tamperStatus="match"` 直接渡しのみで、`step.ts` 内部の
input 計算ブロック（型キャスト・`undefined` チェック・`evidenceAvailable` フラグ制御）は
テスト対象外。

tasks.md T-04「可能なら `BiteEvidenceStep.run` レベルの統合ケースとして gate
verdict が tamper で failed にならないことまで固定する」（「可能なら」の余地付き）の
要件が満たされていない。

F-001 の sentinel fix を含む wiring テストを追加すれば、F-001 の修正の正しさも
同時に固定できる。

---

### F-003（LOW）: `worktreeDirty` の path マッチが不正確（前回 F-003 未解決）

**箇所**: `src/core/step/bite-evidence/step.ts:64`

```typescript
worktreeDirty = wtResult.paths.some((p) => p.endsWith("test-cases.md"));
```

`testCasesMdPath`（`specrunner/changes/${slug}/test-cases.md`）に対して完全一致
ではなく suffix 一致を使用している。`--no-worktree` モードや将来の複数 slug 混在環境
では、別 slug の `test-cases.md` が dirty であっても偽陽性（false positive tamper halt）
になるリスクがある。`p === testCasesMdPath` の完全一致が安全。

---

### F-004（LOW）: `runPipeline` が `authorizedCanonWriters` を注入しない（前回 F-004 未解決、human note により明示）

**箇所**: `src/core/pipeline/run.ts:139-150`

`runPipeline` は `buildPipelineForJob` を経由せず、`authorizedCanonWriterSteps` の
計算・注入を行わない。production path（`runner.ts` → `buildPipelineForJob`）では
問題ないが、`runPipeline` はエクスポートされており
`tests/custom-reviewers-e2e.test.ts` が直接呼び出している。これらの呼び出しパスでは
bite-evidence の tamper 判定が常に `inconclusive`（silently disabled）になる。

Human resume note に「runPipeline にも authorizedCanonWriters を注入する方針で進めてください」
との明示的な指示がある。

**修正案**:
```typescript
export async function runPipeline(
  jobState: JobState,
  deps: PipelineDeps,
  events?: EventBus,
): Promise<JobState> {
  const bus = events ?? new EventBus();
  const base = getPipelineDescriptor(getPipelineId(jobState));
  const scoped = applyScopeConfig(base, deps.config);
  const descriptor = composeReviewerDescriptor(scoped, jobState.reviewers);

  // Inject authorized canon writers (mirrors buildPipelineForJob)
  const canonPath = `${changeFolderPath(deps.slug)}/test-cases.md`;
  const writers = authorizedCanonWriterSteps(canonPath, descriptor.steps, jobState, deps);
  if (writers.size > 0) {
    deps.authorizedCanonWriters = writers;
  }

  const pipeline = buildPipeline(descriptor, deps, bus);
  return pipeline.run(descriptor.startStep, jobState, deps);
}
```
