# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/runtime-read-capability-split/request.md` — 要件・受け入れ基準・実測値・Stop Conditions の全文
- `specrunner/changes/runtime-read-capability-split/design.md` — 決定 D1〜D9、リスク・トレードオフ、Open Questions の全文
- `specrunner/changes/runtime-read-capability-split/tasks.md` — T-01〜T-12 の全タスク
- `specrunner/changes/runtime-read-capability-split/spec.md` — 全 Requirement・Scenario
- `specrunner/changes/runtime-read-capability-split/test-cases.md` — TC-001〜TC-032 の全件
- `src/core/port/runtime-strategy.ts` — RuntimeStrategy インターフェース定義（特に対象メソッドシグネチャ）
- `src/core/step/finding-recency.ts` — 現在の RuntimeStrategy 依存箇所
- `src/core/step/no-op-detect.ts` — 現在の RuntimeStrategy 依存箇所
- `src/core/step/prior-round-context.ts` — 現在の RuntimeStrategy 依存箇所
- `src/core/step/post-fix-context.ts` — 現在の RuntimeStrategy 依存箇所
- `src/core/step/custom-reviewer-round-context.ts` — 現在の unknown キャスト箇所
- `src/core/step/scope-check.ts` — 現在の PipelineDeps 依存箇所
- `src/core/pipeline/runtime-capability-gate.ts` — 現在の Pick<RuntimeStrategy,...> 箇所
- `src/core/archive/achieved-assurance.ts` — 現在の AssuranceProvenanceRuntime 定義
- `architecture/components.md` — RuntimeStrategy 責務記述（行 171 付近の stale 記述を確認）
- `tests/unit/core/runtime/local.test.ts` — LocalRuntime テスト構築方法の確認（T-09 実現可能性）

### 検証した観点

#### アーキテクチャ

| 確認内容 | 結果 |
|---|---|
| D2: 3つの capability を単一 mega-interface にしていないか | ✓ 3分割（ChangedFilesCapability / CommitInspectionCapability / RevisionContentCapability）で non-goal「単一 ReadonlyRuntimeStrategy の新設」に違反しない |
| D1: port ファイルへの共居が依存方向を崩さないか | ✓ DU 型（ChangedFilesResult 等）と capability を同ファイルに置くことで domain→ports back-edge を増やさない |
| D7: orchestration 層（executor.ts 等）が full facade を維持するか | ✓ PipelineDeps.runtimeStrategy は RuntimeStrategy \| undefined のまま。R2b 先取りなし |
| D5: scope-check の構造的最小型は structural typing で PipelineDeps を受け入れるか | ✓ PipelineDeps.runtimeStrategy は RuntimeStrategy \| undefined。RuntimeStrategy は listChangedFiles (required) / canDeriveChangedFiles? を持ち ChangedFilesCapability を構造的に満たす |
| D4: Pick<ChangedFilesCapability, 'canDeriveChangedFiles'> は runtime-capability-gate の用途に適合するか | ✓ canDeriveChangedFiles は ChangedFilesCapability でも optional。ゲートの `runtime.canDeriveChangedFiles?.() === false` ガードと整合 |

#### 正確性 — メソッドシグネチャの照合

T-01 で定義される capability インターフェースのシグネチャを `src/core/port/runtime-strategy.ts` の RuntimeStrategy 定義と照合した。

| Capability | 定義シグネチャ（T-01） | RuntimeStrategy 該当行 | 一致 |
|---|---|---|---|
| `ChangedFilesCapability.canDeriveChangedFiles?()` | `(): boolean` | 行 576: `canDeriveChangedFiles?(): boolean` | ✓ |
| `ChangedFilesCapability.listChangedFiles(...)` | `(baseBranch, cwd, branch): Promise<ChangedFilesResult>` | 行 479 | ✓ |
| `CommitInspectionCapability.listCommitChangedFiles?(...)` | `(oid, cwd): Promise<ChangedFilesResult>` | 行 648: `listCommitChangedFiles?(oid: string, cwd: string): Promise<ChangedFilesResult>` | ✓ |
| `RevisionContentCapability.readRevisionContent?(...)` | `(file, priorOid, cwd, branch): Promise<RevisionContentPair>` | 行 713-718 | ✓ |
| `AssuranceProvenanceRuntime.readFileAtCommit?(...)` | `(oid, pathSuffix, cwd): Promise<CommitFileResult>` | 行 673: `readFileAtCommit?(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>` | ✓ |

全 capability のメソッドシグネチャが RuntimeStrategy 定義と一致する。

#### 正確性 — 境界条件・edge case

| 確認内容 | 結果 |
|---|---|
| D6: optional メソッドを capability でも optional のまま維持 | ✓ readRevisionContent?・listCommitChangedFiles?・readFileAtCommit?・canDeriveChangedFiles? はすべて optional のまま定義される |
| finding-recency の `typeof runtimeStrategy.readRevisionContent !== "function"` ガード | ✓ RevisionContentCapability でも optional なので guard は型レベルで正当 |
| prior-round-context / post-fix-context の null degrade | ✓ `if (!runtimeStrategy?.listCommitChangedFiles) return null` は CommitInspectionCapability\|undefined で正当 |
| custom-reviewer-round-context の `as RuntimeStrategy` 除去後の型安全性 | ✓ CommitInspectionCapability\|undefined への絞り込み後、ガード通過でメソッドが non-null に narrowing され呼び出し可能 |
| scope-check の canDeriveChangedFiles === false 短絡 | ✓ 仕様・タスク・テストケース（TC-014）で明示的に維持が求められている |
| ManagedRuntime が CommitInspectionCapability を満たすか | ✓ ManagedRuntime.listCommitChangedFiles は unavailable を返す optional メソッドとして存在。interface の shape は満たす |
| RealRuntimeStrategy（行 765/780）が ChangedFilesCapability・CommitInspectionCapability を満たすか | ✓ canDeriveChangedFiles() が required として存在（行 765）、listCommitChangedFiles が required として存在（行 780）。LocalRuntime 実装は各 capability を structural typing で満たす |

#### 正確性 — scope-check の deps 最小型

`computeExtraScopeFindings` の全本体（行 41-70 を完読）を確認。`deps.*` アクセスは `deps.runtimeStrategy`・`deps.slug`・`deps.request.baseBranch`・`deps.cwd` の 4 フィールドのみ。D5/T-07 が指定する最小型とちょうど一致する。

#### 完全性 — タスク分解

| requirements §2 対象 consumer | タスク | 確認 |
|---|---|---|
| scope-check | T-07 | ✓ |
| runtime-capability-gate | T-08 | ✓ |
| no-op-detect | T-02 | ✓ |
| prior-round-context | T-04 | ✓ |
| custom-reviewer-round-context | T-06 | ✓ |
| post-fix-context | T-05 | ✓ |
| finding-recency | T-03 | ✓ |
| achieved-assurance | T-08 | ✓ |

8 件すべて対応タスクあり。

| 非機能タスク | 対応 |
|---|---|
| contract test（Local/Managed × capability） | T-09 |
| leaf consumer 非退行 compile-time test | T-10 |
| architecture 文書更新 | T-11 |
| build/typecheck/lint/test 全 green | T-12 |

#### 完全性 — テストケース

spec.md の全 Requirement が test-cases.md のいずれかの TC にトレース可能であることを確認した（TC-001〜TC-022 で spec シナリオを、TC-023〜TC-030 でタスク実装的確認を、TC-031 で手動確認を、TC-032 で gate を網羅）。総数 32 件（must: 24、should: 7、could: 1）。

#### architecture/components.md の stale 記述確認

行 171 に「commit 時テスト実行」の文言が残存していることを確認した。T-11 が正しく削除対象として識別している。

---

## 検証できなかった項目

- **T-09 の LocalRuntime / ManagedRuntime のインスタンス構築可否**: `tests/unit/core/runtime/local.test.ts` を参照し、`spawnFn` mock + `buildMockGitHubClient()` で LocalRuntime が構築可能であることを確認した。ただし、実際に capability contract test ファイル（`capability-contracts.test.ts`）内で動作するかはランタイム確認が必要。
- **executor.ts における `deriveCustomReviewerPriorRound` の呼び出し箇所**: T-06 で `runtimeStrategy: unknown` → `CommitInspectionCapability | undefined` へ変更した後の caller-side 型互換性を executor.ts の詳細コードで直接検証していない。ただし structural typing の原理から RuntimeStrategy → CommitInspectionCapability は成立する。
- **scope 外 `as unknown as RuntimeStrategy` の残存数（e2e テスト）**: design.md Risk D3 で明示的に対象外とされる e2e テスト 4 件（pipeline-sole-committer-e2e, custom-reviewers-e2e, pipeline-integration）の forced cast は今回の spec 対象外であり確認しない。

---

## Findings 詳細

指摘事項なし（None）。

アーキテクチャ・正確性・タスク分解完全性について、スペック文書の範囲内で検証可能な問題は見当たらなかった。

**補足観点（参考）**:

1. `AssuranceProvenanceRuntime` の import 元が `achieved-assurance.ts` であるのに対し、T-09 の contract test は `src/core/port/runtime-strategy.ts` の 3 capability + `achieved-assurance.ts` の 1 interface をまたいで import する必要がある。tasks.md の T-09 はこれを "適切な構築方法を確認して使う" として実装者に委ねており、スペック上の問題ではなく実装ガイダンス上の留意点である。

2. `forced cast 除去` の明示的な TC は TC-019（finding-recency）のみだが、他の consumer については TC-029（capability-consumers compile-time test）がそれを実質的に保証する（narrow 型のみで呼び出せれば forced cast は不要）。スペック上の抜け漏れではない。
