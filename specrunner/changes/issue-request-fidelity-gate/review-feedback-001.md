# Code Review Feedback — issue-request-fidelity-gate — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（80 ファイル変更。主要追加: gate / comparator / adapter / 接続テスト群）
- `design.md` / `tasks.md` / `test-cases.md`（28 TC）を精読
- `src/core/gate/issue-fidelity-gate.ts` — gate orchestrator 全判定ロジック（9 ステップ）
- `src/core/command/runner.ts` — gate 挿入位置（registerCleanup 後・pipeline.run 前）および halt path
- `src/core/command/pipeline-run.ts` — `inboxOrigin` / `issueNumber` の state への設定
- `src/core/command/resume.ts` — ResumeCommand への comparatorFactory 注入
- `src/cli/run.ts` / `src/cli/resume.ts` — composition root 注入（createIssueFidelityComparator）
- `src/adapter/claude-code/issue-fidelity-comparator.ts` — queryOneShot 利用・JSON parse・fail-closed
- `src/adapter/github/github-client.ts` — getIssue adapter（endpoint / header / null body / error 変換）
- `src/kernel/github-client.ts` — getIssue port 定義
- `src/prompts/issue-fidelity-system.ts` — system prompt / user message builder（contract 文言）
- `src/core/port/issue-fidelity-comparator.ts` — port 定義（core 層に閉じている）
- `src/state/schema/types.ts` — `inboxOrigin?: boolean` 追加
- `src/errors.ts` — ISSUE_FIDELITY_UNDECLARED_DROP / ISSUE_FETCH_FAILED 追加確認
- `src/core/inbox/run-inbox.ts` — `runRunCore(…, { inboxOrigin: true })` 配線
- `src/state/lifecycle.ts` — `transitionJob` が `...state` で `inboxOrigin` を保持することを確認
- `src/state/schema/operations.ts` — `appendHistoryEntry` が `...state` spread で全フィールド保持を確認
- テストファイル全種を精読:
  - `tests/unit/core/command/runner-fidelity-gate.test.ts`（TC-001〜008, 011, 026, 027）
  - `tests/unit/core/gate/issue-fidelity-gate.test.ts`（TC-022〜025 + AC4/AC5/AC6/AC1 unit variants）
  - `tests/unit/adapter/github/github-client-get-issue.test.ts`（TC-009, 010, 013）
  - `tests/unit/adapter/claude-code/issue-fidelity-comparator.test.ts`（TC-019, 020, 021）
  - `tests/unit/prompts/issue-fidelity-prompt-contract.test.ts`（TC-012）
  - `tests/unit/errors/issue-fidelity-error-codes.test.ts`（TC-014）
  - `tests/unit/state/inbox-origin-schema.test.ts`（TC-015, 016）
  - `tests/unit/core/command/pipeline-run-inbox-origin.test.ts`（TC-017）
  - `tests/unit/inbox/run-inbox-inbox-origin.test.ts`（TC-018）
  - `tests/unit/core/port/issue-fidelity-comparator-layering.test.ts`（TC-028）
- `specrunner/changes/issue-request-fidelity-gate/verification-result.md` — 696 test files passed、typecheck passed

## AC 対応確認

| AC | 結果 |
|----|------|
| AC1: undeclared drop ≥1 → 全 step 未実行 escalation halt（破壊確認込み） | ✅ TC-002, TC-026 |
| AC2: drop 0 → gate 通過・request-review 通常開始 | ✅ TC-004 |
| AC3: 照合 prompt contract 文言 | ✅ TC-012 |
| AC4: issue 本文が state/folder/step prompt に現れない | ✅ unit 層（gate.test.ts sentinel check）+ 型制約。integration 層は構造的 gap あり（F-03） |
| AC5: --issue なしで gate/fetch 不発火 | ✅ TC-006 |
| AC6: inbox skip・理由 log | ✅ TC-007, TC-018 |
| AC7: fetch 失敗 pass 扱いにならず halt | ✅ TC-008 |
| AC8: getIssue adapter（endpoint / 認証 header / エラー変換） | ✅ TC-009, TC-010, TC-013 |
| AC9: halt 後 request.md 修正 resume で gate 再評価 | ✅ TC-011 |
| AC10: typecheck && test green | ✅ verification-result.md |

## 検証できなかった項目

None（全 AC・全 TC 28 件を上記ファイル群で確認済み）

## Findings 詳細

### F-01: scopeConfigWarning が halt path で emit される

`runner.ts` L276-279 の `scopeConfigWarningForJob` 呼び出しは `if (gateDecision.kind === "halt")` チェックより前にある。gate halt 時にも scope 警告が出力され、pipeline が走らないのに無関係な警告が表示される。

修正: `if (gateDecision.kind !== "halt")` ブロック内に移動する。

### F-02: wiring error が `ISSUE_FETCH_FAILED` を使う

`issue-fidelity-gate.ts` L106 / L149 で comparator 未注入・comparator throw の halt code に `ISSUE_FETCH_FAILED` を使用。tasks.md では "ISSUE_FETCH_FAILED 相当" と明示されているため deliberate な選択。reason message は正確（"comparator not injected (wiring error)"）なため運用上の実害は低い。専用 code を追加すれば診断性が向上するが、current design でも受け入れ可能。

### F-03: TC-005 integration テストが AC4 非伝播を実際には検証していない

`runner-fidelity-gate.test.ts` TC-005 では `mockEvaluateGate` でゲートをモックするため、実 issue body は gate 内で fetch されず sentinel は `_testIssueBodySentinel` という非標準フィールドに置かれているだけ。「gate 経由で fetch された issue body が state/folder に残らない」property は integration 層では未検証。

AC4 の実効的な歯は:
1. `issue-fidelity-gate.test.ts` L289-312（sentinel を含む issue body を gate に渡し、halt.reason に含まれないことを確認）
2. `GateDecision` 型構造（issue body フィールドなし）
3. `runner.ts` の halt path が `gateDecision.reason`（drop 列挙のみ）しか state に書き込まない

機能上の欠陥ではなく test quality 問題。
