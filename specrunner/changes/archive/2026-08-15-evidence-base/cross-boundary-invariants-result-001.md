# Cross-Boundary Invariants Review — evidence-base (Iteration 1)

**Reviewer**: cross-boundary-invariants
**Purpose**: diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Scope

40 files changed, 4265 insertions(+), 235 deletions(−). 主要な変更:

- `oids.ts`: `resolveEvidenceBaseRev` 追加、`detectBaseImplementationContamination` 削除
- `gate.ts`: Evidence Base red + HEAD candidate への切り替え
- `achieved-assurance.ts`: P2.5 置換（汚染検出 → EB ref チェック）、`runTestsOnSynthesizedTree` でのbase-red 実行
- `local.ts`: `runTestsOnSynthesizedTree` 実装追加
- `managed.ts`: `runTestsOnSynthesizedTree` スタブ追加
- `runtime-strategy.ts`: ポート定義拡張

---

## Invariants Checked

### I-1: `synthesizedCommits[0]` = bootstrap commit（不変）

`resolveEvidenceBaseRev` は `synthesizedCommits[0]^` を Evidence Base ref として返す。前提: `synthesizedCommits[0]` が常に bootstrap commit であること。

**検証**:
- `appendSynthesizedCommit` は常に末尾追加（prepend なし）。
- `buildInitialJobState` は `synthesizedCommits` を初期化しない（`undefined`）。
- workspace materialization（`workspace-materializer.ts:240`, `local.ts:441`, `managed.ts:257`）が最初の `appendSynthesizedCommit` 呼び出しを行い、bootstrap commit OID を [0] に登録する。
- `resume --adopt-commits` は末尾に追加するため [0] を書き換えない。
- `parallel-review-round.ts`、`commit-orchestrator.ts`、`commit-push.ts` も末尾追加のみ。

**判定**: invariant 成立。`synthesizedCommits[0]` は常に bootstrap commit。✓

### I-2: `runTestsOnSynthesizedTree` — worktree cwd から `git show` が正しい OID を引ける

gate は feature branch の worktree を `cwd` として受け取り、`git show <headOid>:<filePath>` を実行する。worktree から git object store へのアクセスは shared であり、`headOid` は同 worktree の HEAD。

**判定**: invariant 成立。✓

### I-3: managed runtime が依然 strategy-deferred になる

managed runtime は `runTestsOnSynthesizedTree` / `listCommitChangedFiles` / `runTestsAtCommit` すべてで `unavailable` を返す。gate の capability check（step 5）は「関数として存在するか」を確認するが、managed runtime はすべてのメソッドを定義している（`unavailable` を返す実装）。

→ managed runtime は step 6（`listCommitChangedFiles` → `unavailable`）で `strategy-deferred` になる。旧実装と同じパス。

**判定**: invariant 成立。挙動変化なし。✓

### I-4: `captureHeadSha` が managed runtime で null を返しても deferred になる

managed runtime の `captureHeadSha` は `null` を返す。しかし step 5 で `typeof runtimeStrategy.captureHeadSha !== "function"` は `false`（関数として存在する）。step 6 で先に `unavailable` → deferred になるため、`captureHeadSha` の null は実際には到達しない。

**判定**: invariant 成立。✓

### I-5: gate のショートサーキット順序（D6）— HEAD capture 前にすべての defer が完了

gate の step 順: type check → tamper → baseOid check → evidenceBaseRev check → capability check → listCommitChangedFiles → (step 7) captureHeadSha。HEAD capture は deferral 後。

`resolveEvidenceBaseRev` は pure function（I/O なし）。実装どおり D6 順序が維持されている。

**判定**: invariant 成立。✓

### I-6: blob freeze check と Evidence Base の "基底" が異なる

archive floor の blob freeze（`diffPathsBetweenCommits(baseOid, finalHeadOid, testFiles)`）は test-materialize commit（`baseOid`）を基点とする。Evidence Base の red 実行は `evidenceBaseRev`（fork point）を基点とする。

この 2 基底の共存は設計上正しい:
- blob freeze: 「test-materialize から HEAD まで test ファイルが改ざんされていないか」
- EB red: 「fork point に test ファイルを overlay したとき実装なしで失敗するか」

**判定**: invariant 成立。意図的な 2 基底設計。✓

### I-7: `RealRuntimeStrategy` の `runTestsOnSynthesizedTree` 必須化

`runtime-strategy.ts` の `RealRuntimeStrategy` は `runTestsOnSynthesizedTree` を non-optional として定義。`LocalRuntime` と `ManagedRuntime` 両方が実装済み。コンパイル時に欠落を検出。

**判定**: invariant 成立。✓

### I-8: `detectBaseImplementationContamination` の完全削除

production code 中の `detectBaseImplementationContamination` 参照をすべて確認。テストファイルのコメント 1 件（`// ...replaced by EB.`）を除き、import も call site も存在しない。TC-016 の規約通り typecheck が歯となる。

**判定**: invariant 成立。✓

---

## Findings

### F-1: `BiteEvidenceRecord.candidateOid` の JSDoc が旧意味論を記述

**File**: `src/state/schema/types.ts:384`
**Severity**: low

JSDoc コメント:
```
- candidateOid: commit OID of the implementer step (candidate boundary).
```

gate は現在 `headOid`（branch HEAD）を `candidateOid` に書き込む。archive floor も含め、現在のコードはこのフィールドを読んで判断を行っていない（再導出するため）。しかし将来のコードが `record.candidateOid` を「implementer step の commit OID」と解釈する場合、誤った前提で動作する可能性がある。

**修正内容**: "commit OID of the branch HEAD (green candidate = provenance-approved reachable tree, includes adopted operator commits)" に変更。

---

### F-2: `testDerivation` が `synthesizedCommits` 不在時に fail-closed になる — 旧挙動との差分

**File**: `src/core/archive/achieved-assurance.ts:237-245`
**Severity**: medium

旧実装では `testDerivation`（blob freeze + scenario freeze）は `synthesizedCommits` に依存しなかった。新実装では P2.5 チェック（`evidenceBaseRev === null` → early return）が `biteEvidence` と `testDerivation` の **両方** をブロックする。

`synthesizedCommits` が absent / empty な job（例: ledger 導入前の legacy job）は `testDerivation` も earned できなくなる。

design は `biteEvidence`/`testDerivation` の両方が absent になると明記し（diagnostic message の文言・設計 D5）、legacy job については fail-closed が acceptable と述べている。意図的な設計変更と判断する。

**残課題**: TC-005（archive floor test）は `biteEvidence` のみを floor に含むため、`testDerivation: "frozen"` を floor に含むケースで `synthesizedCommits` 不在時に `testDerivation` が absent になる挙動が**未ピン**。既存テストの全タスクで `synthesizedCommits` が正しく設定されているため実質的なリスクは低いが、pinning が欠けている。

**オプション**:
- A) Accept as-is: design が明示的に記述しており、legacy job 以外には影響しない
- B) Add a pinning test: `floor: { testDerivation: "frozen" }` + `synthesizedCommits: undefined` → `testDerivation` absent を確認

---

### F-3: `runTestsOnSynthesizedTree` の tmp path に OID discriminator がない

**File**: `src/core/runtime/local.ts` (runTestsOnSynthesizedTree)
**Severity**: low

tmp path は `specrunner-bite-evidence-synth-${Date.now()}` のみ。`runTestsAtCommit` は `specrunner-bite-evidence-${oid.slice(0, 8)}-${Date.now()}` とOID prefix を持つ。

同一マシンで複数 job が並行して `runTestsOnSynthesizedTree` を呼んだ場合、`Date.now()` 衝突で `git worktree add` が失敗し `unavailable`（fail-closed）になる可能性がある。

データ破損はない（worktree add の失敗は unavailable を返し、gate は `strategy-deferred` になる）。pre-existing pattern の亜種であり、実用上のリスクは限定的。

**修正内容**: `specrunner-bite-evidence-synth-${baseRev.slice(0, 8).replace(/[^a-z0-9]/gi, "")}-${Date.now()}` のように revision の先頭文字を discriminator に加える。

---

## Summary

| Finding | Severity | Resolution | Blocking |
|---------|----------|------------|---------|
| F-1: `candidateOid` JSDoc 旧意味論 | low | fixable | No |
| F-2: `testDerivation` が `synthesizedCommits` 不在で fail-closed | medium | decision-needed | No |
| F-3: tmp path に OID discriminator なし | low | fixable | No |

重大な cross-boundary invariant 違反（黙って既存不変条件を破るバグ）は検出されなかった。

- `synthesizedCommits[0]` = bootstrap commit の invariant は全書き込み経路を追跡した結果、成立を確認。
- managed runtime / `scopedTestCommand` 未設定 の strategy-deferred 挙動は維持されている。
- `detectBaseImplementationContamination` は production code から完全に除去済み。
- archive floor の `testDerivation`/`biteEvidence` 両次元が `evidenceBaseRev` null で同時に fail-close される挙動は設計で明示されており、fail-closed 方向のため安全性は維持される。
