## Why

`specrunner finish` の Phase 0 で `openspec validate --strict` が delta spec を弾くケースが複数発生している（PR #145, #147）。propose agent の system prompt に openspec validate のルールが含まれていないため、agent は delta spec の書式制約を知らないまま生成している。具体的には requirement 本文に `SHALL`/`MUST` が欠落するケースと、requirement ヘッダーと `#### Scenario:` の間にコードブロックが挿入されるケースが確認されている。

## What Changes

- `src/prompts/propose-system.ts` の `PROPOSE_SYSTEM_PROMPT` に openspec validate の必須ルールセクションを追記する
  - requirement 本文に英語の `SHALL` または `MUST` を含める規約
  - requirement ヘッダーと `#### Scenario:` の間にコードブロックを挟まない規約
  - 各 requirement に最低 1 つの `#### Scenario:` ブロックが必要である規約
- 既存の prompt 構造は維持し、末尾への追記のみとする

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `propose-session`: propose agent の system prompt に openspec validate ルールを追加する requirement を変更

## Impact

- `src/prompts/propose-system.ts` — system prompt の末尾にルールセクションを追記
- propose agent が生成する delta spec の品質向上（validation error の削減）
- 既存テストへの影響: prompt 文字列のスナップショットテストがあれば更新が必要
