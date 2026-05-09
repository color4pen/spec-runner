# Test Cases: timeout-config-fixes

Generated from: proposal.md, design.md, tasks.md

## TC-016r: validateConfig — timeoutMs: 0 は有効値として通過する

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md §3.1, acceptance criteria

```
GIVEN validateConfig に steps.defaults.timeoutMs: 0 を含む config を渡す
WHEN validateConfig を実行する
THEN エラーが throw されない（CONFIG_INVALID にならない）
```

---

## TC-020: validateConfig — timeoutMs: -1 は CONFIG_INVALID

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md §3.2, design.md D3

```
GIVEN validateConfig に steps.defaults.timeoutMs: -1 を含む config を渡す
WHEN validateConfig を実行する
THEN CONFIG_INVALID エラーが throw される
```

---

## TC-021: validateConfig — step 固有の timeoutMs: 0 も有効値として通過する

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md §3.1

```
GIVEN validateConfig に steps.implementer.timeoutMs: 0 を含む config を渡す
WHEN validateConfig を実行する
THEN エラーが throw されない
```

---

## TC-022: validateConfig — step 固有の timeoutMs: -5 は CONFIG_INVALID

- **Category**: correctness
- **Priority**: must
- **Source**: design.md D3

```
GIVEN validateConfig に steps.implementer.timeoutMs: -5 を含む config を渡す
WHEN validateConfig を実行する
THEN CONFIG_INVALID エラーが throw される
```

---

## TC-024: getStepExecutionConfig — timeoutMs: 0 が 0 のまま解決される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md §3.3, design.md D2

```
GIVEN config.steps.defaults.timeoutMs: 0 が設定された config で getStepExecutionConfig を呼ぶ
WHEN implementer ステップの設定を解決する
THEN resolved.timeoutMs === 0 が返される（null や DEFAULT_POLL_TIMEOUT_MS にならない）
```

---

## TC-025: getStepExecutionConfig — step 固有 timeoutMs: 0 が defaults の正数より優先される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md §3.3, acceptance criteria "ステップ固有の設定が defaults を上書きする"

```
GIVEN config.steps.defaults.timeoutMs: 600000、steps.implementer.timeoutMs: 0 が設定された config
WHEN implementer ステップの設定を getStepExecutionConfig で解決する
THEN resolved.timeoutMs === 0 が返される
```

---

## TC-026: resolveTimeout — timeoutMs: 0 は null に変換される (SSE fallback path)

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md §3.4, design.md D2, agent-runner.ts L176

```
GIVEN resolvedConfig.timeoutMs が 0 の場合（SSE disconnected → polling fallback パス）
WHEN agent-runner が polling timeout を解決する
THEN pollUntilComplete に渡される timeoutMs は null になる（タイムアウトなし）
```

---

## TC-027: resolveTimeout — timeoutMs: 0 は null に変換される (direct poll path)

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md §3.4, design.md D2, agent-runner.ts L355

```
GIVEN resolvedConfig.timeoutMs が 0 の場合（直接ポーリングパス）
WHEN agent-runner が polling timeout を解決する
THEN pollUntilComplete に渡される timeoutMs は null になる（タイムアウトなし）
```

---

## TC-028: resolveTimeout — timeoutMs: null は DEFAULT_POLL_TIMEOUT_MS にフォールバックする

- **Category**: correctness
- **Priority**: must
- **Source**: design.md "Non-Goals: null を config で直接書いてもタイムアウト無効にならない"

```
GIVEN resolvedConfig.timeoutMs が null の場合（step に timeoutMs 未設定）
WHEN agent-runner が polling timeout を解決する
THEN pollUntilComplete に渡される timeoutMs は DEFAULT_POLL_TIMEOUT_MS（15 分 = 900000ms）になる
```

---

## TC-029: resolveTimeout — 正の timeoutMs はそのまま渡される

- **Category**: correctness
- **Priority**: must
- **Source**: 既存動作の維持

```
GIVEN resolvedConfig.timeoutMs が 30000 の場合
WHEN agent-runner が polling timeout を解決する
THEN pollUntilComplete に渡される timeoutMs は 30000 になる
```

---

## TC-030: validateConfig — timeoutMs のエラーメッセージが non-negative を示す

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md §1.2, design.md D3

```
GIVEN validateConfig に steps.defaults.timeoutMs: -1 を含む config を渡す
WHEN validateConfig が CONFIG_INVALID を throw する
THEN エラーメッセージに "non-negative" が含まれる
```

---

## TC-031: validateConfig — timeoutMs: 1 は下限として有効

- **Category**: correctness
- **Priority**: should
- **Source**: design.md D3 境界値

```
GIVEN validateConfig に steps.defaults.timeoutMs: 1 を含む config を渡す
WHEN validateConfig を実行する
THEN エラーが throw されない
```

---

## TC-032: 既存動作維持 — steps 未設定時は DEFAULT_POLL_TIMEOUT_MS が使われる

- **Category**: correctness
- **Priority**: must
- **Source**: acceptance criteria "defaults が未設定の場合は既存動作（ハードコードデフォルト 15 分）が維持される"

```
GIVEN config.steps に timeoutMs の設定がない
WHEN agent-runner が polling timeout を解決する
THEN pollUntilComplete に渡される timeoutMs は DEFAULT_POLL_TIMEOUT_MS（900000ms）になる
```

---

## TC-033: typecheck が通る

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md §4.1

```
GIVEN 修正済みのソースコード一式
WHEN bun run typecheck を実行する
THEN 型エラーが 0 件で終了する
```

---

## TC-034: テストスイートが green

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md §4.2

```
GIVEN 修正済みのソースコードと更新済みテスト一式
WHEN bun run test を実行する
THEN 全テストが PASS する
```
