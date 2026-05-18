# Code Review Feedback — implementer-authority-edit-guard — iter 1

- **verdict**: approved
- **reviewer**: code-review (local)
- **date**: 2026-05-18
- **iteration**: 1

## Summary

実装は request.md / design.md / tasks.md / delta spec と整合し、`commitAndPush` 内 prefix-based guard と prompt fragment 注入が一体で動作する。受け入れ基準のうち functional 要件は全て満たされており、verification (build/typecheck/test) は green。残課題は MEDIUM / LOW の test coverage 補強で、CRITICAL / HIGH の欠陥は検出していない。

## Acceptance Criteria Compliance

| # | 受け入れ基準 | Status | 該当箇所 |
|---|---|---|---|
| 1 | staged diff path 検査 | ✓ | `src/core/step/executor.ts:315-322` |
| 2 | `specrunner/specs/` prefix → `AUTHORITY_SPEC_EDIT_VIOLATION` throw | ✓ | `src/core/step/executor.ts:319-321` + `src/errors.ts:252-262` |
| 3 | agent self-commit 経路でも HEAD diff path 検査 | ✓ | `src/core/step/executor.ts:294-302` |
| 4 | delta spec (`specrunner/changes/...`) は許可 | ✓ | prefix 区別 + TC-AUTH-02 / TC-AUTH-INT-02 |
| 5 | CliStep 経路は guard 影響なし | ✓ | `commitAndPush` は `runAgentStep` のみから呼ばれる構造 (executor.ts:226) |
| 6 | error に違反 path + 修復方法 | ✓ | `src/errors.ts:256-261` |
| 7 | implementer / spec-fixer prompt に MUST 明示 | ✓ | `src/prompts/authority-spec-guard.ts` + `implementer-system.ts:22` + `spec-fixer-system.ts:17` |
| 8 | TC-AUTH-INT-01 追記 | ✓ | `tests/pipeline-integration.test.ts:1728-1837` |
| 9 | typecheck + test green | ✓ | verification-result.md (172 files / 2083 tests passed) |
| 10 | spec authority に Requirement 反映 | ✓ (delta) | `specrunner/changes/implementer-authority-edit-guard/specs/step-execution-architecture/spec.md` (spec-merge で authority に反映予定) |

## Findings

### MEDIUM

#### M-01: request TC-AUTH-05 (CliStep regression test) が未実装

- **location**: `tests/unit/step/executor.commit.test.ts`
- **detail**: request.md は TC-AUTH-05 として「CliStep (kind="cli") は `commitAndPush` を通らず authority 編集が許可される (regression なし)」を要求。実装の TC-AUTH-05 は別シナリオ（src のみ staged → 正常完了）に差し替わっており、CliStep 経路の regression test はどこにも存在しない。
- **影響**: 実害は限定的（CliStep が `runCliStep` 経由で `commitAndPush` を呼ばない構造的事実は executor.ts:89 と 373 で明白）だが、将来の refactor で構造が崩れた際に検出する safety net がない。spec-review F-01 で既に MEDIUM として観測済み。
- **suggested**: `tests/unit/step/executor.commit.test.ts` に CliStep を実行し `commit` が呼ばれず authority 編集が許可されるテストを追加するか、`tests/pipeline-integration.test.ts` の TC-AUTH-INT で CliStep 経路を含める。

#### M-02: test-cases.md must-priority TC-AUTH-07 〜 TC-AUTH-12 / TC-AUTH-14 が未実装

- **location**: `tests/unit/step/executor.commit.test.ts`, `tests/prompts/`（新規）
- **detail**: test-case-gen が生成した test-cases.md は以下を `must` として要求しているが対応する test が存在しない:
  - TC-AUTH-07: CliStep 経路で authority 編集が許可される（M-01 と同件）
  - TC-AUTH-08: error message に "specrunner/changes/<slug>/specs/<capability>/spec.md" の修復案内が含まれる
  - TC-AUTH-09: `findAuthoritySpecViolations` に delta path のみ → 空配列
  - TC-AUTH-10: `findAuthoritySpecViolations` の prefix 厳密性
  - TC-AUTH-11: `IMPLEMENTER_SYSTEM_PROMPT` に MUST NOT 明示
  - TC-AUTH-12: `SPEC_FIXER_SYSTEM_PROMPT` に MUST NOT 明示
  - TC-AUTH-14: 複数 authority path が全て列挙される
- **影響**: 実装そのものは正しいが、prompt fragment の regression（次回 prompt 編集で誤って削除）や error message 文言変更を catch する unit test がない。
- **suggested**: 軽量な string assertion テスト（例: `expect(IMPLEMENTER_SYSTEM_PROMPT).toMatch(/specrunner\/specs\/.*MUST NOT/)`）を `tests/prompts/` 配下に 1 ファイル追加。`findAuthoritySpecViolations` を export して直接ユニットテスト化するのも有効。

### LOW

#### L-01: `findAuthoritySpecViolations` が module-internal で test 独立性が低い

- **location**: `src/core/step/executor.ts:27-29`
- **detail**: helper 関数が export されておらず、外部から直接 unit test できない。現状は `StepExecutor.execute` 経由の indirect test のみ。
- **影響**: なし（動作は guard 統合テストで担保されている）。
- **suggested**: TC-AUTH-09 / TC-AUTH-10 / TC-AUTH-19 のような prefix 境界テストを書くなら export 必要。任意。

#### L-02: delta spec Scenario の `requiresCommit` 条件が冗長

- **location**: `specrunner/changes/implementer-authority-edit-guard/specs/step-execution-architecture/spec.md:20-25`
- **detail**: "Staged commit with authority spec path is rejected" の GIVEN に `requiresCommit: true` が含まれるが、staged commit 経路（`hasChanges === true`）に `requiresCommit` は影響しない。spec-review F-02 で既に LOW として観測済み。
- **影響**: 仕様の誤読を招く可能性。動作には影響なし。
- **suggested**: `requiresCommit: true` を GIVEN から除去。

## Security Assessment

- **path 検査の bypass**: `git diff --cached --name-only` / `git diff a..b --name-only` は repo root 相対の正規化 path を返し、`../` や symlink trick で `specrunner/specs/` prefix を偽装する余地はない。defense-in-depth として適切。
- **CliStep 経由の bypass**: `commitAndPush` が `runAgentStep` 内のみから呼ばれる構造（executor.ts:226）により、AgentStep 全経路がカバーされる。spec-merge は CliStep として通常通り authority spec を更新できる（意図通り）。
- **prompt injection**: prompt fragment は補助、本体は executor の機械的 reject。prompt 注入で prompt 規律を無視させても guard で catch される。
- **総合**: セキュリティ上の懸念なし。

## Type Safety / Code Quality

- TypeScript `any` の使用なし。non-null assertion は対象 diff 周辺で検出されなかった。
- `gitExec` の戻り値 (`string | null`) は `if (headDiffOutput)` で正しく narrowing されている (executor.ts:296)。
- error code 追加・factory 追加・既存 error pattern との整合性 OK (`src/errors.ts:53, 252-262`)。
- `commitAndPush` の関数長は 80 行弱で許容範囲。
- 既存 helper (`makeGitSpawnFnWithRevParseSequence`) を `resolveGitResponse` で拡張する後方互換的な変更で、既存 TC-CAP-NEW-001 〜 008 を壊さない設計が確認できた。

## Test Coverage Summary

| TC (request) | 実装 | 備考 |
|---|---|---|
| TC-AUTH-01 (staged authority → reject) | ✓ | executor.commit.test.ts:528 |
| TC-AUTH-02 (delta only → normal) | ✓ | executor.commit.test.ts:563 |
| TC-AUTH-03 (mixed paths, authority only listed) | ✓ | executor.commit.test.ts:598 |
| TC-AUTH-04 (HEAD diff authority → reject) | ✓ | executor.commit.test.ts:629 |
| TC-AUTH-05 (CliStep allows authority) | ✗ | M-01 |
| TC-AUTH-06 (no violation → normal) | ✓ | executor.commit.test.ts:664 (impl 名は TC-AUTH-05) |
| TC-AUTH-INT-01 (PR #289/291 reproduction) | ✓ | pipeline-integration.test.ts:1728 |
| TC-AUTH-INT-02 (delta only pipeline normal) | ✓ | pipeline-integration.test.ts:1842 |

## Verdict Rationale

CRITICAL / HIGH なし。functional acceptance criteria 10 件はすべて満たされており、verification も green。M-01 / M-02 は coverage 不足だが、構造的に動作は担保されており blocker ではない。次 iteration ではなく follow-up issue で扱える範囲。

**verdict: approved**
