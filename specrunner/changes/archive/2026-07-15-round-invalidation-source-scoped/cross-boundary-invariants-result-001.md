# Cross-Boundary-Invariants Review — round-invalidation-source-scoped — iter 1

## Reviewer

**cross-boundary-invariants** — diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

## Scope

変更ファイル: `src/core/pipeline/round-git-scope.ts`, `src/core/pipeline/parallel-review-round.ts`, テスト 2 ファイル + pipeline 管理成果物。

---

## Invariant Walk-through

### INV-1: `evaluateActivation` always-activate 分岐の前提

**前提**: `computeInvalidations` は `touchedFiles` に何が渡されても、`activationPaths: undefined` の member を常に `activated: true` とする。`activation.ts:62-64` の `if (!cond || (!cond.requestTypes && !cond.paths))` 分岐が `changedFiles` を見ずに先に firing する。

**新しい挙動**: filter 後 `sourceTouched = []` を渡す可能性が生まれる。

**判定**: `evaluateActivation` のロジックは一切変更されていない。`paths: undefined` で `changedFiles = []` を渡しても always-activate 分岐が先に fire する。**不変条件保持** ✓  
T-04 Req 4 テストが実測で固定済み。

---

### INV-2: `listChangedFiles` seam の不変性

**前提**: `scope.ts`（scope-check）/ `runtime-capability-gate.ts` が `listChangedFiles` から返される値が「source + pipeline 管理 path 込みの全変更ファイル」であると暗黙に前提している。

**新しい挙動**: `excludeChangeFolderPaths` を `parallel-review-round.ts` 内ローカル変数 `sourceTouched` に適用する。`listChangedFiles` 自体は変更しない。

**判定**: フィルタは `listChangedFiles` の返値（`touched`）に後処理を加えるだけで、seam 自体は未変更。`scope.ts` / `runtime-capability-gate.ts` は別コードパスで `listChangedFiles` を呼ぶため波及しない。**不変条件保持** ✓

---

### INV-3: `computeInvalidations` 1 要素配列デストラクチャの型安全性

**前提**: `computeInvalidations(statuses, ...)` は `statuses.map(...)` を返すため、入力と同じ長さの配列を返す。

**新しい挙動**: `computeInvalidations([s], ...)` として 1 要素で呼び、`const [invalidated] = ...` でデストラクチャする。

**判定**: ループ内のガード `if (s.status !== "approved" || !s.approvedAtCommit) continue` により、この分岐に入る時点で `s` は必ず approved かつ `approvedAtCommit` あり。`computeInvalidations` は `.map()` で入力 1 → 出力 1 を保証するため `invalidated` が `undefined` になる経路はない。`if (invalidated)` ガードは冗長だが無害。**不変条件保持** ✓

---

### INV-4: `headSha` capture 順序と `approvedAtCommit` の意味

**前提**: `approvedAtCommit` に保存される `headSha` は fan-out 後・`commitRoundArtifacts` 前に capture される（design D1、意味(a)）。

**新しい挙動**: step 2（invalidation）に `captureHeadSha` の呼び出しを 1 つ追加（`currentHeadSha` — `invalidatedByCommit` 用）。fan-out 後の `headSha`（`approvedAtCommit` 用、L193-195）の位置は不変。

**判定**: 実行順序確認:  
1. L108: `captureHeadSha` → `currentHeadSha`（invalidatedByCommit 用）  
2. L177-187: fan-out（members commit しない）  
3. L193-195: `captureHeadSha` → `headSha`（approvedAtCommit 用）← 依然 commitRoundArtifacts より前  
4. L276: `commitRoundArtifacts`（HEAD 進む）  
5. L297: `applyRoundResults(..., headSha)` — source revision を保存 ✓  

T-03 contract test が stateful fake でこの順序を機械的に固定。**不変条件保持** ✓

---

### INV-5: `inspectionEscalated` + invalidation 複合挙動

**前提**: inspection escalation 時（`inspectionEscalated = true`）は `applyRoundResults` がスキップされ、members が pending のまま残り、resume 時に再実行される（fail-closed 設計）。

**新しい挙動**: step 2 の invalidation で approved → pending に戻った member は、step 7c の `applyRoundResults` スキップの影響に加え、step 2 の結果がそのまま `statuses` に残る。

**判定**: step 2 で invalidated された member はすでに `status: "pending"` になっているため、step 7c スキップ後も pending のまま。inspection escalation + 事前 invalidation の組み合わせは想定通り: member は pending → resume で再 fan-out → 再 inspection という正しい流れ。**不変条件保持** ✓

---

### INV-6: managed runtime の fail-safe 不変性

**前提**: managed runtime では `listChangedFiles` が `[]` を返し、invalidation が不発になる（fail-safe、known Non-Goal）。

**新しい挙動**: `excludeChangeFolderPaths([])` = `[]` を `computeInvalidations` へ渡す。

**判定**: 空配列に filter を通しても空配列。挙動は既存と完全に同一。always-activate member は空でも invariant 通り fire する。**不変条件保持** ✓

---

### INV-7: `archive/` / `canceled/` パス除外範囲

**前提**: `changesDirRel()` = `"specrunner/changes"`（trailing slash なし）。archived 変更は `specrunner/changes/archive/<slug>/...`、canceled は `specrunner/changes/canceled/<slug>/...`。

**新しい挙動**: `f.startsWith("specrunner/changes/")` が archive/canceled パスもマッチする。

**判定**: archive/canceled は pipeline 管理成果物であり source ではない。`readSourceRevision` の `:(exclude)specrunner/changes/` と同一原則。誤除外ではなく意図した除外。**不変条件保持** ✓

---

### INV-8: `partitionRoundChanges` との責務境界

**前提**: `pipelineManagedPaths(slug)` は state.json / events.jsonl / usage.json の 3 ファイルのみを pipeline 管理として扱い、halt 検出・staged 除外に使う（findings files は対象外）。

**新しい挙動**: `excludeChangeFolderPaths` は `changesDirRel()` 配下全体を除外する（findings 含む）。

**判定**: 2 つの関数は目的が異なる（halt 検出用 vs. invalidation diff 用）。`pipelineManagedPaths` はラウンドコミット境界を守るための 3 ファイル限定で正しい。`excludeChangeFolderPaths` は invalidation の source-scoped 化のための全 change folder 除外で正しい。責務が明確に分離されており衝突しない。**不変条件保持** ✓

---

## Findings

なし — 検出された cross-boundary invariant 違反はない。

## Observations

### OBS-1: `if (invalidated)` guard は冗長

`const [invalidated] = computeInvalidations([s], ...)` の時点で、`invalidated` が `undefined` になる経路はない（1 要素配列の map）。`if (invalidated)` ガードは不要だが、型システムが `ReviewerStatus | undefined` と推論する array destructuring に対する防御的ガードとして許容範囲。動作上の問題なし。

### OBS-2: `currentHeadSha` と `headSha` の 2 回 capture

step 2（L108）と step 6（L193）で `captureHeadSha` を 2 回呼ぶ。`roundOwnsGitEffects` 下ではどちらも同じ値を返すが、概念的に「invalidation 時点の HEAD」と「approve 時点の HEAD」を区別している。コメントで明示されており意図通り。

---

## Verdict

- **verdict**: approved
