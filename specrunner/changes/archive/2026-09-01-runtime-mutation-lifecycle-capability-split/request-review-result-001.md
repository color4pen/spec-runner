# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーション事実確認

以下のアサーションをすべて直接コードで確認した。

**ファイル行数・メソッド数**
- `src/core/port/runtime-strategy.ts`: `wc -l` で **875 行** を確認 ✓
- `RuntimeStrategy` interface: `bootstrapJob`, `persistJobState`, `query`, `createAgentRunner`, `setupWorkspace`, `buildDeps`, `registerCleanup`, `teardown`, `captureHeadSha`, `prepareStepArtifacts`, `finalizeStepArtifacts`, `validateStepInputs`, `validateStepOutputs`, `commitFinalState`, `verifyFindingRefs`, `digestArtifacts`, `listChangedFiles`, `listWorktreeChanges?`, `commitRoundArtifacts?`, `canDeriveChangedFiles?`, `assertNoDuplicateLiveJob?`, `assertProviderReadiness?`, `reloadJobState?`, `listCommitChangedFiles?`, `readFileAtCommit?`, `snapshotMainCheckoutGuard?`, `readRevisionContent?`, `lastCommitTouchingPath?` = **28 メソッド** ✓

**unknown トークン**
- 同ファイル内の `unknown` トークン: `grep -n "unknown"` で 20 行ヒット。うち line 508 は `deps: unknown, state: unknown` の 2 トークン含む → 合計 **21** ✓
- 対象 4 signature の `unknown`:
  - `buildDeps(...)`: `: unknown;` (line 385) ✓
  - `finalizeStepArtifacts(step: unknown, ..., deps: unknown, ..., commitPushInfra: unknown)` (lines 438/440/442) ✓
  - `commitFinalState(deps: unknown, state: unknown)` (line 508) ✓
  - `commitRoundArtifacts(..., commitPushInfra: unknown, egressParams?: unknown)` (lines 627/629) ✓
  - `RealRuntimeStrategy` の intersection でも同 2 unknown を再宣言 (lines 859/860) ✓

**cast パターン**
- `as unknown as RuntimeStrategy`: grep で **4 件**、すべてテストファイル（`pipeline-integration.test.ts`, `custom-reviewers-e2e.test.ts`, `pipeline-sole-committer-e2e.test.ts` ×2）✓
- `as PipelineDeps` cast: `runner.ts` line 222 にのみ存在 ✓
- `as CommitPushInfra` cast: `local.ts` line 931 に存在 ✓
- egress params 復元 cast: `local.ts` line 932 に存在 ✓

**facade 依存**
- `PipelineDeps.runtimeStrategy?: RuntimeStrategy` が `src/core/types.ts` line 91 に存在 ✓
- `LocalRuntime.buildDeps` が `runtimeStrategy: this`（self 注入）を返す（`local.ts` line 617）✓
- `pipeline.ts` が `deps.runtimeStrategy?.commitFinalState(deps, state)` を 2 箇所呼び出し（lines 399, 623）✓

**R2a 完了の確認**
- `ChangedFilesCapability`, `CommitInspectionCapability`, `RevisionContentCapability` が `runtime-strategy.ts` に定義済み ✓
- `deriveCommitInspectionCapability`, `deriveRevisionContentCapability` helper が定義済み ✓
- `architecture/components.md` が存在し、RuntimeStrategy を "composition root 向け facade" として記述済み ✓

### Step 2: 変更スコープ・影響範囲の確認

**変更対象 consumer の確認**

| Consumer | 現状の facade 利用 | 備考 |
|----------|-------------------|------|
| `CommandRunner` (`runner.ts`) | `this.runtime: RuntimeStrategy` で bootstrapJob / persistJobState / setupWorkspace / buildDeps / registerCleanup / teardown / reloadJobState / assertProviderReadiness を呼び出し | template method の核心 |
| `PipelineRunCommand` (`pipeline-run.ts`) | `this.runtime.bootstrapJob`, `assertNoDuplicateLiveJob` を呼び出し（CommandRunner 継承） | prepare() のみ override |
| `ResumeCommand` (`resume.ts`) | `RuntimeStrategy` を type import、CommandRunner 継承 | |
| `Pipeline` (`pipeline.ts`) | `deps.runtimeStrategy?.commitFinalState(deps, state)` を 2 箇所（lines 399, 623） | |
| `StepExecutor` (`executor.ts`) | `deps.runtimeStrategy` 経由で captureHeadSha / snapshotMainCheckoutGuard / prepareStepArtifacts / validateStepInputs / listChangedFiles / validateStepOutputs / finalizeStepArtifacts / detectNoOp 等を呼び出し | |
| `ParallelReviewRound` (`parallel-review-round.ts`) | `deps.runtimeStrategy` 経由で captureHeadSha / listChangedFiles / listWorktreeChanges / commitRoundArtifacts / digestArtifacts を呼び出し | `CommitPushInfra` を自身で組み立てて渡す |

**部分的 R2a 残り**

`adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` の 3 ファイルは `RuntimeStrategy | undefined` を受け取り、`deriveCommitInspectionCapability(runtimeStrategy)` で narrow してから downstream に渡すパターンを採用済み。これらは `RuntimeStrategy | undefined` パラメータを `CommitInspectionCapability | undefined` に narrowing すれば R2a と同等の完成状態となる。本 Request の対象外か対象内かは実装者が判断すること（Request 本文には明記なし）。

**ライフサイクル順序の確認**

`CommandRunner.execute()` の観測可能な順序:
1. `assertProviderReadiness` (before prepare)
2. `prepare()` → bootstrapJob, assertNoDuplicateLiveJob (in PipelineRunCommand)
3. `setupWorkspace`
4. `reloadJobState` (run path のみ)
5. `buildDeps` + `registerCleanup`
6. Pipeline 実行
7. `teardown`

Request Req 5 が明示する順序と一致することを確認した。

### Step 3: Stop Condition 評価

以下の Stop Condition を順次評価した:

- **lifecycle 順序変更なしに分割できないか**: No — capability interface は呼び出し側の型を narrowing するのみであり、CommandRunner のシーケンスを変えなくても分割可能。
- **Local/Managed semantics 変更が必要か**: No — concrete runtime の実装を変えずに interface を分割できる。
- **domain-neutral DTO で情報を保てないか**: `buildDeps` の `unknown` 除去が最も複雑だが、Request が列挙する 4 つの代替手段（consumer-owned interface / domain-neutral DTO / orchestration を consumer へ / composition root typed builder）のいずれかで解決可能。facade 廃止を要しない。
- **RuntimeStrategy facade の廃止が必要か**: No — facade は維持される（Non-goals に明記）。
- **agent runner provider/session lifecycle 変更が必要か**: No。
- **新 architecture layer / public API / ADR が必要か**: No — Request は `adr: false` と明示。

いずれの Stop Condition も発動しない。

### Step 4: 受け入れ基準のレビュー

全 13 項目の受け入れ基準を確認。現状コードとの整合を検証した:
- 対象 consumer が full `RuntimeStrategy` に依存している現状を確認済み → 達成により基準を満たせる構造 ✓
- `PipelineDeps.runtimeStrategy?: RuntimeStrategy` が full facade であることを確認済み → 分割で基準を満たせる ✓
- `unknown` を除去する対象 4 signature の現状を確認済み ✓
- `as PipelineDeps`, `as CommitPushInfra`, egress params cast の現状を確認済み ✓
- R2a read-only capability が既存実装で保護されていることを確認済み ✓

## 検証できなかった項目

- **"production の RuntimeStrategy import: 12 files"のカウント手法**: `grep -rn "import.*RuntimeStrategy"` では 9 件、`grep -rl "from.*runtime-strategy"` (production) では ~22 件となり、baseline の 12 と一致しない。ただしこれは測定方法の違い（型名 import か、ファイル全体のいずれかの型をimportか）による可能性が高く、本 Request の正確性を損なうものではない。baseline 数値の精度に依存する実装計画変更は生じない。
- **archive / attach entrypoint の全コード**: run/resume コマンドは確認したが、archive/attach の詳細コードは確認していない。Request の記述（workspace entrypoint として列挙）と architecture/components.md の記述から scope が正しいことを間接確認した。

## Findings 詳細

### Finding 1: adr-gen/custom-reviewer/spec-review の RuntimeStrategy 受け取り型が R2a で narrowing されていない

`adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` の 3 ファイルは `RuntimeStrategy | undefined` を受け取って `deriveCommitInspectionCapability` で narrow するパターンを採用しているが、パラメータ型が `RuntimeStrategy | undefined` のままであり、`CommitInspectionCapability | undefined` への narrowing が完了していない。これは R2a の partial 残り。本 Request がこれを対象に含めるかどうかは request 本文に明示がなく、Requirement 1 の "少なくとも以下の consumer と呼び出し経路を調査し" の調査対象に含まれていない。

実装者は:
- (a) 本 Request のスコープに含めて narrowing する（受け入れ基準「対象 consumer が full RuntimeStrategy を要求しない」に該当するかを実装者が判断）、または
- (b) 現状維持として残し、対象外の justification を PR 本文に記録する

のいずれかを選択すること。本 finding は実装を blocking しない（medium / decision-needed）。

### Finding 2: `buildDeps` の unknown 除去方針が未確定

`buildDeps(...)`: `unknown` を除去するには port→domain import cycle を避けた代替が必要。Request は 4 つの方針を示しているが、どれを採用するかは PR 本文で明示する必要がある。方針の選択は実装内容に大きく影響するが、Request の指示範囲内で解決可能。Stop Condition は発動しない。

この finding は request の品質問題ではなく、実装者に選択を促す情報。blocking しない（low）。
