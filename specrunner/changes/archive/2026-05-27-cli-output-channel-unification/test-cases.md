# Test Cases: CLI 出力チャネル統合 + マスキング全適用

## フォーマット

各シナリオに以下のメタデータを付与する:

- **Category**: 機能領域
- **Priority**: must / should / could
- **Source**: 参照元 (request / design / tasks / delta-spec)

---

## Category: logger/stdout.ts — 出力先変更

### TC-01: logInfo は stderr に出力される

- **Priority**: must
- **Source**: tasks/Task1, delta-spec/cli-commands

**GIVEN** `logInfo` が import されている  
**WHEN** `logInfo("some message")` を呼び出す  
**THEN** `some message\n` が `process.stderr.write` に渡される  
**AND** `process.stdout.write` は呼ばれない

---

### TC-02: logStep は stderr に出力される

- **Priority**: must
- **Source**: tasks/Task1, delta-spec/cli-commands

**GIVEN** `logStep` が import されている  
**WHEN** `logStep("step name")` を呼び出す  
**THEN** 対応するメッセージが `process.stderr.write` に渡される  
**AND** `process.stdout.write` は呼ばれない

---

### TC-03: logSuccess は stderr に出力される

- **Priority**: must
- **Source**: tasks/Task1, delta-spec/cli-commands

**GIVEN** `logSuccess` が import されている  
**WHEN** `logSuccess("done")` を呼び出す  
**THEN** 対応するメッセージが `process.stderr.write` に渡される  
**AND** `process.stdout.write` は呼ばれない

---

### TC-04: stdoutWrite は maskSensitive を適用する

- **Priority**: must
- **Source**: tasks/Task1, request/要件3, design/D2

**GIVEN** `stdoutWrite` が import されている  
**WHEN** `stdoutWrite("token: sk-ant-api03-xxxx result")` を呼び出す  
**THEN** `process.stdout.write` に渡される文字列は `sk-ant-...` にマスクされている  
**AND** 元のトークン文字列 `sk-ant-api03-xxxx` は出力に含まれない

---

### TC-05: logResult は stdout に出力され末尾に改行がある

- **Priority**: must
- **Source**: tasks/Task1, design/D3, delta-spec/cli-commands

**GIVEN** `logResult` が import されている  
**WHEN** `logResult("https://github.com/owner/repo/pull/42")` を呼び出す  
**THEN** `https://github.com/owner/repo/pull/42\n` が `process.stdout.write` に渡される  
**AND** `process.stderr.write` は呼ばれない

---

### TC-06: logResult は maskSensitive を適用する

- **Priority**: must
- **Source**: tasks/Task1, design/D3, delta-spec/cli-commands

**GIVEN** `logResult` が import されている  
**WHEN** `logResult("gho_token1234567890abcdef")` を呼び出す  
**THEN** `process.stdout.write` に渡される文字列は `gho_...` にマスクされている  
**AND** 元のトークン文字列は出力に含まれない

---

## Category: DomainEvent 型定義

### TC-07: 新 DomainEvent が types.ts に定義されている

- **Priority**: must
- **Source**: tasks/Task2, request/要件4

**GIVEN** `src/core/event/types.ts` を参照する  
**WHEN** DomainEvent union type を確認する  
**THEN** 以下の全 literal type が含まれている:
  - `"pipeline:iteration:start"`
  - `"pipeline:iteration:verdict"`
  - `"pipeline:iteration:exhausted"`
  - `"pipeline:summary"`
  - `"pipeline:cli-step"`

---

### TC-08: EventPayloadMap に新 event の payload 型が定義されている

- **Priority**: must
- **Source**: tasks/Task2, request/要件4

**GIVEN** `src/core/event/types.ts` を参照する  
**WHEN** EventPayloadMap を確認する  
**THEN** 以下の payload 型が正しく定義されている:
  - `"pipeline:iteration:start"`: `{ step: string; iteration: number; maxIterations: number }`
  - `"pipeline:iteration:verdict"`: `{ step: string; iteration: number; verdict: string; action: "done" | "halt" | "fixer" }`
  - `"pipeline:iteration:exhausted"`: `{ step: string; iteration: number; maxIterations: number }`
  - `"pipeline:summary"`: `{ step: string; iterations: number; finalVerdict: string }`
  - `"pipeline:cli-step"`: `{ step: string; verdict?: string }`

---

### TC-09: 既存 DomainEvent が破壊されていない

- **Priority**: must
- **Source**: tasks/Task2, design/変更しないもの

**GIVEN** `src/core/event/types.ts` を参照する  
**WHEN** 既存の DomainEvent 型を確認する  
**THEN** 既存の全 event 型と EventPayloadMap エントリが変更前と同一である  
**AND** `bun run typecheck` がエラーを出さない

---

## Category: pipeline.ts の EventBus event 化

### TC-10: pipeline.ts に stdoutWrite の直接呼び出しが残っていない

- **Priority**: must
- **Source**: tasks/Task3, request/受け入れ基準, delta-spec/pipeline-orchestrator

**GIVEN** `src/core/pipeline/pipeline.ts` を参照する  
**WHEN** ファイル内のすべての stdoutWrite 呼び出しを確認する  
**THEN** `stdoutWrite(` という呼び出しが 0 件である  
**AND** `process.stdout.write` / `process.stderr.write` の直接呼び出しも 0 件である

---

### TC-11: iteration 開始時に pipeline:iteration:start が emit される

- **Priority**: must
- **Source**: tasks/Task3, design/D4, delta-spec/pipeline-orchestrator

**GIVEN** Pipeline インスタンスが EventBus に wire されている  
**WHEN** ループの N 回目の iteration が開始する  
**THEN** `"pipeline:iteration:start"` event が emit される  
**AND** payload は `{ step: currentStep, iteration: N, maxIterations: M }` である

---

### TC-12: iteration 終了時に pipeline:iteration:verdict が emit される (done)

- **Priority**: must
- **Source**: tasks/Task3, design/D4

**GIVEN** Pipeline インスタンスが EventBus に wire されている  
**WHEN** step の verdict が `approved` となり action が `done` になる  
**THEN** `"pipeline:iteration:verdict"` event が emit される  
**AND** payload の `action` は `"done"` である

---

### TC-13: iteration 終了時に pipeline:iteration:verdict が emit される (halt)

- **Priority**: must
- **Source**: tasks/Task3, design/D4

**GIVEN** Pipeline インスタンスが EventBus に wire されている  
**WHEN** step の verdict が escalation を引き起こし action が `halt` になる  
**THEN** `"pipeline:iteration:verdict"` event が emit される  
**AND** payload の `action` は `"halt"` である

---

### TC-14: retries exhausted 時に pipeline:iteration:exhausted が emit される

- **Priority**: must
- **Source**: tasks/Task3, design/D4

**GIVEN** Pipeline インスタンスが EventBus に wire されている  
**WHEN** maxIterations に達して retries が exhausted になる  
**THEN** `"pipeline:iteration:exhausted"` event が emit される  
**AND** payload は `{ step, iteration, maxIterations }` を含む

---

### TC-15: パイプライン完了時に pipeline:summary が emit される

- **Priority**: must
- **Source**: tasks/Task3, design/D4

**GIVEN** Pipeline インスタンスが EventBus に wire されている  
**WHEN** `printPipelineFinished` に相当する処理が実行される  
**THEN** `"pipeline:summary"` event が emit される  
**AND** payload は `{ step, iterations, finalVerdict }` を含む

---

### TC-16: cli-step 実行時に pipeline:cli-step が emit される

- **Priority**: must
- **Source**: tasks/Task3, design/D4

**GIVEN** Pipeline インスタンスが EventBus に wire されている  
**WHEN** CLI step が開始または完了する  
**THEN** `"pipeline:cli-step"` event が emit される  
**AND** payload は `{ step }` または `{ step, verdict }` を含む

---

## Category: progress.ts の拡張

### TC-17: progress.ts の全 process.stdout.write が process.stderr.write に変更されている

- **Priority**: must
- **Source**: tasks/Task4, request/要件2, design/D7

**GIVEN** `src/cli/progress.ts` を参照する  
**WHEN** ファイル内の全出力呼び出しを確認する  
**THEN** `process.stdout.write` の呼び出しが 0 件である  
**AND** 出力は `process.stderr.write` を使用している

---

### TC-18: TTY 検出が process.stderr.isTTY を参照する

- **Priority**: must
- **Source**: tasks/Task4, request/要件5, design/D5, delta-spec/pipeline-orchestrator

**GIVEN** `src/cli/progress.ts` を参照する  
**WHEN** コンストラクタの TTY 判定箇所を確認する  
**THEN** `process.stderr.isTTY` を参照している  
**AND** `process.stdout.isTTY` の参照が 0 件である

---

### TC-19: カラム幅取得が process.stderr.columns を参照する

- **Priority**: must
- **Source**: tasks/Task4, design/D5

**GIVEN** `src/cli/progress.ts` を参照する  
**WHEN** renderHeartbeat 内のカラム幅取得箇所を確認する  
**THEN** `process.stderr.columns` を参照している  
**AND** `process.stdout.columns` の参照が 0 件である

---

### TC-20: stderr がリダイレクトされている場合に \r が使われない

- **Priority**: must
- **Source**: request/要件5, delta-spec/pipeline-orchestrator

**GIVEN** `process.stderr.isTTY === false` (stderr がパイプまたはファイルにリダイレクトされている)  
**WHEN** heartbeat timer が fire する  
**THEN** `\r` による上書きは使用されない  
**AND** 改行付きの通常行として出力される

---

### TC-21: progress.ts が pipeline:iteration:start を subscribe して stderr に出力する

- **Priority**: must
- **Source**: tasks/Task4, design/D4, delta-spec/pipeline-orchestrator

**GIVEN** ProgressDisplay が EventBus に wire されている  
**WHEN** `"pipeline:iteration:start"` event が `{ step: "spec-review", iteration: 2, maxIterations: 5 }` で emit される  
**THEN** `[iter 2/5] starting spec-review\n` が stderr に出力される

---

### TC-22: progress.ts が pipeline:iteration:verdict を subscribe して stderr に出力する

- **Priority**: must
- **Source**: tasks/Task4, design/D4

**GIVEN** ProgressDisplay が EventBus に wire されている  
**WHEN** `"pipeline:iteration:verdict"` event が emit される  
**THEN** `[iter N] <step> verdict: <v> → <action>\n` フォーマットのメッセージが stderr に出力される

---

### TC-23: progress.ts が pipeline:iteration:exhausted を subscribe して stderr に出力する

- **Priority**: must
- **Source**: tasks/Task4, design/D4

**GIVEN** ProgressDisplay が EventBus に wire されている  
**WHEN** `"pipeline:iteration:exhausted"` event が emit される  
**THEN** `[iter N/M] retries exhausted on <step>, escalating\n` が stderr に出力される

---

### TC-24: progress.ts が pipeline:summary を subscribe して stderr に出力する

- **Priority**: must
- **Source**: tasks/Task4, design/D4

**GIVEN** ProgressDisplay が EventBus に wire されている  
**WHEN** `"pipeline:summary"` event が emit される  
**THEN** `Pipeline finished: <step> iterations=N, final verdict=V\n` が stderr に出力される

---

### TC-25: progress.ts が pipeline:cli-step を subscribe して stderr に出力する (verdict なし)

- **Priority**: must
- **Source**: tasks/Task4, design/D4

**GIVEN** ProgressDisplay が EventBus に wire されている  
**WHEN** `"pipeline:cli-step"` event が `{ step: "lint" }` で emit される (verdict なし)  
**THEN** `[step] lint\n` が stderr に出力される

---

### TC-26: progress.ts が pipeline:cli-step を subscribe して stderr に出力する (verdict あり)

- **Priority**: must
- **Source**: tasks/Task4, design/D4

**GIVEN** ProgressDisplay が EventBus に wire されている  
**WHEN** `"pipeline:cli-step"` event が `{ step: "lint", verdict: "approved" }` で emit される  
**THEN** `[step] lint: approved\n` が stderr に出力される

---

## Category: 直接 write の排除 (src/ 全体)

### TC-27: src/ プロダクションコードに process.stdout.write の直接呼び出しがない

- **Priority**: must
- **Source**: request/受け入れ基準, delta-spec/cli-commands

**GIVEN** `src/` 配下の全プロダクションファイルを参照する  
**WHEN** `process.stdout.write` の呼び出しを検索する  
**THEN** `src/logger/stdout.ts` 以外のファイルに `process.stdout.write` の呼び出しが 0 件である

---

### TC-28: src/ プロダクションコードに process.stderr.write の直接呼び出しがない

- **Priority**: must
- **Source**: request/受け入れ基準, delta-spec/cli-commands

**GIVEN** `src/` 配下の全プロダクションファイルを参照する  
**WHEN** `process.stderr.write` の呼び出しを検索する  
**THEN** `src/logger/stdout.ts` と `src/cli/progress.ts` 以外のファイルに `process.stderr.write` の呼び出しが 0 件である

---

### TC-29: cli/run.ts のエラー出力が logError 経由になっている

- **Priority**: should
- **Source**: tasks/Task5

**GIVEN** `src/cli/run.ts` を参照する  
**WHEN** エラーメッセージの出力箇所を確認する  
**THEN** `logError(...)` を使用している  
**AND** `process.stderr.write` の直接呼び出しが 0 件である

---

### TC-30: cli/finish.ts の結果データが logResult 経由になっている

- **Priority**: should
- **Source**: tasks/Task5

**GIVEN** `src/cli/finish.ts` を参照する  
**WHEN** stdoutWrite コールバックのデフォルト値を確認する  
**THEN** `logResult` が使用されている  
**AND** `process.stdout.write` の直接呼び出しが 0 件である

---

### TC-31: core/command/request-create.ts の slug 出力が logResult になっている

- **Priority**: should
- **Source**: tasks/Task6

**GIVEN** `src/core/command/request-create.ts` を参照する  
**WHEN** slug を出力する箇所を確認する  
**THEN** `logResult(\`${slug}\n\`)` または相当の `logResult` 呼び出しを使用している

---

### TC-32: core/step/verification.ts のローカル stderrWrite が削除されている

- **Priority**: should
- **Source**: tasks/Task6

**GIVEN** `src/core/step/verification.ts` を参照する  
**WHEN** ローカル定義の `stderrWrite` 関数を検索する  
**THEN** ローカル定義が存在せず、logger からの import を使用している

---

### TC-33: finish/orchestrator.ts の直接 stderr が stderrWrite 経由になっている

- **Priority**: should
- **Source**: tasks/Task6

**GIVEN** `src/core/finish/orchestrator.ts` を参照する  
**WHEN** `process.stderr.write` の呼び出しを確認する  
**THEN** `process.stderr.write` の直接呼び出しが 0 件である  
**AND** `stderrWrite(...)` を使用している

---

### TC-34: adapter/github/github-client.ts の retry メッセージが stderrWrite になっている

- **Priority**: should
- **Source**: tasks/Task7

**GIVEN** `src/adapter/github/github-client.ts` を参照する  
**WHEN** retry に関する診断メッセージの出力箇所を確認する  
**THEN** `stderrWrite(...)` を使用している  
**AND** `process.stderr.write` の直接呼び出しが 0 件である

---

### TC-35: auth/github-device.ts の認証フロー表示が stderrWrite になっている

- **Priority**: should
- **Source**: tasks/Task7

**GIVEN** `src/auth/github-device.ts` を参照する  
**WHEN** 認証フロー指示（デバイスコード等）の出力箇所を確認する  
**THEN** `stderrWrite(...)` を使用している  
**AND** `process.stdout.write` の直接呼び出しが 0 件である

---

## Category: マスキングの全適用

### TC-36: sk-ant- パターンが全出力パスでマスクされる

- **Priority**: must
- **Source**: request/受け入れ基準

**GIVEN** アプリケーションが動作している  
**WHEN** `sk-ant-api03-xxxxx` を含むメッセージが logger 経由で出力される  
**THEN** stdout / stderr いずれの出力先でも `sk-ant-...` にマスクされている  
**AND** 元のトークン文字列は出力に含まれない

---

### TC-37: gho_ パターンが全出力パスでマスクされる

- **Priority**: must
- **Source**: request/受け入れ基準

**GIVEN** アプリケーションが動作している  
**WHEN** `gho_xxxxxxxxxxxxxxxxxxxxxx` を含むメッセージが出力される  
**THEN** stdout / stderr いずれの出力先でも `gho_...` にマスクされている

---

### TC-38: ghp_ パターンが全出力パスでマスクされる

- **Priority**: must
- **Source**: request/受け入れ基準

**GIVEN** アプリケーションが動作している  
**WHEN** `ghp_xxxxxxxxxxxxxxxxxxxxxx` を含むメッセージが出力される  
**THEN** stdout / stderr いずれの出力先でも `ghp_...` にマスクされている

---

### TC-39: ghr_ パターンが全出力パスでマスクされる

- **Priority**: must
- **Source**: request/受け入れ基準

**GIVEN** アプリケーションが動作している  
**WHEN** `ghr_xxxxxxxxxxxxxxxxxxxxxx` を含むメッセージが出力される  
**THEN** stdout / stderr いずれの出力先でも `ghr_...` にマスクされている

---

### TC-40: stdoutWrite が maskSensitive を適用し素通しにならない

- **Priority**: must
- **Source**: request/要件3, design/D2

**GIVEN** `stdoutWrite` の実装を参照する  
**WHEN** 実装を確認する  
**THEN** `maskSensitive(message)` を適用してから `process.stdout.write` に渡している  
**AND** 生の `message` を直接 `process.stdout.write` に渡していない

---

## Category: stdout/stderr 分離 (E2E 的検証)

### TC-41: job start コマンド実行時に stdout には結果データのみが出力される

- **Priority**: must
- **Source**: request/要件2, delta-spec/cli-commands

**GIVEN** `specrunner job start <slug>` を実行し stdout をファイルにリダイレクトする  
**WHEN** コマンドが完了する  
**THEN** stdout ファイルには PR URL または job ID などの結果データのみが含まれる  
**AND** `[step]` / `[iter` / heartbeat / `running...` / `✓` 等の進捗表示は stdout に含まれない

---

### TC-42: 進捗表示・warning・error は stderr に出力される

- **Priority**: must
- **Source**: request/要件2, request/受け入れ基準

**GIVEN** コマンドを実行し stderr を stdout と分離して観察する  
**WHEN** 進捗表示・warning・error が発生する  
**THEN** これらのメッセージは stderr に出力される  
**AND** stdout には含まれない

---

### TC-43: preflight 成功時に GitHub token 取得元が stderr に出力される

- **Priority**: should
- **Source**: delta-spec/cli-commands

**GIVEN** `specrunner run` を起動し preflight の token resolve が credentials.json で成功する  
**WHEN** preflight が完了する  
**THEN** stderr に `GitHub token source: credentials` の info ログが 1 行出力される  
**AND** stdout には出力されない

---

### TC-44: GITHUB_TOKEN env var 経由でも取得元が stderr に表示される

- **Priority**: should
- **Source**: delta-spec/cli-commands

**GIVEN** `specrunner run` を起動し preflight の token resolve が `GITHUB_TOKEN` env var で成功する  
**WHEN** preflight が完了する  
**THEN** stderr に `GitHub token source: env` の info ログが 1 行出力される  
**AND** stdout には出力されない

---

## Category: ビルド / 型チェック / テスト

### TC-45: bun run typecheck が green

- **Priority**: must
- **Source**: request/受け入れ基準, tasks/Task8

**GIVEN** 全タスクの実装が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で完了する

---

### TC-46: bun run test が green

- **Priority**: must
- **Source**: request/受け入れ基準, tasks/Task8

**GIVEN** 全タスクの実装が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する  
**AND** テスト失敗が 0 件である

---

### TC-47: progress.ts のテストが stderr mock を使用している

- **Priority**: must
- **Source**: tasks/Task8

**GIVEN** `progress.ts` のテストファイルを参照する  
**WHEN** 出力の mock 設定を確認する  
**THEN** `process.stderr.write` を mock している  
**AND** `process.stdout.write` を進捗表示のテスト対象として mock していない

---

### TC-48: pipeline.ts のテストが EventBus emit を検証している

- **Priority**: must
- **Source**: tasks/Task8

**GIVEN** `pipeline.ts` のテストファイルを参照する  
**WHEN** 出力の検証箇所を確認する  
**THEN** `stdoutWrite` の呼び出し検証が存在しない  
**AND** 対応する DomainEvent の emit を検証している

---

### TC-49: logInfo / logStep / logSuccess のテストが stderr を検証している

- **Priority**: must
- **Source**: tasks/Task8

**GIVEN** `logger/stdout.ts` のテストファイルを参照する  
**WHEN** `logInfo` / `logStep` / `logSuccess` の出力先検証箇所を確認する  
**THEN** `process.stderr.write` に出力されることを検証している  
**AND** `process.stdout.write` に出力されることを検証していない

---

## Category: delta spec との整合確認

### TC-50: delta spec の cli-commands 規約が実装と一致する

- **Priority**: should
- **Source**: tasks/Task9, delta-spec/cli-commands

**GIVEN** 実装が完了している  
**WHEN** `specrunner/changes/cli-output-channel-unification/specs/cli-commands/spec.md` を参照する  
**THEN** spec に記載された全 Requirement と Scenario が実装で満たされている  
**AND** spec の記述と実装に乖離がない

---

### TC-51: delta spec の pipeline-orchestrator 規約が実装と一致する

- **Priority**: should
- **Source**: tasks/Task9, delta-spec/pipeline-orchestrator

**GIVEN** 実装が完了している  
**WHEN** `specrunner/changes/cli-output-channel-unification/specs/pipeline-orchestrator/spec.md` を参照する  
**THEN** spec に記載された全 Requirement と Scenario が実装で満たされている  
**AND** `Removed` セクションに記載されたシナリオが既存 spec から削除されている

---

## Category: 後退防止 (regression prevention)

### TC-52: テストファイル内の process.stderr.write mock は変更対象外

- **Priority**: must
- **Source**: request/スコープ外

**GIVEN** テストファイル (`*.test.ts` / `*.spec.ts`) を参照する  
**WHEN** `process.stderr.write` の使用箇所を確認する  
**THEN** テストファイル内の mock 設定は変更されていない (対象外)

---

### TC-53: EventBus の同期 emit が維持されている

- **Priority**: must
- **Source**: request/スコープ外, design/変更しないもの

**GIVEN** EventBus の実装を参照する  
**WHEN** emit の実装を確認する  
**THEN** sync emit が維持されている  
**AND** async emit への変更は行われていない

---

### TC-54: maskSensitive の既存パターンが変更されていない

- **Priority**: must
- **Source**: request/受け入れ基準, design/変更しないもの

**GIVEN** `maskSensitive` の実装を参照する  
**WHEN** マスクパターンを確認する  
**THEN** 既存の 4 パターン (`sk-ant-` / `gho_` / `ghp_` / `ghr_`) がすべて維持されている  
**AND** パターンが削除・変更されていない
