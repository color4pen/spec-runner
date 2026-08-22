# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. 既存 ModelUsage の定義確認

`src/kernel/model-usage.ts` を読み、`ModelUsage` が `inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheCreationInputTokens` の 4 フィールドで構成されることを確認した。request.md の記載と一致する。

### 2. 既存 invocation metrics の確認

`src/core/port/agent-runner.ts` の `AgentInvocationMetrics` インターフェースを確認。`numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd` が定義されており、request.md の「Claude Code では加えて取得している」という記述と一致する。

### 3. ModelUsage が cumulative invocation 値であることの確認

`src/adapter/claude-code/agent-runner.ts` を読み、`extractedModelUsage` が main work turn だけでなく follow-up turn / output repair turn の `modelUsage` を加算していることを確認した（L1083–1096, L1133–1145）。これはあくまで複数の SDK query invocation を合計した値であり、「その時点の active context size」ではない、という request.md の主張は正確である。

### 4. 永続経路の確認

`src/core/usage/types.ts` (`CommandInvocation`), `src/core/step/commit-orchestrator.ts` (`applySuccessPostPersistEffects`), `src/core/usage/store.ts` (`appendInvocation`) を確認した。  
- `StepRun.modelUsage` → `state.json` の `steps` フィールド（ジョブ状態として永続）
- `CommandInvocation` → `usage.json`（append-only、step/model 単位の集計に使用）  
  
どちらも job 完了後に確認できる永続形式であり、request.md が「既存の usage / invocation metrics の責務と同じ観測経路」を求めていることと整合する。

### 5. プロバイダーアダプターの現状確認

以下の 3 アダプターを確認した。

| アダプター | 現状 |
|-----------|------|
| `ClaudeCodeRunner` (claude-code) | modelUsage + AgentInvocationMetrics を返す |
| `CodexAgentRunner` (codex) | 独自の `CodexUsage` 型から modelUsage を抽出 |
| `ManagedAgentRunner` (managed-agent) | `SessionClient.getSessionUsage()` 経由で `SessionUsage` を取得 |

3 つのアダプターが存在しており、request.md 要件 3 では "Claude / Codex" と 2 アダプターのみ明示している。managed-agent は「取得不能 → undefined」の原則で暗黙的にカバーされる（詳細は Findings 参照）。

### 6. context 関連フィールドの不在確認

`contextWindow`, `compaction`, `activeContext`, `peakActiveContext`, `exhaustion` などに一致するシンボルが `src/` 全体に存在しないことを grep で確認した。request.md の「現状では測定できない」という前提は正確である。

### 7. スコープ外事項の確認

- 閾値決定: 要件に含まれず（scope 外） ✓  
- fresh session rollover (#1058): 要件に含まれず（scope 外） ✓  
- provider native compaction policy の上書き: 要件に含まれず（scope 外） ✓

## 検証できなかった項目

- **Claude Code SDK / Codex SDK が実際に context window 関連のイベント・フィールドを現時点で公開しているかどうか**: request.md は "provider SDK / stream event / result が明示的に返す値を優先" と記載しており、取得できない場合は `undefined` と規定しているため、SDK が現在公開していなくても要件定義として問題はない。ただし、具体的な SDK field 名・event 名は design 段階で調査が必要。

## Findings 詳細

**低重要度の観察事項のみ。ブロッカーなし。**

### OBS-1: managed-agent アダプターの明示的言及がない

要件 3 の "Claude / Codex で context や compaction の通知方法が異なることを前提とする" は 2 アダプターのみ例示しているが、実際には `ManagedAgentRunner` という 3 つ目の本番アダプターが存在する。  
ただし "取得不能な provider / SDK では undefined" という要件が managed にも自然に適用されるため、設計・実装上のリスクは低い。design step で managed-agent の扱いを明確にすれば十分。

### OBS-2: 受け入れ条件の "typecheck / test green" が前提条件として機能する

"typecheck / test green" という AC は、既存の `ModelUsage` / `CommandInvocation` / `AgentRunResult` / `StepRun` に新しい optional フィールドを追加することで満たせる。型設計の段階で breaking change を避けることが実装成功の鍵となる。これは設計上の注意点であり、request の問題ではない。
