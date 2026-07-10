# Cross-Boundary-Invariants Review — journal-integrity-fail-closed

- **reviewer**: cross-boundary-invariants
- **iteration**: 2
- **verdict**: approved

## 観点

diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものが正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグが対象。

---

## Iteration 1 からの変更確認

### F-01（前回 HIGH / BLOCKER）→ 修正確認 ✓

`src/core/job-access/load-by-job-id.ts` の step 2a catch が narrowing され、`JOURNAL_CORRUPTED` を再 throw する修正が反映済み:

```ts
} catch (err) {
  // Re-throw journal corruption — must not be silently swallowed or
  // masked by falling through to canonical lookup.
  if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOURNAL_CORRUPTED) {
    throw err;
  }
  // Not in worktree — fall through to canonical lookup
}
```

`resume <UUID>` / `cancel <UUID>` / `job show <UUID>` でアクティブ worktree の破損 journal が `JOB_NOT_FOUND` に化けず `JOURNAL_CORRUPTED` として正しく伝播する。✓

---

## Findings（iteration 2）

### F-02 — slug 経由 resume の "Failed to update state" 包装（LOW / 観察、前回踏襲）

**対象ファイル**: `src/core/command/resume.ts`（diff 非変更）

slug による resume 時、`resolveJobStateBySlug` → `list()` → `composeSplitLayout`（tolerant）で job を surface した後、`persist()` が `JOURNAL_CORRUPTED` を throw する。この throw は resume の catch ブロックで "Failed to update state" として包まれ、`JOURNAL_CORRUPTED` の hint（git restore 手順）がユーザーに届かない。

- 安全性: fail-closed は維持（persist が止まり、状態書き込みは発生しない）
- 影響: ユーザーが診断コストを払う（原因が分からずドクターを見に行く必要がある）
- 評価: ブロッカーではない。UUID 経由なら F-01 fix で正しく伝播するため、ワークアラウンドが存在する。フォローアップ候補。

---

### F-03 — slug path の job show でアクティブ worktree ジョブの corruption banner が出ない（INFO）

**対象**: `src/cli/job-show.ts`（diff 変更）、`src/core/job-access/resolve-change-dir.ts`（diff 非変更）

`printJobState()` 内の `inspectJournalDir` probe は `resolveChangeDir(slug, repoRoot)` が null を返すときにスキップされる（`if (changeDir) {` ガード）。`resolveChangeDir` はメイン checkout と archive のみを検索し、`specrunner-worktrees/` は検索しない（diff 変更なし）。

アクティブな worktree ジョブを **slug** で `job show` したとき、`inspectJournalDir` が呼ばれず corruption banner が表示されない。

```
specrunner job show <slug>   # worktree にあるアクティブジョブ
→ header は表示される
→ corruption banner: 出ない（changeDir が null）
```

- 安全性: 影響なし（表示が省略されるだけ、状態機械への誤影響なし）
- UUID 経由なら F-01 fix により `loadStateByJobId` が `JOURNAL_CORRUPTED` を throw → catch で banner 表示 ✓
- `resolveChangeDir` の worktrees 非検索は diff 変更前からの既存挙動
- 設計 D6 が「slug 入力は printJobState の probe がそのまま表示する」と述べているが、worktree アクティブジョブはこの前提を満たせない。設計メモの精度差であり、動作安全性には関係しない
- 評価: INFO。フォローアップとして `resolveChangeDir` に worktrees 検索を追加するか、`printJobState` に worktree changeDir の解決経路を追加する候補

---

## 全境界チェックサマリー

| 境界 | 確認内容 | 状態 |
|---|---|---|
| `fold()` → 全 caller | throw しない。`FoldResult.corruption` で報告 | ✓ |
| `composeSplitLayout()` → `list()` | tolerant を維持。bare catch {} で skip | ✓ |
| `loadSplitLayout()` → `load()` | corruption で fail-closed | ✓ |
| `load()` → `loadStateByJobId` step 2a | F-01 修正。`JOURNAL_CORRUPTED` 再 throw | ✓（F-01 fix） |
| `load()` → `loadStateByJobId` step 2b | catch なし、直接伝播 | ✓ |
| `persist()` fast-path | fold を省略、corruption/reversal 非検出（設計許容） | 設計 D5 明示 |
| `persist()` fold-path | corruption & reversal で fail-closed | ✓ |
| `max()` 吸収 廃止 | `Math.max` / `mergeStepCountsMax` を削除し fold 由来に統一 | ✓ |
| `inspectJournalDir()` | never throws 契約 | ✓ |
| `scanJournalIntegrity()` → doctor | scan エラー re-throw → doctor catch で pass | ✓ |
| exit-guard handlers | best-effort catch — `JOURNAL_CORRUPTED` 飲み込み | ✓ |
| `runner.ts` crash recovery | persist throw → store.load() throw → in-memory fail → no disk write（許容） | 許容 |
| `job show` UUID path | `JOURNAL_CORRUPTED` catch で banner 表示、exit 0 | ✓ |
| `job show` slug path（main checkout）| `inspectJournalDir` probe で banner | ✓ |
| `job show` slug path（worktree） | `resolveChangeDir` null → probe スキップ（F-03） | INFO |
| doctor `journal-integrity` check | `commonChecks` に登録、fail → exit 1 | ✓ |
| `resolveStateStoreByJobId` catch-all | store 構築のみ（load を呼ばない）— JOURNAL_CORRUPTED は throw されない | ✓ |

---

## 結論

Iteration 1 の唯一のブロッカー（F-01: `loadStateByJobId` step 2a の bare catch が `JOURNAL_CORRUPTED` を飲み込む）は修正済み。

残る F-02（LOW/観察）と F-03（INFO）はどちらもブロッカーではなく、フォローアップ候補。実装の安全性・正確性に関わる境界はすべて正しく維持されている。

- **verdict**: approved
