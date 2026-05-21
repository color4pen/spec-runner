# Proposal: finish Phase 4 の markJobArchived を Phase 3 直後に移動する

## 問題の本質

`finish` の Phase 3 で PR マージ成功後、Phase 4 の cleanup（worktree 削除、branch 削除、git checkout/pull）中に例外が発生すると、`markJobArchived` に到達せず job state が `awaiting-merge` のまま残る。2026-05-08〜09 に 4 件発生（#178）。

PR マージは不可逆な外部操作であり、成功した時点で内部状態を確定させるのが正しい順序。cleanup は best-effort で後回しにする。

## 根本原因

`orchestrator.ts` の `runPhase4Finalize` 内で `markJobArchived` が関数末尾（L315）に配置されている。worktree 削除（L258）、`updateJobState(... worktreePath: null)`（L265、try-catch 未保護）、branch 削除（L305-312）、git checkout/pull（L269-301）のいずれかが例外を投げると `markJobArchived` に到達しない。

特に L265 の `updateJobState` は try-catch で保護されておらず、store の I/O エラーで unhandled rejection になる。

## 提案する修正

### 1. markJobArchived を Phase 3 成功直後に移動

orchestrator.ts の main flow（`runFinishOrchestrator`）で、Phase 3 merge 成功直後（L135 付近）に `markJobArchived` を呼ぶ。`runPhase4Finalize` からは `markJobArchived` 呼び出しを削除する。

PR already MERGED パスでも同様に、Phase 1-3 skip メッセージ直後に `markJobArchived` を呼ぶ。

### 2. assertJobFinishable を canTransition ベースに置換

`job-state-update.ts` の `assertJobFinishable` を `canTransition(state.status, "archived")` ベースに書き換える。遷移不可時のエラーメッセージは status 別 lookup table で現行の情報量を維持する。

### 3. markJobArchived を transitionJob ベースに書き換え

`markJobArchived` 内部で `transitionJob(state, "archived", { trigger: "finish", reason: "PR merged" })` を使用する。

### 4. Phase 4 の updateJobState を try-catch で保護

L265 の `await updateJobState(target.jobId, (s) => ({ ...s, worktreePath: null }))` を try-catch で囲む。

## 設計判断

- archived 状態で worktree が残る可能性がある（cleanup が後回しのため）。doctor / gc で検出・清掃する想定
- `markJobArchived` は `transitionJob` の薄い wrapper として残すか、直接呼び出しに置換するかは implementer 判断
- TC-124（markJobArchived called AFTER git pull）は仕様変更により逆転する。テスト修正が必要
