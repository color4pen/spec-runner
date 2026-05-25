# Tasks: delta-validation-post-code-review

## Phase 1: Type / Interface Extensions

### Task 1: Extend Transition type with `when` predicate

- [x] `src/core/pipeline/types.ts`: `Transition` interface に `when?: (state: JobState) => boolean` を追加
- [x] `JobState` の import を `../../state/schema.js` から追加 (既存 import source)
- [x] 既存の `STANDARD_TRANSITIONS` は `when` なしのため変更不要

**Dep**: なし

### Task 2: Extend DeltaSpecViolationReason union

- [x] `src/core/spec/delta-spec-validator.ts`: `DeltaSpecViolationReason` union に `"authority-spec-direct-edit"` を追加

**Dep**: なし

### Task 3: Extend DeltaSpecRuleName union + DeltaSpecRuleInput

- [x] `src/core/spec/rules/types.ts`: `DeltaSpecRuleName` union に `"no-authority-spec-direct-edit"` を追加 (11 項目に)
- [x] `src/core/spec/rules/types.ts`: `DeltaSpecRuleInput` に `changedFiles?: string[]` を追加 (repo root 相対パスの配列)

**Dep**: Task 2 (DeltaSpecViolation 型で使う reason が定義されている必要がある)

### Task 4: Extend validateDeltaSpecPaths signature

- [x] `src/core/spec/delta-spec-validator.ts`: `validateDeltaSpecPaths()` に optional `changedFiles?: string[]` param を追加
- [x] `ruleInput` 構築時に `changedFiles` を含める: `{ changePath, deps, requestType, baselineSpecLoader, changedFiles }`

**Dep**: Task 3

---

## Phase 2: Core Implementation

### Task 5: Implement no-authority-spec-direct-edit rule

- [x] 新規ファイル `src/core/spec/rules/no-authority-spec-direct-edit.ts`
- [x] `DeltaSpecRule<DeltaSpecRuleName>` 実装、name: `"no-authority-spec-direct-edit"`、severity: `"error"`
- [x] `check(input)`:
  - `input.changedFiles` が undefined → return `[]` (skip)
  - `input.changedFiles` から `specrunner/specs/` prefix のパスを filter
  - delta path (`specrunner/changes/` prefix) は除外
  - 違反パスごとに `{ path, reason: "authority-spec-direct-edit", suggested: "..." }` を返す
  - suggested: `"Revert with git checkout and move changes to specrunner/changes/<slug>/specs/<capability>/spec.md"`
- [x] `commit-push.ts` の `AUTHORITY_SPEC_PREFIX` と同じ prefix (`"specrunner/specs/"`) を使用

**Dep**: Task 2, Task 3

### Task 6: Register rule in registry

- [x] `src/core/spec/rules/index.ts`: `no-authority-spec-direct-edit` を import + `createDeltaSpecRegistry()` に登録 (10 rule に)

**Dep**: Task 5

### Task 7: Inject changedFiles in DeltaSpecValidationStep

- [x] `src/core/step/delta-spec-validation.ts`: `run()` 内で git diff を実行
  - `deps.request.baseBranch` から base branch 取得
  - `deps.spawn` で `git diff <baseBranch>..HEAD --name-only` を実行
  - stdout をパースして `changedFiles: string[]` を構築
  - git diff 失敗時は `changedFiles = undefined` (graceful degradation)
- [x] `validateDeltaSpecPaths()` 呼び出し時に `changedFiles` を渡す

**Dep**: Task 4, Task 6

### Task 8: Update pipeline transition lookup

- [x] `src/core/pipeline/pipeline.ts` line 245-247: transition lookup に `when` 評価を追加
  ```typescript
  const transition = this.transitions.find(
    (t) => t.step === currentStep && t.on === outcome && (!t.when || t.when(state)),
  );
  ```

**Dep**: Task 1

### Task 9: Update STANDARD_TRANSITIONS

- [x] `src/core/pipeline/types.ts`: `STANDARD_TRANSITIONS` を以下のように変更
  - **置換**: `{ step: CODE_REVIEW, on: "approved", to: ADR_GEN }` → `{ step: CODE_REVIEW, on: "approved", to: DELTA_SPEC_VALIDATION }`
  - **追加 (conditional)**: `{ step: DELTA_SPEC_VALIDATION, on: "approved", to: ADR_GEN, when: (s) => (s.steps?.["code-review"]?.length ?? 0) > 0 }`
  - **配列順序**: conditional (`→ adr-gen`) を既存の fallback (`→ spec-review`) の前に配置
- [x] 既存の `delta-spec-validation approved → spec-review` (line 74) はそのまま残す (fallback)
- [x] `delta-spec-validation needs-fix → delta-spec-fixer` と `delta-spec-fixer approved → delta-spec-validation` もそのまま (2 回目 phase で自動的に機能)
- [x] JSDoc コメントを更新して 2 回目 phase を説明

**Dep**: Task 1, Task 8

### Task 10: Extend delta-spec-fixer prompt

- [x] `src/core/step/delta-spec-fixer.ts`: `buildDeltaSpecFixerInitialMessage()` に以下を追加:
  ```
  7. If violations include `authority-spec-direct-edit`:
     a. Revert the authority spec edit: git checkout <baseBranch> -- <violated-path>
     b. Write the intended changes to the delta path: specrunner/changes/<slug>/specs/<capability>/spec.md
  ```
- [x] `buildDeltaSpecFixerContinuationMessage()` にも同様の指示を追加
- [x] `baseBranch` を `buildMessage()` 内で `state` から取得して prompt に渡す

**Dep**: なし (独立して実装可能)

### Task 11: Convert commit-push.ts halt to warning

- [x] `src/core/step/commit-push.ts` staged-changes path (line 92-98):
  - `throw authoritySpecEditViolationError(step.name, stagedViolations)` を削除
  - `stderrWrite(`Warning: authority spec edit detected in staged files: ${stagedViolations.join(", ")}. Continuing — delta-spec-validation will handle.\n`)` に変更
  - commit は続行 (throw しないので自然に次の行へ)
- [x] HEAD-diff path (line 74-78):
  - `throw authoritySpecEditViolationError(step.name, headViolations)` を削除
  - `stderrWrite(`Warning: authority spec edit detected in agent commits: ${headViolations.join(", ")}. Continuing — delta-spec-validation will handle.\n`)` に変更
  - push は続行
- [x] `authoritySpecEditViolationError` の import は残す (他で使われていなければ削除) → 削除済み
- [x] `findAuthoritySpecViolations()` は維持 (検出ロジックは health check に有用)

**Dep**: なし (独立して実装可能)

### Task 12: Update rules.ts

- [x] `src/prompts/rules.ts`: System Facts セクションに以下を追記:
  ```
  - **Baseline edit detection**: authority spec の直接編集は delta-spec-validation の `no-authority-spec-direct-edit` rule が検出し、delta-spec-fixer が自動修正する。code-review 後にも delta-spec-validation が再実行され、code-fixer loop で発生した baseline 編集も捕捉される。
  ```

**Dep**: なし (独立して実装可能)

---

## Phase 3: Tests

### Task 13: Unit test for no-authority-spec-direct-edit rule

- [x] 新規ファイル `tests/unit/core/spec/rules/no-authority-spec-direct-edit.test.ts`
- [x] TC-1: `changedFiles` に `specrunner/specs/foo/spec.md` → violation 検出
- [x] TC-2: `changedFiles` に `specrunner/changes/slug/specs/foo/spec.md` のみ → no violation
- [x] TC-3: `changedFiles` に `src/core/foo.ts` のみ → no violation
- [x] TC-4: `changedFiles` が undefined → no violation (skip)
- [x] TC-5: authority spec + delta spec + src 混在 → authority spec のみ violation
- [x] TC-6: `changedFiles` が空配列 → no violation

**Dep**: Task 5

### Task 14: Pipeline transition context-aware test

- [x] 新規ファイル `tests/unit/pipeline/transition-when.test.ts` または既存 pipeline test に追加
- [x] TC-1: `delta-spec-validation approved` + code-review 未実行 → `spec-review` (1st phase)
- [x] TC-2: `delta-spec-validation approved` + code-review 実行済み → `adr-gen` (2nd phase)
- [x] TC-3: `code-review approved` → `delta-spec-validation` (新 transition)
- [x] TC-4: `when` なしの既存 transition は従来通り動作 (regression なし)
- [x] TC-5: `delta-spec-validation needs-fix` → `delta-spec-fixer` (phase に関係なく同一)

**Dep**: Task 8, Task 9

### Task 15: Update commit-push tests for warning behavior

- [x] `tests/unit/step/executor.commit.test.ts`: TC-AUTH-01〜06 を更新
  - TC-AUTH-01: staged authority spec → warning 出力、commit 続行 (throw しない)
  - TC-AUTH-02: delta spec のみ → 変更なし (warning なし)
  - TC-AUTH-03: staged authority + src → warning 出力、commit 続行
  - TC-AUTH-04: agent self-commit + authority spec → warning 出力、push 続行
  - TC-AUTH-05: 通常 step → 変更なし
  - TC-AUTH-06: agent self-commit + delta spec → 変更なし
- [x] integration test (TC-AUTH-INT-01, TC-AUTH-INT-02) も同様に更新

**Dep**: Task 11

---

## Phase 4: Verification

### Task 16: typecheck + test green

- [x] `bun run typecheck` green
- [x] `bun run test` green
- [x] 既存 pipeline integration test に regression なし
