# Design: silent-exit-keepalive

Pipeline / process lifecycle binding で silent exit を構造的に消す。

## Problem Summary

Bun の event loop は「pending work なし → exit」を Node より厳格に判定する。
spec-runner の async chain は step 間・SDK query 前後に pending I/O を持たない瞬間があり、
Bun がその隙に exit 判定してしまう。

| 既知の silent exit | 発生箇所 |
|---|---|
| #386 | pipeline step 遷移境界 (spec-review → test-case-gen 間) |
| #399 | SDK Agent tool 待ち (tool_result が永遠に返らない) |

Root cause は共通: **pipeline lifecycle と process lifecycle の binding が無い**。

## Design Decisions

### D1: Keep-alive mechanism — Long-lived sentinel `setInterval`

| 案 | Pros | Cons |
|---|---|---|
| **(A) 長寿命 `setInterval`** | 単純、観測可能、低 overhead、`clearInterval` で確実に release | なし（Bun/Node 両方で動作確認済み） |
| (B) `setImmediate` 毎 iteration | Node pattern に近い | Bun で `setImmediate` polyfill 必要、管理が複雑 |
| (C) 解決しない Promise | 単純 | 観測困難、release に workaround 必要 |

**決定: (A)**

```typescript
// src/core/lifecycle/keepalive.ts
export class KeepAlive {
  private timer: ReturnType<typeof setInterval> | null = null;

  acquire(): void {
    if (this.timer !== null) return; // idempotent
    this.timer = setInterval(() => {}, 0x7FFFFFFF); // ~24.8 days, no-op callback
  }

  release(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  get isActive(): boolean {
    return this.timer !== null;
  }
}
```

根拠:
- PR #387 で `process.stderr.write()` (= I/O pending) を仕込むと完走する事実が実証
- `setInterval` は ref'd timer として event loop に登録される → Bun は pending work ありと判定
- no-op callback → CPU overhead ゼロ
- `clearInterval` → 確実に release → process.exit() への道を開く
- KeepAlive instance は command 実行ごとに生成、singleton 不使用 (テスト容易性)

### D2: Integration architecture — Orchestration boundary で acquire/release

KeepAlive は最上位のオーケストレーション層で管理する。

**Pipeline 実行 (`CommandRunner.execute()`)**:

```
execute() {
  const keepAlive = new KeepAlive();
  keepAlive.acquire();        // ← pipeline 開始前
  try {
    pipeline.run(...)
    handleResult(...)
    teardown(...)
  } finally {
    keepAlive.release();      // ← 全 cleanup 完了後
  }
  // caller (run.ts) が process.exit(exitCode) を呼ぶ
}
```

**Finish 実行 (`runFinishOrchestrator()`)**:

```
runFinishOrchestrator() {
  const keepAlive = new KeepAlive();
  keepAlive.acquire();
  try {
    // Phase 0-4
  } finally {
    keepAlive.release();
  }
}
```

根拠:
- acquire/release が `try/finally` で囲まれるため、success/error/signal 全 path で release が保証される
- Pipeline 内の各 step 間、store.persist() の await 前後、transition lookup の隙間すべてで keepalive が有効
- 既存の heartbeat timer (`ProgressDisplay`) は presentation concern → lifecycle concern とは独立

### D3: `beforeExit` safety net — Running 残留検出

```typescript
// src/core/lifecycle/exit-guard.ts
export function registerExitGuard(repoRoot: string): void {
  let fired = false;
  process.on("beforeExit", async () => {
    if (fired) return;
    fired = true;
    // .specrunner/jobs/ を scan
    // status === "running" の job → awaiting-resume に遷移 + warning log
  });
}
```

設計ポイント:

- `beforeExit` は event loop が drain した瞬間に発火 = silent exit のまさにその瞬間
- KeepAlive が正しく動作していれば `beforeExit` は発火しない (keepalive timer が pending)
- defense-in-depth: keepalive が何らかの理由で release された場合のみ発動
- `fired` boolean guard で一度だけ実行 (async I/O 完了後の再発火を防止)
- 遷移先は `awaiting-resume` (resume 可能な状態に保つ)
- **Bun 固有注意**: Bun の `beforeExit` は Node と同等に動作するが、async callback 内で新たな I/O を起こすと再度 event loop が回る可能性がある → `fired` guard が必須

### D4: Agent tool redirect — disallowedTools + stream monitoring + abort

SDK が LLM の init tools list に `Task` を強制告知する問題への対策。

**実装上の差分 (= 実装で確定した仕様)**:
- 当初の D4 案では Layer 1 fallback として `agents` no-op handler で **redirect message を tool_result として返す (= redirect-and-continue)** ことを想定していたが、実装では `agents` option による no-op handler は登録せず、**Stream で `tool_use` を検出 → counter increment → 3 回超で `abortController.abort()` + `AGENT_REDIRECT_LIMIT_EXCEEDED` error** に統一した (= abort-and-escalate)。理由: `disallowedTools` (Layer 1) と prompt 注入 (Layer 2) が一次防衛として有効であれば redirect 経路自体が発火しない、また hang を silent ではなく観測可能な failure (= escalation) に変える方が spec-runner の原理 (= 「silent でなくす」) と整合する。
- `agentRedirectCounter` は **1 step の 1 query() 内で local** な scope (= step 跨ぎで持ち越されない、step ごとに新規 counter)。
- **Layer 1 (`disallowedTools`) の SDK level 実効性**: anthropics/claude-agent-sdk-typescript#162 で「disallowedTools は prompt-based のみ、API filter 無し」と報告あり。Layer 1 単独の効果を過大評価せず、Layer 2 (prompt 注入) + Stream monitoring + abort の defense in depth で堅牢化する。

**優先順位付きの 3 層アプローチ**:

| 層 | 手段 | 目的 |
|---|---|---|
| Layer 1 (SDK config) | `disallowedTools: ["Agent", "Task"]` を query options に追加 | LLM の tool list から除外 |
| Layer 2 (Prompt) | additionalInstructions に「Agent/Task tool は使用不可」を追記 | LLM が tool 呼び出しを試みない方向に誘導 |
| Layer 3 (Safety net) | 既存 timeout (AbortController) | 万一 hang しても timeoutMs で打ち切り |

**実装の進め方**:

1. `disallowedTools: ["Agent", "Task"]` を queryOptions に追加して実機検証
2. 検証結果に応じて:
   - **SDK が `disallowedTools` をサポートし、LLM の tool list から除外される場合** → Layer 1 のみで完了
   - **SDK が `disallowedTools` をサポートしないか、`Task` が依然として LLM に見える場合** → no-op agent handler の登録を試みる (SDK の `agents` option)
3. どちらも不可の場合 → Layer 2 (prompt) + Layer 3 (timeout) で対処

**No-op agent handler (Layer 1 の fallback)**:

```typescript
// SDK が agents option をサポートする場合
const agentRedirectCount = { value: 0 };
const MAX_AGENT_REDIRECTS = 3;

const queryOptions = {
  // ... existing options ...
  // disallowedTools が効かない場合のみ追加:
  agents: {
    Agent: {
      handler: async () => {
        agentRedirectCount.value++;
        if (agentRedirectCount.value > MAX_AGENT_REDIRECTS) {
          abortController.abort();
        }
        return {
          text: "Subagent invocation is not available in this environment. "
              + "Use Read, Grep, Edit, Bash, Write, and Glob tools directly "
              + "to complete the task yourself.",
        };
      },
    },
  },
};
```

**Redirect message の文言設計**:
- "permission denied" ではなく redirect (LLM が方針切替しやすい)
- 使える tool を具体的に列挙 (LLM が次の行動を選びやすい)
- reject ではなく教育的 text

**Retry 上限**: 同一 session で 3 回。超過時は `abortController.abort()` で query 打ち切り → step は timeout/error 経路へ → pipeline が escalation に倒す。

根拠:
- `canUseTool` callback は subagent dispatch が bypass する (request 記載、実機検証済み) → 主軸不可
- `disallowedTools` が最もシンプルで副作用が少ない → 最優先で検証
- no-op agent handler は SDK の agent dispatch mechanism 内で完結 → hang しない
- prompt 指示は LLM uncertainty で破られるため補助のみ (= `[[feedback_llm_uncertainty_principle]]`)
- 3 回 retry 上限は「LLM が指示を理解して切替えるのに十分、無限 loop を防ぐのに十分」のバランス

### D5: Diagnostic logging — `SPECRUNNER_DEBUG=pipeline`

```typescript
// src/core/lifecycle/diagnostic.ts
export function logPipelineDiag(point: string, detail?: string): void {
  const debug = process.env["SPECRUNNER_DEBUG"];
  if (!debug || !debug.includes("pipeline")) return;
  const ts = new Date().toISOString();
  const msg = detail
    ? `[pipeline-diag ${ts}] ${point}: ${detail}`
    : `[pipeline-diag ${ts}] ${point}`;
  process.stderr.write(msg + "\n");
}
```

13 境界ポイント (PR #387 の `process.stderr.write` 配置と同一):

| # | Point ID | 配置ファイル | 位置 |
|---|---|---|---|
| 1 | `pipeline:run:entry` | pipeline.ts | `run()` entry |
| 2 | `pipeline:step:pre-execute` | pipeline.ts | `executor.execute()` 直前 |
| 3 | `pipeline:step:post-execute` | pipeline.ts | `executor.execute()` 直後 |
| 4 | `pipeline:transition:resolved` | pipeline.ts | transition lookup 完了 |
| 5 | `pipeline:terminal` | pipeline.ts | `end` / `escalate` 到達 |
| 6 | `pipeline:loop:exhausted` | pipeline.ts | loop exhaustion 検出 |
| 7 | `executor:step:dispatch` | executor.ts | kind 判定 → agent/cli dispatch |
| 8 | `executor:agent:pre-run` | executor.ts | `runner.run()` 直前 |
| 9 | `executor:agent:post-run` | executor.ts | `runner.run()` 直後 |
| 10 | `executor:commit:pre` | executor.ts | `commitAndPush()` 直前 |
| 11 | `executor:commit:post` | executor.ts | `commitAndPush()` 直後 |
| 12 | `query:start` | agent-runner.ts | SDK `query()` 呼び出し直前 |
| 13 | `query:complete` | agent-runner.ts | SDK `query()` AsyncGenerator 完了直後 |

根拠:
- `SPECRUNNER_DEBUG=pipeline` 未設定時はゼロ overhead (env var check のみ)
- stderr 出力 → stdout の pipeline 出力と混在しない
- 既存の `logVerbose()` と併存 (verbose は file log、diag は stderr 即時出力)
- PR #387 の workaround と同じ配置 → 再現性の確保が確実

### D6: Explicit process.exit() — 既存で充足

現状のコードベースで `process.exit()` は既に明示的に呼ばれている:

| 呼び出し元 | コード |
|---|---|
| `src/cli/run.ts:106` | `process.exit(await runRunCore(...))` |
| `src/cli/resume.ts` | 同パターン |
| `src/cli/finish.ts` | caller が `process.exit()` |
| Signal handler | `process.exit(130)` |

KeepAlive が active な間は Bun の自然 exit が防がれ、release 後に上記の明示 `process.exit()` が exit を確定させる。追加の `process.exit()` 呼び出しは不要。

### D7: Timeout 機構との整合性

KeepAlive は timeout 機構と干渉しない:

| Timeout 機構 | 動作 | KeepAlive との関係 |
|---|---|---|
| ClaudeCodeRunner AbortController | `setTimeout(abort, timeoutMs)` → query abort → error 経路 → pipeline 終了 | timeout 発火 → pipeline 終了 → `finally` で release |
| pollUntilComplete deadline | `Date.now() >= deadline` → throw → error 経路 → pipeline 終了 | 同上 |
| Step-level timeoutMs | getStepExecutionConfig 経由 → AbortController | 同上 |

**「KeepAlive で絶対 exit しない状態になったらどうするか」**: KeepAlive は pipeline の `finally` ブロックで必ず release される。Pipeline は必ず終了する (completion / escalation / error / timeout)。したがって KeepAlive が永久に release されないケースは存在しない。Signal (SIGINT/SIGTERM) 時は `process.exit(130)` が直接呼ばれるため KeepAlive の状態は無関係。

## Module Layout

```
src/core/lifecycle/
├── keepalive.ts          # KeepAlive class
├── exit-guard.ts         # registerExitGuard (beforeExit handler)
└── diagnostic.ts         # logPipelineDiag function
```

既存モジュールへの変更:

| ファイル | 変更内容 |
|---|---|
| `src/core/command/runner.ts` | KeepAlive acquire/release を execute() に追加 |
| `src/core/finish/orchestrator.ts` | KeepAlive acquire/release を runFinishOrchestrator() に追加 |
| `src/cli/run.ts` | registerExitGuard() 呼び出し追加 |
| `src/cli/resume.ts` | registerExitGuard() 呼び出し追加 |
| `src/cli/finish.ts` | registerExitGuard() 呼び出し追加 |
| `src/core/pipeline/pipeline.ts` | logPipelineDiag() 呼び出し追加 (6 ポイント) |
| `src/core/step/executor.ts` | logPipelineDiag() 呼び出し追加 (4 ポイント) |
| `src/adapter/claude-code/agent-runner.ts` | logPipelineDiag() 追加 (2 ポイント) + disallowedTools/agent redirect 追加 |

## Test Strategy

| 対象 | テスト方針 |
|---|---|
| KeepAlive | unit: acquire/release/isActive の状態遷移、idempotent acquire、double release 安全性 |
| ExitGuard | unit: fired guard の一度きり実行、running 検出 → awaiting-resume 遷移 |
| Agent redirect | unit: redirect message が tool_result として返ること、3 回超過で abort |
| Diagnostic log | unit: env var 未設定時に出力なし、設定時に stderr 出力 |
| Pipeline 統合 | integration: keepalive active 中に pipeline step 遷移が完了すること |
| Timeout 整合 | integration: keepalive active でも step timeout が正常に発火すること |
