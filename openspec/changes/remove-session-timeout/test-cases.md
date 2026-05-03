# Test Cases: remove-session-timeout

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration/e2e): 19
- **Manual**: 4
- **Priority**: must: 11, should: 9, could: 3

## Test Cases

---

### TC-001: validateJobState が SESSION_TIMEOUT を SESSION_TERMINATED に in-memory マップする

**Category**: unit
**Priority**: must
**Source**: tasks.md T-1.2 / design.md D2

**GIVEN** `error.code === "SESSION_TIMEOUT"` を含む旧 state fixture が存在する  
**WHEN** `validateJobState` でその fixture を読み込む  
**THEN** 返却される state の `error.code` が `"SESSION_TERMINATED"` に変換されており、元の `"SESSION_TIMEOUT"` は in-memory に残っていない

---

### TC-002: validateJobState が SESSION_TIMEOUT 以外の error code を変換しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-1.2 / design.md D2

**GIVEN** `error.code === "SPEC_REVIEW_RETRIES_EXHAUSTED"` を含む state fixture が存在する  
**WHEN** `validateJobState` でその fixture を読み込む  
**THEN** 返却される state の `error.code` が `"SPEC_REVIEW_RETRIES_EXHAUSTED"` のまま変化しない

---

### TC-003: lazy migration 後の persist で on-disk JSON に SESSION_TIMEOUT が残らない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-1.3 / design.md D2

**GIVEN** `error.code === "SESSION_TIMEOUT"` の旧 state fixture を `validateJobState` で読み込み、in-memory 上で SESSION_TERMINATED にマップした状態がある  
**WHEN** `JobStateStore.persist()` を呼び出して state を書き戻す  
**THEN** 書き出された JSON ファイルに `"SESSION_TIMEOUT"` 文字列が含まれない

---

### TC-004: ERROR_CODES に SESSION_TIMEOUT が存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.1 / design.md D2

**GIVEN** `src/core/errors.ts`（または ERROR_CODES 定義ファイル）をインポートする  
**WHEN** `ERROR_CODES.SESSION_TIMEOUT` を参照する  
**THEN** `undefined` または TypeScript 型エラーとなり、`SESSION_TIMEOUT` が定義されていない

---

### TC-005: sessionTimeoutError ヘルパーが存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-2.2 / design.md D2

**GIVEN** errors モジュールをインポートする  
**WHEN** `sessionTimeoutError` を参照する  
**THEN** `undefined` または TypeScript 型エラーとなり、ヘルパーがエクスポートされていない

---

### TC-006: StepExecutor が pollUntilComplete を timeoutMs なしで呼び出す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.3 / request.md 受け入れ基準 / design.md D1

**GIVEN** `StepExecutor` のインスタンスが存在し、step 実行の準備ができている  
**WHEN** step 実行メソッドを呼び出す  
**THEN** `pollUntilComplete` が呼び出される際に `timeoutMs` プロパティが引数に含まれない（`undefined` も含め渡されない）

---

### TC-007: StepExecutor に getTimeoutMs メソッドが存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.3 / design.md D1

**GIVEN** `StepExecutor` クラスの定義を参照する  
**WHEN** `getTimeoutMs` メソッドを参照する  
**THEN** メソッドが存在せず、TypeScript 型エラーまたは `undefined` となる

---

### TC-008: pollUntilComplete の status === "timeout" 分岐が実行されない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.2 / request.md 要件 1

**GIVEN** SDK ラッパ層の `pollUntilComplete` 関数が存在する  
**WHEN** 関数の実装コードを静的に検査する（またはモックで `pollResult.status = "timeout"` を与える）  
**THEN** `pollResult.status === "timeout"` を参照するコードパスが存在せず、timeout 起因の SESSION_TIMEOUT エラー生成が起きない

---

### TC-009: SessionClient.pollUntilComplete のシグネチャに timeoutMs がない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-3.1 / design.md D1

**GIVEN** `SessionClient` クラスの型定義を参照する  
**WHEN** `pollUntilComplete` メソッドのシグネチャを確認する  
**THEN** `timeoutMs` オプションが型定義に含まれない

---

### TC-010: session-runner.ts の timeoutMs 引数と SESSION_TIMEOUT フォールバックが削除されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.5 / proposal.md Impact

**GIVEN** `src/adapter/anthropic/session-runner.ts` の lines 99, 116 付近のコードを参照する  
**WHEN** `timeoutMs` 引数および SESSION_TIMEOUT フォールバックの有無を確認する  
**THEN** `timeoutMs` 引数も SESSION_TIMEOUT フォールバックも存在しない

---

### TC-011: completion.ts の SESSION_TIMEOUT フォールバックと timeoutMs 関連コードが削除されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-3.6 / proposal.md Impact

**GIVEN** `src/adapter/anthropic/completion.ts:74` 付近のコードを参照する  
**WHEN** SESSION_TIMEOUT フォールバックおよび timeoutMs 関連コードの有無を確認する  
**THEN** 当該コードが存在しない

---

### TC-012: ConfigStore.load が timeoutMs を含む旧 config を warn/error なしで読み込む

**Category**: unit
**Priority**: must
**Source**: tasks.md T-4.5 / design.md D3 / request.md 受け入れ基準

**GIVEN** `specReview.timeoutMs`、`specFixer.timeoutMs`、top-level `timeout` フィールドを含む旧 config JSON fixture が存在する  
**WHEN** `ConfigStore.load()` でその fixture を読み込む  
**THEN** 例外も warn ログも発生せず、正常に config オブジェクトが返却される

---

### TC-013: ConfigStore.save 出力に timeout 関連キーが含まれない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-4.6 / design.md D3

**GIVEN** `specReview.timeoutMs` / `specFixer.timeoutMs` / top-level `timeout` を含む旧 config を `ConfigStore.load()` で読み込んだ状態がある  
**WHEN** `ConfigStore.save()` で設定を書き出す  
**THEN** 出力された JSON ファイルに `timeoutMs`・`timeout` キーが含まれない

---

### TC-014: getTimeoutMs ヘルパーが config schema に存在しない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-4.3 / design.md D1

**GIVEN** `src/config/schema.ts` をインポートする  
**WHEN** `getTimeoutMs` 関数を参照する  
**THEN** 関数が存在せず、TypeScript 型エラーまたは `undefined` となる

---

### TC-015: doctor の network/CLI check timeout が削除されていない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-6.4 / request.md 要件 5 / design.md Non-Goals

**GIVEN** `doctor` コマンドの network/CLI check 実装が存在する  
**WHEN** timeout 設定（5s / 30s）の有無を確認する  
**THEN** doctor の network/CLI check 用 timeout 設定が依然として存在する（削除されていない）

---

### TC-016: Custom Tool Handler の handler 内 timeout が削除されていない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-6.4 / request.md 要件 5 / design.md Non-Goals

**GIVEN** `Custom Tool Handler` の handler 内 timeout 実装が存在する  
**WHEN** timeout 設定の有無を確認する  
**THEN** handler 内 timeout が依然として存在する（削除されていない）

---

### TC-017: 新規 job 実行で SESSION_TIMEOUT error が発生しない

**Category**: integration
**Priority**: should
**Source**: tasks.md T-7.2 / request.md 受け入れ基準

**GIVEN** SESSION_TIMEOUT に関連するコードが削除された状態の specrunner が存在する  
**WHEN** 新規 job を作成して step 実行を開始する  
**THEN** `job.state.error.code` が `"SESSION_TIMEOUT"` にならない（長時間実行を経ても timeout 経由の error 遷移が起きない）

---

### TC-018: 既存テスト全件が pass する（timeout 関連テスト削除分を除く）

**Category**: integration
**Priority**: should
**Source**: tasks.md T-6.3 / request.md 受け入れ基準

**GIVEN** timeout 関連のテスト（SESSION_TIMEOUT を expect するケース）が削除または書き換えられた状態がある  
**WHEN** `bun test` でテストスイート全体を実行する  
**THEN** 全テストが pass し、変更前ベースライン（706 件）から timeout 関連削除分を除いた件数以上が pass している

---

### TC-019: SESSION_TIMEOUT 文字列が src/ tests/ 以下に残存しない

**Category**: manual
**Priority**: should
**Source**: tasks.md T-6.1 / design.md Migration Plan Step 4

**GIVEN** 全コード変更が完了した状態がある  
**WHEN** `grep -r "SESSION_TIMEOUT" src/ tests/` を実行する  
**THEN** 出力が空（ヒットなし）である

---

### TC-020: StepExecutor 経路に setTimeout / AbortSignal.timeout が含まれない

**Category**: manual
**Priority**: should
**Source**: tasks.md T-3.4 / request.md 受け入れ基準

**GIVEN** 全コード変更が完了した状態がある  
**WHEN** `grep -r "setTimeout\|AbortSignal\.timeout" src/core/step/executor.ts` および executor が呼び出す経路のファイルを確認する  
**THEN** session abort を起こしうる `setTimeout` / `AbortSignal.timeout` 呼び出しが executor 経路に存在しない

---

### TC-021: SpecRunnerConfig の specReview.pollIntervalMs / specFixer.pollIntervalMs が schema に残存する

**Category**: unit
**Priority**: could
**Source**: tasks.md T-4.4 / design.md D3

**GIVEN** `src/config/schema.ts` の `SpecRunnerConfig` 型定義を参照する  
**WHEN** `specReview.pollIntervalMs` および `specFixer.pollIntervalMs` フィールドを確認する  
**THEN** `pollIntervalMs` フィールドが schema に存在する（timeout とは別軸の polling 間隔設定として維持されている）

---

### TC-022: openspec validate が pass する（spec 整合性確認）

**Category**: manual
**Priority**: could
**Source**: tasks.md T-5.1 / design.md Goals

**GIVEN** 6 spec（propose-pipeline / session-completion-detection / spec-review-session / spec-fixer-session / job-state-store / cli-config-store）の delta が作成された状態がある  
**WHEN** `openspec validate remove-session-timeout --type change --strict` を実行する  
**THEN** コマンドが pass し、エラーなく完了する

---

### TC-023: delta spec の MODIFIED Requirement ヘッダーが main spec と完全一致する

**Category**: manual
**Priority**: could
**Source**: tasks.md T-5.2 / design.md D4

**GIVEN** 6 spec の delta ファイルが作成された状態がある  
**WHEN** `## MODIFIED Requirements` 配下の `### Requirement:` 行を main spec の対応 header と目視で比較する  
**THEN** 全ての MODIFIED Requirement ヘッダーが main spec と文字列一致しており、RENAMED は発生していない
