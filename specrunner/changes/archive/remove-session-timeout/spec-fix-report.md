## Spec Fix Report

spec-review iteration 1 (spec-review-result-001.md) の findings に基づく修正記録。

### Applied Fixes

| # | Finding | File Modified | Change Description |
|---|---------|--------------|-------------------|
| 1 | #1 (HIGH): message-streaming scope creep | specs/message-streaming/spec.md | 元の delta（wall-clock timeout を参照するよう Requirement 本文を変更し、`Polling timeout` Scenario を削除）を修正。Requirement 本文を main spec に戻し、`Polling timeout` Scenario（30 attempts fail-safe）を復元。CLI step session timeout とは別軸の Web UI polling fail-safe であるため、撤廃しない。同時に proposal.md, design.md から該当行を削除/訂正 |
| 2 | #1 (HIGH): proposal.md の message-streaming 記述削除 | proposal.md | `## Modified Capabilities` から `message-streaming` 行をコメントアウトして scope 外と明示 |
| 3 | #1 (HIGH): design.md の message-streaming 記述訂正 | design.md | D4 Decision の「7 spec」を「6 spec」に訂正し、`message-streaming` は scope 外と明記。Goals の「関連 7 spec」も同様に訂正。Migration Plan §5 の「7 spec」も訂正 |
| 4 | #2 (MEDIUM): path drift 修正 | proposal.md | `src/core/steps/executor.ts` → `src/core/step/executor.ts`、`src/core/state/validate.ts` → `src/state/schema.ts`、`src/core/config/schema.ts` → `src/config/schema.ts` に修正。`session-runner.ts` と `completion.ts` の adapter 層も Impact に追加 |
| 5 | #2 (MEDIUM): path drift 修正 | design.md | Migration Plan §1 の path を実体に合わせて修正 |
| 6 | #2 (MEDIUM): getTimeoutMs ヘルパー削除タスク追加 | tasks.md | §1.1 の path を `src/state/schema.ts` に修正。§3.3/3.4 を `src/core/step/executor.ts` に修正。§3.5/3.6 として adapter 層（session-runner.ts, completion.ts）の timeoutMs 削除タスクを追加 |
| 7 | #2 (MEDIUM): getTimeoutMs ヘルパー削除タスク追加 | tasks.md | §4.3 に `src/config/schema.ts` の `getTimeoutMs(stepName, cfg)` ヘルパー削除タスクを追加 |
| 8 | #3 (MEDIUM): hang リスク mitigation 明文化 | design.md | Risks §1 に「Out of scope but tracked #1/2」として (1) cancel smoke test と (2) elapsed time 可視化 UX の 2 点を明記 |
| 9 | #4 (LOW): 「706 件」absolute literal を相対表現に修正 | proposal.md | 「既存テスト全件 PASS（変更前ベースライン比で减少なし、timeout 関連テスト削除分を除く）」に書き換え |
| 10 | #4 (LOW): 「706 件」absolute literal を相対表現に修正 | design.md | Goals と Risks セクションの「706 件」を同様の相対表現に書き換え |
| 11 | #4 (LOW): 「706 件」absolute literal を相対表現に修正 | tasks.md | §6.3 を「bun test で全件 pass 確認（変更前ベースライン比で減少なし）」に書き換え |
| 12 | #5 (LOW): pollIntervalMs 扱いの明確化 | specs/cli-config-store/spec.md | REMOVED Reason を「pollIntervalMs は timeout とは別軸であり本 request の削除対象外として schema に残置（当面 tagged optional として維持）」に書き換え |
| 13 | #5 (LOW): pollIntervalMs 扱いの明確化 | tasks.md | §4.4 として「`pollIntervalMs` を残す/定数化するかを決定して schema を整える」タスクを追加 |
| 14 | #6 (LOW): state.error.code 正規定義の明示 | specs/job-state-store/spec.md | `JobStateStore is the Sole Persistence Authority` Requirement 本体（Scenarios の上）に `state.error.code` 正規定義テーブルを追加し、「これが正規定義」と明示 |

### Skipped Findings

なし（全 findings を適用済み）。MEDIUM/LOW findings も request.md の意図に反しないため全て適用した。

### Notes

- Finding #1 は「delta をこの change から削除する」が推奨方針だったが、ファイル削除が不可能なため `message-streaming/spec.md` は main spec と同等の内容（30 attempts Polling timeout Scenario を保持）の MODIFIED として残した。delta としての有効性を維持しつつ、scope creep の本質（wall-clock timeout 参照の追加と fail-safe 削除）を修正した
- Finding #2 の `src/adapter/anthropic/session-runner.ts` と `completion.ts` は「撤廃 or 内部 default 化のいずれかを実装時に確定する」として tasks.md に追加した。どちらにするかは実装者が実際のコードを確認して判断する
