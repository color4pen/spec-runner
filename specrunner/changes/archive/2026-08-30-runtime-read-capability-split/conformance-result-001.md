# Conformance Result — runtime-read-capability-split — Iteration 1

## Evidence Summary

| checked | skipped | unverified |
|---------|---------|------------|
| 11      | 0       | 0          |

---

## Normative Items Verified

### AC-1: 対象 read-only leaf consumer が `RuntimeStrategy` 全体を import/parameter type として要求しない

**PASS** — すべての対象 consumer を確認。

| Consumer | Import 変更 | 依存型 |
|---|---|---|
| `no-op-detect.ts` | `RuntimeStrategy` → `ChangedFilesCapability` | `ChangedFilesCapability` |
| `finding-recency.ts` | `RuntimeStrategy` → `RevisionContentCapability` | `RevisionContentCapability` |
| `prior-round-context.ts` | `RuntimeStrategy` → `CommitInspectionCapability` | `CommitInspectionCapability \| undefined` |
| `post-fix-context.ts` | `RuntimeStrategy` → `CommitInspectionCapability` | `CommitInspectionCapability \| undefined` |
| `custom-reviewer-round-context.ts` | `RuntimeStrategy` → `CommitInspectionCapability` | `CommitInspectionCapability \| undefined` |
| `scope-check.ts` | `PipelineDeps` + 間接 `RuntimeStrategy` → `ChangedFilesCapability` | minimal inline deps 型 |
| `runtime-capability-gate.ts` | `RuntimeStrategy` → `ChangedFilesCapability` | `Pick<ChangedFilesCapability, 'canDeriveChangedFiles'>` |
| `achieved-assurance.ts` | `Pick<RuntimeStrategy, 'readFileAtCommit'>` → 自己完結 interface | `AssuranceProvenanceRuntime` |

`src/core/step/` の grep 結果（`import.*RuntimeStrategy`）は spec-review.ts、custom-reviewer.ts、adr-gen.ts にのみ残存。これらはオーケストレーション層であり request.md § 2「executor や parallel review round … 無理に facade 依存を除去しない」の適用範囲内。

---

### AC-2: capability は consumer-owned な最小契約として定義され、単一の新 mega-interface に集約されていない

**PASS** — `src/core/port/runtime-strategy.ts` から 3 つの named export を確認。

```
ChangedFilesCapability     (line 230): canDeriveChangedFiles?() / listChangedFiles(...)
CommitInspectionCapability (line 246): listCommitChangedFiles?(oid, cwd)
RevisionContentCapability  (line 256): readRevisionContent?(file, priorOid, cwd, branch)
```

`AssuranceProvenanceRuntime` は `achieved-assurance.ts` に consumer-owned explicit interface として定義。これらを包括する新たな mega-interface は存在しない。

---

### AC-3: `LocalRuntime` / `ManagedRuntime` が必要な capability を満たす

**PASS** — `tests/unit/core/runtime/capability-contracts.test.ts` を確認。

LocalRuntime・ManagedRuntime の両インスタンスを `ChangedFilesCapability`、`CommitInspectionCapability`、`RevisionContentCapability`、`AssuranceProvenanceRuntime` 各型変数に代入する compile-time 代入テストが存在。typecheck (tsc --noEmit) が通っている（verification-result.md: phase typecheck = passed）。

---

### AC-4: 対象 consumer の test fake は必要な capability だけで構築できる

**PASS** — `finding-recency.test.ts` の `makeFakeRuntime()` / `makeFakeRuntimeNoReadRevision()` が `RevisionContentCapability` 型の narrow オブジェクトを返すことを確認。`capability-consumers.test.ts` 内でも全 consumer 関数が narrow 型オブジェクトのみで呼び出されている。

---

### AC-5: 対象箇所の forced cast を除去し、新たな `as unknown as RuntimeStrategy` を追加していない

**PASS** — `as unknown as RuntimeStrategy` の全体 grep 結果を確認。

残存箇所:
- `tests/pipeline-sole-committer-e2e.test.ts` (2件)
- `tests/custom-reviewers-e2e.test.ts` (1件)
- `tests/pipeline-integration.test.ts` (1件)

これら 4 件はいずれも full pipeline mock（E2E テスト）であり、design.md Risk 「E2E テストの forced cast は本変更の対象外」と一致。leaf consumer の unit test fake の forced cast はゼロ。`finding-recency.test.ts` の旧 cast 2 件（行 83、109）は除去済みを確認。

---

### AC-6: optional/fallback/fail-closed semantics が既存テストで維持される

**PASS** — `verification-result.md` で全テスト green を確認（test phase: passed, 65.1s）。`capability-consumers.test.ts` で以下の動作維持シナリオを明示的にカバー:
- `listChangedFiles → unavailable` → changedFiles 空 → no-op 判定（TC-005/TC-020）
- `listCommitChangedFiles` absent → `null` degrade（TC-010）
- `listCommitChangedFiles → unavailable` → `null` degrade（TC-021）
- `canDeriveChangedFiles?.() === false` → UNKNOWN finding（scope-check fail-closed）

---

### AC-7: read-only capability ごとの Local/Managed contract test、または同等の executable proof がある

**PASS** — `tests/unit/core/runtime/capability-contracts.test.ts` (108 lines) を確認。LocalRuntime / ManagedRuntime の両方が 4 capability すべてを型代入で検証。vitest 上で実行可能（test phase: passed）。

---

### AC-8: 選定した leaf consumer が full `RuntimeStrategy` へ戻らない architecture/compile-time test がある

**PASS** — `tests/unit/core/step/capability-consumers.test.ts` (416 lines) を確認。8 つの leaf consumer 関数（`detectNoOp`、`computeFindingRecency`、`derivePriorRoundContext`、`derivePostFixContext`、`deriveCustomReviewerPriorRound`、`computeExtraScopeFindings`）を narrow 型オブジェクトのみで呼び出す compile-time テストが存在。consumer が `RuntimeStrategy` を要求する型に戻れば、narrow 型の call が型エラーになり typecheck が fail する。

---

### AC-9: architecture 文書が実装後の責務と依存方向に一致する

**PASS** — `architecture/components.md` の RuntimeStrategy セクション（line 170–179）を確認。

以下の必須記述をすべて確認:
- `### RuntimeStrategy — composition root 向け facade（runtime 中立の実行基盤 seam）` — composition root facade であることを明示
- `read-only leaf consumer は consumer-owned capability に依存する` — 8 つの対象 consumer と 4 つの capability interface が明記
- `concrete runtime が capability を structural typing で満たす` — LocalRuntime / ManagedRuntime の structural typing 実装を説明
- `src/core/port/runtime-strategy.ts`（consumer-owned capability interfaces）への参照

「commit 時テスト実行」等の stale 記述: grep 結果なし。既存の他セクション（層の責務、不変条件等）に変更なし。

---

### AC-10: build / typecheck / lint / full test / smoke が green

**PASS** — `verification-result.md` (Verdict: passed) を確認。

| Phase | Status | Duration |
|-------|--------|----------|
| build | passed | 0.4s |
| typecheck | passed | 9.6s |
| test | passed | 65.1s |
| lint | passed | 9.1s |
| changed-line-coverage | passed | 83.5s |

---

### AC-11: 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない

**PASS** — `git diff main...HEAD --stat` で 30 ファイルを確認。すべて以下のいずれかに該当:
- `specrunner/changes/runtime-read-capability-split/` 配下（change folder 管理ファイル）
- `src/core/port/runtime-strategy.ts`（capability interface 追加）
- `src/core/step/` 配下の対象 consumer 6 ファイル
- `src/core/pipeline/runtime-capability-gate.ts`、`src/core/archive/achieved-assurance.ts`
- `src/core/archive/__tests__/achieved-assurance.test.ts`（関連テスト minor 修正）
- `tests/unit/core/runtime/capability-contracts.test.ts`（新規）
- `tests/unit/core/step/capability-consumers.test.ts`（新規）
- `tests/unit/core/step/finding-recency.test.ts`（修正）
- `architecture/components.md`

scope 外ファイルは含まれていない。

---

## Spec Requirement 確認

| Requirement | Scenario 数 | 確認結果 |
|---|---|---|
| capability interface は named export として port ファイルから取り込める | 3 | ✓ |
| no-op-detect は ChangedFilesCapability のみを依存型として受け取る | 2 | ✓ |
| finding-recency は RevisionContentCapability のみを依存型として受け取る | 3 | ✓ |
| commit inspection consumer は CommitInspectionCapability のみを依存型として受け取る | 3 | ✓ |
| scope-check は ChangedFilesCapability を含む最小型の deps を受け取る | 3 | ✓ |
| AssuranceProvenanceRuntime が explicit interface として定義される | 2 | ✓ |
| LocalRuntime と ManagedRuntime が各 capability を structural typing で満たす | 2 | ✓ |
| 対象 consumer の test fake から forced cast が除去される | 1 | ✓ |
| 既存の観測可能な振る舞いが維持される | 3 | ✓ |

すべての normative requirement (SHALL/MUST) の達成を確認。

---

## Plan Divergence（design/tasks 参照）

plan からの逸脱: なし。

- D4（runtime-capability-gate の匿名 Pick → `Pick<ChangedFilesCapability, 'canDeriveChangedFiles'>`）: 実装確認済み
- D5（scope-check の deps 最小型）: tasks.md では `runtimeStrategy: ChangedFilesCapability | undefined`、実装は `runtimeStrategy?: ChangedFilesCapability`（optional フィールド）。型レベルでは caller からの割り当て可能性・関数内ガードの意味ともに等価であり、spec 要件（"structurally minimal"）を満たす。機能上の差異なし。
- D8/D9（compile-time contract test）: `capability-contracts.test.ts`（T-09）および `capability-consumers.test.ts`（T-10）いずれも実装済み。
- tasks.md T-12（実測値収集）: tasks.md では PR 本文用の計測を指示。conformance の判定対象外（report_result に影響しない）。
