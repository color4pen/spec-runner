# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コード前提の確認（request.md の現状コード前提）

| 前提 | 場所 | 確認結果 |
|------|------|----------|
| `verificationResultPath(slug)` が iteration 番号を持たない | `src/util/paths.ts:67` | ✅ `specrunner/changes/<slug>/verification-result.md` を返す（iteration なし）|
| `runVerification` の戻り値が破棄される | `src/core/step/verification.ts:49` | ✅ `await runVerification(...)` の戻り値が変数に代入されていない |
| VERIFICATION hint が連番ファイルを案内している | `src/core/pipeline/types.ts:176` | ✅ `` hint: (nnn) => `Review verification-result-${nnn}.md...` `` — 生成されない連番を参照 |
| `PhaseName` 定義 | `src/core/verification/phases.ts:11` | ✅ `"build" \| "typecheck" \| "test" \| "lint" \| "security" \| "test-coverage"` |
| `CliStep.run` の戻り型が `Promise<void>` | `src/core/port/step-types.ts:339` | ✅ 現在 `Promise<void>` |
| `build-fixer.ts` の reads 宣言と findingsPath | `src/core/step/build-fixer.ts:64-94` | ✅ `verificationResultPath(deps.slug)` を reads/enrichContext/buildMessage すべてで参照 |
| `PhaseResult` が stdout/stderr/durationMs/skippedCount を含む | `src/core/verification/runner.ts:31-46` | ✅ 確認。D3 の「落とす」対象フィールドが実在する |

### 設計判断の妥当性確認

- **D1（`CliStep.run()` 戻り型 widen）**: `void` は `CliStepRunOutcome | void` に代入可能。bite-evidence `step.ts` / `pr-create.ts` の `run: async () => {}` は無改修で通る。✅
- **D2（`StepOutcome.verificationPhases` 新フィールド）**: `StepOutcome` の既存パターン（`followUpAttempts`, `skipReason`, `addedTurns` 等の optional フィールド）と一致。後方互換。✅
- **D3（最小投影）**: `PhaseResult` → `{phase, status, exitCode}` のみ。stdout/stderr は markdown（無変更）に残る。journal 肥大化を回避。✅
- **D4（verdict 導出から分離）**: `projectSuccess` → `pushStepResult` に `verificationPhases` を通す経路が `deriveStepCompletion` / `parseResult` に触れないことを確認。`runCliStep` の verdict 導出（line 608）は unchanged。✅
- **D5（hint 修正）**: `LoopErrorShape.hint: (nnn: string) => string` の型に対し、引数を無視する lambda は型互換。`pipeline.ts:762` の `errorShape.hint(nnn)` 呼び出しは機能継続。✅

### journal round-trip の安全性確認

- `fold()` が `StepAttemptRecord.outcome` から `StepRun.outcome` を再構築する箇所（`event-journal.ts:364-374`）は conditional spread パターンで各フィールドを個別に通す。新フィールド `verificationPhases` を同パターンで追加すれば round-trip は成立する。✅
- `stepRunToRecord()` も同パターン（`event-journal.ts:440-450`）。✅
- `normalizeSteps`（`state/schema/operations.ts:70-72`）は `"attempt" in obj && "outcome" in obj` の current-shape を `as unknown as StepRun` で passthrough する。新フィールドを含む record はそのまま通る。✅

### タスク依存関係の確認

T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → T-07 → T-08 の順序は正しい。各タスクが前段の型定義に依存する構造になっており、順次実装で型エラーなく進められる。✅

### テスト配置の確認

- `tests/unit/core/step/verification-step.test.ts` ✅ 存在確認
- `tests/store/event-journal.test.ts` ✅ 存在確認
- `tests/unit/core/step/executor-cli-entry-oid.test.ts` ✅ 存在確認（TC-05 の参照先）
- `tests/unit/pipeline/` ✅ 存在確認（TC-06 の配置先）
- `LOOP_ERROR_CODES` の既存テストが `tests/unit/pipeline/` に存在しないことを確認。TC-06 は新規ファイル作成になる。✅

### セキュリティ確認

- `phase` フィールドは `PhaseResult.phase`（commands パスではユーザー config の `command.name`）由来。JSON シリアライズされるため injection リスクなし。
- `exitCode` は `number | null`、`status` は union literal — 型安全。
- journal への書き込みは内部経路のみ（CLI step → `stepRunToRecord` → append）。外部 HTTP 入力なし。
- OWASP 観点：A3（Injection）リスクなし（JSON エスケープ）、A8（Integrity Failures）なし（append-only journal は不変）。

## 検証できなかった項目

- **T-05 の戻り型アノテーション変更の必要性**: `VerificationStep.run` の明示的 `: Promise<void>` アノテーションは、`return { verificationPhases }` を追加すると TypeScript エラーになる。T-05 のタスク記述はアノテーション変更に言及していないが、`tsc` AC（T-06 で要求）が通れば自然に対応されるため、実装上の障害にはならない。テスト実行による確認は未実施（実装前レビューのため）。

## Findings 詳細

None
