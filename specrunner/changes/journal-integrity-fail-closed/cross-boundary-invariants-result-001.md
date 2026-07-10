# Cross-Boundary-Invariants Review — journal-integrity-fail-closed

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: needs-fix

## 観点

diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものが正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグが対象。

---

## Findings

### F-01 — `loadStateByJobId` の catch-all が `JOURNAL_CORRUPTED` を黙って飲み込む [HIGH / BLOCKER]

**対象ファイル**: `src/core/job-access/load-by-job-id.ts`（diff 非変更）  
**関与する新挙動**: `load()` が `JOURNAL_CORRUPTED` を throw するようになった（diff 変更）

#### 前提の崩れ

`loadStateByJobId` の step 2a は「worktree 上の state.json が読めなかった場合（ファイルが存在しない、worktree が消えた）に canonical lookup へフォールスルーする」という前提で bare `catch {}` を置いている。

```ts
// src/core/job-access/load-by-job-id.ts:44-52
try {
    await fs.access(stateJsonPath);           // state.json 存在確認
    return new JobStateStore(jobId, repoRoot, {
        slug: sidecarEntry.slug,
        stateRoot: sidecarEntry.worktreePath,
    }).load();                                // ← 新挙動: JOURNAL_CORRUPTED を throw
} catch {
    // Not in worktree — fall through to canonical lookup  ← JOURNAL_CORRUPTED もここへ来る
}
```

`load()` は従来 ENOENT / state.json 破損しか throw しなかった。今回の変更で `JOURNAL_CORRUPTED` を throw するようになったが、この catch-all が拾い、canonical lookup (step 2b) へフォールスルーする。

#### 実際の症状

アクティブな worktree ジョブ（state.json は存在、events.jsonl が中間破損）の場合:

| コマンド | 期待 | 実際 |
|---|---|---|
| `specrunner resume <UUID>` | `JOURNAL_CORRUPTED` エラーと hint | `JOB_NOT_FOUND`（"Job not found"） |
| `specrunner cancel <UUID>` | `JOURNAL_CORRUPTED` エラーと hint | `JOB_NOT_FOUND` → "Job not found" |
| `specrunner job show <UUID>` | corruption banner 表示 | "Job not found" |

worktree と archive が両方存在する稀なケース（partial archive 後など）では、archive の（正常な）状態を load して返し、worktree の破損を完全に隠蔽する。

#### 設計コメントとの乖離

`loadSplitLayout` のコメントには明示的に:

> Used by load() and loadStateByJobId (resume/finish/cancel paths).

とあり、design D5 でも:

> `JobStateStore.load()` は `loadSplitLayout()`（fail-closed）を使う。→ resume / finish / cancel が使う `loadStateByJobId` も fail-closed になる（consume 経路。破損 truth では動かない）。

と述べているが、step 2a の catch-all により worktree 経路の fail-closed は実現していない。

#### 修正方針

`loadStateByJobId` step 2a の catch を narrowing する。`JOURNAL_CORRUPTED` は再 throw し、`JOB_NOT_FOUND` や ENOENT だけをフォールスルー条件とする。

```ts
} catch (err: unknown) {
    // JOURNAL_CORRUPTED は意図的なエラー — 再 throw してフォールスルーしない
    if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOURNAL_CORRUPTED) {
        throw err;
    }
    // その他（ENOENT / state.json 破損 / worktree 消滅）→ canonical lookup へ
}
```

---

### F-02 — `job show` の slug 経路: `persist()` が fail-closed でも呼び出し前のステート使用 [LOW / 観察]

**対象ファイル**: `src/core/command/resume.ts`（diff 非変更、slug 経路）

slug による resume 時、`resolveJobStateBySlug` は `JobStateStore.list()` → `composeSplitLayout`（tolerant）を使うため、破損 journal のジョブが best-effort state で返ってくる。その state を使って `resolveResumeStep`、`checkConsecutiveEscalations` 等の判定が行われた後、`persist()` の fold 経路が `JOURNAL_CORRUPTED` を throw する（line 218-221 で "Failed to update state" として処理）。

問題点:
- ユーザーに見えるエラーが "Failed to update state" であり、journal corruption が原因だと分からない
- `JOURNAL_CORRUPTED` の hint（git restore 手順）が表示されない

破損した state でステップ判定が行われる点はブロックにならない（persist で止まるため状態書き込みは発生しない）。ただし `JOURNAL_CORRUPTED` の詳細が隠れることで診断コストが上がる。

F-01 を修正すれば slug 経路でも `resolveJobStateBySlug` → list → tolerant は設計意図（D5: enumerate 経路は tolerant）のままであるが、その後の処理でエラー理由が隠れる。F-01 fix の補足として、resume の catch ブロックで `JOURNAL_CORRUPTED` を識別して hint を出力するか、`resolveJobStateBySlug` で corruption を事前検出するかを検討する価値がある。本 review サイクルでの必須修正ではなくフォローアップ候補。

---

### F-03 — `scanJournalIntegrity`: active・worktrees-root セクションで非 ENOENT re-throw [INFO / 問題なし]

**対象**: `src/store/journal-integrity.ts`（diff 変更）

`readdir` の非 ENOENT エラーは re-throw されるが、doctor check の outer `try/catch` で全エラーを `pass` に落とす。設計仕様（「scan I/O errors → pass (defensive)」）と一致。境界は維持されている。

---

## 確認した境界一覧

| 境界 | 確認内容 | 状態 |
|---|---|---|
| `fold()` → `list()` | tolerant の維持（composeSplitLayout を使用） | ✓ |
| `fold()` → `load()` / `persist()` | fail-closed の維持（loadSplitLayout を使用） | ✓（worktree 経路は F-01 で破損） |
| `load()` → `loadStateByJobId` step 2a | JOURNAL_CORRUPTED の伝播 | **✗ F-01** |
| `load()` → `loadStateByJobId` step 2b | JOURNAL_CORRUPTED の伝播 | ✓（catch なし） |
| `persist()` fast-path | 破損未検出（設計許容） | 許容（design D5 明示） |
| `persist()` fold-path | 破損・逆行の fail-closed | ✓ |
| `inspectJournalDir()` | never throw 契約 | ✓ |
| `scanJournalIntegrity()` → doctor | scan エラー = pass の安全側倒れ | ✓ |
| `cancel` catch | JOURNAL_CORRUPTED の re-throw | ✓（step 2b 経路なら） |
| `resume` catch | JOURNAL_CORRUPTED の変換（詳細隠蔽） | F-02 として観察 |

---

## 修正が必要なファイル

1. **`src/core/job-access/load-by-job-id.ts`** — step 2a の bare `catch {}` を narrowing して `JOURNAL_CORRUPTED` を再 throw する（F-01）

