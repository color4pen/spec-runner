# ADR: intra-step follow-up prompt による agent self-fix 2 段実行

- **date**: 2026-05-22
- **slug**: intra-step-follow-up-prompt
- **status**: accepted

## Context

PR #359 (job-cancel-command) の事後監査で、design agent が `specrunner/changes/<slug>/rules.md` を読まずに delta spec を書き、`## Removed` の format 違反を生んだことが判明した。rules.md の Read 強制は identity priming ([2026-05-20-rules-md-injection](./2026-05-20-rules-md-injection.md)) により導入済みだが、prompt 冒頭の instruction は確率的に skip される (= LLM uncertainty principle)。

dsv 拡充 (PR #361) で検出ゲートは強化されたが、**「agent が rules.md を読まずに書く」という root cause そのもの**は残っていた。対症療法としての rule 追加ではなく、「agent が作業直後に読み直しと修正を実行する 2nd pass」を仕組みとして組み込む設計が必要と判断した。

## Decisions

### D1: follow プロンプトは intra-step に閉じる（新 step を作らない）

follow プロンプトは **step の中で完結**する。新 step を作らず、step 遷移を変えず、`FIXER_STEP_NAMES` を触らない。

```
[design step]
  turn 1: buildMessage で作業
  turn 2: followUpPrompt で self-fix  ← 同一 session 内
  → step 終了（1 AgentRunResult を返す）
[delta-spec-validation]  ← 無改修
```

executor からは `runner.run(ctx)` 1 回の await に見える。内部 2 turn は adapter の実装詳細。

**理由**: pipeline の step machinery に干渉しない。core 原理「cross-step の session state 非依存」を保つ。executor / finalizeStep 無改修。

**不採用案**: 新しい `self-fix` step を pipeline に追加する案は、step 遷移の変更と `FIXER_STEP_NAMES` 改修を招き、pipeline 全体の影響範囲が広がるため不採用。

### D2: follow プロンプトは 1 本（多 turn ループにしない）

作業 turn + follow プロンプト 1 本の bounded な 2 段。follow プロンプトが指定されなければ作業 turn のみで返す（opt-in）。

**理由**: 多 turn の往復ループは収束保証がなく、wall-clock timeout との相性も悪い。bounded な 2 段で「best-effort 前掃除」として位置づける。

### D3: self-fix であって検出ゲートではない

follow プロンプトは「rules.md を読んで直せ」という action 指示。「違反していないか判定」させると確認バイアスで穴が空く (feedback_verify_dont_trust)。

- dsv は決定論的ゲートとして残す (belt and suspenders)
- self-fix は「ゲート前の best-effort 前掃除」であり、dsv を代替しない

### D4: `AgentRunContext.followUpPrompt` + `AgentStep.followUpPrompt` の field 配置

`needsProjectContext` → `projectContext` の executor 転記と同型のパターンを採用:

```typescript
// src/core/step/types.ts
interface AgentStep {
  followUpPrompt?: string;  // step が宣言
}

// src/core/port/agent-runner.ts
interface AgentRunContext {
  followUpPrompt?: string;  // executor が転記
}
```

executor が `ctx.followUpPrompt = step.followUpPrompt` で転記。`followUpPrompt` は **step 非依存の汎用 field** であり、将来の step も primitive 側を改修せずに利用できる。本 request では design step のみ wiring。

### D5: shared / native の境界

| 層 | 責務 | 配置 |
|---|---|---|
| **shared 純粋関数** | follow turn 要否判定 / result 集約（sessionId 維持・resultContent 採用） | `src/adapter/shared/follow-up.ts` |
| **adapter native** | 「同一 session で 2 turn 目を送る」操作 / modelUsage の session 総量算出 | 各 adapter の `run()` 内 |

依存方向は adapter → shared 純粋関数の一方向。shared は runtime 型 (AsyncGenerator / Turn / poll result) と usage 意味論を知らない。

**理由**: per-turn usage（Codex）と cumulative usage（Claude）の意味論差を shared に「一律加算」として持ち込むと leaky abstraction になる。usage 算出は adapter 責務に留める。

### D6: 各 adapter の follow turn 送信方式

| Adapter | 方式 | 根拠 |
|---|---|---|
| **Claude Code** | 作業 turn 後、`queryFn` を `resume: sessionId` で 2 回目呼び出し | fixer session resume で実績あり |
| **Codex** | 同一 `CodexThread` の `run()` を 2 回呼ぶ | thread instance 保持で session 継続が自然 |
| **Managed Agent** | SSE `end_turn` 後、`sendUserMessage` + `pollUntilComplete` | port interface に既存の口が揃っている |

Managed Agent の SSE 後 multi-turn 可否は request 時点で未確認だったが、design フェーズで「SSE `end_turn` 後もセッションが active のまま残り `sendUserMessage` が受け付けられる」と確認済み（fixer session resume と同前提）。API が multi-turn 非対応だった場合は graceful degradation（follow turn をスキップして warning）とする。

### D7: result 集約の方針

```
sessionId   : turn 1 のものを維持（intra-step は同一 session が定義）
resultContent: follow turn（最終状態）のものを採用
modelUsage  : adapter native で算出（Claude は cumulative そのまま / Codex は turn 加算）
timeout     : 既存 AbortController が run() 全体に 1 つ → 作業 turn + follow turn 合算で wall-clock 1 本
```

### D8: design step の follow プロンプト

rules.md の path を明示し、Read tool を使わせることで「rules.md を読まなかった」root cause を直撃する:

```
1. specrunner/changes/{slug}/rules.md を Read tool で読んでください
2. 「delta spec 記法」セクションの format 規律を確認
3. 今回書いた delta spec ファイルを Read し、違反があれば修正
4. 違反がなければ変更せず end_turn
```

「判定」ではなく「修正」の action を指示することで確認バイアスを回避する。

## Consequences

- step が `followUpPrompt` を宣言するだけで、adapter 側が 2 段実行を自動処理する汎用 primitive が生まれる
- design step では rules.md format 違反が自己修正されることで、dsv に届く違反件数の削減が期待される
- `AgentRunContext` はコアポートインターフェースであり、`followUpPrompt` の追加は全 adapter の実装義務になる（opt-in だが、フィールド自体は contract に入る）
- Claude Code adapter は `resume: sessionId` 方式を採用するため、turn 間で sessionId が変わらないことへの依存が生まれる
- Managed Agent adapter は SSE 後 `sendUserMessage` が失敗した場合に graceful degradation するため、follow turn の実行保証はない（best-effort）
- dsv ゲートは変更なし。self-fix は前掃除であり、ゲートの廃止・代替を意図しない

## 関連 ADR

- [2026-05-20-rules-md-injection](./2026-05-20-rules-md-injection.md) — rules.md Read 強制の identity priming 方式を確立。本 ADR はその「読まない確率的 skip」への追加対策として位置づける。
- [2026-05-05-agent-runner-port-and-local-runtime](./2026-05-05-agent-runner-port-and-local-runtime.md) — `AgentRunContext` ポートの初期定義。本 ADR で `followUpPrompt` を追加。
