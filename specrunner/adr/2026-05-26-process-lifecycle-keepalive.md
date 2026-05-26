# ADR: Pipeline / Process lifecycle binding — KeepAlive sentinel と Agent tool redirect 設計

- **date**: 2026-05-26
- **slug**: process-lifecycle-keepalive
- **status**: accepted

## Context

spec-runner は dogfood 中に **silent exit**（= error なく process が exit、`state.status: running` のまま）を 2 種類踏んだ。

| 番号 | 発生箇所 | 観察 |
|---|---|---|
| #386 | pipeline step 遷移境界 (spec-review → test-case-gen 間) | parent jsonl が `verdict: approved` で停止、次 step に進まず |
| #399 | SDK Agent tool 待ち | jsonl 最終 entry が `assistant.tool_use (Agent)`、tool_result が永遠に返らない |

両者の root cause は共通: **pipeline lifecycle と process lifecycle の binding が無い**。

```
pipeline lifecycle:   ━━━━━━━━━━━━━━━━━━━━━━━ (まだ step 残ってる)
process lifecycle:    ━━━━━━━━━━╳ exit
                                 ↑
                                 ここで死ぬべきじゃない
```

**Bun の event loop は「pending work なし → exit」を Node より厳格に判定する**（仕様としては正しい）。
spec-runner の async chain は step 間・SDK query 前後に pending I/O を持たない瞬間があり、Bun がその隙に exit 判定していた。Node の慣習（「pending なくても少し待つ」）への暗黙依存が原因。

`process.stderr.write()` を 13 ポイントに仕込むと完走する（PR #387）という事実が「I/O pending が増えれば exit しない」= lifecycle binding で直るを実証した。

同型構造の audit で、さらに以下の経路も同リスクを持つと判明:

| 経路 | リスク |
|---|---|
| managed-agent `pollUntilComplete()` × 3 箇所 | 同型、未踏 |
| finish の git fetch retry sleep (preflight / branch-checkout / local-conflict-check) | 同型、未踏 |

2 件を別個に対症療法で潰すと 3 件目の silent exit で同じ問題が再出する（patchwork パターン）。
1 つの構造解で両方を吸収する方針をとった。

Agent tool 経路（#399）の追加背景: Claude Agent SDK `@anthropic-ai/claude-agent-sdk@^0.2.128`（pre-1.0、検証時点）は `Task`（= `Agent` の旧名）を LLM の init tools list に **強制告知**する。host（= spec-runner）に handler 未登録のまま LLM が呼び出すと tool_result が返らず `for await` が hang する。

## Decisions

### D1: Keep-alive mechanism — 長寿命 sentinel `setInterval`

| 案 | Pros | Cons | 採否 |
|---|---|---|---|
| **(A) 長寿命 `setInterval`** | 単純・観測可能・低 overhead・`clearInterval` で確実 release | なし | **採用** |
| (B) `setImmediate` 毎 iteration | Node pattern に近い | Bun で polyfill 必要、管理が複雑 | 不採用 |
| (C) 解決しない Promise | 単純 | 観測困難、release に workaround 必要 | 不採用 |

実装: `src/core/lifecycle/keepalive.ts` の `KeepAlive` クラス。

```typescript
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

`setInterval` は ref'd timer として event loop に登録される。no-op callback で CPU overhead ゼロ。
`KeepAlive` instance は command 実行ごとに生成し singleton 不使用（テスト容易性）。

### D2: KeepAlive 配置 — orchestration boundary で acquire/release

KeepAlive は最上位オーケストレーション層（`CommandRunner.execute()` と `runFinishOrchestrator()`）で管理する。

```typescript
execute() {
  const keepAlive = new KeepAlive();
  keepAlive.acquire();        // pipeline 開始前
  try {
    pipeline.run(...)
    handleResult(...)
    teardown(...)
  } finally {
    keepAlive.release();      // 全 cleanup 完了後（success / error / signal 全 path）
  }
  // caller (run.ts) が process.exit(exitCode) を呼ぶ
}
```

`try/finally` で囲むことで全 path で release を保証。pipeline 内の各 step 間・store.persist() の await 前後・transition lookup の隙間すべてで keepalive が有効になる。

step 単位の acquire/release は不採用（粒度が細かく forget リスクが高い）。

### D3: `beforeExit` safety net — exit 時 invariant 検証

KeepAlive が正しく動作していれば `beforeExit` は発火しない（sentinel timer が pending）。defense-in-depth として:

- `process.on('beforeExit')` で `status: running` の job を検出 → `awaiting-resume` に強制遷移 + warning log
- `fired` boolean flag で一度だけ実行（async I/O 完了後の再発火を防止）
- Bun では `beforeExit` の async callback 内で新たな I/O を起こすと event loop が再度回る可能性がある → flag guard が必須

### D4: Agent tool redirect — `disallowedTools` 優先、stream monitoring + abort で safety net

SDK が `Task` を LLM に強制告知する問題への対策。3 層アプローチを採用:

| 層 | 手段 |
|---|---|
| Layer 1 | `disallowedTools: ["Agent", "Task"]` を query options に追加 |
| Layer 2 | `additionalInstructions` で Agent/Task tool 使用不可を明記 |
| Layer 3 | 既存 timeout (`AbortController`) + redirect カウンター（3 回超過で abort → escalation） |

**`canUseTool` callback を主軸から外した根拠**: 実機検証で callback が呼ばれないことを確認。SDK が subprocess を起動する造りで permission check が subprocess 内で完結している可能性 + subagent dispatch が host callback を bypass する可能性。両経路で筋悪のため除外。

**no-op agent handler を主軸から外した根拠**: `disallowedTools` が最もシンプルで副作用が少ない。SDK の `agents` option サポート状況が pre-1.0 で不確定のため、実機検証で `disallowedTools` が有効と確認できた段階で完了とする（SDK upgrade 時は再検証が必要）。

redirect 上限 3 回: LLM が指示を理解して切替えるのに十分、かつ無限 loop を防ぐバランス。超過時は `abortController.abort()` → step が `AGENT_REDIRECT_LIMIT_EXCEEDED` error → pipeline が escalation に倒す。

**注意**: review-feedback-001 F-01 が記録した通り、実装は "redirect → continue" ではなく "stream monitoring + abort → escalation" になっている（SDK の `agents` option が動作確認取れなかったため）。`disallowedTools` が有効な間は redirect 経路自体が発火しないため実害なし。

### D5: 明示的 `process.exit()` — 自然終了任せをやめる

現状コードベースで `run.ts`・`resume.ts`・`finish.ts`・signal handler に明示的 `process.exit()` が既に存在していた。KeepAlive active 中は Bun の自然 exit が防がれ、release 後に既存の明示 `process.exit()` が exit を確定させる設計。「自然終了任せ」を silent exit の遠因と特定し、この方針を明示的な contract として確認・文書化する。

### D6: Timeout 機構との整合性

KeepAlive は timeout 機構と干渉しない。pipeline は必ず終了する（completion / escalation / error / timeout）ため、KeepAlive が永久に release されないケースは存在しない。

| Timeout 機構 | KeepAlive との関係 |
|---|---|
| ClaudeCodeRunner AbortController | timeout 発火 → pipeline 終了 → `finally` で release |
| pollUntilComplete deadline | 同上 |
| Signal (SIGINT/SIGTERM) | `process.exit(130)` が直接呼ばれるため KeepAlive の状態は無関係 |

### D7: Diagnostic logging — `SPECRUNNER_DEBUG=pipeline`

PR #387 で silent exit の再現に使った 13 ポイントの `process.stderr.write()` 配置を、`SPECRUNNER_DEBUG=pipeline` env var で opt-in の恒久ログとして残す。

未設定時はゼロ overhead（env var check のみ）。stderr 出力で stdout と混在しない。

## Alternatives Considered

### Alternative 1: #386 と #399 を別個の対症療法で対処する

silent exit 2 件を独立した issue として別 PR で個別修正する。

- **Pros**: 各 PR の scope が小さく review が容易
- **Cons**: 3 件目の silent exit が出た時（managed polling 境界 / finish git fetch 境界）にまた同じ設計議論が発生する。根本原因「lifecycle binding の欠落」を共有しているにもかかわらず対症療法を重ねると patchwork が固定化する
- **Why not**: request.md「architect 評価済みの設計判断」で明示的に排除。両問題の root cause が共通仮説で説明可能であり、共通の lifecycle binding contract を 1 度設計して両方を吸収する方が構造的

### Alternative 2: 各 async 境界に個別 I/O pending を仕込む（PR #387 の正規化）

PR #387 の workaround をそのまま保持し、step 間に `process.stderr.write()` を残す。

- **Pros**: 変更が小さい
- **Cons**: 境界が増えるたびに手動追加が必要。実装の意図が不明瞭で将来削除リスクが高い。patchwork パターンの固定化
- **Why not**: 「I/O pending が増えれば exit しない」を利用する同じ原理だが、管理可能な形に構造化する方が保守性が高い。意図が可視化されない実装は後継者が削除するリスクを持つ

### Alternative 3: Bun upgrade で解決する

Bun v1.3.14 / Rust 版 canary で event loop 互換性が改善している可能性。

- **Pros**: spec-runner 側の変更なし
- **Cons**: Bun upgrade 自体が別リスク。upgrade しても同種の問題が再発する可能性を排除できない。runtime 依存の暗黙前提を解消しない
- **Why not**: 環境変更で本質を解決せず、設計改善で Bun/Node 両方で動く構造を持つことが優先。Bun upgrade は別 issue / 別 request に委ねる。lifecycle binding が入れば v1.3.12 のままで解決可能（PR #387 で実証）

### Alternative 4: `setImmediate` を毎 iteration 仕込む

pipeline の各 step 間で `setImmediate` を呼び、event loop の「次の iteration」を確実に回す。

- **Pros**: Node pattern として知られている
- **Cons**: Bun で `setImmediate` の polyfill が必要な可能性。step 遷移の全 path に挿入する必要があり forget リスクが高い。管理境界が orchestration 層ではなく各 step 間に散らばる
- **Why not**: 長寿命 `setInterval` の方が acquire/release が 1 箇所に集約でき、観測性と保守性が高い（design.md D1 で比較評価）

### Alternative 5: `canUseTool` callback で Agent tool を制御する

SDK の `canUseTool` callback で Agent/Task を検知し、host 側で redirect text を返す。

- **Pros**: SDK の公式 API 経路に見える
- **Cons**: 実機検証で callback が呼ばれないことを確認。SDK が subprocess を起動する造りで permission check が subprocess 内で完結している可能性 + subagent dispatch が host callback を bypass する可能性
- **Why not**: request.md・design.md D4 で実機検証済みとして明示排除。`disallowedTools` / `agents` no-op / `PreToolUse` hook の 3 案に絞る根拠として記録されている

### Alternative 6: `PreToolUse` hook で Agent tool を横取りする

Claude Code の `PreToolUse` hook 経路で host が Agent tool 呼び出しを検知し、redirect text を返す。

- **Pros**: hooks 経路なら tool_result を host が直接返せる可能性がある
- **Cons**: `PreToolUse` hook は Claude Code の hooks 機能（`~/.claude/settings.json` 等）であり、SDK の `query()` 呼び出し経路（spec-runner が直接 SDK を invoke する構造）では発火しない可能性が高い。SDK の subagent dispatch が host の hook を bypass する経路と同型
- **Why not**: request.md の比較案 (c) として記載されたが、design.md D4 では `disallowedTools` を最優先・最もシンプルと評価。`PreToolUse` は host と SDK の結合が深くなる経路であり採用されなかった

## Consequences

### Positive

- pipeline が生きている間、Bun の event loop が早期 exit 判定しない（silent exit の構造的解消）
- pipeline / finish の全 async 境界（step 遷移・pollUntilComplete・git fetch retry sleep）がカバーされる
- `beforeExit` safety net が `status: running` のまま exit するケースを観測・救済する
- Agent tool 呼び出しが hang → silent exit から hang → abort → escalation（観測可能な失敗）に変わる
- `KeepAlive` / `ExitGuard` が独立モジュールとして unit test 可能
- `SPECRUNNER_DEBUG=pipeline` で silent exit の再現診断が容易になる

### Negative / 既知の負債

- KeepAlive の `setInterval` は long-running interval として process に常在する。`clearInterval` を呼ばずに process が exit するケース（Signal handler 直接 exit 等）では leak するが、process exit と同時に GC されるため実害なし
- Agent tool redirect の "redirect → continue" 経路（TC-17 / TC-26 が期待した振る舞い）は実装されていない。現状は abort → escalation になっている。`disallowedTools` が有効な間は LLM に Tool が見えないため発火しないが、SDK upgrade 後の再検証が必要（`review-feedback-001 F-01` 記録）
- `runQuery` の `aborted` 戻り値が dead code として残存（`review-feedback-001 F-02`）。将来の cleanup 対象

### 将来の開発者への注意

- **新しい async 境界を追加する場合**: KeepAlive が orchestration boundary（`CommandRunner.execute()` / `runFinishOrchestrator()`）で acquire されているため、その内側であれば自動的に保護される。orchestration 境界の外側に async 処理を追加する場合は KeepAlive の acquire/release 範囲を確認すること
- **SDK upgrade 時**: `@anthropic-ai/claude-agent-sdk` を upgrade した場合、`disallowedTools: ["Agent", "Task"]` の有効性と `Task` の init tools list 強制告知の有無を再検証すること（D4 参照）

## References

- Request: `specrunner/changes/silent-exit-keepalive/request.md`
- Design: `specrunner/changes/silent-exit-keepalive/design.md`
- Delta specs: `specrunner/changes/silent-exit-keepalive/specs/process-lifecycle/spec.md`, `specrunner/changes/silent-exit-keepalive/specs/claude-code-runtime/spec.md`, `specrunner/changes/silent-exit-keepalive/specs/cli-commands/spec.md`
- Review: `specrunner/changes/silent-exit-keepalive/review-feedback-001.md`
- Related issues: anthropics/claude-agent-sdk-typescript#87 (Agent tool disable 手段なし), #210 (hang on unregistered handler), #162 (disallowedTools prompt-based のみ)
- Related ADR: [2026-05-23-foreground-progress-display](./2026-05-23-foreground-progress-display.md) — `ProgressDisplay` の heartbeat timer（presentation 層）と本 ADR の KeepAlive（lifecycle 層）の関係: 両者はともに `setInterval` を使うが責務が異なる。heartbeat は表示の鼓動、KeepAlive は process lifecycle の保証
- Related ADR: [2026-05-05-agent-runner-port-and-local-runtime](./2026-05-05-agent-runner-port-and-local-runtime.md) — `AgentRunner` port 契約と query 実行パターン
