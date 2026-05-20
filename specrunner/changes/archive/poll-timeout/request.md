# ポーリングにウォールクロックタイムアウトを追加する

## Meta

- **type**: bug-fix
- **slug**: poll-timeout
- **base-branch**: main

## 背景

`pollUntilComplete()` にウォールクロックタイムアウトがない。#171 で状態ハンドリングを網羅した後も、API が `running` を返し続けるケース（API 側の障害等）に対する防御層が必要。

2026-05-09 に implementer セッションが 20 分以上 stuck し、手動 kill で復旧した。状態ハンドリングの修正（#171）が根本対策だが、API 側の想定外の挙動に対する defense-in-depth としてタイムアウトを入れる。

### 設計上の難しさ

ステップによって正当な実行時間が大きく異なる。implementer は 10 分以上かかることがあり、固定タイムアウトでは false positive が発生する。

## 要件

1. `pollUntilComplete()` にウォールクロックタイムアウトを追加する
   - `Date.now()` ベースの deadline 判定
   - タイムアウト超過で `PollTimeoutError` を throw
2. タイムアウト値は `config.json` の step 別 `timeout` 設定を使用する
   - `pollUntilComplete()` の引数に `timeoutMs` を追加
   - 呼び出し元が step config から取得して渡す
3. デフォルトタイムアウトは 15 分（900,000ms）
   - step config に `timeout` が未設定の場合のフォールバック
4. `PollTimeoutError` を `errors.ts` に追加する
   - エラーコード: `POLL_TIMEOUT`
   - メッセージに sessionId と経過時間を含める
5. タイムアウト発生時、パイプラインは `awaiting-resume` 状態に遷移する
   - `PollTimeoutError` を catch した呼び出し元が状態遷移を行う

## スコープ外

- SSE ストリーム側のタイムアウト（SSE は SDK が管理するストリーム）
- 状態ハンドリングの改善（#171 で対応）
- step config の timeout 値の自動チューニング

## 受け入れ基準

- [ ] `pollUntilComplete()` が `timeoutMs` 引数を受け取り、超過で `PollTimeoutError` を throw する
- [ ] デフォルトタイムアウトが 15 分
- [ ] `PollTimeoutError` のユニットテストが存在する（sleepFn モックでタイムアウト動作を検証）
- [ ] 既存のポーリングテストが壊れない
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- タイムアウトは defense-in-depth。根本対策は #171 の状態ハンドリング
- 固定 15 分はデフォルト。step config の `timeout` で上書き可能
- タイムアウト発生 = 即エラーではなく `awaiting-resume`。ユーザーが状況を判断して resume or rm


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/poll-timeout.md` by `merged-to-archive-consolidation`.
