# Conformance Result — runtime-mutation-lifecycle-capability-split — iter 1

## Evidence Report

### AC-1: 対象 consumer が mutation / lifecycle 用に full `RuntimeStrategy` を要求しない

**PASS**

`src/core/step/executor.ts` に `deps.runtimeStrategy` の参照がないことを確認した。grep により `deps.stepArtifact`、`deps.stepIo`、`deps.changedFiles` のみを参照している。

`src/core/pipeline/pipeline.ts` では `deps.terminalState?.commitFinalState(...)` のみを使用。`deps.runtimeStrategy` 参照なし。

`src/core/pipeline/parallel-review-round.ts` では `deps.roundGitEffects?.captureHeadSha`、`deps.roundGitEffects?.listWorktreeChanges`、`deps.roundGitEffects?.commitRoundArtifacts` 等を使用。`deps.runtimeStrategy` 参照なし（grep 確認済み）。

`src/core/command/runner.ts` では `this.runtime.buildDeps(...)` を直接使用（composition root 層として適切）。mutation/lifecycle capability は `deps.terminalState?.commitFinalState(...)` で呼び出し。

---

### AC-2: `PipelineDeps` が full runtime facade を mutation consumer 向け service locator として保持しない

**PASS**

`src/core/types.ts` に `runtimeStrategy?: RuntimeStrategy` フィールドが存在しないことを確認した。R2b コメント（`// R2b: runtimeStrategy is removed`）がある。代わりに以下 7 フィールドが追加されている：

- `stepArtifact?: StepArtifactLifecycleCapability`
- `stepIo?: StepIoValidationCapability`
- `terminalState?: TerminalStateCapability`
- `roundGitEffects?: RoundGitEffectsCapability`
- `changedFiles?: ChangedFilesCapability`（R2a, port 層）
- `commitInspection?: CommitInspectionCapability`（R2a）
- `revisionContent?: RevisionContentCapability`（R2a）

`RuntimeStrategy` の import も `types.ts` から除去されていることを確認。

---

### AC-3: capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない

**PASS**

4 つの capability が使い分けられており、それぞれ最小メソッド集合に留まっている：

| Interface | Methods | File |
|---|---|---|
| `StepArtifactLifecycleCapability` | 4 required + 1 optional | `step-capability.ts` |
| `StepIoValidationCapability` | 3 required | `step-capability.ts` |
| `TerminalStateCapability` | 1 required | `pipeline-capability.ts` |
| `RoundGitEffectsCapability` | 5 required | `pipeline-capability.ts` |

単一の `MutationRuntimeStrategy` に詰め替えてはいないことを確認した。

---

### AC-4: capability method は required で、能力不在は注入値で表現される

**PASS**

`step-capability.ts`・`pipeline-capability.ts` を確認した。全メソッドが required（`?` なし）。唯一の例外は `snapshotMainCheckoutGuard?`（spec に明示された除外）。

`PipelineDeps` 上のフィールドが `T | undefined`（optional field）として宣言されており、消費側は `deps.stepArtifact?.method()` パターンで field-level optionality を表現している。メソッド自体には `?` を付けていない。

---

### AC-5: `buildDeps` / `finalizeStepArtifacts` / `commitFinalState` / `commitRoundArtifacts` の対象 payload signature に domain object を表す `unknown` が残らない

**PASS**

`src/core/port/runtime-strategy.ts` の `buildDeps` は `PipelineDeps` を返すよう変更済み。`finalizeStepArtifacts`、`commitFinalState`、`commitRoundArtifacts` は `RuntimeStrategy` インターフェースから除去済みであることを確認した（runtime-strategy.ts 全体を読了）。

`LocalRuntime.finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra)` — 全パラメータが具体的な型。

`LocalRuntime.commitFinalState(cwd: string, slug: string, state: JobState)` — `unknown` なし。

`LocalRuntime.commitRoundArtifacts(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams)` — `unknown` なし。`RoundEgressParams` は domain-neutral DTO として定義済み。

`ManagedRuntime` の対応メソッドも同一の typed signature を持つことを確認。

---

### AC-6: 対象境界の `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される

**PASS**

`src/core/command/runner.ts` を確認した。`this.runtime.buildDeps(config, request, slug, workspace)` の結果が `as PipelineDeps` キャストなしで `deps: PipelineDeps` に代入されている（line 222 相当）。

`src/core/runtime/local.ts` を確認した。`as CommitPushInfra`（旧 line 931）および egress params 復元 cast は存在しない。`infra: CommitPushInfra` として直接受け取る形に変更済み。

---

### AC-7: 新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない

**PASS**

grep で `as unknown as RuntimeStrategy` を検索した結果、src/ 配下で新たな occurrences は存在しない。既存の 4 件（`pipeline-sole-committer-e2e.test.ts` ×2、`custom-reviewers-e2e.test.ts` ×1、`pipeline-integration.test.ts` ×1）は scope 外の full-pipeline e2e mock であり baseline と変化なし。

---

### AC-8: R2a の read-only leaf consumer が full facade 依存へ戻っていない

**PASS**

`src/core/step/adr-gen.ts`：パラメータが `commitInspection: CommitInspectionCapability | undefined` に変更済み。`RuntimeStrategy` import なし。

`src/core/step/custom-reviewer.ts`：同様に `commitInspection: CommitInspectionCapability | undefined` に変更済み。

`src/core/step/spec-review.ts`：同様に `commitInspection: CommitInspectionCapability | undefined` に変更済み。

`src/core/step/commit-orchestrator.ts`：`deps.stepArtifact?.digestArtifacts(...)` および `deps.revisionContent` を直接使用。`deriveRevisionContentCapability(deps.runtimeStrategy)` の派生呼び出しは除去済み。

`src/core/step/step-context-builder.ts`：`deps.commitInspection` を `step.prepareRoundContext` へ渡している。

R2a の `ChangedFilesCapability`、`CommitInspectionCapability`、`RevisionContentCapability` が `PipelineDeps` の explicit フィールドとして注入されており、consumer 側での再派生パターンは除去されている。

---

### AC-9: command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される

**PASS**

以下のテストファイルを確認した：

- `tests/unit/step/executor-lifecycle-ordering.test.ts`（T-15）:
  - TC-T15-01: `finalizeStepArtifacts` が `cwd: string`、`slug: string` を string primitive で受け取ることを確認
  - TC-T15-02: `deps.roundOwnsGitEffects === true` の場合に `finalizeStepArtifacts` が呼ばれないことを確認
  - TC-T15-03: `terminalState?.commitFinalState` が string primitive で呼ばれることを確認
  - TC-T15-04: `terminalState` 不在で optional chain が正しく評価されることを確認
  - TC-T15-05: `buildDeps` の返値が `PipelineDeps` 型にキャストなしで代入できることを型レベルで証明

- `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts`（T-03, T-04）:
  - `commitRoundArtifacts` の前後でのHEAD order（T-03: approvedAtCommit が source revision）を確認
  - `deps.roundGitEffects` 経由でのメソッド呼び出しを確認

- 既存の `parallel-review-round-git-effects.test.ts`、`parallel-review-round-canon.test.ts` 等も更新済みで pass している。

注記：`tests/unit/step/executor-lifecycle-ordering.test.ts` の TC-T15-03 が `deps.cwd ?? ""` を replication しているが、これは production code と一致している。spec.md シナリオは `deps.cwd ?? process.cwd()` を例示しているが、当該 SHALL 文（"Consumers SHALL NOT pass a full `PipelineDeps` object"）はフォールバック値を規定しておらず、production では `deps.cwd` は常に `workspace.cwd` として非 null で設定されるため影響なし。

---

### AC-10: Local/Managed capability contract test、または同等の executable proof がある

**PASS**

- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts`（T-14）:
  - `deriveStepArtifactLifecycleCapability` の compile-time + runtime proof
  - `deriveStepIoValidationCapability` の同上
  - `deriveTerminalStateCapability` の同上
  - `deriveRoundGitEffectsCapability` の同上
  - capability absence（`terminalState: undefined`）の負のテスト

- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts`（T-14）:
  - Managed runtime の no-op semantics を verify する assertions 含む
  - `prepareStepArtifacts` resolve without side effects
  - `finalizeStepArtifacts` resolve without side effects
  - `commitFinalState` resolve without side effects（no-op）
  - `listWorktreeChanges` returns `{ kind: "success", paths: [] }`
  - TC-028: 実際の `ManagedRuntime` instance を用いた buildDeps 検証

- `src/core/runtime/__tests__/managed-round-git.test.ts` も更新済みで pass。

---

### AC-11: architecture 文書が実装後の責務と依存方向に一致する

**PASS**

`architecture/components.md` の RuntimeStrategy セクション（line 170–183）を確認した。以下が明記されている：

- `RuntimeStrategy` は composition root 向け facade（not a service locator for domain consumers）
- R2a：read-only leaf capability（`ChangedFilesCapability`、`CommitInspectionCapability`、`RevisionContentCapability`）
- R2b：mutation/lifecycle capability（`StepArtifactLifecycleCapability`、`StepIoValidationCapability`、`TerminalStateCapability`、`RoundGitEffectsCapability`）
- `PipelineDeps.runtimeStrategy` は廃止（R2b）、各 capability フィールドが代替
- Local/Managed の行動差異は concrete runtime / adapter 実装に閉じる
- `derive*Capability(this)` ヘルパーで束縛される（D5）

`src/core/step/step-capability.ts` および `src/core/pipeline/pipeline-capability.ts` への参照あり。

---

### AC-12: SpecRunner verification が green

**PASS**（PR の既存証跡を正本とする）

`specrunner/changes/runtime-mutation-lifecycle-capability-split/verification-result.md` を確認した。

| Phase | Status |
|---|---|
| build | passed |
| typecheck | passed |
| test | passed |
| lint | passed |
| changed-line-coverage | passed |

---

### AC-13: 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない

**PASS**

`git diff main...HEAD --stat` の結果を確認した。変更ファイルはすべて以下のカテゴリに属する：

- capability interface の新規ファイル（`step-capability.ts`、`pipeline-capability.ts`）
- 既存 port / domain ファイルの更新（`runtime-strategy.ts`、`types.ts`、`local.ts`、`managed.ts`、`executor.ts`、`pipeline.ts`、`parallel-review-round.ts`、`runner.ts`、`adr-gen.ts`、`custom-reviewer.ts`、`spec-review.ts`、`commit-orchestrator.ts`、`step-completion.ts`、等）
- 新規・更新テストファイル（contract tests, lifecycle ordering tests）
- 更新アーキテクチャ文書（`architecture/components.md`）
- 変更フォルダ（`specrunner/changes/runtime-mutation-lifecycle-capability-split/`）

scope 外の未追跡ファイルは含まれていない。

---

## 観測事項（参考：規範違反ではない）

- `pipeline.ts` および `runner.ts` での `commitFinalState` 呼び出しで `deps.cwd ?? ""` を使用しているが、spec.md シナリオは `deps.cwd ?? process.cwd()` を例示している。SHALL 文はフォールバック値を規定しておらず、production では `deps.cwd` は `workspace.cwd` として常に非 null であるため動作に影響しない。

- `parallel-review-round-invalidation.test.ts` のテスト内ローカル変数名が `runtimeStrategy` のままだが、実際には `PipelineDeps.roundGitEffects` に渡されており、production コードが `deps.runtimeStrategy` を参照していないことを妨げない。

---

## 確認済みアイテム数

- 規範項目（request.md 受け入れ基準）：13 項目
- spec.md Requirements/Scenarios：11 Requirements（18 Scenarios）
- 実装ファイル読了：22 ファイル
- テストファイル確認：6 ファイル
