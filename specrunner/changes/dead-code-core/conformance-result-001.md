# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### tasks.md — 全チェックボックス [x] 確認

T-01〜T-14 の 14 タスクすべて `[x]`。各タスクの実装をファイルシステムと grep で個別に検証した。

### Design Decisions

**D1** (ファイル vs symbol 単位削除): 全エクスポートが死コードのファイルはファイルごと削除（`resolve-target.ts`, `pr-status.ts`, `slugify.ts` 等）。部分削除ファイルは生きた symbol を保持（`types.ts` は `FinishFs` のみ残存）。✓

**D2** (ERROR_CODES code 定数は残す): `ERROR_CODES.BRANCH_NOT_REGISTERED`（:88）・`STATE_FILE_INVALID`（:89）・`STEP_INPUT_MISSING`（:114）が `src/errors.ts` に残存。factory のみ削除。✓

**D3** (`core/tools/` readdir assertion 削除): `src/core/tools/` ディレクトリ不在を確認。`tests/unit/adapter/managed-agent/agent-runner.test.ts` から "only types.ts remains" it-block 削除。TC-017 は残存。✓

**D4** (`core/validation/` → parser/validation/ repoint): `src/core/validation/` 不在。`tests/unit/core/validation/registry.test.ts` は `src/parser/validation/registry.js` から import。`tests/unit/parser/rules/rule-name-typesafe.test.ts` は `src/parser/validation/types.js` から import。✓

**D5** (`core/doctor/index.ts` fallback): `src/core/doctor/index.ts` 不在。`next-steps.test.ts:14` のコメントを「Tries index.ts first (re-export), falls back to next-steps.ts directly」に更新済み。fallback 経路が機能することを verification green で確認。✓

**D6** (`derive-usage.ts` 削除): ファイル不在。orchestrator の try/catch block 削除済み。`no-worktree-archive.test.ts`・`orchestrator.test.ts`・`orchestrator-hook.test.ts` から `vi.mock("…derive-usage.js", …)` 行を削除。grep `derive-usage` = 0。✓

### Spec Requirements

**R1: 削除 symbol の grep 0 件**

下記グループの symbol を src/ bin/ tests/ で grep し、`tests/unit/dead-code-core.test.ts` 以外のヒット = 0 を確認。
- finish 関連: `resolveTarget`, `fetchPrViewWithRetry`, `PrViewData`, `ResolvedTarget`, `FinishContext`, `FinishFlags`
- 7 factory: `branchNotRegisteredError`, `stateFileInvalidError`, `sessionCreateFailedError`, `noCommitDetectedError`, `stepHaltedNoToolCallError`, `stepInputMissingError`, `authoritySpecEditViolationError`
- 7 ERROR_CODES キー: `AUTO_MERGE_UNAVAILABLE`, `GH_SUBPROCESS_FAILED`, `OPENSPEC_ARCHIVE_FAILED`, `SPEC_FIXER_NO_FINDINGS`, `AUTHORITY_SPEC_EDIT_VIOLATION`, `STEP_HALTED_NO_TOOL_CALL`, `NO_COMMIT_DETECTED`
- `slugify`, `state/reconcile`, `allChecks`, `deriveAndWriteUsage`, `DeriveUsageResult`, `derive-usage`
- `buildSpecFixerSystemPrompt`, `SpecFixerPromptInput`, `buildSpecReviewSystemPrompt`, `requestReviewResultPath`（prompts/ からの re-export のみ）
- `defineCustomTool`, `CustomTool`（interface）, `CustomToolDefinition`

`dead-code-core.test.ts` はこれらを string literal として assertion に使用するが、`grepInTests()` が `--exclude="${SELF}"` で自己除外している。TC 全件 green で動作確認済み。✓

**R2: 保護 symbol の残存**

- `FinishFs` — `src/core/finish/types.ts`（唯一の interface として残存）
- `ERROR_CODES.STEP_INPUT_MISSING` — `src/errors.ts:114`
- `ERROR_CODES.BRANCH_NOT_REGISTERED` — `src/errors.ts:88`
- `ERROR_CODES.STATE_FILE_INVALID` — `src/errors.ts:89`
- `DoctorContext` interface — `src/core/doctor/types.ts:87`（const は削除、interface は残存）
- `list` 関数 — `src/core/request/manager.ts:3`（`resolve` 削除・ファイル残存）
- `CustomToolContext`, `CustomToolResult`, `CustomToolHandler` — `src/kernel/tool-types.ts`

すべて確認。✓

**R3: 共有 test は削除対象 assertion のみ除去**

- `tests/error-codes.test.ts`: `branchNotRegisteredError`/`stateFileInvalidError` の import なし。TC-024 ブロック削除済み。`ERROR_CODES.BRANCH_NOT_REGISTERED`（TC-026 :249）・`STATE_FILE_INVALID`（:242）確認は残存。他 TC (004, 005, 023, 025, 026) は無変更。✓
- `tests/unit/adapter/managed-agent/agent-runner.test.ts`: "only types.ts remains" it-block 削除。他は残存。✓
- `tests/unit/generate-chain-removed.test.ts`: TC-010 describe ブロック削除。`TC-010|PORT_INDEX_PATH` grep = 0。他 TC 残存。✓

**R4: typecheck && test green**

`verification-result.md` より: build passed / typecheck passed（0 error）/ test passed（10714 passed / 1 skipped / 0 failed）/ lint passed。✓

### 受け入れ基準

- 削除 symbol が src/ bin/ tests/ で grep 0 件 ✓（上記 R1 参照）
- `FinishFs`・`STEP_INPUT_MISSING`・`DoctorContext` 型・`list`・`CustomToolContext/Result/Handler` 残存 ✓
- 共有 test は対象 block のみ削除、他の期待値変更なし ✓
- `typecheck && test` green ✓

### tasks.md 非記載の追加変更

acceptance criteria 「grep 0 件（コメント含む）」を達成するため、削除した symbol 名を参照していた stale コメント・test description を追加で修正している：
- `src/core/runtime/managed.ts` — `state/store.ts` 参照コメント除去
- `tests/finish-job-state.test.ts` — `state/store.ts` 参照コメント更新
- `tests/unit/step/executor.test.ts` / `executor.commit.test.ts` — `NO_COMMIT_DETECTED` 参照を記述的表現に更新
- `tests/adapter/managed-agent/agent-runner.test.ts` — TC-04-11 description 更新
- `tests/unit/adapter/claude-code/agent-runner.test.ts` — コメント更新
- `tests/unit/doctor/xdg-integration.test.ts` — 削除された `DoctorContext` const の dynamic import を除去

いずれも acceptance criteria「コメント内の言及含む grep 0 件」の要件を満たすために必要な変更。✓

## 検証できなかった項目

None — すべての要件をファイル読み込み・grep・verification-result.md の照合で確認できた。

## Findings 詳細

None
