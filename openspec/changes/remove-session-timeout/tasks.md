## 1. State Backward Compatibility (実装は最初に — 旧 state を壊さないため)

- [x] 1.1 `src/state/schema.ts`（`validateJobState` 実体: schema.ts:226 付近）に `state.error.code === "SESSION_TIMEOUT"` を `SESSION_TERMINATED` に書き換える lazy mapping を追加する
- [x] 1.2 旧 state fixture（`error.code === "SESSION_TIMEOUT"` を含む）を読み込み、in-memory 状態が `SESSION_TERMINATED` にマップされることを検証する unit test を追加する
- [x] 1.3 lazy migration 後の `JobStateStore.persist()` 呼び出しで on-disk JSON から `SESSION_TIMEOUT` 文字列が消えることを検証する unit test を追加する

## 2. Error Code 撤廃

- [x] 2.1 `src/core/errors.ts`（または `ERROR_CODES` 定義ファイル）から `SESSION_TIMEOUT` を削除する
- [x] 2.2 `sessionTimeoutError` ヘルパーを削除する
- [x] 2.3 削除後、TypeScript 型チェックで `SESSION_TIMEOUT` を参照する箇所が無いことを確認する（`tsc --noEmit` pass）

## 3. Polling Timeout 削除

- [x] 3.1 `SessionClient.pollUntilComplete` のシグネチャから `timeoutMs` オプションを削除する
- [x] 3.2 SDK ラッパ層の `pollUntilComplete` 関数から `timeoutMs` オプションと `pollResult.status === "timeout"` 分岐を削除する
- [x] 3.3 `src/core/step/executor.ts` の `StepExecutor.getTimeoutMs` メソッドを削除し、`pollUntilComplete` 呼び出しから `timeoutMs` 引数を除去する
- [x] 3.4 `src/core/step/executor.ts` 経路に `setTimeout` / `AbortSignal.timeout` 由来の session abort が残っていないことを `grep` で確認し、残骸があれば削除する
- [x] 3.5 `src/adapter/anthropic/session-runner.ts` の `timeoutMs` 引数（lines 99, 116 付近）と `SESSION_TIMEOUT` フォールバックを削除する（撤廃 or 内部 default 化のいずれかを実装時に確定する）
- [x] 3.6 `src/adapter/anthropic/completion.ts:74` の `SESSION_TIMEOUT` フォールバック / `timeoutMs` 関連コードを削除する

## 4. Config Schema 変更

- [x] 4.1 `src/config/schema.ts` から `SpecRunnerConfig.specReview.timeoutMs` / `SpecRunnerConfig.specFixer.timeoutMs` フィールドを削除する
- [x] 4.2 `src/config/schema.ts` から top-level `timeout` フィールド（`SpecRunnerConfig` 直下）を削除する
- [x] 4.3 `src/config/schema.ts` の `getTimeoutMs(stepName, cfg)` ヘルパー（schema.ts:161 付近）を削除する
- [x] 4.4 `SpecRunnerConfig.specReview.pollIntervalMs` / `SpecRunnerConfig.specFixer.pollIntervalMs` の扱いを決定する: (a) 本 request では schema に残す（timeout とは別軸の polling 間隔設定として tagged optional のまま維持）が推奨。(b) 定数化する場合は schema から削除し executor 内部定数化する。いずれかを選択して schema を整える
- [x] 4.5 `ConfigStore.load()` が旧 config（`specReview.timeoutMs` / `specFixer.timeoutMs` / 直下 `timeout` を含む）を warn / error なしで読み込めることを検証する unit test を追加する
- [x] 4.6 `ConfigStore.save()` 出力ファイルに旧 timeout キーが書き戻されないことを検証する unit test を追加する

## 5. Spec 反映

- [x] 5.1 `openspec validate remove-session-timeout --type change --strict` を実行し pass することを確認する
- [x] 5.2 6 spec の delta（`propose-pipeline` / `session-completion-detection` / `spec-review-session` / `spec-fixer-session` / `job-state-store` / `cli-config-store`）が `openspec/specs/<name>/spec.md` の現状 header と整合することを目視確認する（`## MODIFIED Requirements` 配下の `### Requirement:` 行が main spec と完全一致）

## 6. Test Suite Cleanup

- [x] 6.1 `grep -r "SESSION_TIMEOUT" src/ tests/` を実行し、残存箇所をすべて削除または書き換える
- [x] 6.2 timeout 関連の既存 unit / integration テスト（`pollResult.status === "timeout"` を expect しているもの、`SESSION_TIMEOUT` error を expect しているもの）を削除または書き換える
- [x] 6.3 `bun test` で全件 pass を確認する（変更前ベースライン比で减少なし。timeout 関連テスト削除分は除く）
- [x] 6.4 対象外 timeout（`doctor` の network/CLI check、`Custom Tool Handler` の handler 内 timeout、Anthropic SDK 内部の HTTP timeout）が削除対象に含まれていないことを `grep` 結果から再確認する

## 7. 受け入れ基準の検証

- [x] 7.1 step 実行から wall-clock timeout が完全に消えていることを確認する（`StepExecutor` 経路に timeout 起因の abort 経路が無い）
- [x] 7.2 `SESSION_TIMEOUT` を含む error が新規 job で発生しないことを smoke test で確認する
- [x] 7.3 旧 state file が `validateJobState` で `SESSION_TERMINATED` に lazy migrate されることを smoke test で確認する
- [x] 7.4 `~/.config/specrunner/config.json` の `timeoutMs` / `timeout` が無視されることを smoke test で確認する
- [x] 7.5 `propose-system.ts` 等の prompt が本 request の対象外であることを再確認する（変更しない）
