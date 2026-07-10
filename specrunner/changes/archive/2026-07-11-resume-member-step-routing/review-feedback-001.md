# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | testing | `src/core/lifecycle/__tests__/exit-guard.test.ts:311` | TC-008（must）が global scan モードで events.jsonl 行数を確認しているが、`handleGlobalExit` は signal フラグに関係なく `appendInterruption` を呼ばない設計のため、シグナルガードの実効性を検証していない。`isSignalHandlerFired()` チェックを削除してもこの test は pass する。 | per-job または no-worktree モードで同ケースを再テストするか、global scan 経由での status 維持（TC-018 と役割分担）として明示的に書き換える。 | yes |
| 2 | medium | testing | `src/core/lifecycle/signal-state.ts:1` | TC-015（must）— モジュール単体の初期値・mark・reset サイクルの明示テストが欠落。T-04 acceptance criteria（初期 false / mark → true / reset → false）は exit-guard.test.ts の副作用として間接的にしか担保されていない。 | `signal-state.test.ts` を追加し、`isSignalHandlerFired()` の初期値、`markSignalHandlerFired()` 後の状態、`resetSignalHandlerFiredForTest()` 後の状態を独立したアサーションで固定する。 | yes |
| 3 | medium | testing | `src/core/runtime/local.ts:961` | TC-016（must）— `signalCleanup` が最初の `await` より前に `markSignalHandlerFired()` を呼ぶことの自動テストが存在しない。実装は正しい（コード検査で確認済み）が、この順序保証は将来の編集で崩れうる。 | `signalCleanup` の呼び出し開始後・最初の `await` 到達前に `isSignalHandlerFired()` が `true` になることを確認する test を追加する。`store.load` をモックして同期的に確認する形が現実的。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.9

## Summary

実装は正確。受け入れ基準をすべて充足しており、verification（6439 テスト・typecheck・lint・changed-line-coverage）が green であることを確認した。

**ルーティング修正**（T-01/T-02/T-03）は設計通りに実装されている。`mapMemberToCoordinator` は coordinator 変換を `resolveResumeStep` 内に集約し、`resume.ts` の変更は 1 行（引数追加のみ）。`stateStep` フォールバック分岐はマッピング対象外とする TC-013 の意図も実装が保持している。`buildAllowedStepSet` は reviewers 存在時のみ coordinator を許可集合に加える（零レビュアー不変条件を維持）。

**シグナル重複抑止**（T-04/T-05/T-06）も正確。`markSignalHandlerFired()` は `signalCleanup` の先頭で同期呼び出しされており、`handleNoWorktreeExit` / `handlePerJobExit` / `handleGlobalExit` の 3 handler すべてに early return guard が追加されている。

指摘 3 件はいずれも test 品質の問題（動作バグなし）であり、非ブロッキング。

### 実装検査メモ

**must テストケース充足状況**

| TC | 優先 | カバー状況 |
|----|------|----------|
| TC-001 | must | resolve-step.test.ts line 177 ✓ |
| TC-004 | must | resolve-step.test.ts line 185 ✓ |
| TC-006 | must | resolve-step.test.ts line 140 ✓ |
| TC-008 | must | exit-guard.test.ts line 311（global scan 経由のため appendInterruption 実効性に疑義 → Finding #1） |
| TC-009 | must | exit-guard.test.ts line 350 ✓ |
| TC-015 | must | 明示 test なし（間接担保のみ → Finding #2） |
| TC-016 | must | 自動 test なし（コード検査で正しさ確認 → Finding #3） |
| TC-018 | must | exit-guard.test.ts line 333 ✓ |
| TC-019 | must | member-resume-routing.test.ts line 107 ✓ |

**受け入れ基準の充足**

| 基準 | 状態 |
|------|------|
| member resumePoint → escalate に落ちずに終端 | ✓ TC-001 / TC-019 |
| approved 済み member が再実行されない | ✓ TC-019 |
| `--from <member名>` の挙動テスト | ✓ TC-004 |
| 静的 step / regression-gate からの resume 既存テスト green | ✓ backward compat group |
| シグナル停止 → interruption 1 件 | TC-008/TC-018（TC-008 実効性は Finding #1 参照） |
| exit-guard 単独 → interruption 従来通り 1 件 | ✓ TC-009 |
| 既存テスト無変更 green | ✓ 6439 tests passed |
| typecheck && test green | ✓ verification passed |
