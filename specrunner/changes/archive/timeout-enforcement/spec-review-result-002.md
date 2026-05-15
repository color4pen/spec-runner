# Spec Review: timeout-enforcement (Round 2)

- **reviewer**: spec-reviewer (local)
- **date**: 2026-05-15
- **verdict**: approved

## Summary

spec-review-result-001 の Finding 1-4 すべてが design.md / tasks.md に反映済み。
ソースコードとの照合で行番号・既存コード構造・型定義すべて正確。
新たな blocking issue なし。

## Finding 1 (from review-001): `??` 演算子で `timeoutMs: 0` が即時タイムアウト [RESOLVED]

design.md D3 および tasks.md T-04a/T-04b で `resolvedConfig.timeoutMs && resolvedConfig.timeoutMs > 0`
ガードに変更済み。Claude Code / Codex adapter の既存 `!== null && > 0` ガードと一致する挙動になる。

コード検証:
- `schema.ts` L258: `timeoutMs >= 0` validator 確認 — `0` は valid な入力
- Claude Code adapter L117: `resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0` 確認
- Codex adapter L123: 同上
- 修正後の Managed Agent: `resolvedConfig.timeoutMs && resolvedConfig.timeoutMs > 0` — 3 adapter で `0` を無視する挙動が統一される

## Finding 2 (from review-001): store.ts の legacy timeoutMs stripping [RESOLVED]

design.md D3b および tasks.md T-05a で対応追加。`store.ts` L99-109 の strip コードを削除する。
ADR-0013 supersede と整合。

コード検証: `store.ts` L99-109 の strip コード確認。`specReview` / `specFixer` の legacy path のみ。
`steps` 配下の `timeoutMs` は strip 対象外であり、本 request の config resolution に影響なし。

## Finding 3 (from review-001): schema.ts の JSDoc が不正確 [RESOLVED]

tasks.md T-05b で JSDoc 更新を追加。
「Effective only for local runtime / ManagedAgentRunner ignores this field」→ 両 runtime で有効の記述に修正。

コード検証: `schema.ts` L114-122 の JSDoc 確認。

## Finding 4 (from review-001): .catch ブロック内 completedAt スコープが曖昧 [RESOLVED]

tasks.md T-02c で明示的に決定: 「startedAt のみ渡し、completedAt は pushStepResult の
フォールバック（`new Date().toISOString()`）に任せる」。T-03c でも同じ方針を採用。

設計判断として妥当:
- `.catch()` ブロック内では `completedAt` 未定義のため渡せない
- `pushStepResult` のフォールバック（`partial.completedAt ?? now`）で補完される
- ブロック内に `const completedAt` を重複定義するより単純

## 新規確認: コード参照の正確性

| 参照 | 実際のコード | 状態 |
|------|------------|------|
| helpers.ts L82-93: `startedAt: now, endedAt: now` | 確認。`now = partial.completedAt ?? new Date()` で両方に代入 | 正確 |
| executor.ts L140: `completedAt` が `runner.run()` の前 | 確認。L140 → L141 `.catch()` の直前 | 正確 |
| executor.ts L314: CLI step の `completedAt` が `step.run()` の前 | 確認。L314 → L316 `try` の直前 | 正確 |
| executor.ts L148, L170, L198: `recordFailedStepResult` の 3 呼び出し | 確認 | 正確 |
| agent-runner.ts L193-196: SSE fallback に `DEFAULT_POLL_TIMEOUT_MS` | 確認 | 正確 |
| agent-runner.ts L438-441: polling-style に `DEFAULT_POLL_TIMEOUT_MS` | 確認 | 正確 |
| store.ts L99-109: legacy strip コード | 確認 | 正確 |
| schema.ts L114-122: JSDoc | 確認 | 正確 |

## 新規確認: recordFailedStepResult のシグネチャ互換性

`executor-helpers.ts` L101-113:
```
partial: Omit<StepResultInput, "verdict" | "findingsPath" | "error"> = {}
```
`...partial` で `pushStepResult` に透過。`StepResultInput` に `startedAt` を追加すれば
`partial` にも自動的に `startedAt` が含まれる。シグネチャ変更不要の主張は正確。

## 新規確認: finalizeStep のシグネチャ変更

現在の呼び出し (L209):
```
this.finalizeStep(step, state, deps, runResult.resultContent, completedAt, { ... })
```
T-02e の修正後:
```
this.finalizeStep(step, state, deps, runResult.resultContent, completedAt, startedAt, { ... })
```
`startedAt: string` が `completedAt` と `agentResult?` の間に挿入される。
位置パラメータの順序は `completedAt → startedAt → agentResult?` で、呼び出し元 2 箇所
(runAgentStep L209, runCliStep L347) の更新が tasks に記載済み。

## 要件対応マトリクス

| 要件 # | 内容 | design.md | tasks.md | 状態 |
|--------|------|-----------|----------|------|
| 1 | startedAt/endedAt の修正 | D1 | T-01, T-02, T-03 | OK |
| 2 | StepRun 型定義変更なし | D1 明記 | — | OK |
| 3 | adapter が timeout 実施 | D2 | — | OK |
| 4 | Claude Code: AbortController | D2 「変更なし」 | — | OK (既存配線完備) |
| 5 | Codex: AbortController | D2 「変更なし」 | — | OK (既存配線完備) |
| 6 | Managed Agent: timeoutMs param | D3 | T-04 | OK (review-001 Finding 1 修正済) |
| 7 | timeout 時 awaiting-resume | D2 | — | OK (executor 既存ハンドリング) |
| 8 | デフォルト null | D2, D3 | T-04 | OK |
| 9 | ADR-0013 supersede | D4 | T-05, T-06 | OK (ADR-0014 番号空き確認済) |
| — | store.ts strip 除去 | D3b | T-05a | OK (review-001 Finding 2) |
| — | schema.ts JSDoc 更新 | — | T-05b | OK (review-001 Finding 3) |

## セキュリティ確認

- `timeoutMs` の入力源はユーザーの config ファイル（`~/.config/specrunner/config.json`）のみ。外部入力なし
- config validator (`schema.ts` L258-264) で `timeoutMs >= 0` の整数または `null` に制限済み。負値・非整数は reject
- 認証・権限の変更なし
- OWASP Top 10 該当なし（CLI ツール、ネットワーク入力を受けない）
