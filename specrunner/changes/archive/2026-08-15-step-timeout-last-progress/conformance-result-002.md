# Conformance Result — step-timeout-last-progress — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### spec.md — Requirements & Scenarios

**Requirement: Last-tool tracker records the most recent tool and its completion**

- `src/adapter/shared/last-tool-tracker.ts`: `onToolStart` sets `last = { tool, target, startedAt: now(), id, done: false }` replacing any prior entry. `onToolEnd` uses `const correlates = last.id === undefined || id === last.id` — id-tracked start rejects id-less end (false "completed" masked); id-less start accepts any end (best-effort). `timeoutHint()` returns exactly the three D4 strings. `reset()` nulls `last`.
- 各 Scenario がテストで固定されている:
  - In-flight at timeout → TC-001 ✓
  - Completed before timeout → TC-002 ✓
  - No tool observed → TC-003 ✓
  - Non-matching id does not clear in-flight → TC-004 ✓
  - TC-016 (asymmetric best-effort: id-less end does NOT clear id-tracked start; id-less start accepts any end) ✓
  - TC-021 (reset isolates retry attempts) ✓

**Requirement: claude-code timeout error carries the last-tool observation**

- `src/adapter/claude-code/agent-runner.ts`:
  - tracker は `run()` ごとに構築 ✓
  - `observeMessage` closure が `emitToolProgress` + tracker 呼び出しを 3 サイト（main work loop line 676、postWork follow-up line 963、output-repair line 1040）で統一 ✓
  - replay guard (`isReplay === true`) が先行 session の tool 完了で tracker を誤更新しない ✓
  - `tracker.reset()` が `runMainWorkTurn` の先頭で呼ばれ、retry attempt 間でステートが漏れない ✓
  - STEP_TIMEOUT catch ブロックで `hint: tracker.timeoutHint()` を設定 ✓
  - `emitToolProgress` は `observeMessage` に統合されており、3 サイトすべてで `step:progress` は変更なし ✓
- Scenarios:
  - TC-005: tool_use 観測後の無音 → hint に Bash / bun test / in-flight を含む ✓
  - TC-006: tool_result 観測後の無音 → hint に "completed before timeout" を含む ✓
  - TC-007: tool_use 未観測 → hint に "no tool observed" を含む ✓
  - TC-022: replay 付き tool_result が tracker state を変えない → hint が in-flight のまま ✓
  - TC-017: step:progress が 3 サイトすべてで引き続き emit される（TC-005 emitSpy + 専用 site 2 / site 3 テスト） ✓

**Requirement: codex timeout error carries the last-tool observation**

- `src/adapter/codex/agent-runner.ts`:
  - tracker は `run()` ごとに構築 ✓
  - `item.started` ハンドラで `extractCodexProgress ≠ null` のとき `tracker.onToolStart` 呼び出し ✓
  - `item.completed` ハンドラで `extractCodexProgress ≠ null` のとき `tracker.onToolEnd` 呼び出し（非 tool item は skip） ✓
  - `tracker.reset()` が `runMainWorkTurn` の先頭で呼ばれる ✓
  - STEP_TIMEOUT catch ブロックで `hint: tracker.timeoutHint()` を設定 ✓
- Scenarios:
  - TC-008: item.started 観測後の無音 → hint に Bash / bun test / in-flight を含む ✓
  - TC-009: item.completed 観測後の無音 → hint に "completed before timeout" を含む ✓
  - TC-010: tool 以外の item のみ / item なし → hint に "no tool observed" を含む ✓

**Requirement: the observation reaches the persisted step-attempt record**

- `src/core/step/step-halt.ts:131`: `makeTimeoutHalt` は `(err as { hint?: string }).hint ?? ""` を `ErrorInfo.hint` にコピー（変更なし）。
- TC-011: `makeTimeoutHalt` が非空の `hint` を `halt.error.hint` にそのまま伝播することをテストで固定 ✓
- `src/store/event-journal.ts` は main と byte-identical（`git diff main...HEAD` 出力なし）。`ErrorInfo.hint → events.jsonl` の書き込みパスは既存コードで確立済み ✓

**Requirement: existing timeout behavior is unchanged**

- `src/adapter/shared/inactivity-watchdog.ts`: main と byte-identical ✓
- `src/core/step/step-halt.ts`: main と byte-identical ✓
- `src/store/event-journal.ts`: main と byte-identical ✓
- `formatInactivityTimeoutMessage` の出力: 変更なし（message フィールドは固定、hint のみ付加）✓
- TC-012: `makeTimeoutHalt` が `kind=awaiting-resume`、`reason=timeout` を生成 ✓
- TC-013: `error.message` が `formatInactivityTimeoutMessage` の出力と byte-identical、hint は別フィールド ✓
- AC#5 既存 6 ファイル: `git diff main...HEAD` で差分なし（byte-identical to main）✓
  - `src/adapter/shared/__tests__/inactivity-watchdog.test.ts`
  - `src/core/step/__tests__/executor-sequential-regression.test.ts`
  - `src/core/step/__tests__/commit-orchestrator.test.ts`
  - `src/core/step/__tests__/executor-drift-detection.test.ts`
  - `src/core/step/__tests__/no-op-detect-exemption.test.ts`
  - `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts`

### request.md — Acceptance Criteria

| AC | Status |
|----|--------|
| claude-code runner: tool_use 観測後 timeout → エラー記録に tool 名・target・経過を含む | ✓ TC-005 |
| codex runner: item.started 観測後 timeout → 同様の情報を含む | ✓ TC-008 |
| tool 完了(tool_result / item.completed)後の無音で timeout → in-flight でない旨が読み取れる | ✓ TC-006, TC-009 |
| tool を一度も観測せず timeout → "no tool observed" 相当を含む | ✓ TC-007, TC-010 |
| 既存 watchdog テストの更新対象を design で全列挙、列挙外は無変更で green | ✓ design.md AC#5 表、6 ファイル全て byte-identical |
| `typecheck && test` green | ✓ verification-result.md: all phases passed (768 test files, 11473 tests) |

---

## 検証できなかった項目

- **TC-018 (wall-clock timeout も hint を受け取る)**: test-cases.md で "could" 優先度のため、テスト不在は許容される。
- **events.jsonl への完全ラウンドトリップ検証 (TC-011)**: テストは `makeTimeoutHalt` 境界での伝播を固定しており、event-journal への書き込み→読み戻しは既存の確立済みパスとして扱う。設計で確認済み。

## Findings 詳細

None。spec.md の全 Requirement / Scenario および request.md の全受け入れ基準が実装・テストで満たされている。
