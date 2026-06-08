# Tasks: managed-agent adapter の非 null アサーションを safe access に置き換える

## T-01: environment 未設定エラーの factory と error code を追加する

- [x] `src/errors.ts` の `ERROR_CODES` に `ENVIRONMENT_NOT_SET: "ENVIRONMENT_NOT_SET"` を追加する
- [x] `environmentNotSetError(stepName: string): SpecRunnerError` factory を追加する。
  - hint は doctor の `environment-registered` チェックと揃えて `Run 'specrunner managed setup'.`
  - message は何が足りないか（managed environment が未登録）と、どの step で検知したかを含める
    （例: `Managed environment is not configured when entering '<stepName>'.`）
- [x] `branchNotSetError` の前例に倣い、`EXIT_CODE_MAP` への登録は行わない（既定 GENERAL_ERROR）

**Acceptance Criteria**:
- `ERROR_CODES.ENVIRONMENT_NOT_SET` が存在する
- `environmentNotSetError("design")` が `code === "ENVIRONMENT_NOT_SET"`、stepName と remediation を
  含む `SpecRunnerError` を返す
- `bun run typecheck` が green

## T-02: `config.environment!.id` の全箇所を safe access へ置き換える（+ テスト）

- [x] `src/adapter/managed-agent/agent-runner.ts` に private helper を追加する。
  `config.environment` が `undefined` の場合は `environmentNotSetError(step.name)` を
  `throwWrappedError({ code, message, hint }, state)` 経由で投げ、設定済みなら `environment.id` を返す
  （`branchNotSetError` を使う L564-566 と同じ wrapping パターン）
- [x] `config.environment!.id` を以下の **3 箇所すべて** で helper 経由に置き換える:
  - `createDesignSession`（L285 付近）
  - `createOrResumePollingSession` の resume fallback createSession（L606 付近）
  - `createOrResumePollingSession` の通常 createSession（L628 付近）
- [x] `tests/unit/adapter/managed-agent/agent-runner.test.ts` にテストを追加する（既存の
  `makeConfig` / `makeCtx` / `makeDesignStep` / mock client helper を再利用）:
  - polling-style step + `config.environment` 未設定（`makeConfig({ environment: undefined })`）で
    `run()` が `ENVIRONMENT_NOT_SET` を含むエラーで reject すること
  - design-style step + `config.environment` 未設定で `run()` が `ENVIRONMENT_NOT_SET` を含む
    エラーで reject すること（design は最初の managed step なので L285 を通る）

**Acceptance Criteria**:
- agent-runner.ts に `config.environment!.id` が 1 箇所も残っていない
- environment 未設定で polling-style / design-style いずれの `run()` も `TypeError` ではなく
  `ENVIRONMENT_NOT_SET` を識別子とする明確なエラーで throw する
- 追加した 2 テストが green

## T-03: `return sessionId!` を型の正直化 + 明示ガードへ置き換える（+ テスト）

- [x] `createOrResumePollingSession` の `let sessionId: string;` を `let sessionId: string | undefined;`
  に変更する
- [x] 代入後の narrowing により L618・L641 の `sessionId!` から `!` を除去する（`!` が残らないこと）
- [x] `return sessionId!`（L648）を、`sessionId === undefined` の場合に session 未確立を示す明確な
  メッセージで throw する明示ガードに置き換える（`SESSION_CREATE_FAILED` 系。`throwSessionCreateError`
  もしくは `throwWrappedError` を用い、message は「session が確立されなかった」旨と対処を含める）。
  undefined でなければ `sessionId` を返す
- [x] `tests/unit/adapter/managed-agent/agent-runner.test.ts` にテストを追加する:
  - `createSession` mock が `{ sessionId: undefined }` を resolve する場合、polling-style `run()` が
    session 未確立を示す明確なエラーで reject すること（resume なし経路で到達させる）

**Acceptance Criteria**:
- agent-runner.ts の `createOrResumePollingSession` に `sessionId!` が 1 箇所も残っていない
- `createSession` が `sessionId` を返さない場合、`run()` は undefined を下流へ返さず明確なエラーで throw する
- 追加したテストが green

## T-04: `state.branch!` を明示 null ガードへ置き換える（+ テスト）

- [x] `fetchResultFile` の `const effectiveBranch = state.branch!;`（L663）を、`state.branch === null` の
  場合に `branchNotSetError(step.name)` 相当を `throwWrappedError` で投げる明示ガードに置き換える
  （`preparePollingMessage` L564-566 と同じ error code `BRANCH_NOT_SET`・factory を再利用）。null で
  なければ narrow 済みの `state.branch` を `effectiveBranch` に使う
- [x] `tests/unit/adapter/managed-agent/agent-runner.test.ts` にテストを追加する:
  - polling-style step + `state.branch = null` で `run()` が `BRANCH_NOT_SET` を含むエラーで reject すること

**Acceptance Criteria**:
- agent-runner.ts に `state.branch!` が残っていない
- `state.branch` が null の場合、`run()` は `BRANCH_NOT_SET` を識別子とする明確なエラーで throw し、
  null branch を GitHub API へ伝播させない
- 追加したテストが green

## T-05: 検証ゲートを green にする

- [x] `bun run typecheck` が green
- [x] `bun run test` が green（既存テストの regression なし、追加テストすべて pass）
- [x] `bun run lint` が green

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- `bun run lint` が green
- 変更は managed-agent adapter（`src/adapter/managed-agent/`）と `src/errors.ts`、および
  対応するテストに閉じており、local runtime のコードを変更していない
