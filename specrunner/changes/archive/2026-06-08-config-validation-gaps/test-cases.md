# Test Cases: config-validation-gaps

## Summary

- **Total**: 35 cases
- **Automated** (unit/integration): 32
- **Manual**: 3
- **Priority**: must: 26, should: 9, could: 0

---

### TC-001: validateConfig — agents が非 object のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: must
**Source**: design.md D1 / tasks.md T1.1

**GIVEN** `agents: "x"` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-002: validateConfig — agents エントリ値が非 object のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: must
**Source**: design.md D1 / tasks.md T1.1

**GIVEN** `agents: { design: "x" }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-003: validateConfig — agents エントリの agentId が非 string のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: must
**Source**: design.md D1 / tasks.md T1.1

**GIVEN** `agents: { design: { agentId: 123, definitionHash: "h", lastSyncedAt: "t" } }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-004: validateConfig — agents エントリの definitionHash が非 string のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: should
**Source**: design.md D1 / tasks.md T1.1

**GIVEN** `agents: { design: { agentId: "a", definitionHash: null, lastSyncedAt: "t" } }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-005: validateConfig — agents エントリの lastSyncedAt が非 string のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: should
**Source**: design.md D1 / tasks.md T1.1

**GIVEN** `agents: { design: { agentId: "a", definitionHash: "h", lastSyncedAt: 0 } }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-006: validateConfig — agents に有効なエントリが含まれるとき throw しない

**Category**: unit
**Priority**: must
**Source**: design.md D1 / tasks.md T1.1

**GIVEN** `agents: { design: { agentId: "a", definitionHash: "h", lastSyncedAt: "2026-01-01T00:00:00.000Z" } }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** エラーを throw しない

---

### TC-007: validateConfig — agents が空 object のとき throw しない

**Category**: unit
**Priority**: should
**Source**: design.md D1 / tasks.md T1.1

**GIVEN** `agents: {}` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** エラーを throw しない

---

### TC-008: validateConfig — agents が未設定のとき throw しない（後方互換）

**Category**: unit
**Priority**: must
**Source**: design.md D1 / tasks.md T1.1

**GIVEN** `agents` キーを含まない最小 config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** エラーを throw しない

---

### TC-009: validateConfig — environment が非 object のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T1.2

**GIVEN** `environment: "prod"` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-010: validateConfig — environment.id が非 string のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T1.2

**GIVEN** `environment: { id: 42, lastSyncedAt: "t" }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-011: validateConfig — environment.lastSyncedAt が非 string のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: should
**Source**: design.md D2 / tasks.md T1.2

**GIVEN** `environment: { id: "e", lastSyncedAt: null }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-012: validateConfig — environment に有効な値が含まれるとき throw しない

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T1.2

**GIVEN** `environment: { id: "env-1", lastSyncedAt: "2026-01-01T00:00:00.000Z" }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** エラーを throw しない

---

### TC-013: validateConfig — environment が未設定のとき throw しない（後方互換）

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T1.2

**GIVEN** `environment` キーを含まない最小 config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** エラーを throw しない

---

### TC-014: validateConfig — specReview.pollIntervalMs = 0 のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: must
**Source**: design.md D3 / tasks.md T1.3

**GIVEN** `specReview: { pollIntervalMs: 0 }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-015: validateConfig — specReview.pollIntervalMs が負数のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: should
**Source**: design.md D3 / tasks.md T1.3

**GIVEN** `specReview: { pollIntervalMs: -1 }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-016: validateConfig — specReview.pollIntervalMs が非整数のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: should
**Source**: design.md D3 / tasks.md T1.3

**GIVEN** `specReview: { pollIntervalMs: 1.5 }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-017: validateConfig — specReview.pollIntervalMs が文字列のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: should
**Source**: design.md D3 / tasks.md T1.3

**GIVEN** `specReview: { pollIntervalMs: "10000" }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-018: validateConfig — specReview.pollIntervalMs が正の整数のとき throw しない

**Category**: unit
**Priority**: must
**Source**: design.md D3 / tasks.md T1.3

**GIVEN** `specReview: { pollIntervalMs: 10000 }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** エラーを throw しない

---

### TC-019: validateConfig — specReview.pollIntervalMs が未設定のとき throw しない

**Category**: unit
**Priority**: must
**Source**: design.md D3 / tasks.md T1.3

**GIVEN** `specReview: {}` を含む config raw object（pollIntervalMs キー不在）
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** エラーを throw しない

---

### TC-020: validateConfig — specReview セクション自体が未設定のとき throw しない

**Category**: unit
**Priority**: must
**Source**: design.md D3 / tasks.md T1.3

**GIVEN** `specReview` キーを含まない最小 config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** エラーを throw しない

---

### TC-021: validateConfig — pipeline が非 object（文字列）のとき CONFIG_INVALID を throw する

**Category**: unit
**Priority**: must
**Source**: design.md D4 / tasks.md T1.4

**GIVEN** `pipeline: "fast"` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-022: validateConfig — pipeline.maxRetries が範囲外のとき既存エラーが throw される（回帰）

**Category**: unit
**Priority**: must
**Source**: design.md D4 / tasks.md T1.4

**GIVEN** `pipeline: { maxRetries: 0 }` を含む config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** エラーが throw される（object ガード追加後も maxRetries 既存チェックが機能する）

---

### TC-023: loadCredentials — github.token が有効な credentials を返す

**Category**: unit
**Priority**: must
**Source**: design.md D6 / tasks.md T2.1

**GIVEN** `{ "github": { "token": "ghp_x" } }` を内容とする credentials.json が存在する
**WHEN** `loadCredentials()` を呼ぶ
**THEN** `{ github: { token: "ghp_x" } }` を返す（throw しない）

---

### TC-024: loadCredentials — anthropic-only credentials（github キー不在）は throw しない

**Category**: unit
**Priority**: must
**Source**: design.md D6 / tasks.md T2.1

**GIVEN** `{ "anthropic": { "apiKey": "sk-x" } }` を内容とする credentials.json が存在する
**WHEN** `loadCredentials()` を呼ぶ
**THEN** throw せず anthropic のみ含むオブジェクトを返す

---

### TC-025: loadCredentials — github.token が string でない（数値）とき throw する

**Category**: unit
**Priority**: must
**Source**: design.md D6 / tasks.md T2.1

**GIVEN** `{ "github": { "token": 123 } }` を内容とする credentials.json が存在する
**WHEN** `loadCredentials()` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-026: loadCredentials — github が存在するが token キーが無いとき throw する

**Category**: unit
**Priority**: should
**Source**: design.md D6 / tasks.md T2.1

**GIVEN** `{ "github": {} }` を内容とする credentials.json が存在する
**WHEN** `loadCredentials()` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-027: loadCredentials — github が object でない（文字列）とき throw する

**Category**: unit
**Priority**: should
**Source**: design.md D6 / tasks.md T2.1

**GIVEN** `{ "github": "x" }` を内容とする credentials.json が存在する
**WHEN** `loadCredentials()` を呼ぶ
**THEN** `code === "CONFIG_INVALID"` のエラーが throw される

---

### TC-028: loadCredentials — malformed JSON のとき `{}` を返す（throw しない）

**Category**: unit
**Priority**: must
**Source**: design.md D6 / tasks.md T2.1

**GIVEN** `"{ not json"` を内容とする credentials.json が存在する
**WHEN** `loadCredentials()` を呼ぶ
**THEN** `{}` を返す（後方互換、throw しない）

---

### TC-029: loadCredentials — ファイルが存在しないとき `{}` を返す

**Category**: unit
**Priority**: must
**Source**: design.md D6 / tasks.md T2.1

**GIVEN** credentials.json が存在しない
**WHEN** `loadCredentials()` を呼ぶ
**THEN** `{}` を返す（throw しない）

---

### TC-030: cancel sidecar の jobId が非 string（数値）のとき convention パスへフォールスルーし throw しない

**Category**: unit
**Priority**: must
**Source**: design.md D7 / tasks.md T2.2, T3.3

**GIVEN** liveness sidecar に `{ jobId: 999, worktreePath: "/wt/foo" }` が書かれている（jobId が数値）
**WHEN** `resolveWorktreePathForJob` 経由で worktree パスを解決しようとする
**THEN** sidecar の `worktreePath` を採用せず convention パスへフォールスルーし、エラーを throw しない

---

### TC-031: resume sidecar の pid が非 number（文字列）のとき isStaleRunning が stale を返す

**Category**: unit
**Priority**: must
**Source**: design.md D8 / tasks.md T2.3, T3.4

**GIVEN** sidecar に `{ pid: "123" }` が書かれている（pid が文字列）
**WHEN** `isStaleRunning(state, sidecarPath)` を呼ぶ
**THEN** `true`（stale）を返す（既存の typeof チェックが機能することの回帰確認）

---

### TC-032: validateConfig — agents / environment 未設定の既存 valid config が引き続き通る（後方互換回帰）

**Category**: unit
**Priority**: must
**Source**: design.md D12 / tasks.md T5.3

**GIVEN** agents / environment を含まない既存の最小 valid config raw object
**WHEN** `validateConfig(raw)` を呼ぶ
**THEN** エラーを throw せず SpecRunnerConfig を返す

---

### TC-033: bun run typecheck が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T5.1

**GIVEN** 全変更が適用済みの状態
**WHEN** `bun run typecheck` を実行する
**THEN** 型エラーが 0 件で終了する

---

### TC-034: bun run test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T5.2, T5.3

**GIVEN** 全変更が適用済みの状態
**WHEN** `bun run test` を実行する
**THEN** 新規テストおよび既存テストが全て pass する

---

### TC-035: bun run lint が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T5.2

**GIVEN** 全変更が適用済みの状態
**WHEN** `bun run lint` を実行する
**THEN** lint エラーが 0 件で終了する

---

## Result

```yaml
result: completed
total: 35
automated: 32
manual: 3
must: 26
should: 9
could: 0
blocked_reasons: []
```
