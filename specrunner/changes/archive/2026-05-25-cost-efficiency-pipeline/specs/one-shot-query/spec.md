# one-shot-query Specification (delta)

## Requirements

### Requirement: OneShotQueryResult に modelUsage を含める

`OneShotQueryResult` SHALL include a `modelUsage` field that returns per-model token usage from the LLM invocation.

#### Scenario: SDK result に modelUsage がある場合

- WHEN `queryOneShot()` を実行する
- AND SDK の `SDKResultSuccess` に `modelUsage` が含まれる (model 名 → token 数の mapping)
- THEN `OneShotQueryResult.modelUsage` に `Record<string, ModelUsage>` が設定される
- AND 各 model の `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens` が正しく mapping される

#### Scenario: SDK result に modelUsage がない場合

- WHEN `queryOneShot()` を実行する
- AND SDK の `SDKResultSuccess` に `modelUsage` が含まれない (undefined or 空オブジェクト)
- THEN `OneShotQueryResult.modelUsage` は `undefined` になる

#### Scenario: port interface の型互換性

- WHEN `OneShotQueryClient.run()` を呼び出す
- THEN 戻り値の `OneShotQueryResult` に optional `modelUsage?: Record<string, ModelUsage>` field がある
- AND 既存の `text`, `sessionId`, `turnCount`, `stopReason` field に変更はない
