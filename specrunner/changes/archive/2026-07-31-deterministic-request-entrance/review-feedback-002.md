# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ基準との照合

**B-18 import 検査テスト（`tests/unit/architecture/request-entrance-llm-boundary.test.ts`）**
- `grepE` ベースの実テストが `src/core/request/` と `src/core/command/request-*.ts` に対して LLM 系 port / adapter の import を grep で禁止していることを確認 ✓
- パターン: `port/agent-runner` / `port/session-client` / `port/anthropic-client` / `adapter/claude-code/` / `adapter/managed-agent/` / `adapter/codex/` / `adapter/dispatching/` の 7 パターン × 2 スコープ = 14 テスト
- 禁止 import を実際に追加すれば `expect(result).toBe("")` が fail = red になる構造を確認 ✓

**`request prompt` 出力検証（`tests/unit/command/request-prompt.test.ts`）**
- TC-001: `## Meta` / `## 背景` / `## 現状コードの前提` / `## 要件` / `## スコープ外` / `## 受け入れ基準` の 6 セクションを含む検査 ✓
- TC-001: `spec-change` / `new-feature` の type 選択規律 ✓
- TC-001: `specrunner request validate` の自己検証指示 ✓
- TC-002: `executePrompt()` が同期で `number` を返すことを確認（`typeof result === "number"`）✓
- TC-002: ソースに `one-shot-query-client` / `loadConfigWithOverlay` / `credentials` が現れないことを `readFileSync` で確認 ✓
- TC-003: `request-prompt.ts` が `buildScaffoldTemplate` を `./request.js` から import していることを確認 ✓
- TC-015: 出力に `architecture/` が含まれないことを確認 ✓

**廃止一本鎖の削除（`tests/unit/generate-chain-removed.test.ts` / `tests/unit/cli/deprecated-generate-removal.test.ts`）**
- TC-005: `src/` / `docs/` に `OneShotQueryClient` / `request-generate-system` / `request generate` の参照が 0 件 ✓
- TC-008: 5 ファイル（`request-create.ts` / `generator.ts` / `request-generate-system.ts` / `port/one-shot-query-client.ts` / `adapter/claude-code/one-shot-query-client.ts`）が存在しないことを `existsSync` で確認 ✓
- TC-009: `src/core/request/manager.ts` に `create` / `generator` / `OneShotQueryClient` が現れないことを確認 ✓
- TC-010: `src/core/port/index.ts` から OneShotQueryClient 系 re-export が除去されていることを確認 ✓
- TC-011: `src/core/usage/types.ts` に `"request-generate"` リテラルが残置されていることを確認 ✓

**スコープ外 file の保持（TC-012）**
- `src/adapter/claude-code/query-one-shot.ts` が存在することを確認（design.md D5 の意図的残置）✓

**drift-guard 更新（TC-013 / prompt-skeleton-drift-guard.test.ts）**
- `REQUEST_GENERATE_SYSTEM_PROMPT` の import が除去され、`ALL_14_AGENT_PROMPTS.length` が `toBe(14)` になっていることを確認 ✓
- TC-025 ブロックがコメントアウトではなく除去されていることを確認 ✓

**CLI subcommand / USAGE 文字列（TC-004, TC-007）**
- `removed-commands.test.ts` の TC-004 が `request generate` を未知サブコマンドとして exit 2 で拒否することを確認 ✓
- USAGE 文字列に `request prompt` が載り `request generate` が除去されていることを確認 ✓
- `docs/request-authoring.md` に `request prompt` の知識注入としての位置づけが追記されていることを確認 ✓

**生成系テストの削除（TC-014, TC-016）**
- 3 テストファイル（`request-create.test.ts` / `generator.test.ts` / `request-generate-system.test.ts`）の削除を確認 ✓
- `removed-commands.test.ts` から `vi.mock("../../../src/core/command/request-create.js")` が除去されていることを確認 ✓

**verification-result.md（TC-017）**
- build / typecheck / test / lint / changed-line-coverage の全フェーズが passed ✓
- 9790 tests passed, 654 test files ✓

### コードレビュー

- `src/core/command/request-prompt.ts`: `buildScaffoldTemplate` を `request.js` から import し、(a) 起票規律 / (b) 雛形 / (c) 自己検証指示の 3 部構成で出力 ✓
- `src/core/request/manager.ts`: `list` / `resolve` のみ残存、`create` / `generator` / `OneShotQueryClient` への言及なし ✓
- `src/core/usage/types.ts`: `"request-generate"` リテラルが union に残置されている ✓
- `src/cli/command-registry.ts`: `request prompt` サブコマンドが `executePrompt` を呼ぶ形で登録、USAGE 文字列更新済み ✓
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`: `ALL_14_AGENT_PROMPTS` に request-generate エントリなし、`toBe(14)` assertion ✓

## 検証できなかった項目

- B-18 の `grepE` 関数が runtime で本当に期待通りの exit code を返すかの実機動作（ただし同パターンの既存 architecture テストが 9790 passed の中に含まれており間接的に検証済みと判断）

## Findings 詳細

### F-01: B-18 regression guard tests が grepE を呼ばず trivially true

`tests/unit/architecture/request-entrance-llm-boundary.test.ts` の "B-18 regression guard" describe ブロック（行 107–135）の 2 テストは、非空の文字列リテラル `syntheticMatch` を作り `expect(syntheticMatch).not.toBe("")` を assert するだけで、`grepE` を一切呼んでいない。このテストは常に green になり、検出機構の健全性を実証していない。

実際の B-18 保護（最初の 2 つの describe ブロック）は grepE ベースの本物の検査であり機能は担保されている。acceptance criterion「sabotage で red になる」は上位 2 describe ブロックが満たす。regression guard のみが misleading。

### F-02: テスト実装の重複（低リスク）

`tests/unit/generate-chain-removed.test.ts`（291 行）と `tests/unit/cli/deprecated-generate-removal.test.ts`（291 行）が TC-005 / TC-007 / TC-008 / TC-009 / TC-010 / TC-011 / TC-012 / TC-014 / TC-016 を事実上同一の assertion で二重カバーしている。追加カバレッジなしに約 291 行分の重複メンテナンス負担が生じる。
