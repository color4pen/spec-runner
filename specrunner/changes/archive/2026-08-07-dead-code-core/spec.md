# Spec: core の検証済み死コードを削除する

## Requirements

### Requirement: 削除対象 symbol はすべてのコードパスで grep 0 件になる

削除後、対象 symbol 名がコメントを含む src/ bin/ tests/ 全体で grep 0 件でなければならない。削除した各 symbol は src/ bin/ tests/ のいかなるファイルにも残存してはならない（SHALL NOT）。

#### Scenario: finish の死コードが削除されている

**Given** `src/core/finish/resolve-target.ts`・`pr-status.ts` と `types.ts` の 4 不要 interface が削除されている
**When** `grep -r "resolveTarget\|fetchPrViewWithRetry\|PrViewData\|ResolvedTarget\|FinishContext\|FinishFlags" src/ tests/` を実行する
**Then** マッチ 0 件

#### Scenario: errors.ts の factory 7 個が削除されている

**Given** `branchNotRegisteredError`・`stateFileInvalidError`・`sessionCreateFailedError`・`noCommitDetectedError`・`stepHaltedNoToolCallError`・`stepInputMissingError`・`authoritySpecEditViolationError` が削除されている
**When** 上記 7 関数名を src/ tests/ で grep する
**Then** マッチ 0 件

#### Scenario: ERROR_CODES の 7 エントリが削除されている

**Given** `AUTO_MERGE_UNAVAILABLE`・`GH_SUBPROCESS_FAILED`・`OPENSPEC_ARCHIVE_FAILED`・`SPEC_FIXER_NO_FINDINGS`・`AUTHORITY_SPEC_EDIT_VIOLATION`・`STEP_HALTED_NO_TOOL_CALL`・`NO_COMMIT_DETECTED` が `ERROR_CODES` から削除されている
**When** 上記 7 キー名を src/ tests/ で grep する
**Then** マッチ 0 件

---

### Requirement: 削除しない symbol は残存している

`FinishFs`・`ERROR_CODES.STEP_INPUT_MISSING`・`ERROR_CODES.BRANCH_NOT_REGISTERED`・`ERROR_CODES.STATE_FILE_INVALID`・`DoctorContext`（interface）・`request/manager.ts` の `list`・`CustomToolContext`/`CustomToolResult`/`CustomToolHandler` は削除 MUST NOT。これらの symbol は T-01〜T-13 完了後も src/ に定義が残存していなければならない（MUST）。

#### Scenario: 残存 symbol が存在する

**Given** T-01〜T-13 が完了している
**When** `grep -r "FinishFs\|STEP_INPUT_MISSING\|CustomToolContext" src/` を実行する
**Then** 各 symbol の定義行が 1 件以上マッチする

---

### Requirement: 共有 test は削除対象 assertion のみ除去し他の期待値を変更しない

`tests/error-codes.test.ts`・`tests/unit/adapter/managed-agent/agent-runner.test.ts`・`tests/unit/generate-chain-removed.test.ts` は削除対象に関連する assertion block のみを除去しなければならない（MUST）。他の describe/it ブロックは一切変更してはならない（MUST NOT）。

#### Scenario: error-codes.test.ts が green のまま

**Given** `branchNotRegisteredError`・`stateFileInvalidError` の assertion block が削除され、`ERROR_CODES.BRANCH_NOT_REGISTERED`・`ERROR_CODES.STATE_FILE_INVALID` の確認 assertion が残っている
**When** `bun run test tests/error-codes.test.ts` を実行する
**Then** 全テストが green

#### Scenario: generate-chain-removed.test.ts が green のまま

**Given** TC-010 ブロック（3 テスト）が削除され、他の TC ブロックが残存している
**When** `bun run test tests/unit/generate-chain-removed.test.ts` を実行する
**Then** 全テストが green

---

### Requirement: `typecheck && test` が green

削除後、`bun run typecheck` と `bun run test` がどちらも 0 エラー・0 失敗で完了しなければならない（MUST）。

#### Scenario: 全テストが green

**Given** T-01〜T-13 の全タスクが完了している
**When** `bun run typecheck && bun run test` を実行する
**Then** 両コマンドが exit 0 で完了する
