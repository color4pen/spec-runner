# Scale-Tolerance Review: fresh-session-rollover

**Reviewer**: scale-tolerance  
**Iteration**: 1  
**Scope**: 時間とともに件数が単調増加する対象（archive・sidecar・issue/PR・コメント・journal）に対して、走査・ロード・API 呼び出しのコストが比例して成長するコードを、merge 前に検出する。

---

## 対象スコープの確認

### 変更ファイル（実装コード）

| ファイル | 種別 |
|---|---|
| `src/adapter/claude-code/agent-runner.ts` | rollover ループ・exhaustion 判別・session metrics 分離 |
| `src/adapter/claude-code/rollover-prompt.ts` | rollover 継続 prompt 生成（pure module） |
| `src/core/port/agent-runner.ts` | `AgentSessionRollover` 型追加・`sessionRollovers` フィールド |
| `src/core/step/commit-orchestrator.ts` | rollover 分 `contextOnly` エントリの usage.json 追記 |
| `src/core/step/executor.ts` | `sessionRollovers` の `StepExecutionResult` への透過 |
| `src/core/step/step-halt.ts` | `sessionRollovers` の `StepHalt` への追加 |
| `src/config/schema/types.ts` | `ContextRolloverConfig`・`DEFAULT_CONTEXT_ROLLOVER_MAX` |
| `src/config/schema/resolution.ts` | `resolveContextRolloverConfig` |
| `src/config/schema/validation.ts` | `contextRollover` スキーマ検証 |
| `src/kernel/event-types.ts` | `step:rollover` イベント型追加 |
| `src/core/event/types.ts` | `step:rollover` ペイロード型追加 |
| `src/logger/pipeline-logger.ts` | `step:rollover` イベント購読・JSONL 書き出し |
| `src/cli/progress.ts` | `step:rollover` イベント購読・1 行表示 |
| `src/core/usage/store.ts` | 変更なし（`appendInvocation` は既存） |

---

## スケール感度チェック

### 1. archive スキャン

新規コードはいかなる archive（`specrunner/changes/archive/`）の走査も行わない。  
`buildArtifactBundle` は step 開始時に 1 回呼ばれるが、これは **既存コード** であり rollover 発生ごとに再実行されない（`baseFullPrompt` として一度だけ評価され、`currentPrompt` 差し替えの材料として使い回す）。

→ **問題なし**

### 2. sidecar スキャン（`.specrunner/local/<slug>/`）

新規コードはいかなる sidecar ディレクトリの走査も行わない。

→ **問題なし**

### 3. GitHub API 呼び出し（issue/PR・コメント）

新規コードは GitHub API を呼び出さない。rollover は adapter 内（`ClaudeCodeRunner.run()`）に完結し、executor は `runner.run(ctx)` の戻り値のみを扱う契約が維持される。

→ **問題なし**

### 4. journal（events.jsonl）読み込み

新規コードは `events.jsonl` を **読み込まない**。  
`ctx.emit("step:rollover", ...)` → `pipeline-logger.ts` の `step:rollover` 購読 → JSONL への **追記のみ**。  
既存の `step:retry` イベントと同一パターンで、読み込みは発生しない。

→ **問題なし**

### 5. usage.json の read-modify-write ループ（要注目）

`applySuccessPostPersistEffects`（`commit-orchestrator.ts` 268–286）および `commitHalt`（同 587–606）に新規ループが追加された:

```typescript
for (const rollover of sessionRollovers) {          // ← maxRollovers 回（default 1）
  if (rollover.contextMetrics === undefined) continue;
  await appendInvocation(usageAbsPath, {            // ← 1 回ごとに usage.json を全読み + 全書き
    command: "job", contextOnly: true, ...
  });
}
```

`appendInvocation`（`src/core/usage/store.ts`）は read-modify-write パターンを採用しており、呼び出しのたびに `usage.json` を全件読み込み、1 エントリ追加後に全件書き戻す。

**スケール感度評価**:

| 項目 | 評価 |
|---|---|
| `usage.json` のスコープ | **per-slug**（`specrunner/changes/<slug>/usage.json`）。job 単位であり、複数 job にまたがらない |
| `usage.json` のエントリ数上限 | 1 job あたり step 数 × retry 数（標準 pipeline で 13 step。retry・fixer 込みでも 30–50 エントリ程度） |
| ループ反復回数 | `sessionRollovers.length` ≤ `maxRollovers`（default 1）。設定値に依存するが、設定は int ≥ 0 のみ許可 |
| 単調増加する対象との連動 | なし。usage.json は単一 job の生存期間中のみ肥大化し、archive 後は読まれない |

この read-modify-write パターンは**本 PR 以前から存在**し、今回の変更はループ回数を `maxRollovers` 分だけ増やす。エントリ件数は per-slug・per-job で bounded であり、時間とともに単調増加する collection（archive, sidecar, issues）と連動しない。

`maxRollovers` を大きな値（例: 10）に設定すると、1 step 実行あたり最大 10 回の追加 read-write サイクルが発生するが、対象ファイルの件数は job スコープで固定されており、ファイルサイズに係る実用上の上限はない。これは scale-tolerance ではなく設定値の妥当性の問題である。

→ **スケール問題なし**（bounded by config、per-slug scoped）

### 6. touchedFileMessages 配列の rollover 間蓄積

`touchedFileMessages: unknown[]` は `run()` スコープに宣言され、rollover をまたいでリセットされない（design D6 の設計意図: "worktree に対する事実の和集合"）。

```typescript
const touchedFileMessages: unknown[] = [];  // run() スコープ — rollover 後もリセットなし
// ...
if ((message as SDKMessage).type === "assistant") {
    touchedFileMessages.push(message);  // 全 session の assistant メッセージを蓄積
}
```

`maxRollovers = N` の場合、最大 N+1 session 分のメッセージが 1 配列に蓄積される。各 session の最大ターン数は `maxTurns`（default 60）で bounded。対象は単調増加する外部 collection ではなく、1 回の `run()` 内の制御フロー上のみ存在する。

→ **スケール問題なし**（double-bounded by `maxRollovers × maxTurns`）

### 7. extractedModelUsage の per-model 集計ループ

```typescript
for (const [mdl, usage] of Object.entries(discardedUsage as Record<string, ModelUsage>)) {
```

`discardedUsage` は 1 SDK result の `modelUsage` フィールド。モデル数は 1–3 程度で固定。単調増加する collection への依存なし。

→ **問題なし**

---

## 総合評価

新規コードは、時間とともに単調増加する対象（archive, sidecar, issues/PR, コメント, journal）の走査・ロード・API 呼び出しを一切行わない。

新たに追加された全てのループは以下のいずれかで bounded:
- `maxRollovers`（設定値、default 1）
- `sessionRollovers.length`（`maxRollovers` と等値）

`appendInvocation` の read-modify-write は pre-existing パターンであり、per-slug scoped な `usage.json`（単一 job 内でのみ肥大化）に対して操作する。

## Findings

なし（scale-tolerance 観点での問題点は検出されなかった）

## Evidence

- 検証ファイル数: 14（実装 + 型定義 + 設定）
- スキップ: 0
- 未検証: 0

| チェック項目 | 結果 |
|---|---|
| archive 走査 | なし |
| sidecar 走査 | なし |
| GitHub API 呼び出し（issue/PR/コメント） | なし |
| journal 読み込み | なし |
| usage.json read-write ループ | per-slug, bounded by `maxRollovers`（スケール問題なし） |
| touchedFileMessages 蓄積 | `maxRollovers × maxTurns` で double-bounded（スケール問題なし） |
| 全ループの boundedness | `maxRollovers` ≥ 0 の整数（設定バリデーション済み） |
