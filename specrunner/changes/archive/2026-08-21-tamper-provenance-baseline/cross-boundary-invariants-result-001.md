# Cross-Boundary Invariants Review — tamper-provenance-baseline

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Focus**: 変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないか

---

## 検査対象と検査アプローチ

### 主な変更ファイル
- `src/core/step/bite-evidence/tamper.ts` — checkTamperStatus 全面書き換え + parseCommitToken 追加
- `src/core/step/bite-evidence/step.ts` — provenance 入力の計算・配線（lineage fold → commit 履歴照会）
- `src/core/step/bite-evidence/gate.ts` — reason 文字列のみ変更（routing 不変）
- `src/core/resume/canon-provenance.ts` — authorizedCanonWriterSteps helper 追加
- `src/core/pipeline/run.ts` — buildPipelineForJob + runPipeline での authorizedCanonWriters 注入
- `src/core/types.ts` — PipelineDeps.authorizedCanonWriters フィールド追加
- `src/core/port/runtime-strategy.ts` — lastCommitTouchingPath port method 追加 + RealRuntimeStrategy 更新
- `src/core/runtime/local.ts` / `managed.ts` — lastCommitTouchingPath 実装

### 検査方針

1. `gate.ts` `evidence-base-gate.test.ts` `gate-empty-selection.test.ts` が依拠している不変条件（tamperStatus routing 安定性）を確認
2. `PipelineDeps.authorizedCanonWriters` の注入経路とその依拠する前提を追跡
3. sole-committer 不変条件（commit subject 形式への依存）の実装整合を確認
4. managed runtime における fail-safe 経路を確認
5. `authorizedCanonWriterSteps` の呼び出しが `writes()` の pure 制約を踏み越えないか確認

---

## 発見事項

### F-001 — gate routing 不変条件: 維持されている ✓

**対象**: `gate.ts`, `evidence-base-gate.test.ts`, `gate-empty-selection.test.ts`

これらのテストは `tamperStatus` を直接文字列 (`"mismatch"` / `"inconclusive"`) として `runBiteEvidenceGate` に渡す。変更後も `TamperStatus = "match" | "mismatch" | "inconclusive"` union と `mismatch → failed` routing は不変（D4）。

- `tamperStatus: "mismatch"` → `verdict: "failed"` かつ `reason.match(/tamper/i)` ✓  
  新 reason 文字列: `"tamper detected: current test-cases.md is not attributable to an authorized change path (owner step or operator-apply)"` — `/tamper/i` に一致 ✓  
- `tamperStatus: "inconclusive"` → proceed ✓  
- 両テストファイルは `checkTamperStatus` / `parseCommitToken` を import せず影響ゼロ ✓

**判定**: 問題なし。既存 test の前提は完全に維持されている。

---

### F-002 — `authorizedCanonWriters` の注入経路: 両エントリポイントで網羅 ✓

**対象**: `run.ts` (buildPipelineForJob, runPipeline), `runner.ts`

注入は 2 箇所で行われる。

1. `buildPipelineForJob` — 本番運用の `runner.ts` が呼ぶ（line 339）。`composeReviewerDescriptor` 後の descriptor（custom reviewer 込み）に対し `authorizedCanonWriterSteps` を計算し `deps.authorizedCanonWriters = writers` を設定。✓  
2. `runPipeline` — operator adjudication に従い追加。e2e テスト等がこの関数を直接呼ぶ場合にも注入される。✓

`createStandardPipeline`（backward-compat export）はこの注入を行わないが、現在の呼び出し元はすべてテストコードであり、テストでは `tamperStatus = inconclusive`（fail-open）になる挙動が期待通り。本番コードからは呼ばれていない。

**注意点（Low）**: `createStandardPipeline` が本番で誤用された場合、tamper 判定が常に inconclusive になる（サイレントな fail-open）。このリスクは `createStandardPipeline` のドキュメントに明示されていないが、現状では非問題。

---

### F-003 — `authorizedCanonWriterSteps` が `writes()` pure 制約を遵守 ✓

**対象**: `canon-provenance.ts:authorizedCanonWriterSteps`, 各 step の `writes()` メソッド

`authorizedCanonWriterSteps` は `buildPipelineForJob` / `runPipeline` 内（pipeline run 前）で呼ばれ、各 step の `writes?(state, deps)` を純粋関数として呼び出す。Step の `writes()` は "Pure function — no I/O allowed（invariant B-5）" と文書化されており、サイドエフェクトはない。各 step 呼び出しは inner try-catch で保護され、例外があっても outer 集計を止めない。

`operator-apply` は常に追加されるため、結果は最低 1 要素（`{ operator-apply }`）。`authorizedCanonWriterSteps` の outer try が空集合を返す場合のみ `if (writers.size > 0)` ガードにより注入をスキップするが、`new Set()` と `.add()` は例外を throw しないため実質的に空集合が返る経路は存在しない。

**判定**: 問題なし。

---

### F-004 — sole-committer 不変条件への依存（設計上の前提） ✓

**対象**: `step.ts`, `tamper.ts`, `commit-push.ts:581`, `apply-canon.ts:142`

新 tamper 判定は「`git log -1 -- <path>` の subject が `<step-name>: <slug>` 形式」という sole-committer 不変条件を権威とする。

- `commit-push.ts:581`: `const commitMessage = \`${step.name}: ${slug}\`` — 確認済み ✓
- `apply-canon.ts:142`: `const commitMessage = \`operator-apply: ${slug}\`` — 確認済み ✓
- `parseCommitToken` は slug 一致まで検証し cross-slug 誤認を防ぐ ✓

sole-committer 制約に反してエージェントが自己 commit した場合：
- 非準拠 subject → `parseCommitToken` → `null` → sentinel `__non-conforming-subject__` → `mismatch` → fail-closed（正しい）
- 準拠 subject で自己 commit した場合は authorized と判定されうるが、これは sole-committer 制約違反であり threat model 外。

**判定**: 設計ドキュメント（Risk 節）に明示された既知の前提。問題なし。

---

### F-005 — managed runtime における inconclusive パス ✓

**対象**: `managed.ts`, `step.ts`

managed runtime での tamper 判定フロー:
1. `authorizedCanonWriters` が注入されているため `evidenceAvailable = true`
2. `listWorktreeChanges` は `{ kind: "success", paths: [] }` を返す → `worktreeDirty = false`
3. `lastCommitTouchingPath` は常に `{ kind: "unavailable" }` → `evidenceAvailable = false`
4. `checkTamperStatus({ evidenceAvailable: false })` → `inconclusive` → proceed

D3（証跡欠落時 inconclusive → proceed）に完全準拠。managed runtime は halt しない。✓

---

### F-006 — path 比較一貫性 ✓

**対象**: `step.ts`, `util/paths.ts`, `local.ts`

`testCasesMdPath = \`${changeFolderPath(slug)}/test-cases.md\``  
= `"specrunner/changes/<slug>/test-cases.md"` （`changeFolderPath` は POSIX 相対パス固定）

`listWorktreeChanges` (`git status --porcelain -z`) が返すパスも repo root 相対の POSIX パス形式。  
`lastCommitTouchingPath` の `pathArg` も同じ形式で `git log -- <path>` に渡される。  
`authorizedCanonWriterSteps` に渡す `canonPath` も同形式で `step.writes()` の返り値と比較される。

すべての path が同一基準（`changeFolderPath(slug)` 経由）で生成されるため整合している。✓

---

### F-007 — `TamperCheckResult` 型と旧インターフェース ✓

**対象**: `tamper.ts` (exported types), gate.ts, step.ts

旧 `checkTamperStatus` は `{ currentHash: string; lineageHash: string | null }` を受け取っていた。これを直接呼んでいたのは `gate.test.ts` の TC-032 群（更新許容対象）のみ。`evidence-base-gate.test.ts` と `gate-empty-selection.test.ts` は `checkTamperStatus` を import しておらず影響ゼロ。

`TamperStatus` union（`"match" | "mismatch" | "inconclusive"`）と `TamperCheckResult` 型は変更なし。gate.ts の `GateDeps.tamperStatus: TamperStatus` も変更なし。✓

---

### F-008 — CliStepDeps / PipelineDeps の型整合: 冗長キャスト（Low）

**対象**: `step.ts:53`, `step-types.ts`, `types.ts`

`step.ts` 内の取得:
```typescript
const authorizedWriters = (deps as { authorizedCanonWriters?: ReadonlySet<string> }).authorizedCanonWriters;
```

`CliStepDeps`（`step-types.ts`）が `authorizedCanonWriters?: ReadonlySet<string>` を既に宣言しており、このキャストは不要（`deps.authorizedCanonWriters` で直接参照可能）。現時点では挙動への影響はないが、キャストが型チェックをバイパスするため `CliStepDeps` からフィールドが除去された場合に TypeScript が警告を出さなくなる。

tasks.md は「`CliStepDeps` にも同フィールドを追加して型宣言を揃える」と明示しており、宣言は正しく追加されている。キャストは実装完了後の残余コードと見られ、`deps.authorizedCanonWriters` の直接参照に変更することで完全に解決できる。

**影響**: ランタイム挙動への影響なし。フィールド不在時は `undefined` → `evidenceAvailable = false` → inconclusive（fail-open）となり安全。

---

### F-009 — `PipelineDeps` コメントの不完全性（Low / Documentation）

**対象**: `types.ts:105-114`

```typescript
/**
 * Pre-computed set of step names and operator tokens authorized to write the canon
 * test-cases.md path for this job. Injected by `buildPipelineForJob` before the
 * pipeline runs ...
 */
```

`runPipeline` も同様に注入を行う（operator adjudication に従い追加）が、コメントには `buildPipelineForJob` のみ記載。documentation gap。

**影響**: コードの挙動には無影響。

---

### F-010 — `__non-conforming-subject__` sentinel の inline 定義（Low）

**対象**: `step.ts:89`

```typescript
lastCanonCommitToken = token ?? "__non-conforming-subject__";
```

non-conforming subject（commit が存在するが形式に合わない）と "no commit history"（`null`）を区別するための sentinel 文字列がインラインに埋め込まれている。名前付き定数化されていないため、同じ文字列を別箇所で参照する場合に typo リスクがある。

現在この sentinel は `step.ts` 1 箇所のみで定義・使用され、`authorizedWriters` には含まれないため誤認可のリスクは実質ゼロ。コード説明コメントは十分。

**影響**: ランタイム挙動への影響なし。

---

## 検査スコープ

| 観点 | 状態 |
|------|------|
| gate routing 不変条件（mismatch→failed, inconclusive→proceed） | ✓ 維持 |
| 既存 test（evidence-base-gate, gate-empty-selection）の前提 | ✓ 無変更で green |
| authorizedCanonWriters 注入経路の完全性 | ✓ 両エントリポイントで注入 |
| sole-committer commit subject 形式への依存 | ✓ 設計上の前提として明示済み |
| managed runtime の fail-open | ✓ D3 準拠 |
| path 比較の一貫性 | ✓ |
| writes() pure 制約の遵守 | ✓ |
| createStandardPipeline の非注入 | ✓ テスト専用、本番では非使用 |

---

## 総括

変更していないコードが依拠する不変条件（tamperStatus routing の安定性、TamperStatus union の安定性、gate reason の `/tamper/i` 一致、managed runtime の fail-open）はすべて維持されている。

`CliStepDeps` の冗長キャスト（F-008）と docs gap（F-009）は低重要度の指摘に留まり、ランタイム挙動に影響しない。`createStandardPipeline` の非注入（F-002 注意点）は将来リスクとして記録するが、現状は非問題。

critical / high の cross-boundary invariant 違反は検出されなかった。
