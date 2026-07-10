# Cross-Boundary-Invariants Review — journal-integrity-fail-closed

- **reviewer**: cross-boundary-invariants
- **iteration**: 5
- **verdict**: approved

## 観点

diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものが正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグが対象。

---

## 経緯

Iteration 4 は result-004.md に approved を書き出した時点でシグナルにより中断。CLI は保守的に escalation として記録したため iteration 5 を実施。コードベースは iteration 4 と同一であることを確認した上で再審査。

---

## 境界チェック

### 1. `fold()` never-throws 契約

`fold()` は committed 行で JSON.parse に失敗しても `corruption` フィールドにセットして `continue` する。関数全体で try/catch の上振れはなく、あらゆる文字列入力で throw しない（コメントに "fold() never throws for any input string" と明記）。既存 caller がすべて throw しないことに依存している不変条件は維持されている。✓

### 2. `list()` の tolerant 維持（5 箇所）

`list()` 内の全 5 call site（main-checkout active / archive / worktrees / sidecar supplement / managed markers）はすべて `composeSplitLayout()` を使い、戻り値の `{ state, corruption }` から `state` のみ取り出す。corruption フィールドは無視され、ジョブが `ps` / slug 解決から落ちない。既存 `list()` の観測性保存挙動は維持されている。✓

### 3. `load()` / `loadStateByJobId` の fail-closed

`loadSplitLayout()` は `composeSplitLayout()` の薄いラッパで、`corruption !== null` のとき `journalCorruptedError` を throw する。`JobStateStore.load()` はこの `loadSplitLayout()` だけを呼ぶ。resume / finish / cancel の consume 経路はすべて `loadStateByJobId` → `load()` を経由するため fail-closed が効く。✓

### 4. `load-by-job-id.ts` step 2a の catch narrowing（F-01 fix）

```ts
} catch (err) {
  if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOURNAL_CORRUPTED) {
    throw err;
  }
  // Not in worktree — fall through to canonical lookup
}
```

bare `catch {}` が narrowing されており、`JOURNAL_CORRUPTED` は再 throw される。worktree アクティブジョブの破損 journal が `JOB_NOT_FOUND` に化けない。✓

### 5. `persist()` の fail-closed（corruption + counter reversal）

fold-path において：
- `foldResult.corruption` が truthy なら `journalCorruptedError` を throw（中間破損）
- `detectCounterReversal(existingCounters, foldResult)` が非 null なら同 error を throw（切り詰め）

check 通過後に `recoveredCounters = { historyCount: foldResult.historyCount, stepCounts: { ...existingCounters.stepCounts, ...foldResult.stepCounts } }` で構築しており、以前の `Math.max` / `mergeStepCountsMax` 吸収は廃止されている。✓

### 6. `persist()` fast path の counter reversal 非検出（設計 D5 許容）

fast path（`existingCounters >= inMemoryState` のとき fold を省く経路）は counter reversal を検出しない。設計 D5 が明示的に許容している（「新規 event が無いときの cursor 書き換えのみで、破損を導入しないため」）。doctor がその gap を補完する。設計との整合は確認済み。✓

### 7. `inspectJournalDir()` never-throws 契約

events.jsonl の読み込み失敗（ENOENT / その他 I/O エラー）はいずれも `null` を返す。state.json の読み込み / JSON.parse 失敗は `} catch { /* skip reversal check */ }` で吸収する。job show と doctor の観測経路が共用する関数として throw しない契約を維持している。✓

### 8. `scanJournalIntegrity()` と doctor の境界

`scanJournalIntegrity()` は changesDir の ENOENT を silent、それ以外の I/O エラーを throw する設計。doctor check は `doScan` 全体を try/catch で包み、catch 時に `{ status: "pass" }` を返す。設計 D7「scan 中の I/O エラーは pass」を正しく実装している。✓

### 9. `job show` UUID path

`runJobShow()` の UUID branch: `loadStateByJobId` が `JOURNAL_CORRUPTED` を throw した場合、catch ブロックが `err.code === ERROR_CODES.JOURNAL_CORRUPTED` で絞り込み、banner を表示して `return 0`（exit 0）する。crash せず corruption を明示し、観測が成功する。✓

### 10. `job show` slug path

slug branch: `JobStateStore.list()` が tolerant（composeSplitLayout）で state を取得し、`printJobState()` 内で `inspectJournalDir(changeDir)` を呼ぶ。main checkout の active / archive job ならば `resolveChangeDir` が null でないため probe が実行される。worktree アクティブジョブは `resolveChangeDir` が null を返すため probe がスキップされる（F-03 INFO、既存挙動）。✓

---

## Findings

### F-02 — slug 経由 resume の "Failed to update state" 包装（LOW / 観察）

**対象**: `src/core/command/resume.ts`（diff 非変更）

slug による resume では `persist()` が `JOURNAL_CORRUPTED` を throw しても、resume の catch ブロックが "Failed to update state" として包む。`JOURNAL_CORRUPTED` の hint（git restore 手順）がユーザーに届かない。fail-closed 自体は維持されており、UUID 経由のワークアラウンドが存在する。ブロッカーではない。フォローアップ候補。

---

### F-03 — slug 経由 job show でアクティブ worktree ジョブの corruption banner が出ない（INFO）

**対象**: `src/cli/job-show.ts`（diff 変更）、`src/core/job-access/resolve-change-dir.ts`（diff 非変更）

`resolveChangeDir` はメイン checkout の active / archive のみを検索し、`.git/specrunner-worktrees/` 内を検索しない（diff 変更前からの既存挙動）。UUID 経由なら F-01 fix により `JOURNAL_CORRUPTED` が正しく伝播する。表示が省略されるだけで状態機械への誤影響はない。INFO。フォローアップ候補。

---

## 全境界チェックサマリー

| 境界 | 確認内容 | 状態 |
|---|---|---|
| `fold()` → 全 caller | throw しない。`FoldResult.corruption` で報告 | ✓ |
| `composeSplitLayout()` → `list()` | tolerant を維持。5 箇所すべて corruption を無視 | ✓ |
| `loadSplitLayout()` → `load()` | corruption で fail-closed | ✓ |
| `load()` → `loadStateByJobId` step 2a | JOURNAL_CORRUPTED を再 throw（F-01 fix） | ✓ |
| `load()` → `loadStateByJobId` step 2b | catch なし、直接伝播 | ✓ |
| `persist()` fast-path | fold を省略、reversal 非検出（設計 D5 許容） | ✓ |
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

コードベースは iteration 4 と同一。Iteration 1 で指摘した唯一のブロッカー（F-01: bare `catch {}` による JOURNAL_CORRUPTED 隠蔽）は修正済み。残る F-02（LOW/観察）と F-03（INFO）はいずれもブロッカーではなく、フォローアップ候補。実装の安全性・正確性に関わるすべての境界が正しく維持されている。

- **verdict**: approved
