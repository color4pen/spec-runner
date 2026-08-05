# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: SDK 型定義の確認

`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`（行 3127–3169）を読んで確認した。

- `SDKResultSuccess`（行 3149）: `num_turns`, `duration_ms`, `duration_api_ms`, `total_cost_usd`, `modelUsage`, `session_id` をすべて持つ。いずれも non-optional。
- `SDKResultError`（行 3127）: `num_turns`, `duration_ms`, `duration_api_ms`, `total_cost_usd`, `modelUsage`, `session_id` をすべて持つ。

→ request の「SDK が返す値」の前提はすべて正確。

### Step 2: adapter のローカル型とコード

**`src/adapter/claude-code/agent-runner.ts:368–375`**  
`SDKResultMessage` が `[key: string]: unknown` を持ち、`SDKResultSuccess` はそれを継承。宣言フィールドは `result / session_id / modelUsage` のみ（request 記載通り）。

**`src/adapter/claude-code/agent-runner.ts:828–844`**  
`lastResult.subtype === "success"` 分岐で `modelUsage` と `session_id` のみ取り出し。`num_turns` / `duration_ms` / `duration_api_ms` / `total_cost_usd` は取り出していない（request の前提通り）。

エラー分岐（810–824）は `subtype !== "success"` で早期 return。metrics は一切取り出さず。

**`src/adapter/claude-code/query-one-shot.ts:177–196`**  
`modelUsage` のみ抽出し、残 4 値は捨てている（request 記載通り）。

**`src/core/port/agent-runner.ts:205–245`**（`AgentRunResult`）  
`numTurns`, `durationMs`, `durationApiMs`, `totalCostUsd` フィールドは存在しない（要追加対象）。  
`turnCount?: number` が `QueryOneShotResult`（query-one-shot.ts:75）に既に "Reserved for future use" として宣言されていることを確認。

### Step 3: 型スキーマと集計コード

**`src/core/usage/types.ts:9–20`**（`CommandInvocation`）  
`command / timestamp / modelUsage / jobId / stepName` のみ。metrics フィールドなし（request 記載通り）。

**`src/core/usage/store.ts:42`**（`appendInvocation`）  
append-only で確認。

**`src/core/step/commit-orchestrator.ts:233`**  
`appendInvocation` 呼び出し確認。success path のみ（`applySuccessPostPersistEffects`）。halt/error path からは呼ばれない。

**`src/core/command/job-stats.ts:147–170`**（costUsd 算出）  
`computeCostUsd` の総和。null を除外する設計を行 158–165 で確認。doc comment（行 85）も "sum of computeCostUsd for all non-null modelUsage entries" と一致。

**`src/core/usage/pricing.ts:38–172`**（単価表）  
`claude-opus-5` / `claude-sonnet-5` / `claude-fable-5` のエントリなしを grep で確認。`computeCostUsd` は行 210–212 で `lookupPricing` が null なら null を返す（request 記載通り）。

**`src/adapter/managed-agent/usage.ts:22–24`**  
`ephemeral_1h_input_tokens + ephemeral_5m_input_tokens` を `cacheCreationInputTokens` に平坦化（行 22–24 が該当。request は "23–24" と記載、実態は 22–24 だが内容は一致）。

### Step 4: queryOneShot の production 呼び出し元調査

`queryOneShot` の import を src 以下でフルサーチした結果、**production コードからのインポートはゼロ**であることを確認（テストファイルのみ）。  
request の背景節「この経路は `request-review` / `request-generate` コマンドが使う」は現状コードでは不正確：  
- `request-generate` は TC-013 で削除済（`prompt-skeleton-drift-guard.test.ts` の TC-028 コメントが確認）。  
- `request-review` はパイプライン step として `ClaudeCodeRunner` 経由で実行（`RequestReviewStep` を確認）。queryOneShot は使っていない。  
ただしこれは背景の説明誤りであり、要件・受け入れ基準自体への影響はない。

### Step 5: `usage show` / `job stats` の現状確認

**`src/core/command/usage-show.ts`**  
invocation ごとに `modelUsage` のみ出力。metrics 行なし（追加対象）。

**`src/core/command/job-stats.ts`**  
`JobStatRow` に `numTurns` フィールドなし。costUsd は静的単価表のみ（追加対象）。

## 検証できなかった項目

None — すべての前提コードアサーションを直接 Read/Grep で確認した。

## Findings 詳細

### Obs-1: `queryOneShot` の production 呼び出し元不在（severity: low）

背景節が「request-review / request-generate の invocation にも metrics が載る」と述べているが、現状 `queryOneShot` は production から呼ばれていない。受け入れ基準 3 の「`query-one-shot` 経路でも同じ 4 値が**記録**されることをテストで固定する」は、実装者が「`QueryOneShotResult` として返す（unit テスト対象）」と理解すれば成立する。usage.json への記録は req 4（commit-orchestrator）経由であり、req 3 の記録はファンクション戻り値レベルと解釈することが整合する。実装者は この解釈が意図通りか確認することを推奨するが、ブロッキングではない。

### Obs-2: error subtype の metrics が usage.json に到達しない可能性（severity: low）

受け入れ基準 2 が「success / error 双方の subtype について検証する」と述べる一方、`appendInvocation` は `applySuccessPostPersistEffects`（success path）からのみ呼ばれる。エラー時は step が halt して commit-orchestrator を経由しないため、error subtype から抽出した metrics は `AgentRunResult` に乗るが usage.json には記録されない設計になる可能性がある。AC 2 の「記録される」が「抽出されて AgentRunResult に載る」なのか「usage.json に書かれる」なのかを実装前に確認することを推奨するが、要件文を素直に読めば前者（adapter テスト = 抽出のテスト）が意図と解せるため、ブロッキングではない。
