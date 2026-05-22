# Design: delta-spec-session-followup

## Summary

step 内で作業完了後に follow プロンプトを 1 本投げて self-fix させる intra-step follow-up prompt primitive を追加する。最初の consumer は design step で、rules.md の delta spec format 規律を読み直して self-fix させる。

## Background

PR #359 事後監査で design agent が rules.md を読まずに delta spec を書き format 違反を生んだ。prompt 冒頭の instruction は確率的に skip される (LLM uncertainty principle)。dsv 拡充で検出は強化したが、root cause「agent が rules.md を読まずに書く」は残っている。

## Architecture Decision

### D1: intra-step に閉じる 2 段実行

follow プロンプトは **step の中で完結**する。新 step を作らず、step 遷移を変えず、FIXER_STEP_NAMES を触らない。

```
[design step]
  turn 1: buildMessage で作業
  turn 2: followUpPrompt で self-fix  ← 同一 session 内
  → step 終了 (= 1 AgentRunResult を返す)
[delta-spec-validation]  ← 無改修
```

executor からは `runner.run(ctx)` 1 回の await。内部 2 turn は adapter の実装詳細。

**理由**: pipeline の step machinery に干渉しない。core 原理「cross-step の session state 非依存」を保つ。executor / finalizeStep 無改修。

### D2: follow プロンプトは 1 本 (bounded)

多 turn の対話ループにしない。作業 turn + follow プロンプト 1 本の bounded な 2 段。follow プロンプトが指定されなければ作業 turn のみで返す (opt-in)。

### D3: self-fix であって検出ゲートではない

follow プロンプトは「rules.md を読んで直せ」という action 指示。「違反していないか判定」させると確認バイアスで穴が空く (feedback_verify_dont_trust)。dsv は決定論的ゲートとして残す (belt and suspenders)。

### D4: field 配置 — AgentStep.followUpPrompt → executor 転記 → AgentRunContext.followUpPrompt

`needsProjectContext` → `projectContext` と同型のパターン:
- `AgentStep` interface に `followUpPrompt?: string` を追加 (step が宣言)
- executor が `ctx.followUpPrompt = step.followUpPrompt` で AgentRunContext に転記
- adapter が `ctx.followUpPrompt` を読んで 2 段実行するかを判定

**汎用 field**: design 以外の step も将来 primitive 改修なしで `followUpPrompt` を設定できる。本 request では design step のみ wiring。

### D5: shared / native の境界

| 層 | 責務 | 配置 |
|---|---|---|
| **shared 純粋関数** | follow turn 要否判定 / result 集約 (sessionId 維持・resultContent 採用) | `src/adapter/shared/follow-up.ts` |
| **adapter native** | 「同一 session で 2 turn 目を送る」操作 / modelUsage の session 総量算出 | 各 adapter の `run()` 内 |

依存方向は adapter → shared 純粋関数の一方向。shared は runtime 型 (AsyncGenerator / Turn / poll result) と usage 意味論を知らない。

### D6: 各 adapter の follow プロンプト送信方式

#### Claude Code adapter

作業 turn 完了後、`queryFn` を 2 回目で `resume: sessionId` option 付きで呼ぶ:

```typescript
// turn 1: 作業
const firstResult = await runQuery(fullPrompt, queryOptions);
const sessionId = firstResult.session_id;

// turn 2: follow-up (同一 session を resume)
if (ctx.followUpPrompt) {
  const followOptions = { ...queryOptions, resume: sessionId };
  const followResult = await runQuery(ctx.followUpPrompt, followOptions);
  // followResult.modelUsage は SDK cumulative → そのまま採用
}
```

**resume vs AsyncIterable**: request は AsyncIterable 化を推奨しているが、resume は既存の fixer session 継続で実績がある方式。AsyncIterable で 2 prompt を 1 query() に流す方式は SDK の supported usage pattern が未確認。resume 方式を採用し、session_id が resume 後も同一であることを実装時に検証する。

**modelUsage**: Claude SDK の `modelUsage` は session 累積値。follow turn の result をそのまま最終 usage とする。

#### Codex adapter

同一 `CodexThread` の `run()` を 2 回呼ぶ:

```typescript
// turn 1: 作業
const turn1 = await thread.run(fullPrompt, { signal });
const threadId = thread.id;

// turn 2: follow-up
if (ctx.followUpPrompt) {
  const turn2 = await thread.run(ctx.followUpPrompt, { signal });
  // usage = turn1.usage + turn2.usage (per-turn → 加算)
}
```

**modelUsage**: Codex の `turn.usage` は per-turn。turn 1 と turn 2 を加算して session 総量にする。thread は同一 instance なので session 継続が自然。

#### Managed Agent adapter (design step = SSE 経路)

SSE `end_turn` 後、**同一 session に `sendUserMessage` → `pollUntilComplete`** で follow turn を実行:

```typescript
// turn 1: SSE streaming (既存 runDesignStyle)
const sseResult = await this.sessionClient.streamEvents(sessionId, opts);

// turn 2: follow-up (SSE 不要 — polling で十分)
if (ctx.followUpPrompt) {
  await this.sessionClient.sendUserMessage(sessionId, ctx.followUpPrompt);
  const followPoll = await this.sessionClient.pollUntilComplete(sessionId, { timeoutMs });
  // handle followPoll result
}
```

**SSE end_turn 後の multi-turn 可否**: `SessionClient.sendUserMessage` は session ID を受け取り、session が active であればメッセージを送れる。Managed Agents API のセッションは `end_turn` でもアクティブなまま残る (= fixer session resume pattern と同じ前提)。port interface に `sendUserMessage` + `pollUntilComplete` が既に存在するため infra は揃っている。

**実装時の検証**: SSE `end_turn` 後に `sendUserMessage` が 403/404 等で失敗する場合は、follow turn をスキップして warning を出す graceful degradation とする。

**modelUsage**: ManagedAgentRunner は現状 modelUsage を populate しない (undefined)。follow turn でも変更なし。

### D7: result 集約 (shared 純粋関数)

```typescript
// src/adapter/shared/follow-up.ts
function mergeFollowUpResult(
  baseResult: AgentRunResult,
  followUpResult: { resultContent: string | null },
): AgentRunResult {
  return {
    ...baseResult,
    // sessionId: baseResult から維持 (同一 session)
    // resultContent: follow turn の最終状態を採用
    resultContent: followUpResult.resultContent,
  };
}
```

- **sessionId**: turn 1 のものを維持 (intra-step は同一 session が定義)
- **resultContent**: follow turn (最終状態) のものを採用
- **modelUsage**: adapter native で算出後、mergeFollowUpResult 呼び出し前に baseResult に反映済み
- **timeout**: 既存 AbortController が run() 全体に 1 つ → 作業 turn + follow turn 合算で wall-clock 1 本

### D8: design step の follow プロンプト文面

```
作業完了後の self-fix pass です。

1. specrunner/changes/{slug}/rules.md を Read tool で読んでください
2. 「delta spec 記法」セクションの以下の規律を確認してください:
   - セクションヘッダーは ## Requirements / ## Removed / ## Renamed のみ
     (## ADDED Requirements / ## MODIFIED Requirements 等の旧形式は禁止)
   - 各 Requirement は ### Requirement: で始まる header を持つ
   - 各 Requirement は少なくとも 1 つの #### Scenario: を含む
   - Requirement 本文に英語の SHALL または MUST が含まれる
   - ### Requirement: と最初の #### Scenario: の間にコードブロックがない
   - ## Removed は - "requirement name" のリスト形式
   - ## Renamed は - "old name" → "new name" のリスト形式
3. 今回書いた delta spec ファイルを Read し、違反箇所があれば修正してください
4. 違反がなければ変更せず end_turn してください
```

slug は `ctx.slug` から実行時に埋め込む。rules.md の path を明示し、Read tool を使わせることで「rules.md を読まなかった」root cause を直撃する。

### D9: timeout は単一 AbortController で統合

既存の AbortController は `run()` メソッド冒頭で 1 つ作成し、メソッド全体をカバーする。follow プロンプト追加後もこの構造を変えない。作業 turn + follow turn の合算が wall-clock timeout になる。turn ごとの分割タイマーは設けない。

## Affected Capabilities (delta spec)

| Capability | 変更内容 |
|---|---|
| agent-runner-port | `AgentRunContext.followUpPrompt?: string` 追加 |
| step-execution-architecture | `AgentStep.followUpPrompt?: string` 追加、executor 転記 |
| claude-code-runtime | follow-up turn の 2 段実行 (resume 方式) |
| managed-agent-runtime | follow-up turn の 2 段実行 (sendUserMessage + pollUntilComplete) |

## Scope

### In scope
- `followUpPrompt` field の追加 (AgentStep + AgentRunContext)
- 3 adapter での 2 段実行
- shared follow-up helper (判定 + result 集約)
- design step への follow プロンプト wiring

### Out of scope
- cross-step session resume
- 検出の self-review 化 (確認バイアスで不採用)
- 多 turn の対話ループ
- delta-spec-fixer step の改廃
- dsv rule の追加
- design 以外の step への follow プロンプト wiring
