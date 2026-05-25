# Design: delta-validation-post-code-review

## Problem

Agent が authority spec (`specrunner/specs/<capability>/spec.md`) を直接編集する事故が累積 (5 open issues: #383, #385, #299, #316, #263)。現行の `commit-push.ts` inline halt は違反を検出して pipeline を即死させるが、agent に self-fix の機会を与えない。

## Solution Overview

3 つの変更を連携させて pipeline 内で構造的に対処する:

1. **新 rule**: `no-authority-spec-direct-edit` を `delta-spec-validation` の rules に追加
2. **2 回目 validation**: `code-review approved` 後に `delta-spec-validation` を再実行する context-aware transition
3. **halt 降格**: `commit-push.ts` の inline halt を warning ログに変え、対処を validation step に委譲

これにより違反発生時に `delta-spec-fixer` が起動し、agent self-fix → pipeline 続行が可能になる。

## Design Decisions

### D1: changedFiles injection (option b)

`DeltaSpecRuleInput` に `changedFiles?: string[]` を追加。`DeltaSpecValidationStep.run()` が git diff を事前実行し、結果を注入する。

- base branch は `deps.request.baseBranch` から取得 (ParsedRequest に既存フィールド)
- `CliStepDeps.spawn` (SpawnFn) で `git diff <baseBranch>..HEAD --name-only` を実行
- rule 自体は `input.changedFiles` を filter するだけの pure function
- `changedFiles` が undefined の場合は rule をスキップ (backward compatible、旧 caller / test で安全)

Rejected: option (a) `gitDiffFiles: () => Promise<string[]>` — rule 内に副作用が入り、DI pattern と不整合。

### D2: Transition.when predicate

`Transition` interface に optional `when?: (state: JobState) => boolean` を追加:

```typescript
export interface Transition {
  step: string;
  on: Verdict | string;
  to: string | "end" | "escalate";
  when?: (state: JobState) => boolean;
}
```

`pipeline.ts` の transition lookup (line 245-247) を 1 行拡張:

```typescript
const transition = this.transitions.find(
  (t) => t.step === currentStep && t.on === outcome && (!t.when || t.when(state)),
);
```

- `when` なし → 常にマッチ (既存 transition は変更不要)
- `when` あり → predicate が true のみマッチ
- 配列順序: conditional transition を fallback の前に配置 (`find` の first-match 特性を利用)

Rejected: wrapper step 追加 (`delta-spec-validation-post-review`) — prompt / STEP_NAMES 重複、認知負荷増加。

### D3: STANDARD_TRANSITIONS 変更

| Before | After |
|--------|-------|
| `code-review approved → adr-gen` | `code-review approved → delta-spec-validation` |
| (なし) | `delta-spec-validation approved → adr-gen` (when: code-review に attempt あり) |
| `delta-spec-validation approved → spec-review` | そのまま残る (fallback) |

配列順序が重要:
```
// conditional (2nd phase) — must come BEFORE fallback
{ step: "delta-spec-validation", on: "approved", to: "adr-gen",      when: hasCodeReviewRun }
// fallback (1st phase) — no when
{ step: "delta-spec-validation", on: "approved", to: "spec-review" }
```

when predicate: `(state) => (state.steps?.["code-review"]?.length ?? 0) > 0`

### D4: shared loop iteration budget

`delta-spec-validation` は `STANDARD_LOOP_NAMES` に含まれず exhaustion check は適用されない (pre-existing)。`delta-spec-fixer` は `STANDARD_LOOP_FIXER_PAIRS` で管理され、2 回目 phase でも同じ fixer loop mechanism で動作する。budget は通算 — 1 回目 phase で iteration を消費しても 2 回目で fixer loop は継続可能。

### D5: commit-push halt → warning

`findAuthoritySpecViolations()` は残す。両 throw 経路を `stderrWrite("Warning: ...")` に変更:

1. **staged-changes path** (line 92-98): `throw` → `stderrWrite` + commit 続行
2. **HEAD-diff path** (line 74-78): `throw` → `stderrWrite` + push 続行

pipeline は halt せず、後段の `delta-spec-validation` (2 回目) が本格対処。

### D6: delta-spec-fixer prompt 拡張

initial message と continuation message に `authority-spec-direct-edit` violation 用の指示を追加:

- `git checkout <baseBranch> -- <violated-path>` で baseline 編集を revert
- 変更内容を対応する delta path (`specrunner/changes/<slug>/specs/<capability>/spec.md`) に書き直す

## Pipeline Flow (2nd phase)

```
code-review approved
  → delta-spec-validation (2nd invocation)
    → approved → adr-gen → pr-create → end
    → needs-fix → delta-spec-fixer → delta-spec-validation (loop)
    → escalation → escalate
```

## Affected Files

| File | Change |
|------|--------|
| `src/core/pipeline/types.ts` | `Transition.when` 追加、`STANDARD_TRANSITIONS` 更新 |
| `src/core/pipeline/pipeline.ts` | transition lookup に `when` 評価追加 (1 行) |
| `src/core/spec/delta-spec-validator.ts` | `DeltaSpecViolationReason` に `"authority-spec-direct-edit"` 追加、`validateDeltaSpecPaths` に `changedFiles` param 追加 |
| `src/core/spec/rules/types.ts` | `DeltaSpecRuleInput.changedFiles` 追加、`DeltaSpecRuleName` に `"no-authority-spec-direct-edit"` 追加 |
| `src/core/spec/rules/no-authority-spec-direct-edit.ts` | 新 rule 実装 (新規ファイル) |
| `src/core/spec/rules/index.ts` | 新 rule import + registry 登録 |
| `src/core/step/delta-spec-validation.ts` | git diff 実行 + changedFiles 注入 |
| `src/core/step/delta-spec-fixer.ts` | prompt に baseline rollback 指示追加 |
| `src/core/step/commit-push.ts` | 両 throw 削除 → stderrWrite warning |
| `src/prompts/rules.ts` | baseline 違反 detection flow 追記 |
| `tests/unit/spec/rules/no-authority-spec-direct-edit.test.ts` | 新 rule unit test (新規) |
| `tests/unit/pipeline/transition-when.test.ts` | context-aware transition test (新規) |
| `tests/unit/step/executor.commit.test.ts` | 既存 TC-AUTH-01〜06 を warning 挙動に更新 |
