# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 参照した spec ファイル

- `request.md` — 問題背景・要件・受け入れ基準・architect 評価済み設計判断
- `design.md` — D1〜D5 の設計判断（前周 F-001 対応後）
- `tasks.md` — T-01〜T-05 の実装タスク（前周 F-001 対応後）
- `spec.md` — 4 要件・6 シナリオ
- `test-cases.md` — TC-001〜TC-028（28 件、前周 F-002 対応後）

### 参照した実装ファイル

- `src/core/step/bite-evidence/tamper.ts` — 現行 `checkTamperStatus(lineage, currentHash)` の signature と実装（旧契約のまま、これから実装される予定）
- `src/core/step/bite-evidence/step.ts` — 現行 tamper 計算ブロック（旧契約のまま）
- `src/core/step/bite-evidence/gate.ts` — tamper mismatch → failed routing（行 104-111）
- `src/core/port/step-types.ts` — `CliStepDeps` インターフェース（`spawn`, `runtimeStrategy?` を確認）
- `src/core/types.ts` — `PipelineDeps` インターフェース（`StepContext` を継承、`spawn` と `runtimeStrategy?` を持つ）
- `src/core/step/executor.ts` — `runCliStep` の実装（`step.run(state, deps)` の呼び出しを確認、deps は `PipelineDeps`）
- `src/core/pipeline/run.ts` — `buildPipeline` / `buildPipelineForJob`（descriptor 参照・`StepExecutor` 構築を確認）
- `src/core/resume/canon-provenance.ts` — `declaredCanonWritesForStep` の実装パターン（`getPipelineDescriptor` 使用）
- `src/core/pipeline/registry.ts` — `import { BiteEvidenceStep } from "../step/bite-evidence/step.js"` (行 24) を確認
- `src/core/port/runtime-strategy.ts` — `listWorktreeChanges`・`RealRuntimeStrategy` 交差型を確認
- `src/core/resume/apply-canon.ts` — `operator-apply: ${slug}` commit メッセージの確認（行 142）
- `src/core/step/spec-fixer.ts` — `writes()` で `test-cases.md` を宣言していることを確認（行 99-107）
- `src/core/step/commit-push.ts` — commit メッセージ形式 `` `${step.name}: ${slug}` ``（行 581, 713）を確認

### 前周 finding の解消確認

#### F-001（HIGH）: circular import — RESOLVED ✅

`design.md` D1 に「実装上の制約 — circular import 回避」セクションが追加され、以下が明示された:

- `authorizedCanonWriterSteps` の配置を `tamper.ts` ではなく `src/core/resume/canon-provenance.ts` とする
- `step.ts` は `registry.ts` の import chain に含まれるため `canon-provenance.ts` を import できない
- 配線は executor 層から `CliStepDeps.authorizedCanonWriters` フィールド経由で行う
- `authorizedCanonWriterSteps` は `steps` 配列を引数で受け取り（`registry` を内部 import しない）、registry の import chain 外で安全に呼び出せる

`tasks.md` T-02 も同様に「**配置は `tamper.ts` ではなく `src/core/resume/canon-provenance.ts`**」と明記され、シグネチャが「descriptor 内の steps 配列を直接引数で受け取る — `registry` を内部 import しない」形で記述された。

技術的検証:
- `registry.ts` は `bite-evidence/step.ts`（行 24）→ `tamper.ts` を import する（一方向）
- `executor.ts` は `registry.ts` を import しないため、`canon-provenance.ts` を import しても cycle は生じない
- `run.ts` は `registry.ts` を import するが、`registry.ts` が `run.ts` を import することはなく cycle なし

F-001 は実質的に解消されている。

#### F-002（LOW）: TC-017 Category — RESOLVED ✅

`test-cases.md` の TC-017 が `**Category**: unit` から `**Category**: integration` に変更されていることを確認した。Summary の `Automated (unit/integration): 28` は変更なし（category 変更は unit/integration 双方とも automated のため影響なし）。

### 検証した観点

1. **spec.md の規約適合性**: 4 要件すべてに SHALL NOT / MUST 入り normative keyword 確認 ✓。6 シナリオすべてに GIVEN/WHEN/THEN 確認 ✓。
2. **test-cases.md の完全性**: 4 要件 6 シナリオが TC-001〜TC-006（Spec Scenario 由来）に対応 ✓。inconclusive・証跡欠落・authorizedWriters 空集合・例外フォールバックも TC-026〜TC-028 に網羅 ✓。
3. **設計判断の内部一貫性**: D1（provenance 移行）→ D2（durable 証跡）→ D3（inconclusive proceed）→ D4（TamperStatus 安定）→ D5（port method 追加）の論理連鎖を確認 ✓。
4. **commit message 形式の一致**: `commit-push.ts:581, 713` が `` `${step.name}: ${slug}` ``（step 帰属）、`apply-canon.ts:142` が `` `operator-apply: ${slug}` `` を生成することを確認 ✓。
5. **`worktreeDirty` と `evidenceAvailable` の評価順序**: D1 の分類ロジックで `evidenceAvailable === false` を最初に確認するため、worktree が dirty であっても別証跡が unavailable なら `inconclusive` になる。これは D3 「fail-closed は積極的に認可外と判定できた変更に限定する」および spec.md 要件 4 の "provenance 証跡を導出できないとき proceed" と整合する ✓。
6. **security 考察**: commit subject 解析は `<slug>` 一致検証（cross-slug 誤認防止）を含む。slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` で制限されており `: ` を含まないためパース安全。path は内部生成（`changeFolderPath(slug)` + `/test-cases.md`）であり git コマンド injection リスクなし ✓。
7. **T-03 `authorizedCanonWriters` 注入の配線**: **F-003 として報告**（下記参照）。
8. **TamperStatus union と gate routing 安定性**: `evidence-base-gate.test.ts` / `gate-empty-selection.test.ts` が `tamperStatus` を直渡しする形式であり、D4 の union 安定化で既存テストが無変更で green になる設計を確認 ✓。

## 検証できなかった項目

- `src/core/runtime/local.ts` の実際の git 操作実装詳細（既存 port method パターンから推定）
- `src/core/pipeline/pipeline.ts` の step 実行ディスパッチ詳細（`executor.execute()` 呼び出し形式 — F-003 の評価に関係するが完全確認できず）
- `src/core/step/write-scope.ts` の `protectedCanonPaths` の実装内容（design.md に参照があるが詳細確認なし）

いずれも本 request のスコープに実質的な影響はない。

## Findings 詳細

### F-003（MEDIUM）: T-03 の `authorizedCanonWriters` injection 配線が未指定 — 実装ファイルリストに注入元モジュールが欠落

**ファイル**: `specrunner/changes/tamper-provenance-baseline/tasks.md`
**該当箇所**: T-03「`CliStepDeps` に `authorizedCanonWriters?` フィールドを追加する」および冒頭の「実装対象の主なファイル」リスト

**問題の詳細**:

T-03 は `CliStepDeps` に `authorizedCanonWriters?: ReadonlySet<string>` を追加し、executor が `authorizedCanonWriterSteps`（`canon-provenance.ts`）を呼び出して事前計算し「`BiteEvidenceStep.run()` 呼び出し前に `deps.authorizedCanonWriters` として渡す」とする。

しかし現行の実行フローを追うと:

```
run.ts（buildPipeline）
  → new StepExecutor(bus, runner, storeFactory, gitTransportSpawn, undefined, permissionScope)
       ※ descriptor.steps は StepExecutor に渡されない
  → executor.execute(step, state, deps: PipelineDeps)
       → runCliStep(step, state, deps: PipelineDeps)
            → step.run(state, deps)   ← deps は PipelineDeps のまま
```

以下の問題がある:

1. **`executor.ts` は descriptor の steps を保持しない**: `StepExecutor` のコンストラクタは steps を受け取らず、`runCliStep` が `authorizedCanonWriterSteps` を呼び出すための `descriptor.steps` にアクセスできない。

2. **`PipelineDeps` に `authorizedCanonWriters?` フィールドがない**: `executor.ts` が `step.run(state, deps)` を呼ぶとき `deps` は `PipelineDeps` 型。`PipelineDeps` はこのフィールドを持たないため、型定義を `CliStepDeps` に追加しただけでは `step.ts` が読む `deps.authorizedCanonWriters` は常に `undefined` になる。

3. **注入元モジュールが実装ファイルリストに未記載**: `run.ts`（`buildPipelineForJob` が descriptor と state の両方にアクセスできる）や `src/core/types.ts`（`PipelineDeps`）がリストに含まれていない。

**影響**:

実装者が T-03 を忠実に実行すると、`CliStepDeps.authorizedCanonWriters` の型定義は追加されるが値が決して注入されない。`step.ts` は `deps.authorizedCanonWriters === undefined` を検出して `evidenceAvailable=false` に倒し、tamper 判定が常に `inconclusive`（proceed）になる。これは tamper 検出機能が**サイレントに無効化**される状態であり、要件 2（fail-closed）を満たさない。

**修正案**（いずれかを tasks.md T-03 に追記する）:

**案 A（推奨）**: 計算を `run.ts` の `buildPipelineForJob` で行い、`PipelineDeps` 経由で流す。

- `src/core/types.ts` の `PipelineDeps` に `authorizedCanonWriters?: ReadonlySet<string>` を追加（T-03 に追記）。
- `run.ts` の `buildPipelineForJob` 内で `authorizedCanonWriterSteps(testCasesMdPath(jobState.slug), descriptor.steps, jobState, deps)` を呼び出し、`enrichedDeps: PipelineDeps = { ...deps, authorizedCanonWriters: writers }` として `buildPipeline` に渡す（T-03 に追記）。
- `executor.ts` は変更不要（`deps` として `PipelineDeps` をそのまま `step.run()` に渡す既存コードで `authorizedCanonWriters` が自動伝搬する）。
- 実装ファイルリストに `src/core/types.ts` と `src/core/pipeline/run.ts` を追加。

**案 B**: `StepExecutor` コンストラクタに steps を渡し、`runCliStep` 内で計算する。

- `StepExecutor` のコンストラクタに `allSteps?: ReadonlyArray<readonly [string, Step]>` を追加。
- `buildPipeline` で `new StepExecutor(..., descriptor.steps)` と渡す。
- `runCliStep` 内で `authorizedCanonWriterSteps` を呼び出し、`step.run(state, { ...deps, authorizedCanonWriters })` で渡す。
- 実装ファイルリストに `src/core/pipeline/run.ts` と `src/core/step/executor.ts` を追加。

どちらの案でも `run.ts` が `canon-provenance.ts` を import することになるが、`registry.ts` が `run.ts` を import しないため circular import は生じない。
