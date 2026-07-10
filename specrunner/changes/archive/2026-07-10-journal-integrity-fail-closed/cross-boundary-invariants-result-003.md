# Cross-Boundary-Invariants Review — journal-integrity-fail-closed

- **reviewer**: cross-boundary-invariants
- **iteration**: 3
- **verdict**: approved

## 観点

diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものが正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグが対象。

---

## 経緯

Iteration 2 は result-002.md に approved を書き出した時点で signal により中断。CLI は保守的に escalation として記録したため iteration 3 を実施。コードベースは iteration 2 と同一であることを確認した上で再審査。

---

## F-01（HIGH / BLOCKER、iteration 1 指摘）→ 修正確認 ✓

`src/core/job-access/load-by-job-id.ts` step 2a の bare `catch {}` を narrowing した修正が反映済み:

```ts
} catch (err) {
  if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOURNAL_CORRUPTED) {
    throw err;
  }
  // Not in worktree — fall through to canonical lookup
}
```

`resume <UUID>` / `cancel <UUID>` / `job show <UUID>` でアクティブ worktree ジョブの破損 journal が `JOB_NOT_FOUND` に化けず `JOURNAL_CORRUPTED` として正しく伝播する。✓

---

## Findings（iteration 3）

### F-02 — slug 経由 resume の "Failed to update state" 包装（LOW / 観察）

**対象**: `src/core/command/resume.ts`（diff 非変更）

slug による resume では `resolveJobStateBySlug` → `list()` → `composeSplitLayout`（tolerant）で job を surface した後、`persist()` が `JOURNAL_CORRUPTED` を throw する。この throw は resume の catch ブロックで "Failed to update state" として包まれ、`JOURNAL_CORRUPTED` の hint（git restore 手順）がユーザーに届かない。

- 安全性: fail-closed は維持（persist が止まり、状態書き込みは発生しない）
- UUID 経由ならば F-01 fix で正しく伝播するため、ワークアラウンドが存在する
- 評価: ブロッカーではない。フォローアップ候補

---

### F-03 — slug 経由 job show でアクティブ worktree ジョブの corruption banner が出ない（INFO）

**対象**: `src/cli/job-show.ts`（diff 変更）、`src/core/job-access/resolve-change-dir.ts`（diff 非変更）

`printJobState()` 内の `inspectJournalDir` probe は `resolveChangeDir(slug, repoRoot)` が null を返すときにスキップされる（`if (changeDir) {` ガード）。`resolveChangeDir` はメイン checkout の active と archive のみを検索し、`specrunner-worktrees/` は検索しない（diff 変更なし）。

アクティブ worktree ジョブを slug で `job show` したとき、`inspectJournalDir` が呼ばれず corruption banner が表示されない。UUID 経由なら F-01 fix により `loadStateByJobId` が `JOURNAL_CORRUPTED` を throw → catch で banner 表示。`resolveChangeDir` の worktrees 非検索は diff 変更前からの既存挙動。

- 安全性: 影響なし（表示が省略されるだけ、状態機械への誤影響なし）
- 評価: INFO。フォローアップ候補

---

## 全境界チェックサマリー

| 境界 | 確認内容 | 状態 |
|---|---|---|
| `fold()` → 全 caller | throw しない。`FoldResult.corruption` で報告 | ✓ |
| `composeSplitLayout()` → `list()` | tolerant を維持。bare catch {} で skip | ✓ |
| `loadSplitLayout()` → `load()` | corruption で fail-closed | ✓ |
| `load()` → `loadStateByJobId` step 2a | JOURNAL_CORRUPTED を再 throw（F-01 fix） | ✓ |
| `load()` → `loadStateByJobId` step 2b | catch なし、直接伝播 | ✓ |
| `persist()` fast-path | fold を省略、corruption/reversal 非検出（設計 D5 許容） | ✓ |
| `persist()` fold-path | corruption & reversal の両方で fail-closed | ✓ |
| `max()` 吸収 廃止 | `Math.max` / `mergeStepCountsMax` を削除し fold 由来に統一 | ✓ |
| `inspectJournalDir()` | never throws 契約（全 I/O エラーを null に落とす） | ✓ |
| `scanJournalIntegrity()` → doctor | scan エラー re-throw → doctor outer catch で pass | ✓ |
| `job show` UUID path | `JOURNAL_CORRUPTED` catch で banner 表示、exit 0 | ✓ |
| `job show` slug path（main checkout）| `resolveChangeDir` → `inspectJournalDir` probe | ✓ |
| `job show` slug path（worktree active）| `resolveChangeDir` null → probe スキップ（F-03 INFO） | INFO |
| doctor `journal-integrity` check | `commonChecks` に登録、fail → exit 1 | ✓ |
| `journalCorruptedError` factory | `ERROR_CODES.JOURNAL_CORRUPTED`、hint に git restore 手順 | ✓ |
| slug 経由 resume catch | "Failed to update state" で包まれる（F-02 LOW） | LOW |

---

## 結論

Iteration 1 の唯一のブロッカー（F-01）は修正済み。残る F-02（LOW/観察）と F-03（INFO）はいずれもブロッカーではなく、フォローアップ候補。実装の安全性・正確性に関わる境界はすべて正しく維持されている。

- **verdict**: approved
