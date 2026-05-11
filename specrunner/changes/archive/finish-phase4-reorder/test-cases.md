# Test Cases: finish Phase 4 の markJobArchived を Phase 3 直後に移動する

## Overview

| # | ID | Category | Priority | Source | must/should/could |
|---|-----|----------|----------|--------|-------------------|
| 1 | TC-FIN-REORDER-001 | correctness | high | T3 / 受け入れ基準1 | must |
| 2 | TC-FIN-REORDER-002 | correctness | high | T3 / 受け入れ基準1 | must |
| 3 | TC-FIN-REORDER-003 | correctness | high | T3 / 受け入れ基準2 | must |
| 4 | TC-FIN-REORDER-004 | correctness | high | T3 / 受け入れ基準2 | must |
| 5 | TC-FIN-REORDER-005 | correctness | high | T3 / 受け入れ基準2 | must |
| 6 | TC-FIN-REORDER-006 | correctness | high | T1 / 受け入れ基準3 | must |
| 7 | TC-FIN-REORDER-007 | correctness | medium | T1 / 受け入れ基準3 | must |
| 8 | TC-FIN-REORDER-008 | correctness | medium | T1 / 受け入れ基準3 | must |
| 9 | TC-FIN-REORDER-009 | correctness | high | T3e / 受け入れ基準4 | must |
| 10 | TC-FIN-REORDER-010 | correctness | high | TC-126 / 受け入れ基準5 | must |
| 11 | TC-FIN-REORDER-011 | correctness | medium | T2 | should |
| 12 | TC-FIN-REORDER-012 | correctness | medium | T2 | should |
| 13 | TC-FIN-REORDER-013 | correctness | low | T3d | could |

---

## TC-FIN-REORDER-001: markJobArchived は Phase 3 成功直後に実行される（git pull より前）

- **Category**: correctness
- **Priority**: high
- **Source**: T3, T4 (TC-124 修正), 受け入れ基準1
- **must/should/could**: must

### Scenario

```
GIVEN: job が awaiting-merge 状態で存在し、PRがオープン状態である
  AND: Phase 4 の git pull が呼ばれた時点での job state を記録する spy が仕掛けられている

WHEN: runFinishOrchestrator を実行する

THEN: result.exitCode === 0
  AND: git pull が呼ばれた時点での job.status === "archived"
  AND: markJobArchived は git pull より前に完了している
```

---

## TC-FIN-REORDER-002: prAlreadyMerged パスでも markJobArchived は Phase 4 の前に実行される

- **Category**: correctness
- **Priority**: high
- **Source**: T3b, 受け入れ基準1
- **must/should/could**: must

### Scenario

```
GIVEN: job が awaiting-merge 状態で存在し、PR が既にマージ済み（prAlreadyMerged === true）である

WHEN: runFinishOrchestrator を実行する

THEN: result.exitCode === 0
  AND: Phase 1-3 skip メッセージが出力されている
  AND: Phase 4 の cleanup（worktree remove、branch 削除）の前に job.status === "archived" になっている
```

---

## TC-FIN-REORDER-003: Phase 4 の worktree remove が失敗しても job state は archived になる

- **Category**: correctness
- **Priority**: high
- **Source**: T4c (TC-FIN-P4-FAIL-001), 受け入れ基準2
- **must/should/could**: must

### Scenario

```
GIVEN: job が awaiting-merge 状態で存在し、worktreePath が設定されている
  AND: worktreeManager.remove が例外を throw するようにモックされている

WHEN: runFinishOrchestrator を実行する

THEN: result.exitCode === 0
  AND: 終了時の job.status === "archived"
  AND: stderr に worktree remove 失敗の警告が出力されている
```

---

## TC-FIN-REORDER-004: Phase 4 の git checkout が失敗しても job state は archived になる

- **Category**: correctness
- **Priority**: high
- **Source**: T3d, 受け入れ基準2
- **must/should/could**: must

### Scenario

```
GIVEN: job が awaiting-merge 状態で存在し、PRがオープン状態である
  AND: spawn("git", ["checkout", ...]) が非ゼロ exit code を返すようにモックされている

WHEN: runFinishOrchestrator を実行する

THEN: result.exitCode === 0
  AND: 終了時の job.status === "archived"
  AND: stderr に checkout 失敗の警告が出力されている（escalation にならない）
```

---

## TC-FIN-REORDER-005: Phase 4 の updateJobState(worktreePath: null) が失敗しても job state は archived になる

- **Category**: correctness
- **Priority**: high
- **Source**: T3e (TC-FIN-P4-FAIL-002), 受け入れ基準2, 受け入れ基準4
- **must/should/could**: must

### Scenario

```
GIVEN: job が awaiting-merge 状態で存在し、PRがオープン状態である
  AND: worktreePath クリア用の updateJobState が I/O エラーを throw するようにモックされている

WHEN: runFinishOrchestrator を実行する

THEN: result.exitCode === 0
  AND: 終了時の job.status === "archived"
  AND: stderr に updateJobState 失敗の警告が出力されている
  AND: プロセスが unhandled rejection で落ちない
```

---

## TC-FIN-REORDER-006: assertJobFinishable — awaiting-merge は遷移可能として通過する

- **Category**: correctness
- **Priority**: high
- **Source**: T1, 受け入れ基準3
- **must/should/could**: must

### Scenario

```
GIVEN: job.status === "awaiting-merge"

WHEN: assertJobFinishable(state) を呼ぶ

THEN: 例外がスローされない
```

---

## TC-FIN-REORDER-007: assertJobFinishable — running は遷移不可としてエラーをスローする

- **Category**: correctness
- **Priority**: medium
- **Source**: T1, 受け入れ基準3
- **must/should/could**: must

### Scenario

```
GIVEN: job.status === "running"

WHEN: assertJobFinishable(state) を呼ぶ

THEN: SpecRunnerError が throw される
  AND: エラーメッセージに "Wait for the running job to complete" が含まれる
  AND: error.code === ERROR_CODES.JOB_NOT_FINISHABLE
```

---

## TC-FIN-REORDER-008: assertJobFinishable — canceled/failed/terminated はエラーをスローし適切な hint を返す

- **Category**: correctness
- **Priority**: medium
- **Source**: T1, 受け入れ基準3 (STATUS_HINTS の各 status)
- **must/should/could**: must

### Scenario

```
GIVEN: job.status が "canceled" または "failed" または "terminated" のいずれか

WHEN: assertJobFinishable(state) を呼ぶ

THEN: SpecRunnerError が throw される
  AND: "canceled" の場合は "already canceled" を含むメッセージ
  AND: "failed" / "terminated" の場合は "specrunner cancel" を含むメッセージ
  AND: "awaiting-resume" の場合は "specrunner resume" を含むメッセージ
```

---

## TC-FIN-REORDER-009: Phase 4 の updateJobState(worktreePath: null) が try-catch で保護されている

- **Category**: correctness
- **Priority**: high
- **Source**: T3e, 受け入れ基準4
- **must/should/could**: must

### Scenario

```
GIVEN: orchestrator.ts の runPhase4Finalize（または runPhase4Cleanup）実装を参照する

WHEN: L265 相当の updateJobState(worktreePath: null) のコードを確認する

THEN: try-catch ブロックで囲まれている
  AND: catch ブロック内で stderr に warning を出力している
  AND: catch ブロックで再スローしていない（best-effort）
```

---

## TC-FIN-REORDER-010: archived 状態の job を finish しても no-op で exit 0（TC-126 継続）

- **Category**: correctness
- **Priority**: high
- **Source**: TC-126, 受け入れ基準5
- **must/should/could**: must

### Scenario

```
GIVEN: job.status === "archived"（TERMINAL_STATUSES に含まれる）

WHEN: runFinishOrchestrator を実行する

THEN: result.exitCode === 0
  AND: Phase 1-3 の処理が実行されない（early return）
  AND: markJobArchived が再度呼ばれない
  AND: job.status は引き続き "archived"
```

---

## TC-FIN-REORDER-011: markJobArchived 内部で transitionJob を使用し history が記録される

- **Category**: correctness
- **Priority**: medium
- **Source**: T2
- **must/should/could**: should

### Scenario

```
GIVEN: job.status === "awaiting-merge"

WHEN: markJobArchived(jobId) を呼ぶ

THEN: 返却される state.status === "archived"
  AND: state.history の末尾エントリに trigger === "finish" かつ reason === "PR merged" が含まれる
  AND: transitionJob が内部で使用されている（手動 status 書き換えではない）
```

---

## TC-FIN-REORDER-012: markJobArchived — 既に archived の場合は noop で state を返す

- **Category**: correctness
- **Priority**: medium
- **Source**: T2 (noop パス)
- **must/should/could**: should

### Scenario

```
GIVEN: job.status === "archived"（既に archived）

WHEN: markJobArchived(jobId) を呼ぶ

THEN: 例外がスローされない
  AND: 返却される state.status === "archived"
  AND: state.history に重複エントリが追加されない
```

---

## TC-FIN-REORDER-013: Phase 4 の git pull 失敗は exit 0 で終了する（best-effort 化）

- **Category**: correctness
- **Priority**: low
- **Source**: T3d
- **must/should/could**: could

### Scenario

```
GIVEN: job が awaiting-merge 状態で存在し、PRがオープン状態である
  AND: spawn("git", ["pull", ...]) が非ゼロ exit code を返すようにモックされている

WHEN: runFinishOrchestrator を実行する

THEN: result.exitCode === 0
  AND: 終了時の job.status === "archived"
  AND: stderr に git pull 失敗の警告が出力されている
  AND: escalation（exit 1 / ok: false）にはなっていない
```
