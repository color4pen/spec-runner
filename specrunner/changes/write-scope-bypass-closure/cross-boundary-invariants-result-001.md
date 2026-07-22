# Cross-Boundary Invariants Review — write-scope-bypass-closure — iter 1

## Reviewer Purpose

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。  
実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 調査した不変条件と確認根拠

### 確認した既存不変条件

| 不変条件 | 根拠 | 判定 |
|---|---|---|
| halt は `deriveStepCompletion`（verdict 採用）より前に発生する | executor.ts:453-459 が `{ kind: "halt" }` で early return → `deriveStepCompletion`（line 483）には到達しない | ✅ |
| scoped pathspec commit は index 全体を commit しない | `commitAndPushTail` line 250–255: `git commit -m msg -- <stagePaths>` (pathspec 付き) | ✅ |
| guarded mode は commit 前に worktree 検査 → 違反は restore + halt | `commitAndPush` line 456–487: status → `findWriteScopeViolations` → halt の順 | ✅ |
| `commitFinalState` の `git add -A` は違反内容を commit しない（guarded / scoped 残余） | 違反 path は throw 前に `git checkout HEAD` で復元済み。guarded は staging 自体を行わずに throw するため staged 変更は管理 path のみ | ✅ |
| agent 自己 commit の違反は remote に到達しない | 違反時は `pushOnly` を呼ばずに throw → `commitFinalState` 実行時にworktree は clean（agent が全 index を commit 済み）→ staged 変更なし → push されない | ✅ (通常の `git commit -m` を使うケース) |
| `gitExec` の stdout は trim 済み | `git-exec.ts:47` `return stdout.trim()` — `headBeforeStep` と `headAfterStep` の比較で trailing newline によるミスマッチは起きない | ✅ |
| `findScopedCommitViolations` は leaf module 制約（`src/util/paths.ts` のみ import）を維持 | `write-scope.ts` の import 文は `../../util/paths.js` のみ。architecture test TC-010/TC-028 が静的検証 | ✅ |
| `listCommitRangeChangedPaths` は git error 時に null を返し呼び出し側が fail-closed | `git-exec.ts` の `gitExec` は error 時 null、`listCommitRangeChangedPaths` はそのまま null を返す。呼び出し側 `if (changedPaths === null) { throw commitEffectFailedError(...) }` | ✅ |

---

## Findings

### FINDING-001: Scoped 残余 halt 後に declared outputs が `commitFinalState` で remote に commit される

**種別**: 期待挙動との乖離（cross-boundary interaction）  
**重要度**: LOW

**不変条件**: spec.md §"scoped mode の保護正典残余違反は halt する" — 「改変された正典を読んだ可能性のある step の結果を採用してはならない」

**観察した挙動（コード追跡）**:

1. `commitAndPush` (scoped mode): `git add -A -- <stagePaths>` を実行 → declared outputs（例: `spec-review-result-001.md`）が index に staged される  
2. `postStatus` 検査で保護正典残余違反を検出 → quarantine + `git checkout HEAD -- <violations>` で protected path を復元 → `throw writeScopeViolationError(...)` (T-06)
3. `commitHalt` → `store.fail()` → state: "failed"
4. pipeline: "failed" + 非 FATAL code → escalate → `transitionJob("awaiting-resume")` → publisher seam
5. `commitFinalState` が呼ばれる: `git add -A` → **step 1 で staged された declared outputs が依然 staged** → `git diff --cached --quiet` が exit 1 → commit + push

**結果**: `spec-review-result-001.md`（汚染された正典を読んで生成された可能性のある result ファイル）が remote branch に push される。

**誤りではない点**:
- `deriveStepCompletion` は呼ばれない → pipeline 上の verdict 採用は抑止される（spec の core 要求）
- 汚染された正典 path（`request.md` 等）自体は `git checkout HEAD` で復元済みで push されない

**ギャップ**:  
`commitFinalState` の docstring（lines 517–521）は「scoped residual violations are similarly restored before throwing (T-06). Therefore, git add -A here does not pick up violation content」と記述しているが、これは **violated path（保護正典）** が復元されるという事実についての正しい記述であって、**staged された declared outputs**（step の出力ファイル）は復元されない。commit FinalState はこれらを commit する。

**実害の範囲**:  
resume 時にパイプラインは当該 step を再実行し新しい result ファイルを書く。汚染された result ファイルは pipeline の verdict 導出に使われない。操作者が branch を直接参照すると汚染ファイルが見えるが、pipeline 正確性は維持される。

**修正方向（参考）**:  
throw 前に `git reset HEAD -- <stagePaths>` を追加して staged 状態を解除するか、`commitFinalState` が WRITE_SCOPE_VIOLATION 後は管理 path のみを commit するよう分岐する。ただし T-06 の scope 外であり本変更の受け入れ基準には含まれない。

---

### FINDING-002: `headBeforeStep = null` 時に自己 commit 検査が全バイパスされる

**種別**: 既存の fail-open 経路の範囲確認  
**重要度**: LOW

**観察した挙動**:

executor.ts line 330:
```typescript
const headBeforeStep: string | null = deps.runtimeStrategy
  ? await gitExec(this.spawnFn, cwd, ["rev-parse", "HEAD"])
  : null;
```

`gitExec` は git error（spawn 失敗 / exit ≠ 0）時に `null` を返す。`commitAndPushTail` line 198:
```typescript
if (headBeforeStep && headAfterStep && headAfterStep !== headBeforeStep) {
```

`headBeforeStep` が null の場合、自己 commit 検査全体がスキップされる。

**影響範囲**:  
- step 開始前に `git rev-parse HEAD` が失敗した状況（git が broken 状態）でのみ発生
- 本変更以前は自己 commit 検査が存在しなかった（fail-open）ため、これは退行ではなく既存の fail-open に条件付き保護を追加した形
- git が broken な状態でエージェントが commit できる可能性は低い

**判定**: 既存挙動に対する改善の一形態であり、regression ではない。ただし「git rev-parse が失敗した場合の代替保護はない」という制約は明示が望ましい。

---

### FINDING-003: 複合攻撃（route 1 + route 2）における pre-staged 許可外ファイルの漏洩

**種別**: 組み合わせ境界の分析  
**重要度**: LOW（非典型的 agent 行動が前提）

**前提条件（非典型）**:  
エージェントが `git commit -- <specific-pathspec>` を使って自己 commit し、意図的に pre-staged 許可外ファイルをその commit から除外する。

**観察した挙動**（scoped mode の場合）:

1. pre-staged 許可外ファイル `src/secret.ts` が事前に index に stage されている  
2. エージェントが `git commit -- <declared_paths_only>` を実行（pathspec-restricted self-commit）→ `src/secret.ts` は agent の commit に含まれない  
3. `commitAndPushTail` の scoped staged-check: `git diff --cached --quiet -- <stagePaths>` → exit 0（`src/secret.ts` は `stagePaths` 外）→ `hasChanges = false`  
4. HEAD 前進検出 → `listCommitRangeChangedPaths` → エージェント自己 commit の別の違反を検出 → halt  
5. halt 後、`src/secret.ts` はまだ index に staged のまま  
6. `commitFinalState` の `git add -A` → staged 変更あり → commit + push で `src/secret.ts` が remote に到達する

**反論（severity を LOW とした根拠）**:  
標準的な agent 行動（`git commit -m "message"`、pathspec なし）では、`src/secret.ts` が agent の commit に含まれる。すると `listCommitRangeChangedPaths` で検出され、scoped 自己 commit 違反として halt する。`commitFinalState` 実行時には worktree + index が clean（agent が全 index を commit 済み）→ push されない。pathspec-restricted な自己 commit を使って pre-staged ファイルを commit に混入させないというのは非典型的かつ意図的な操作が必要。

---

### INFORMATIONAL: `commitScopedPaths`（coordinator 並列 round path）は未ハードニング

**種別**: スコープ外確認  
**重要度**: 対象外

`commitScopedPaths`（lines 601–635）は今回の変更対象外（request.md：「並列 round 経路の変更（coordinator scoped staging は対象外）」）。  
- `git diff --cached --quiet`（whole-index、pathspec なし）で staged 判定
- `git commit -m <msg>`（pathspec なし）
- `headBeforeStep` なし → 自己 commit 検査なし

これらは既存の欠陥（route 1 / route 2 と同型）だが request の scope 外として明示されている。同一欠陥が確認された場合のみ同修正というポリシーは妥当。

---

## 対象外確認済み不変条件

- **halt 後の checkpoint が違反を commit しない（guarded / agent 自己 commit）**: 両経路で worktree / index は clean → `commitFinalState` push なし。✅
- **scoped pathspec commit が pre-staged 許可外ファイルを除外する**: `git commit -- <stagePaths>` により pathspec 外の index エントリは commit に記録されない。✅
- **`findScopedCommitViolations` の集合演算正確性**: `changedPaths − declaredWritePaths − managedPaths`。`managedPaths` に全 pipeline 管理 path（`allManagedPaths`、存在有無不問）を使うことで step 実行中に作成された管理 path（例: usage.json）も許容される。✅
- **`git diff --name-only --no-renames` による rename の両端列挙**: `--no-renames` により rename は削除+追加として展開され、両 path が違反検査に含まれる。✅
- **`gitExec` は stdout.trim() 済み**: `headBeforeStep` と `headAfterStep` の SHA 比較に trailing newline は影響しない。✅

---

## 総評

3 突破経路の閉塞（D2/D3/D4）は全て core の不変条件（halt が verdict 採用より前に発生する、pathspec commit が index 全体を巻き込まない、fail-closed が保護正典を守る）を維持した上で正しく実装されている。FINDING-001 は spec の "採用してはならない" という要求（verdict adoption）は満たしているが、declared outputs が `commitFinalState` 経由で remote に commit される副作用は docstring の安全性主張が不完全であることを示す。実害は限定的（resume 時に再実行される）だが、明示的な制約として記録する価値がある。FINDING-002・FINDING-003 はいずれも既存挙動に対する改善であり、退行はない。

