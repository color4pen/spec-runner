## Context

`remove-session-timeout` で wall-clock timeout を撤廃し、session 終端を SDK シグナル（idle/terminated/stop_reason）に一本化した。この判断は正しかったが、API が `running` を返し続ける障害シナリオに対する最終防御層が欠落していることが 2026-05-09 のインシデントで顕在化した。

現行の `pollUntilComplete` は無限ループで session status をポーリングし、`idle` または `terminated` のみで脱出する。API 側が正常なレスポンスを返しつつも `running` を返し続ける場合、ループは永遠に回り続ける。

旧 `SESSION_TIMEOUT` は StepExecutor が外側から AbortSignal.timeout で打ち切る設計だったが、正常な長時間 session（implementer 10+ 分）を false positive で kill する問題があった。本 design は `pollUntilComplete` 内部に Date.now() ベースの deadline 判定を置き、step config の `timeoutMs` で上書き可能にすることで、false positive を回避しつつ defense-in-depth を実現する。

## Goals / Non-Goals

**Goals:**
- `pollUntilComplete()` に `timeoutMs` 引数を追加し、超過で `PollTimeoutError` を throw する
- デフォルトタイムアウト 15 分（900,000ms）。step config で上書き可能
- タイムアウト発生時、パイプラインは `awaiting-resume` 状態に遷移する（`failed` ではない）
- `PollTimeoutError` のユニットテストを追加する
- 既存テストが壊れない（`bun run typecheck && bun run test` green）

**Non-Goals:**
- SSE ストリーム側のタイムアウト（SDK が管理するストリーム）
- 状態ハンドリングの改善（#171 で対応）
- step config の timeout 値の自動チューニング
- `SESSION_TIMEOUT` の復活（完全に別のエラーコード `POLL_TIMEOUT` を使用）

## Decisions

### D1. タイムアウトを `pollUntilComplete` 内部に置く（vs. 外側から AbortSignal で制御）

`pollUntilComplete` の while ループ内で `Date.now() >= deadline` を判定し、超過時に `PollTimeoutError` を throw する。

**Rationale:** 旧設計の AbortSignal.timeout は (1) executor が session lifecycle を知らないのに timeout を管理する責務不一致、(2) abort 後の session 状態が不定、という問題があった。`pollUntilComplete` 内部に置くことで、deadline 判定と session 状態の確認が同じスコープに収まり、timeout 発生時の session 状態が明確になる。

### D2. デフォルト 15 分、step config で上書き可能

`DEFAULT_POLL_TIMEOUT_MS = 900_000` を `completion.ts` に定義する。ManagedAgentRunner が `getStepExecutionConfig()` で `resolvedConfig.timeoutMs` を取得し、`null`（未設定）の場合にデフォルトを適用して `pollUntilComplete` に渡す。

**Rationale:** step-config-externalization で `timeoutMs` フィールドは既に `ResolvedStepConfig` と config schema に存在する（現在は null = no timeout にフォールバック）。このインフラをそのまま活用する。15 分は implementer の正常実行時間（10 分程度）に十分なマージンを持たせた値。

**Resolution chain:** `config.steps[stepName].timeoutMs` → `config.steps.defaults.timeoutMs` → `null` → `DEFAULT_POLL_TIMEOUT_MS`（ManagedAgentRunner 側で適用）。step definition の `stepDefaults.timeoutMs` は使用しない（各 step に hardcoded timeout を持たせる設計は採用しない）。

### D3. `POLL_TIMEOUT` → `awaiting-resume`（`failed` ではない）

タイムアウトは API 側の一時的な問題の可能性がある。`failed`（= 復帰不可）ではなく `awaiting-resume`（= ユーザーが状況を判断して resume or cancel）に遷移する。

**Rationale:** `failed` だと resume できない。API 障害が回復すれば resume で続行できる可能性がある。ユーザーが判断する余地を残す。

**Implementation path:**
1. `pollUntilComplete` → throw `PollTimeoutError`
2. `AnthropicSessionClient.pollUntilComplete` → catch して `{ status: "terminated", error: { code: "POLL_TIMEOUT", ... } }` を返す（既存の `normalizeSessionError` がコードを保持）
3. `ManagedAgentRunner` → `error.code === "POLL_TIMEOUT"` を検出し `{ completionReason: "timeout" }` を返す
4. `StepExecutor.runAgentStep` → `completionReason === "timeout"` を検出し、state を `awaiting-resume` に設定して persist、error を attach して rethrow
5. Pipeline の safety net は `status: "awaiting-resume"` を見て上書きしない（既存動作）

### D4. `remove-session-timeout` テストの更新

TC-008（completion.ts に `SESSION_TIMEOUT` がない）と TC-011（`PollOptions` に `timeoutMs` がない）のアサーションを更新する。`SESSION_TIMEOUT` 不在のアサーションは維持しつつ、`timeoutMs` 不在のアサーションを削除する。

**Rationale:** `POLL_TIMEOUT` は `SESSION_TIMEOUT` の復活ではなく別概念。`SESSION_TIMEOUT` に関するアサーションは引き続き有効。`timeoutMs` が `PollOptions` と session-client port に戻るのは設計上の意図的な変更。

## Risks / Trade-offs

- **[Risk] 15 分デフォルトが特定の step に対して短すぎる** → Mitigation: step config で `timeoutMs` を上書き可能。`config.steps.implementer.timeoutMs: 1800000`（30 分）等で対応
- **[Risk] API 障害でない正常な長時間 session が timeout される** → Mitigation: 15 分は実測 implementer 最大値（~12 分）に 25% マージン。それを超える session は config で延長。false positive 発生時も `awaiting-resume` なので resume 可能
- **[Trade-off] `pollUntilComplete` に `timeoutMs` を戻すことで `remove-session-timeout` の設計意図（timeout 完全撤廃）と矛盾する** → Mitigation: 旧設計の問題は (1) executor 外部からの AbortSignal 制御、(2) `failed` 遷移で復帰不可、(3) 固定値で設定不可。本 design はこれら全てを解消した上で defense-in-depth として再導入しており、旧設計の失敗を繰り返していない
