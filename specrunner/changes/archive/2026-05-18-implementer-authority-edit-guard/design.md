# Design: implementer-authority-edit-guard

## Overview

`commitAndPush` 内で staged diff path を検査し、`specrunner/specs/` 配下を含む AgentStep commit を reject する guard を追加する。prompt 補強を併用し、agent に予測可能性を与える。

## 変更判断

### Guard 挿入点: `commitAndPush` 内、commit 前

executor.ts L241 `commitAndPush` の 2 経路で path 検査する:

1. **staged commit 経路** (L263 `hasChanges === true`): `git diff --cached --name-only` で staged file list を取得し、`specrunner/specs/` prefix を検査。commit 前に reject。
2. **agent self-commit 経路** (L270 HEAD advanced): `git diff <headBeforeStep>..HEAD --name-only` で同検査。push 前に reject。

両経路とも `specrunner/changes/` prefix は除外 (= delta spec は正常許可)。

### Error 設計

既存 `SpecRunnerError` パターンに揃える:

- error code: `AUTHORITY_SPEC_EDIT_VIOLATION` (ERROR_CODES に追加)
- factory: `authoritySpecEditViolationError(stepName, violatedPaths)` (errors.ts に追加)
- hint: 違反 path 一覧 + delta spec 経由の修復案内

### CliStep は影響外

`commitAndPush` は `runAgentStep` からのみ呼ばれる。`runCliStep` (L331) は別経路で `commitAndPush` を通らないため、spec-merge 等の CliStep は自然に guard 対象外。追加のホワイトリスト不要。

### Prompt 補強

`commit-discipline.ts` と同パターンで `authority-spec-guard.ts` に shared fragment を定義。`implementer-system.ts` / `spec-fixer-system.ts` から import して注入。

## Component Structure

### New Files

| File | Role |
|------|------|
| `src/prompts/authority-spec-guard.ts` | authority spec 編集禁止ルールの shared prompt fragment |

### Modified Files

| File | Change |
|------|--------|
| `src/core/step/executor.ts` | `commitAndPush` に authority spec path 検査を追加 |
| `src/errors.ts` | `AUTHORITY_SPEC_EDIT_VIOLATION` code + factory 追加 |
| `src/prompts/implementer-system.ts` | authority-spec-guard fragment を注入 |
| `src/prompts/spec-fixer-system.ts` | authority-spec-guard fragment を注入 |
| `tests/unit/step/executor.commit.test.ts` | TC-AUTH-01 〜 TC-AUTH-06 追加 |
| `tests/pipeline-integration.test.ts` | TC-AUTH-INT-01 追加 |

## Data Flow

```
AgentStep completes
  → commitAndPush(step, state, deps, headBeforeStep)
    → git add -A
    → git diff --cached --quiet
    ┌─ hasChanges=true:
    │   → git diff --cached --name-only
    │   → checkAuthoritySpecPaths(paths)
    │   → violation? → throw AuthoritySpecEditViolation
    │   → no violation → git commit → git push
    └─ hasChanges=false + requiresCommit:
        → HEAD advanced?
          → git diff headBefore..HEAD --name-only
          → checkAuthoritySpecPaths(paths)
          → violation? → throw AuthoritySpecEditViolation
          → no violation → push only
```

## Guard Logic (pseudo-code)

```typescript
const AUTHORITY_SPEC_PREFIX = "specrunner/specs/";

function findAuthoritySpecViolations(filePaths: string[]): string[] {
  return filePaths.filter(p => p.startsWith(AUTHORITY_SPEC_PREFIX));
}
```

`specrunner/changes/*/specs/...` は `specrunner/specs/` で始まらないため自然に除外される。

## Delta Spec

`specrunner/specs/step-execution-architecture` に ADDED Requirement 1 件を追加。
