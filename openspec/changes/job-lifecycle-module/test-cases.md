# Test Cases: job-lifecycle-module

## Overview

`src/state/lifecycle.ts` の新設と、それに伴う `idempotency.ts` 削除・`ps.ts` 置換のテストシナリオ。

---

## TC-01: VALID_TRANSITIONS — 許可遷移の網羅検証

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.2, 受け入れ基準「全 JobStatus × 全遷移先の網羅テストが存在する」

### GIVEN / WHEN / THEN

```
GIVEN: VALID_TRANSITIONS マップが定義されている
WHEN:  canTransition(from, to) を全 JobStatus × 全 JobStatus の 49 組で呼ぶ
THEN:  以下の遷移のみ true を返す（それ以外はすべて false）
        running          → awaiting-resume : true
        running          → awaiting-merge  : true
        running          → failed          : true
        running          → terminated      : true
        awaiting-resume  → running         : true
        awaiting-resume  → canceled        : true
        awaiting-merge   → archived        : true
        failed           → running         : true
        failed           → canceled        : true
        terminated       → running         : true
        terminated       → canceled        : true
        archived         → （すべて false）
        canceled         → （すべて false）
```

---

## TC-02: VALID_TRANSITIONS — 禁止遷移の代表パターン

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.2, design.md D4

### GIVEN / WHEN / THEN

```
GIVEN: VALID_TRANSITIONS マップが定義されている
WHEN:  canTransition を以下の禁止遷移ペアで呼ぶ
       - archived  → running
       - archived  → failed
       - canceled  → running
       - canceled  → awaiting-resume
       - running   → archived（直接は不可）
       - running   → canceled（直接は不可）
       - awaiting-merge → running
THEN:  すべて false を返す
```

---

## TC-03: canTransition — 同一 status は常に true（noop パス）

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 3.1, design.md D3

### GIVEN / WHEN / THEN

```
GIVEN: canTransition 関数が実装されている
WHEN:  canTransition(s, s) を全 7 JobStatus 値で呼ぶ
THEN:  すべて true を返す
```

---

## TC-04: isTerminal — terminal status の判定

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.8, 受け入れ基準「canTransition / isTerminal が正しく判定する」

### GIVEN / WHEN / THEN

```
GIVEN: isTerminal 関数が実装されている
WHEN:  isTerminal("archived") を呼ぶ
THEN:  true を返す

WHEN:  isTerminal("canceled") を呼ぶ
THEN:  true を返す

WHEN:  isTerminal を running / awaiting-resume / awaiting-merge / failed / terminated で呼ぶ
THEN:  すべて false を返す
```

---

## TC-05: TERMINAL_STATUSES — 定数の値検証

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.9, 受け入れ基準「lifecycle.ts が全遷移ルールを宣言的に定義している」

### GIVEN / WHEN / THEN

```
GIVEN: TERMINAL_STATUSES が export されている
WHEN:  TERMINAL_STATUSES の内容を検査する
THEN:  "archived" と "canceled" のみが含まれ、サイズが 2 である
```

---

## TC-06: ACTIVE_STATUSES — 定数の値検証

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.9, 受け入れ基準「ps.ts の ACTIVE_STATUSES が lifecycle.ts からの import に置換されている」

### GIVEN / WHEN / THEN

```
GIVEN: ACTIVE_STATUSES が export されている
WHEN:  ACTIVE_STATUSES の内容を検査する
THEN:  "running" と "awaiting-resume" のみが含まれ、サイズが 2 である
```

---

## TC-07: transitionJob — 正常遷移でステータスと updatedAt が更新される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.3, 受け入れ基準「transitionJob が不正な遷移を throw する」

### GIVEN / WHEN / THEN

```
GIVEN: status が "running" の JobState と TransitionContext が存在する
WHEN:  transitionJob(state, "awaiting-resume", ctx) を呼ぶ
THEN:  - result.noop が false である
       - result.state.status が "awaiting-resume" である
       - result.state.updatedAt が遷移前の updatedAt より新しい（または別の値）
       - 元の state は変更されていない（純粋関数）
```

---

## TC-08: transitionJob — 許可された全遷移パターンで noop: false

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.3

### GIVEN / WHEN / THEN

```
GIVEN: 各許可遷移の from status を持つ JobState が存在する
WHEN:  transitionJob(state, to, ctx) を許可された全遷移ペアで呼ぶ（11 パターン）
THEN:  すべて { noop: false, state.status === to } を返す
```

---

## TC-09: transitionJob — 同一 status への遷移は noop: true

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.4, design.md D3

### GIVEN / WHEN / THEN

```
GIVEN: status が "running" の JobState が存在する
WHEN:  transitionJob(state, "running", ctx) を呼ぶ
THEN:  - result.noop が true である
       - result.state が入力の state と同一参照（または同値）である
       - history に新エントリが追記されていない
```

---

## TC-10: transitionJob — 不正遷移で InvalidTransitionError を throw

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.5, 受け入れ基準「transitionJob が不正な遷移を throw する」

### GIVEN / WHEN / THEN

```
GIVEN: status が "archived" の JobState が存在する
       ctx = { trigger: "test-trigger", reason: "test-reason" }
WHEN:  transitionJob(state, "running", ctx) を呼ぶ
THEN:  Error が throw される
       エラーメッセージに "archived" が含まれる
       エラーメッセージに "running" が含まれる
       エラーメッセージに "test-trigger" が含まれる
```

---

## TC-11: transitionJob — 不正遷移エラーに from / to / trigger が含まれる

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.5

### GIVEN / WHEN / THEN

```
GIVEN: status が "canceled" の JobState が存在する
       ctx = { trigger: "signal-handler", reason: "user interrupted" }
WHEN:  transitionJob(state, "awaiting-resume", ctx) を呼ぶ
THEN:  throw されたエラーのメッセージに以下がすべて含まれる
       - "canceled"（from status）
       - "awaiting-resume"（to status）
       - "signal-handler"（trigger）
```

---

## TC-12: transitionJob — terminal status（archived）からの非 noop 遷移は throw

- **Category**: correctness
- **Priority**: must
- **Source**: design.md D4

### GIVEN / WHEN / THEN

```
GIVEN: status が "archived" の JobState が存在する
WHEN:  transitionJob を archived 以外の任意の to で呼ぶ
THEN:  Error が throw される（noop にはならない）
```

---

## TC-13: transitionJob — history エントリが appendHistoryEntry 経由で追記される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.3, 受け入れ基準「transitionJob が history エントリを appendHistoryEntry 経由で追記する」, design.md D7

### GIVEN / WHEN / THEN

```
GIVEN: history が空の JobState と ctx = { trigger: "pipeline", reason: "step done" } が存在する
WHEN:  transitionJob(state, "awaiting-merge", ctx) を呼ぶ
THEN:  - result.state.history の長さが 1 増えている
       - 最新エントリの step が "pipeline"（ctx.trigger）である
       - 最新エントリの message に "running → awaiting-merge" が含まれる
       - 最新エントリの message に "step done"（ctx.reason）が含まれる
```

---

## TC-14: transitionJob — ctx.patch が state にマージされる

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.6, 受け入れ基準「transitionJob が ctx.patch を state にマージする」

### GIVEN / WHEN / THEN

```
GIVEN: status が "running" の JobState と
       ctx = { trigger: "finish", reason: "failed", patch: { error: "exit code 1" } }
WHEN:  transitionJob(state, "failed", ctx) を呼ぶ
THEN:  result.state.error が "exit code 1" である
       result.state.status が "failed" である
```

---

## TC-15: transitionJob — patch で status / history / version / jobId / createdAt を上書きできない（型レベル）

- **Category**: architecture
- **Priority**: must
- **Source**: tasks.md 6.6, design.md D8

### GIVEN / WHEN / THEN

```
GIVEN: TransitionContext の patch 型が
       Partial<Omit<JobState, "version" | "jobId" | "createdAt" | "status" | "history">>
       と定義されている
WHEN:  TypeScript コンパイラが patch に status / history / version / jobId / createdAt を渡すコードを型検査する
THEN:  コンパイルエラーが発生する（型による保護）
```

---

## TC-16: transitionJob — MAX_HISTORY_SIZE に達した状態でも history が truncate される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 6.7

### GIVEN / WHEN / THEN

```
GIVEN: history が MAX_HISTORY_SIZE（上限）に達した JobState が存在する
WHEN:  transitionJob(state, 許可遷移先, ctx) を呼ぶ
THEN:  result.state.history の長さが MAX_HISTORY_SIZE を超えない
       最新エントリが追加され、最古エントリが削除されている
```

---

## TC-17: transitionJob — I/O なし（純粋関数）

- **Category**: architecture
- **Priority**: must
- **Source**: design.md D1, 受け入れ基準「lifecycle.ts が全遷移ルールを宣言的に定義している」

### GIVEN / WHEN / THEN

```
GIVEN: transitionJob 関数の実装
WHEN:  コードを静的に検査する
THEN:  ファイルシステム・ネットワーク・プロセス等の副作用呼び出しが存在しない
       （fs, child_process, fetch 等の import がない）
```

---

## TC-18: VALID_TRANSITIONS — ReadonlyMap + ReadonlySet で immutability が型保証される

- **Category**: architecture
- **Priority**: must
- **Source**: design.md D2

### GIVEN / WHEN / THEN

```
GIVEN: VALID_TRANSITIONS が ReadonlyMap<JobStatus, ReadonlySet<JobStatus>> として定義されている
WHEN:  TypeScript コンパイラが VALID_TRANSITIONS.set(...) または内側の Set への .add() を型検査する
THEN:  コンパイルエラーが発生する（mutation が型レベルで禁止）
```

---

## TC-19: idempotency.ts 削除 — orchestrator.ts が TERMINAL_STATUSES.has() を使用する

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 5.1, 5.2, 受け入れ基準「idempotency.ts が削除され、呼び出し元が TERMINAL_STATUSES.has() を使用している」

### GIVEN / WHEN / THEN

```
GIVEN: src/core/finish/idempotency.ts が削除されている
       src/core/finish/orchestrator.ts が更新されている
WHEN:  orchestrator.ts の import を検査する
THEN:  isFullyFinished の import が存在しない
       TERMINAL_STATUSES が ../../state/lifecycle.js から import されている
       isFullyFinished(state) の呼び出しが TERMINAL_STATUSES.has(state.status) に置換されている
```

---

## TC-20: idempotency.ts 削除後も既存テストが green

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 7.2, 受け入れ基準「bun run typecheck && bun run test が green」

### GIVEN / WHEN / THEN

```
GIVEN: idempotency.ts が削除され orchestrator.ts が TERMINAL_STATUSES.has() に置換されている
WHEN:  bun run test を実行する
THEN:  finish 関連の既存テストがすべて PASS する
       regression がゼロである
```

---

## TC-21: ps.ts — ACTIVE_STATUSES が lifecycle.ts から import される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 5.3, 受け入れ基準「ps.ts の ACTIVE_STATUSES が lifecycle.ts からの import に置換されている」

### GIVEN / WHEN / THEN

```
GIVEN: src/cli/ps.ts が更新されている
WHEN:  ps.ts の内容を検査する
THEN:  ローカルの `const ACTIVE_STATUSES: Set<JobStatus> = new Set([...])` 定義が存在しない
       ACTIVE_STATUSES が ../state/lifecycle.js から import されている
       JobStatus の import は ../state/schema.js から維持されている
```

---

## TC-22: ps.ts 置換後の動作が変わらない

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 5.3

### GIVEN / WHEN / THEN

```
GIVEN: ps.ts が lifecycle.ts の ACTIVE_STATUSES を使用するよう置換されている
WHEN:  running / awaiting-resume のジョブを含む状態で ps コマンドを実行する
THEN:  以前と同じ動作（active ジョブのみ表示 or フィルタ）が維持される
```

---

## TC-23: typecheck — 全ファイルが型エラーなし

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 7.1, 受け入れ基準「bun run typecheck && bun run test が green」

### GIVEN / WHEN / THEN

```
GIVEN: lifecycle.ts 新設・idempotency.ts 削除・orchestrator.ts と ps.ts の置換が完了している
WHEN:  bun run typecheck を実行する
THEN:  型エラーが 0 件である
```

---

## TC-24: test suite — bun run test が green

- **Category**: testing
- **Priority**: must
- **Source**: tasks.md 7.2, 受け入れ基準「bun run typecheck && bun run test が green」

### GIVEN / WHEN / THEN

```
GIVEN: tests/unit/state/lifecycle.test.ts が新設され、全実装が完了している
WHEN:  bun run test を実行する
THEN:  新規テスト（lifecycle.test.ts）が全 PASS
       既存テスト（finish / ps 等）が全 PASS
       FAIL / SKIP が 0 件
```

---

## TC-25: transitionJob — noop 時に history が変化しない（副作用なし）

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md 6.4, design.md D3

### GIVEN / WHEN / THEN

```
GIVEN: history に 3 エントリを持つ JobState が存在する
WHEN:  transitionJob(state, state.status, ctx) を呼ぶ（noop）
THEN:  result.state.history の長さが変化しない
       result.state.updatedAt が変化しない
```

---

## TC-26: canTransition — 存在しない JobStatus 値に対しても false を返す（防御的動作）

- **Category**: correctness
- **Priority**: should
- **Source**: design.md D4

### GIVEN / WHEN / THEN

```
GIVEN: canTransition 関数が実装されている
WHEN:  canTransition("unknown-status" as JobStatus, "running") を呼ぶ
THEN:  false を返す（throw しない）
```

---

## TC-27: transitionJob — patch なしで遷移しても state の他フィールドが保持される

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md 6.6

### GIVEN / WHEN / THEN

```
GIVEN: jobId / createdAt / version 等が設定された JobState が存在する
       ctx.patch が undefined の TransitionContext
WHEN:  transitionJob(state, 許可遷移先, ctx) を呼ぶ
THEN:  result.state.jobId / createdAt / version が変化しない
```

---

## TC-28: TransitionContext.trigger が history エントリの step フィールドに記録される

- **Category**: correctness
- **Priority**: should
- **Source**: design.md D5, D7

### GIVEN / WHEN / THEN

```
GIVEN: ctx = { trigger: "signal-handler", reason: "SIGTERM received" }
WHEN:  transitionJob(state, "terminated", ctx) を呼ぶ
THEN:  追記された history エントリの step が "signal-handler" である
       forensics / デバッグ時に遷移元を識別できる
```

---

## TC-29: lifecycle.ts のモジュール構造 — 必要な export がすべて存在する

- **Category**: architecture
- **Priority**: must
- **Source**: tasks.md 1.1–2.3, 3.1–3.2, 4.1

### GIVEN / WHEN / THEN

```
GIVEN: src/state/lifecycle.ts が実装されている
WHEN:  モジュールの named export を検査する
THEN:  以下がすべて export されている
       - TransitionContext（interface）
       - TransitionResult（interface）
       - VALID_TRANSITIONS（ReadonlyMap）
       - TERMINAL_STATUSES（ReadonlySet）
       - ACTIVE_STATUSES（ReadonlySet）
       - canTransition（function）
       - isTerminal（function）
       - transitionJob（function）
```

---

## TC-30: idempotency.ts ファイルが削除されている

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 5.2, 受け入れ基準「idempotency.ts が削除され...」

### GIVEN / WHEN / THEN

```
GIVEN: Phase 5 の実装が完了している
WHEN:  src/core/finish/idempotency.ts のパスを確認する
THEN:  ファイルが存在しない
```
