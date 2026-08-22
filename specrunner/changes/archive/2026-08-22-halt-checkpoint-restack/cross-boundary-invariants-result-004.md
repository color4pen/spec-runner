# cross-boundary-invariants Review — halt-checkpoint-restack

**Reviewer**: cross-boundary-invariants  
**Iteration**: 4  
**Date**: 2026-08-22  

## 観点

実装そのものは正しくテストも green のまま、**変更していないコードの暗黙の前提（不変条件）を新しい挙動が黙って破っていないか**を検出する。  

Iteration 3 では F-01〜F-04 の全件解消を確認し、I-1〜I-7 の不変条件も全件保持を確認した。  
Iteration 4 では前周以降に code-fixer が変更したファイルに絞って再検査する。

---

## 前周以降の変更ファイル（machine-derived）

prior-round-context に記載された変更ファイル:

| ファイル | 種別 | 注記 |
|---|---|---|
| `specrunner/changes/halt-checkpoint-restack/events.jsonl` | pipeline 状態ファイル | コードではない |
| `specrunner/changes/halt-checkpoint-restack/state.json` | pipeline 状態ファイル | コードではない |
| `specrunner/changes/halt-checkpoint-restack/usage.json` | pipeline 状態ファイル | コードではない |
| `tests/halt-checkpoint-restack-e2e.test.ts` | テストファイル | 検査対象 |

加えて operator 注記に「runner 側の workflow で local main ref を補う修正を適用済み」とあり、
`src/core/verification/changed-lines.ts`（origin fallback 実装）も参照対象として確認する。

---

## Iteration 3 で確認した前提の継続保持

Production code（`src/` 配下）に変更はなし。したがって iteration 3 で確認した以下の不変条件は
構造的に引き続き保持される。

| 不変条件 | 前周確認状態 | 今周状態 |
|---|---|---|
| I-1: egress backstop 不変条件 | ✅ 保持 | ✅ 変更なし、継続保持 |
| I-2: attach quiescence 不変条件 | ✅ 保持 | ✅ 変更なし、継続保持 |
| I-3: counter reversal 不変条件 | ✅ 保持 | ✅ 変更なし、継続保持 |
| I-4: attachResumePolicy 必須入力 | ✅ 保持 | ✅ 変更なし、継続保持 |
| I-5: 差分封じ込め不変条件 | ✅ 保持 | ✅ 変更なし、継続保持 |
| I-6: worktree 汚染不変条件 | ✅ 保持 | ✅ 変更なし、継続保持 |
| I-7: GIT_INDEX_FILE SpawnFn 互換性 | ✅ 保持 | ✅ 変更なし、継続保持 |

---

## 新規検査: E2E テスト TC-009 追加（all-reject path）

### 検査対象

`tests/halt-checkpoint-restack-e2e.test.ts` — TC-009「all-reject path: commitFinalState は throw しない」

code-fixer が追加した TC-009 テストが、既存の不変条件と矛盾するシナリオを想定していないかを確認する。

### `makeRejectAllPushesSpawnFn` の動作

```typescript
function makeRejectAllPushesSpawnFn(_repoDir: string): SpawnFn {
  return async (cmd, args, opts) => {
    if (cmd === "git" && args[0] === "push") {
      return { exitCode: 1, stdout: "", stderr: "remote: error: push rejected" };
    }
    return spawnCommand(cmd, args, opts);
  };
}
```

- `git push` 系（`args[0] === "push"`）: **すべて拒否**（commitFinalState 直接 push も restack push も）
- `git fetch`, `git rev-parse`, `git commit-tree`, `git update-ref` 等: 実 git に通す

### TC-009 シナリオの状態機械トレース

**Before `commitFinalState`**:
- Local HEAD = `workCommitOid`（`.github/workflows/ci.yml` を含む work commit）
- `origin/<branch>` = `publishedTipOid`（最後の正常 push 済み checkpoint）

**`commitFinalState` 実行中**:
1. `git add -- <managed-paths>` → staged
2. `git diff --cached --quiet` → exit 1（変更あり）
3. `git commit -m "checkpoint: <slug>"` → C1 を作成（Local HEAD = C1）
4. `persistBeforePush(C1)` → `persistedOids` に追記（実 state への write は callback 未注入のため skip）
5. `verifyEgressLedger`: `ledger = [workCommitOid, C1]`、`rev-list HEAD --not --remotes=origin = [C1, workCommitOid]` → 全件 ledger 内 → pass
6. `git push -u origin <branch>` × 2 → **両方 REJECTED**
7. `restackCheckpointOntoPublishedTip` 呼び出し:
   - `git fetch origin <branch>` → 実 git で成功（bare remote は `publishedTipOid`）
   - `git rev-parse refs/remotes/origin/<branch>^{commit}` → `publishedTipOid`
   - Local HEAD = C1 → `localTipOid = C1`
   - restack commit 構築 → `restackedOid`
   - `git push origin <restackedOid>:refs/heads/<branch>` × 2 → **両方 REJECTED**（`args[0] === "push"`）
   - Returns `{ kind: "push-failed" }`
   - `_doGraft` は**呼ばれない**（push 成功後にのみ呼ばれる）

**After `commitFinalState`**:
- Local HEAD = C1（checkpoint commit。workCommitOid の直上）
- `origin/<branch>` = `publishedTipOid`（変化なし）

**テストアサーション検証**:

```typescript
// originTip === publishedTipOid（push 成功なし）
const originTip = gitSync(["rev-parse", `refs/remotes/origin/${BRANCH}`], repoDir);
expect(originTip).toBe(publishedTipOid);  // ✓

// localTip = C1 ≠ publishedTipOid（checkpoint commit がローカルに存在する）
const localTip = gitSync(["rev-parse", "HEAD"], repoDir);
expect(localTip).not.toBe(publishedTipOid);  // ✓（C1 は workCommitOid の上にある）
```

**不変条件との整合**:
- **commit は成功しているが push は全拒否** → local state は保持（local resume は可能）
- `_doGraft` が呼ばれないため graft commit は発生せず → egress backstop への追加 OID は C1 のみ
- `synthesizedCommits` は `persistedOids = [C1]`（`workCommitOid` は外部注入で既登録）
- TC-009 は「commit は成功 → throw しない」の最低限アサーションのみ。追加アサーション（restack OID なし等）は不要でありかつ不変条件違反もない

**結論**: TC-009 all-reject path のテストシナリオは既存の不変条件（I-1〜I-7）と矛盾しない。✅

---

## 新規検査 I-8: `changed-lines.ts` origin fallback の fail-closed 不変条件保持

### 検査対象

`src/core/verification/changed-lines.ts` — `getChangedFilesAndLines` / `getChangedFileList` に
`origin/<baseBranch>` fallback が追加された（worktree 環境で local `main` ref が不在の場合の対応）。

operator 注記: 「runner 側の workflow で local main ref を補う修正を適用済み」であり、
code 変更は `changed-lines.ts` の origin fallback のみ（コード内で既に実装済み）。

### `getChangedFilesAndLines` の fail-closed 不変条件

```typescript
try {
  fileListOutput = await spawnGit(["diff", "--name-only", "--diff-filter=d", `${baseBranch}...HEAD`], cwd, spawn);
} catch (primaryErr) {
  const originBase = `origin/${baseBranch}`;
  try {
    fileListOutput = await spawnGit(["diff", "--name-only", "--diff-filter=d", `${originBase}...HEAD`], cwd, spawn);
    effectiveBase = originBase;
  } catch {
    // Both primary and origin fallback failed — fail closed with original error.
    throw new Error(
      `changed-line derivation failed: git diff --name-only ${baseBranch}...HEAD: ${(primaryErr as Error).message}`,
    );
  }
}
```

**不変条件 A: 両方失敗時に fail-closed（skip ではなく throw）**  
- primary 失敗 + origin fallback 失敗 → `throw primaryErr` ✓
- 呼び出し側（`runLockfileSyncGate` 等）は throw を catch して gate をスキップする（元の仕様通り）

**不変条件 B: per-file diff の `effectiveBase` 一貫性**  
- `effectiveBase = originBase` がセットされた場合、per-file diff も `origin/<baseBranch>...HEAD` を使う
- TC-OFB-05 がこれを検証済み

**不変条件 C: primary 成功時は fallback 試行なし**  
- primary が成功した場合 `catch` に入らないため origin fallback は呼ばれない
- TC-OFB-06 がこれを検証済み

**`getChangedFileList` の特性**:  
`getChangedFileList` はファイルリストのみを返す（per-file diff なし）ため、`effectiveBase` の追跡は不要。  
同様に primary → origin fallback → throw（両方失敗）の構造。TC-OFB-03/04 がカバー。

**他の gate との境界不変条件**:  
`getChangedFileList` を呼ぶ lockfile-sync gate は throw を catch して「skip」に分類する。  
origin fallback が成功した場合は gate が実行されるが、`origin/main...HEAD` は `main...HEAD` と
同等の変更セットを表す（pipeline runner では main は origin/main と同期）ため、gate の判定精度は不変。

**結論**: `changed-lines.ts` origin fallback は fail-closed 不変条件を保持し、coverage gate の精度も維持する。✅

---

## TC-001 / TC-005 のハッピーパス再確認

TC-001 ハッピーパスで使われる `makeRejectDirectPushSpawnFn`:

```typescript
if (cmd === "git" && args[0] === "push" && args.includes("-u")) {
  return { exitCode: 1, ... };  // commitFinalState の直接 push のみ拒否
}
return spawnCommand(cmd, args, opts);  // restack push は実 git に通す
```

- `git push -u origin <branch>` → `-u` フラグ含む → REJECTED ✓
- `git push origin <oid>:refs/heads/<branch>` → `-u` なし → 実 git に通す → ACCEPTED ✓
- `git fetch origin <branch>` → `args[0] === "fetch"` → 実 git に通す ✓
- `git update-ref refs/remotes/origin/<branch>` → `args[0] === "update-ref"` → 実 git に通す ✓

**結論**: TC-001 ハッピーパスの SpawnFn 実装は restack 後の graft を含む全シーケンスと整合し、
不変条件違反を導かない。✅

---

## 判定まとめ

| Finding | 前周状態 | 本周状態 |
|---|---|---|
| I-1 egress backstop | ✅ 前周保持確認 | ✅ コード変更なし、継続保持 |
| I-2 attach quiescence | ✅ 前周保持確認 | ✅ コード変更なし、継続保持 |
| I-3 counter reversal | ✅ 前周保持確認 | ✅ コード変更なし、継続保持 |
| I-4 attachResumePolicy 必須入力 | ✅ 前周保持確認 | ✅ コード変更なし、継続保持 |
| I-5 差分封じ込め | ✅ 前周保持確認 | ✅ コード変更なし、継続保持 |
| I-6 worktree 汚染防止 | ✅ 前周保持確認 | ✅ コード変更なし、継続保持 |
| I-7 GIT_INDEX_FILE 互換性 | ✅ 前周保持確認 | ✅ コード変更なし、継続保持 |
| I-8 changed-lines fail-closed | 未検査 | ✅ 新規確認済み |
| TC-009 all-reject path | 未検査 | ✅ 不変条件違反なし |

**本周では新規不変条件違反は検出されなかった。前周 findings は全件解消済み。**
