# Code Review Feedback — iteration 001

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
- `specrunner/changes/tamper-provenance-baseline/verification-result.md` — typecheck + test passed ✓

### 参照した実装ファイル

- `src/core/step/bite-evidence/tamper.ts` — `checkTamperStatus` (provenance 分類) / `parseCommitToken` helper
- `src/core/step/bite-evidence/step.ts` — provenance 入力計算・配線ブロック全体
- `src/core/step/bite-evidence/gate.ts` — tamper reason 文字列変更確認
- `src/core/resume/canon-provenance.ts` — `authorizedCanonWriterSteps` helper 追加
- `src/core/port/runtime-strategy.ts` — `lastCommitTouchingPath` optional/RealRuntimeStrategy required 追加
- `src/core/runtime/local.ts` — `lastCommitTouchingPath` の local 実装（git log -1 `--format=%H\x1f%s`）
- `src/core/runtime/managed.ts` — `lastCommitTouchingPath` の managed 実装（常に unavailable）
- `src/core/types.ts` — `PipelineDeps.authorizedCanonWriters?: ReadonlySet<string>` 追加
- `src/core/port/step-types.ts` — `CliStepDeps.authorizedCanonWriters?: ReadonlySet<string>` 追加
- `src/core/pipeline/run.ts` — `buildPipelineForJob` での `authorizedCanonWriterSteps` 計算・注入
- `src/core/step/bite-evidence/__tests__/gate.test.ts` — TC-012〜TC-028 の追加テスト / TC-032 更新
- `src/core/runtime/__tests__/last-commit-touching-path.test.ts` — TC-007〜TC-011
- `src/core/resume/__tests__/authorized-canon-writer-steps.test.ts` — TC-017

### 受け入れ基準の確認

| 受け入れ基準 | 対応テスト | 充足 |
|------------|---------|-----|
| spec-fixer 正規編集 → tamper 扱いにならない | TC-001 / TC-032/TC-015 | ✅ |
| operator 適用 → tamper 扱いにならない | TC-002 / TC-032/TC-015 | ✅ |
| 非所有 step 帰属変更 → failed | TC-003 / TC-032/TC-016 | ✅ (conforming format のみ) |
| 証跡外未 commit 書き換え → failed | TC-004 / TC-032/TC-013 | ✅ |
| 証跡欠落シナリオ → 偽陽性なし | TC-025 / TC-005 | ✅ |
| 既存テスト（evidence-base-gate / gate-empty-selection 等）無変更 green | TC-023 / verification | ✅ |
| typecheck && test green | verification-result.md | ✅ |

### スコープ外の確認

- `src/core/step/write-scope.ts` への変更なし ✅
- `src/core/step/spec-fixer.ts` への `writes()` 変更なし ✅（writes() 確認: test-cases.md を正しく宣言）
- base/candidate 評価（`runTestsOnSynthesizedTree`）への変更なし ✅
- `test-cases.md` 以外の保護正典への tamper 拡張なし ✅

### 設計適合性の確認

- **D1 (provenance 移行)**: `checkTamperStatus` を pure な 5 分岐関数として実装 ✅
- **D2 (durable 証跡)**: `lastCommitTouchingPath` port method を git 履歴から取得 ✅
- **D3 (inconclusive proceed)**: evidenceAvailable=false → inconclusive → proceed ✅
- **D4 (TamperStatus 安定)**: union `"match"|"mismatch"|"inconclusive"` と gate routing 不変 ✅
- **D5 (port method 追加)**: `lastCommitTouchingPath` が RuntimeStrategy (optional) と RealRuntimeStrategy (required) に正しく追加 ✅
- **circular import 回避**: `authorizedCanonWriterSteps` を `canon-provenance.ts` に配置、`buildPipelineForJob` 経由で注入 ✅

## 検証できなかった項目

- `src/core/pipeline/pipeline.ts` 内の step ディスパッチ詳細（executor.execute → runCliStep の呼び出し経路）
- managed runtime での実際の git 履歴照会失敗時の挙動（テストは fake で確認済み）

## Findings 詳細

### F-001（HIGH）: 非準拠 commit subject が `mismatch` ではなく `inconclusive` になる

`step.ts:81-83` にて、`lastCommitTouchingPath` が `kind: "found"` を返した場合に
`parseCommitToken(commitResult.subject, slug)` を呼び出し、その戻り値を
`lastCanonCommitToken` に直接代入している。`parseCommitToken` が `null` を返す
（`: ` 不在 / cross-slug / 空トークン）場合、`lastCanonCommitToken = null` となり、
`checkTamperStatus` の branch 3（`null → inconclusive`）が発火する。

**しかし design.md の Risks セクション**には
「非準拠 subject が `test-cases.md` を変更していた場合は認可外 → `mismatch`（fail-closed）」と
明記されており、**tasks.md T-02** には「トークン抽出失敗と「commit 不在」は区別すること」という
明示的な要件がある。

現在の実装は、"commit が見つかったが subject が非準拠" と "commit が存在しない" の
2 ケースを同じ `null` で表現してしまうため区別できない。この結果、
非準拠 commit subject（例: "initial commit"、"merge branch 'main'"、
cross-slug の `spec-fixer: other-slug`）が test-cases.md を変更していた場合に
`mismatch` ではなく `inconclusive` (proceed) となり、tamper 検出をすり抜ける。

さらに `step.ts:83-84` のコメント
「null here means non-conforming subject → treated as unauthorized → **mismatch**」は
実際の動作（`inconclusive`）と矛盾しており、誤った理解を植え付ける。

**修正案**: `commitResult.kind === "found"` かつ `parseCommitToken` が `null` を返す場合、
`lastCanonCommitToken` に `null` ではなく `authorizedWriters` に存在しない sentinel 値
（例: `"__non-conforming-subject__"`）を使用する。これにより branch 5
（`not in authorizedWriters → mismatch`）が発火し、設計通りの fail-closed 動作となる。

```ts
// 修正後:
const token = parseCommitToken(commitResult.subject, slug);
if (token !== null) {
  lastCanonCommitToken = token;
} else {
  // parseCommitToken returned null: non-conforming subject on a found commit.
  // Treat as unauthorized (mismatch), not as "no history" (inconclusive).
  // Use a sentinel that is guaranteed to not be in authorizedWriters.
  lastCanonCommitToken = "__non-conforming-subject__";
}
```

または簡潔に: `lastCanonCommitToken = token ?? "__non-conforming-subject__";`

---

### F-002（MEDIUM）: BiteEvidenceStep.run レベルの wiring を検証する統合テストが欠如

acceptance criteria の「spec-fixer 正規編集 → bite-evidence で tamper 扱いにならない」を
固定するテストとして、TC-001 では `checkTamperStatus` の pure function テストと
`runBiteEvidenceGate` への tamperStatus="match" 直接渡しテストが用意されている。

しかし `BiteEvidenceStep.run` の wiring（`deps.runtimeStrategy` の `lastCommitTouchingPath`
→ `parseCommitToken` → `checkTamperStatus` の連鎖）を実際に通すテストが存在しない。
以下の step.ts ロジックに潜在的バグが入り込んでも、既存テストでは検出できない:

- `lastCommitTouchingPath` の結果を `parseCommitToken` に渡す前後の処理誤り
- `authorizedWriters` の未設定に起因する `evidenceAvailable` の計算誤り
- `runtimeStrategy` の型キャストによる実行時エラー

tasks.md T-04 の acceptance criteria には「可能なら BiteEvidenceStep.run レベルの
統合ケースとして gate verdict が tamper で failed にならないことまで固定する」と
あり、「可能なら」の余地があるが、wiring テストの欠如は中程度のリスクを残す。

**修正案**: fake runtimeStrategy（`lastCommitTouchingPath` が `{kind:"found",subject:"spec-fixer:<slug>"}` を返す、`listWorktreeChanges` が clean を返す、`authorizedCanonWriters` を注入）を使って `BiteEvidenceStep.run` を呼び出し、生成された bite-evidence-result.md の内容に tamper-failed が含まれないことを確認する統合テストを追加する。

---

### F-003（LOW）: `worktreeDirty` の path マッチが不正確（suffix 一致）

`step.ts:64` の `wtResult.paths.some((p) => p.endsWith("test-cases.md"))` は
`testCasesMdPath`（`${changeFolderPath(slug)}/test-cases.md`）の完全一致ではなく
suffix 一致（`endsWith("test-cases.md")`）を使用している。

コメントにも「by path suffix」と記載されており意図的ではあるが、`--no-worktree` モードや
複数 slug の change folder が同一 worktree に存在する環境では、
別 slug の `specrunner/changes/other-slug/test-cases.md` が dirty であっても
このジョブの worktreeDirty が `true` になる偽陽性リスクがある。

`testCasesMdPath` はすでに計算済みであるため、`p === testCasesMdPath` の完全一致に
変更するのが最も安全である。

---

### F-004（LOW）: `runPipeline` が `authorizedCanonWriters` を注入しない

`run.ts` の `runPipeline` 関数は `buildPipelineForJob` を経由せず、`authorizedCanonWriters`
の注入処理（`authorizedCanonWriterSteps` 呼び出し → `deps.authorizedCanonWriters` 設定）を
行わない。現在の production path（`runner.ts` → `buildPipelineForJob` → `pipeline.run`）では
問題ないが、`runPipeline` はエクスポートされており、将来のコードやテストが直接呼び出した場合、
bite-evidence の tamper 判定が常に `inconclusive`（silently disabled）になる。

design.md には `buildPipelineForJob` が注入の唯一の箇所として明記されているが、
`runPipeline` もこの注入を行うか、または内部使用専用であることをドキュメントに明記すべき。
