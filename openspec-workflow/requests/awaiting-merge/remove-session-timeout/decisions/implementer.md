# Implementer Decisions — remove-session-timeout

## 実装判断ログ

### Group 1: State Backward Compatibility

- `validateJobState` に SESSION_TIMEOUT → SESSION_TERMINATED lazy mapping を追加する :: error フィールドの null チェック後に 1 行の条件式で実現でき、既存の validation 構造を変えない最小変更
- unit test は `tests/state/validate-job-state.test.ts` を新規作成する :: 既存 schema.test.ts は validateJobState の汎用 backward compat テストを持つが、SESSION_TIMEOUT 固有の migration テストは別ファイルに分離する方が TC 番号管理が明確

### Group 2: Error Code 撤廃

- `SESSION_TIMEOUT` と `sessionTimeoutError` を `src/errors.ts` から削除する :: 型システムから完全除去して新規書き込み禁止を実現する
- `tests/error-codes.test.ts` の TC-022 (SESSION_TIMEOUT preserved) を新しい TC-004/TC-005 (SESSION_TIMEOUT absent) に書き換える :: 旧テストは「SESSION_TIMEOUT が存在すること」を検証していたが、削除後は「存在しないこと」を検証する semantics に反転する
- `tests/completion.test.ts` の TC-032 (timeout after 30m) を削除する :: pollUntilComplete から timeout 機能を削除するためテスト自体が無効になる
- `src/adapter/anthropic/completion.ts` の timeoutMs 分岐と sessionTimeoutError throw を削除するが、`DEFAULT_TIMEOUT_MS` 定数は残す :: pollUntilComplete は AbortSignal での中断のみサポートする clean な関数になる。DEFAULT_TIMEOUT_MS は外部 consumer が参照している可能性があるため一旦 export を維持する（grep で参照ゼロなら削除する）

### Group 3: Polling Timeout 削除

- `SessionClient.pollUntilComplete` の opts から `timeoutMs` を削除する :: port 契約から除去することで core 層が timeout を渡せなくなる（型レベルの保護）
- `AnthropicSessionClient.pollUntilComplete` の `timeoutMs` forward も削除する :: adapter は port 契約に従う
- `StepExecutor.getTimeoutMs` メソッドを削除する :: design D1 の方針通り。step 名 dispatch の最後の残骸が消える
- `runPollingStyleStep` の `pollUntilComplete` 呼び出しから `timeoutMs` と timeout 分岐を削除する :: `pollResult.status === "timeout"` 分岐は SESSION_TIMEOUT コードを生成するコードパスのため削除
- `runProposeStyleStep` の polling fallback も同様に `timeoutMs` と `"timeout"` 分岐を削除する :: SSE disconnect 後の fallback polling も timeout フリーにする
- `session-runner.ts` の `timeoutMs` 関連コードを削除する :: design.md の migration plan に従い同 commit で処理する

### Group 4: Config Schema 変更

- `SpecRunnerConfig.specReview.timeoutMs`、`SpecRunnerConfig.specFixer.timeoutMs` を schema 型定義から削除する :: silently ignore 方針のため schema に残す必要はない（型から消しても Zod でなく手書き validator なので read 時に余分キーは無視される）
- `getTimeoutMs` ヘルパーを `src/config/schema.ts` から削除する :: StepExecutor 内の private `getTimeoutMs` と同名だが独立した実装。両方削除する
- `PipelineDeps.timeoutMs` を `src/core/types.ts` から削除する :: executor が timeoutMs を受け取る必要がなくなるため interface から除去する
- `src/cli/run.ts` の `timeoutMs` 変数と `--timeout` フラグ由来の parsing を削除する :: CLI フラグ `--timeout` も意味を失うので削除する（ただし parseTimeout 関数は他で使われている可能性があるため grep 確認後に判断する）
- `tests/init.test.ts` の `specReview.timeoutMs` 保存テストを更新する :: timeoutMs が schema から消えるためテストが failure になる。silently ignore される挙動に書き換える
- `tests/spec-review-step.test.ts` の TC-016 (timeoutMs from config) と TC-019 (SESSION_TIMEOUT handling) を削除または書き換える :: timeoutMs が渡されないこと / SESSION_TIMEOUT が発生しないことを検証するテストに反転する

### Group 5: Test Suite Cleanup

- `tests/core/session-runner.test.ts` の `timeoutMs: 60000` 引数を削除する :: `runManagedAgentSession` の `ManagedAgentSessionInput.timeoutMs` を削除するため
- `tests/unit/config/migrate.test.ts` の specFixer.timeoutMs 保存テストを更新する :: migrate が timeoutMs を pass-through するか、無視するかを確認して更新する
- `tests/grep-no-step-name-hardcode.test.ts` の `getTimeoutMs` 参照を削除する :: 削除後にテストの期待値が変わる
- `DEFAULT_TIMEOUT_MS` 定数の参照をチェックしてから削除判断する :: grep で tests/src 全体を確認
