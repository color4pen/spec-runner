# Tasks: resume の再開位置解決を resumePoint の記録から素直に決定する

## T-01: resolveResumeStep を簡素化する（推理撤去 + alias 撤去）

- [x] `src/core/resume/resolve-step.ts` の `resolveResumeStep` を書き換え、シグネチャを `(from: string | undefined, resumePoint: ResumePoint | null): StepName` にする（`descriptor` / `fallbackStep` / `steps` パラメータを撤去）。
- [x] 新ロジック: (1) `from` が登録 step 名なら `from` を返す。(2) `from` が定義済みだが未登録なら、有効 step 名（`AGENT_STEP_NAMES` + `CLI_STEP_NAMES`）を列挙したエラーを throw する（legacy alias は列挙しない）。(3) `from` 未指定で `resumePoint !== null` なら `resumePoint.step` を返す。(4) `from` 未指定で `resumePoint === null` なら防御的に Error を throw する（D5）。
- [x] Tier 2a（fixer-empty detection）/ Tier 2b（review 枯渇 → fixer 推理）/ Tier 3（null fallback → critic 推測）を削除する。
- [x] legacy alias 関連を削除する: `LegacyResumeRole` / `ResumeRole` / `LEGACY_RESUME_ROLES` / `ResumeFrom`、および alias 解決に使う descriptor 由来ヘルパー（`isSpecPhase` / `getReviewerSteps` / `getFixerToLoop` / `reviewerOf` / `creatorOf` / `buildStepMapping`）のうち未使用になるものをすべて削除する。
- [x] これらの型・定数が `src/` 内の他所から import されていないことを確認する（現状は resolve-step.ts 内のみで自己完結）。

**Acceptance Criteria**:
- `resolveResumeStep` は `resumePoint` があれば `resumePoint.step` を verbatim で返す（re-inference なし）。
- `--from <step-name>` でその step 名を返す。
- `--from` legacy alias / 未登録値はエラーになる。
- `src/core/resume/resolve-step.ts` の行数が現行 237 行の 50% 以下（≤118 行）になる。
- `bun run typecheck` が green。

## T-02: ResumeCommand.prepare() の呼び出しを新シグネチャへ追従する

- [x] `src/core/command/resume.ts` の `resolveResumeStep` 呼び出しを `resolveResumeStep(this.options.from, resumePoint)` に変更する。
- [x] 不要になった `fallbackStep` の算出（`resumePoint === null ? state.step : undefined`）と `state.steps` の受け渡しを削除する。
- [x] `resolveResumeStep` のためだけに使っていた `getPipelineDescriptor` / `getPipelineId` / `descriptor` が他で未使用なら import ごと削除する（他で使っていれば残す）。
- [x] null `resumePoint` + `--from` 未指定のガード（「再開位置が不明です。`--from` で再開 step を指定してください」を `logError` し `PrepareError(1)` を投げる）は現行のまま維持する。

**Acceptance Criteria**:
- resume コマンドが新シグネチャでビルドできる（`bun run typecheck` green）。
- null `resumePoint` + `--from` 未指定で exit code 1 と当該 Japanese メッセージが出る（挙動不変）。

## T-03: CLI の --from 受理値から legacy alias を撤去する

- [x] `src/cli/command-registry.ts` の `resume.flags.from.values` から `"critic"` / `"fixer"` / `"creator"` を除去し、`[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]` のみにする。

**Acceptance Criteria**:
- `specrunner resume <slug> --from critic`（等）が未登録値として拒否される。
- `specrunner resume <slug> --from code-fixer`（登録 step 名）は受理される。

## T-04: handleExhausted が resumePoint に対の fixer step を記録する

- [x] `src/core/pipeline/pipeline.ts` の `handleExhausted` で、`resumePoint.step` に書く値を `this.loopFixerPairs[exhaustedLoopName] ?? exhaustedLoopName` で算出した step にする。
- [x] error code（`LOOP_ERROR_CODES` 参照）と「最終 reviewer entry の verdict を `escalation` へ上書き」する処理は従来通り `exhaustedLoopName`（reviewer）基準のまま保持する。変更は `resumePoint.step` フィールドのみ。
- [x] `exhaustionPhase` / `iterationsExhausted` の記録は据え置く。

**Acceptance Criteria**:
- code-review 枯渇時に `resumePoint.step === "code-fixer"`。
- spec-review 枯渇時に `resumePoint.step === "spec-fixer"`。
- verification 枯渇時に `resumePoint.step === "build-fixer"`。
- 対の fixer を持たない loop step（conformance）の枯渇時は `resumePoint.step` が当該 step 自身のまま（挙動据え置き）。
- error code と `exhaustionPhase` は従来と同じ値が記録される。

## T-05: resolve-step の単体テストを更新する

- [x] `tests/unit/core/resume/resolve-step.test.ts` を新仕様へ更新する: legacy alias（critic/fixer/creator）テスト、fixer-empty detection（issue #236）テスト、Tier 2b（reviewer + iterationsExhausted>0 → fixer）テスト、Tier 3（null fallback → critic）テストを削除する。
- [x] 新規ケースを追加する: `resumePoint` ありで `resumePoint.step` を verbatim 返却（crash の reviewer/fixer/その他 step）、`--from <step-name>` で当該 step 返却、`--from` 未登録値でエラー（alias が列挙に出ないこと）。
- [x] `tests/unit/core/pipeline/pipeline-roles.test.ts` のうち `resolveResumeStep` を旧シグネチャ／alias／Tier 2b 前提で呼ぶケース（例: `--from fixer`→code-fixer、`--from creator/critic`、spec-review exhausted→spec-fixer を `resolveResumeStep` で検証する箇所）を、新シグネチャと新仕様へ更新するか、`handleExhausted` 側の検証（T-07）へ移す。

**Acceptance Criteria**:
- 撤去した推理に紐づくテストが残っていない。
- 新仕様（verbatim 返却 / --from step 名 / alias 撤去）を検証するテストが存在する。
- `bun run test tests/unit/core/resume/resolve-step.test.ts tests/unit/core/pipeline/pipeline-roles.test.ts` が green。

## T-06: CLI resume の統合テストを新挙動へ更新する

- [x] `tests/unit/cli/resume.test.ts` の TC-RESUME-013（#236 fixer-empty）を、pipeline 起動 step が `code-fixer`（記録された step）になる新挙動へ更新する。
- [x] TC-RESUME-006（null resumePoint + `--from`）の `from: "fixer"`（legacy alias）を具体 step 名（例: `from: "spec-fixer"`）へ置き換える。
- [x] TC-RESUME-005（null resumePoint + `--from` 未指定 → exit 1 + 「再開位置が不明」）が引き続き通ることを確認する。

**Acceptance Criteria**:
- `bun run test tests/unit/cli/resume.test.ts` が green。
- legacy alias を渡すテストが残っていない。

## T-07: pipeline 枯渇の統合テストで resumePoint.step を検証する

- [x] `tests/unit/core/pipeline/pipeline.transitions.test.ts` の TC-NEW-05（spec-review 枯渇）が `resumePoint.step === "spec-fixer"` を返すことを検証するアサーションを更新する。
- [x] `tests/store/event-journal.test.ts` の TC-006 を新挙動（verbatim return）へ更新する。

**Acceptance Criteria**:
- 枯渇統合テストが green。
- `resumePoint.step` が対の fixer step であることが少なくとも 1 つの統合テストで検証される。

## T-08: 全体検証

- [x] `bun run typecheck && bun run test` が green。
- [x] `resolveResumeStep` の行数削減（≤118 行）と受け入れ基準の全項目を確認する。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- request.md の受け入れ基準がすべて満たされている。
