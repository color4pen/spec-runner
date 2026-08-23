# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### spec ファイル読込

- `request.md` — 受け入れ条件 11 件、スコープ外 8 件、実装イメージを全読
- `design.md` — D1〜D9（9 決定）の rationale・代替案を全読
- `spec.md` — 8 Requirement・14 Scenario を全読
- `tasks.md` — T-01〜T-09（9 タスク）の項目・Acceptance Criteria を全読
- `test-cases.md` — TC-001〜TC-034（34 件）を全読

### ソースコード照合

| 確認箇所 | 確認内容 |
|---|---|
| `src/adapter/claude-code/context-observer.ts` | `isContextExhaustionError()` が allowlist 3 文字列（`prompt is too long` / `context length exceeded` / `context window exceeded`）を fail-closed で照合する実装を確認。`markExhaustion()` が観測値ゼロなら `exhaustionAtTokens` を書かない設計を確認 |
| `src/adapter/claude-code/agent-runner.ts` L986-1006 | 現行の non-success error result 経路が `CLAUDE_CODE_QUERY_FAILED` に潰されること、`errors[]` の本文が捨てられることを確認。T-02 が修正対象とする箇所と一致 |
| `src/adapter/claude-code/agent-runner.ts` L1312-1329 | throw 経路でも `CLAUDE_CODE_QUERY_FAILED` に潰されることを確認。T-02 が修正対象とする箇所と一致 |
| `src/adapter/claude-code/agent-runner.ts` L800-807 | `resumeFallbackDone` latch の実装を確認。D6 が言及する "既存の resume→fresh fallback が二重発火しないようその latch を立てる" の対象として存在する |
| `src/adapter/claude-code/agent-runner.ts` L939-964 | 現行の main work 実行単位（`maxRetries === 0` の直接呼び出し / `retryWithBackoff`）を確認。T-04 の rollover ループはこの直外に置く設計と一致 |
| `src/adapter/shared/transient-error.ts` | `TRANSIENT_TOKENS` に context exhaustion 文字列が含まれないことを確認（fail-closed — D2 の根拠）。本変更での変更禁止が spec.md Requirement「context exhaustion 以外の失敗は〜」の Acceptance Criteria と整合 |
| `src/core/port/agent-runner.ts` | `AgentRunResult` に `sessionRollovers` フィールドが未存在（T-05 が追加する対象）。`AgentRunner.run()` のインターフェース契約を確認。`emit` は `Record<string, unknown>` payload で型が弱いため `step:rollover` payload の型チェックは実行時のみ |
| `src/kernel/event-types.ts` | `DomainEvent` に `"step:rollover"` が未存在（T-05 が追加する対象）。`"step:retry"` が存在することで T-05 の参照モデルを確認 |
| `src/core/event/types.ts` | `EventPayloadMap` に `"step:rollover"` エントリが未存在（T-05 が追加する対象）。`"step:retry"` エントリが参照モデルとして存在する |
| `src/core/step/step-halt.ts` | `makeNonSuccessHalt` / `makeTimeoutHalt` が `Pick<AgentRunResult, "error" | "contextMetrics">` を受け取り、code を透過することを確認。T-06 は `sessionRollovers` を同 Pick に追加する設計と一致 |
| `src/core/step/commit-orchestrator.ts` L556-579 | halt 経路での `contextOnly: true` エントリ追記パターン（best-effort try/catch）を確認。T-06 の rollover 分追記はこのパターンを踏襲する |
| `src/config/schema/types.ts` | `TransientRetryConfig` と `SpecRunnerConfig.transientRetry` の構造を確認。T-01 の `ContextRolloverConfig` / `contextRollover` は同じスタイルで追加される |
| `src/config/schema/resolution.ts` | `resolveTransientRetryConfig` の実装パターンを確認。T-01 の `resolveContextRolloverConfig` はこれを模倣する |
| `src/config/schema/validation.ts` L441-458 | `transientRetry` の zod スキーマ（`optional(object({...gte(0)...}))` パターン）を確認。T-01 の `contextRollover` バリデーションは同形 |
| `tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts` | T-07 が参照する既存 integration test が存在することを確認（L1-50 読込） |
| `src/adapter/claude-code/completion-directive.ts` | D5 が参照する completion directive の構造（prompt 末尾に置く）を確認 |
| `docs/configuration.md` / `docs/operations.md` | T-08 が対象とする両ファイルが存在することを確認 |

### 受け入れ条件 × spec Scenario の網羅確認

request.md の受け入れ条件 11 件について、spec.md の Scenario / test-cases.md の TC とのトレーサビリティを全確認。

| 受け入れ条件 | 対応 Scenario / TC |
|---|---|
| errors[] の typed 判別 | TC-001 |
| SDK throw 経路の typed 判別 | TC-003 |
| fresh session 開始・resume 無し | TC-004 |
| rollover prompt の 4 要素 | TC-006 |
| rollover 後 1 回だけ commit | TC-007 |
| 回数上限で typed halt | TC-008, TC-009 |
| 非 exhaustion は rollover しない | TC-010 |
| transient retry 既存挙動不変 | TC-011 |
| error 詳細がログに残る | TC-012 |
| metrics 合成せず observation として残る | TC-013, TC-014, TC-015 |
| 既存テスト green | TC-033, TC-034 |

### セキュリティ観点

- rollover 継続セクションはテンプレート生成（ユーザー入力を含まない）。プロンプトインジェクションリスクなし。
- `maxRollovers` に `gte(0)` + `int` バリデーションを指定（T-01）。負値・非整数・非オブジェクトが拒否されることが TC-017, TC-019, TC-020 で検証される。
- rollover 回数を `maxRollovers` で bound することで、context 枯渇による意図しない無限ループを防止。
- `isContextExhaustionError()` の fail-closed 設計により、未知エラーは rollover しない（degrade → 従来 halt のみ）。
- エフェメラルランナー上のデータ漏洩経路に変化なし（worktree の扱いは既存契約と同一）。

## 検証できなかった項目

- `agent-runner.ts` の full body（約 1340 行）のうち follow-up / outputVerification / output repair 経路（L1060〜L1200 付近）の typed code 適用（D8）。コード量が大きく部分確認のみ。ただし T-02 の Acceptance Criteria に "follow-up query 失敗分岐でも同じ述語を適用して code を typed 化する" が明示されているため spec 上は十分。
- `CommitOrchestrator.applySuccessPostPersistEffects` の全実装（success 経路での `contextOnly` 追記）。関連箇所（halt 経路 L556-579）でパターンを確認したが、success 経路の対応関数は未読。

## Findings 詳細

### F-1: tasks.md T-04 の Acceptance Criteria が存在しないテストパスを参照している

T-04 Acceptance Criteria に「既存 adapter テスト（`agent-runner.test.ts` / **`agent-runner-transient-retry.test.ts`** / `agent-runner-inactivity-timeout.test.ts` / **`agent-runner-report-settles.test.ts`**）が無変更で green」と記載されているが、参照パスが誤っている。

実際のファイル位置:
- 参照: `tests/unit/adapter/claude-code/agent-runner-transient-retry.test.ts` — **存在しない**
- 実在: `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts`
- 参照: `tests/unit/adapter/claude-code/agent-runner-report-settles.test.ts` — **存在しない**
- 実在: `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts`

存在が確認できた `tests/unit/adapter/claude-code/agent-runner-inactivity-timeout.test.ts` と `agent-runner.test.ts` はパスが正しい。

影響: 実装者が "Acceptance Criteria を満たす確認" をしようとしても対象ファイルが見つからず、誤ったファイルを対象として検証するリスクがある。修正方法: tasks.md T-04 Acceptance Criteria の 2 パスを `src/adapter/claude-code/__tests__/` 配下に修正する。

### F-2: T-04 と T-05 にまたがる rollover 実行シーケンスの暗黙的な順序依存

rollover ループ実装は T-04（状態リセット）と T-05（observer 差し替え・snapshot）で分割されているが、`extractedSessionId` の利用順序に潜在的な罠がある。

T-05 は rollover 時の処理を次の順序で記述する:
1. 旧 observer に `markExhaustion()` → `snapshot()`
2. `sessionRollovers` に push（`sessionId: 捨てる session の ID があれば設定`）
3. 新 observer に差し替え

T-04 は同一の rollover 実行ブロックで `extractedSessionId = undefined` をリセットするよう指示する。

**罠**: 実装者が T-04 の `extractedSessionId = undefined` を T-05 の `snapshot()` より先に実行すると、`AgentSessionRollover.sessionId` が常に `undefined` になる。正しい実装順序は「snapshot 後にリセット」であり、design.md D7 の「差し替え前 → 差し替え」の文脈から読み取れるが、タスク間の明示的な順序指示は存在しない。

影響: テスト（TC-013 の `exhaustionAtTokens` 確認など）で発覚はできるが、`sessionId` フィールドの欠如はテスト対象になっていないため見落とされる可能性がある。修正方法: T-05 の snapshot 操作ブロックと T-04 の `extractedSessionId = undefined` リセットの実行順序を明示する（例: snapshot ブロックを rollover 実行コードの先頭に置くと注記する）。

### F-3（Low）: TC-012 が throw 経路の error 詳細保全を検証しない

T-02 は throw 経路について "message / `cause` の保持は現行どおり" と記述し、throw 経路での `errors[]` 本文相当の詳細保全を「現行どおり」の範囲に留めている。TC-012 は error result 経路のメッセージに `subtype` と `errors[]` 本文が含まれることを検証するが、throw 経路でのメッセージ詳細（cause チェーン）が halt / log に残ることを検証する TC が存在しない。

影響: throw 経路でのメッセージ劣化は spec の意図外だが、テストの欠如で回帰が発生しても検出されにくい。影響は限定的（観測に関わる post-mortem 情報の品質のみ）。修正方法: "throw 経路の error.message が cause チェーンを含む" ことを検証する TC を 1 件追加するか、T-02 の throw 経路テストに `error.message` の assert を追加する。
