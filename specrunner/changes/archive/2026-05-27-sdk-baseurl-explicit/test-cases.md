# Test Cases: sdk-baseurl-explicit

## TC-01: createAnthropicClient が baseURL を明示する

- **Category**: Unit
- **Priority**: must
- **Source**: T-01, 受け入れ基準

```
GIVEN `ANTHROPIC_BASE_URL` が未設定の環境で
WHEN  `createAnthropicClient(apiKey)` を呼び出したとき
THEN  返却された Anthropic インスタンスの `baseURL` が `"https://api.anthropic.com"` である
```

## TC-02: createAnthropicClient が ANTHROPIC_BASE_URL を無視する

- **Category**: Security / Unit
- **Priority**: must
- **Source**: request.md 背景, design.md 方針

```
GIVEN `ANTHROPIC_BASE_URL=https://evil.example.com` が設定された環境で
WHEN  `createAnthropicClient(apiKey)` を呼び出したとき
THEN  返却された Anthropic インスタンスの `baseURL` が `"https://api.anthropic.com"` のままである
AND   `https://evil.example.com` には接続しない
```

## TC-03: createAnthropicClientAdapter が baseURL を明示する

- **Category**: Unit
- **Priority**: must
- **Source**: T-02, 受け入れ基準

```
GIVEN `ANTHROPIC_BASE_URL` が未設定の環境で
WHEN  `createAnthropicClientAdapter(apiKey)` を呼び出したとき
THEN  内部で生成された Anthropic インスタンスの `baseURL` が `"https://api.anthropic.com"` である
```

## TC-04: createAnthropicClientAdapter が ANTHROPIC_BASE_URL を無視する

- **Category**: Security / Unit
- **Priority**: must
- **Source**: request.md 背景, design.md 方針

```
GIVEN `ANTHROPIC_BASE_URL=https://evil.example.com` が設定された環境で
WHEN  `createAnthropicClientAdapter(apiKey)` を呼び出したとき
THEN  内部で生成された Anthropic インスタンスの `baseURL` が `"https://api.anthropic.com"` のままである
AND   `https://evil.example.com` には接続しない
```

## TC-05: typecheck が通る

- **Category**: Static Analysis
- **Priority**: must
- **Source**: T-03, 受け入れ基準

```
GIVEN 変更後のコードで
WHEN  `bun run typecheck` を実行したとき
THEN  exit code が 0 である
```

## TC-06: 既存テストが壊れない

- **Category**: Regression
- **Priority**: must
- **Source**: T-03, 受け入れ基準

```
GIVEN 変更後のコードで
WHEN  `bun run test` を実行したとき
THEN  exit code が 0 である（既存テストがすべて pass する）
```

## TC-07: managed-agents beta ヘッダーが保持される

- **Category**: Unit / Regression
- **Priority**: should
- **Source**: design.md「既存テストは破壊されない」

```
GIVEN `createAnthropicClient(apiKey)` を呼び出したとき
WHEN  返却された client でリクエストを送信したとき
THEN  `anthropic-beta: managed-agents-2026-04-01` ヘッダーが付与されている
AND   `baseURL` の追加によってヘッダーが欠落していない
```

## TC-08: apiKey が SDK に渡される

- **Category**: Unit / Regression
- **Priority**: should
- **Source**: design.md「SDK 呼び出しの引数追加のみ」

```
GIVEN 有効な apiKey で `createAnthropicClient(apiKey)` を呼び出したとき
WHEN  返却された client の初期化パラメータを確認したとき
THEN  `apiKey` が Anthropic インスタンスに渡されている
AND   `baseURL` の追加によって `apiKey` が上書き・欠落していない
```

## TC-09: createAnthropicClientAdapter の apiKey が SDK に渡される

- **Category**: Unit / Regression
- **Priority**: should
- **Source**: design.md「SDK 呼び出しの引数追加のみ」

```
GIVEN 有効な apiKey で `createAnthropicClientAdapter(apiKey)` を呼び出したとき
WHEN  内部で生成された Anthropic インスタンスの初期化パラメータを確認したとき
THEN  `apiKey` が Anthropic インスタンスに渡されている
AND   `baseURL` の追加によって `apiKey` が上書き・欠落していない
```
