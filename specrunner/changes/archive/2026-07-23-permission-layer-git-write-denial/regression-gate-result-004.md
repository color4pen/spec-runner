# Regression Gate Result — Iteration 4

**Change**: permission-layer-git-write-denial  
**Date**: 2026-07-23

## Evidence Summary

9/11 findings verified fixed. 2 LOW findings not fixed.

---

## Finding-by-Finding Verification

### F1 [CRITICAL] Bash が allowedTools に残り、本番 SDK 経路で git 変更 deny が機能しない

**Status: FIXED**

`src/adapter/claude-code/agent-runner.ts`:
```ts
const baseAllowedTools = ["Read", "Grep", "Glob"];
```
Bash は `baseAllowedTools` から除外済み（line 566）。`autoAllowBashIfSandboxed` も `false` に変更（line 103）。
TC-037（sandbox-scope.test.ts:272）が `expect(allowedTools).not.toContain("Bash")` を assert し固定している。

---

### F2 [CRITICAL] guard 単体テスト TC-011〜TC-036 が未実装

**Status: FIXED**

`src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts` に全 must テストが実装済み（80 tests pass）:

| テスト | 実装行 |
|--------|--------|
| TC-011（git mutation deny） | 487 |
| TC-012（deny message 内容） | 541 |
| TC-013（読み取り git allow + updatedInput） | 568 |
| TC-014（非 git allow + updatedInput） | 602 |
| TC-015（複合コマンド mutation） | 636 |
| TC-017（state.json Write deny） | 660 |
| TC-018（.specrunner Write deny） | 691 |
| TC-022（scoped 宣言外 Write deny） | 718 |
| TC-023（scoped 宣言外 Edit deny） | 752 |
| TC-025（scoped 宣言内 Write allow） | 766 |
| TC-026（scoped 宣言内 Edit allow） | 781 |
| TC-027（guarded 保護正典 deny） | 796 |
| TC-028（各保護正典 Write deny） | 819 |
| TC-029（guarded 非保護 allow） | 842 |
| TC-033（allow updatedInput 不変条件） | 872 |

---

### F3 [HIGH] ALWAYS_MUTATING リストが design D2 仕様より不完全 — switch/pull/revert 等 8 subcommand 欠落

**Status: FIXED**

`src/adapter/claude-code/git-command-classifier.ts` の `ALWAYS_MUTATING`（line 38-63）に全て含まれる:
- `"switch"` (line 45)
- `"revert"` (line 51)
- `"pull"` (line 56)
- `"commit-tree"` (line 40)
- `"update-index"` (line 58)
- `"fast-import"` (line 60)
- `"gc"` (line 61)
- `"prune"` (line 62)

---

### F4 [MEDIUM] TC-SB-02 と TC-037 が相互矛盾、TC-037/TC-038 のテストが未実装

**Status: FIXED**

`src/adapter/claude-code/__tests__/sandbox-scope.test.ts`（9 tests pass）:
- TC-SB-02（line 160）: `expect(sandbox["autoAllowBashIfSandboxed"]).toBe(false)` + `expect(allowedTools).not.toContain("Bash")` — 矛盾解消済み
- TC-037（line 272）: `expect(allowedTools).not.toContain("Bash")` — 実装済み
- TC-038（line 319）: `expect(capturedOptions!["permissionMode"]).toBe("default")` — 実装済み

---

### F5 [LOW] git branch --set-upstream-to=origin/main（branch 名引数なし形式）が read-or-nongit に分類される false negative

**Status: FIXED**

`git-command-classifier.ts` `isBranchMutationFlag`（line 179-188）に追加済み:
```ts
a === "--set-upstream-to" ||
a.startsWith("--set-upstream-to=") ||
a === "--unset-upstream" ||
a === "--edit-description"
```
`git branch --set-upstream-to=origin/main` は prefix check にヒットして mutation 判定される。

---

### F6 [LOW] should 優先度テスト 4 件（TC-010, TC-019, TC-021, TC-030）が未実装

**Status: FIXED**

| テスト | ファイル | 実装行 |
|--------|----------|--------|
| TC-010（classifier leaf 制約） | git-command-classifier.test.ts | 248 |
| TC-019（events.jsonl/usage.json/bite-evidence 個別 deny） | workspace-tool-guard.test.ts | 916 |
| TC-021（pipeline 管理パス deny が scoped/guarded 両方で適用） | workspace-tool-guard.test.ts | 937 |
| TC-030（guarded step が宣言した保護正典への Write は allow） | workspace-tool-guard.test.ts | 973 |

---

### F7 [LOW] git branch の long-form mutation フラグが isBranchMutationFlag に未収録

**Status: FIXED**

`isBranchMutationFlag` 関数（line 179-188）に short/long form 両方が収録済み:
- `-D`, `-d` + `--delete` (line 180-181)
- `-m`, `-M` + `--move` (line 180-182)
- `-c`, `-C` + `--copy` (line 180-183)
- `-f` + `--force` (line 180-184)
- `-u` + `--set-upstream-to` / `--set-upstream-to=` (line 185-186)
- `--unset-upstream`, `--edit-description` (line 187-188)

---

### F8 [CRITICAL] bootstrap commit OID の台帳記録削除により egress チェックが初回 push で EGRESS_UNKNOWN_COMMIT を返す

**Status: FIXED**

`appendSynthesizedCommit` 呼び出しが 3 ファイル全てに存在することを確認:
- `src/core/runtime/local.ts` line 426: `(s) => appendSynthesizedCommit(s, bootstrapOid)`
- `src/core/runtime/managed.ts` line 256: `(s) => appendSynthesizedCommit(s, bootstrapOid)`
- `src/core/runtime/workspace-materializer.ts` line 240: `(s) => appendSynthesizedCommit(s, bootstrapOid)`

import も各ファイルで確認済み（local.ts:61, managed.ts:18, workspace-materializer.ts:27）。

---

### F9 [HIGH] prCreateResultPath が pipelineManagedPaths から削除され、#900 の false-positive round halt が再現する

**Status: FIXED**

`src/core/pipeline/round-git-scope.ts` line 110:
```ts
export function pipelineManagedPaths(slug: string): string[] {
  return [slugStateJsonPath(slug), slugEventsPath(slug), usageJsonPath(slug), biteEvidenceResultPath(slug), prCreateResultPath(slug)];
}
```
5 要素返却（`prCreateResultPath` 含む）を確認。
TC-002（round-git-scope.test.ts:48）: `expect(paths).toHaveLength(5)` が pass。
TC-001（round-git-scope.test.ts:198）: `pr-create-result.md` が offending に入らないことも pass（31 tests pass, 0 fail）。

---

### F10 [LOW] buildStepContext テストが managedPaths / forbiddenPaths フィールドを検証しない

**Status: NOT FIXED**

`src/core/step/__tests__/step-context-builder.test.ts` の TC-039（line 126-130）と TC-040（line 168-172）は以下のみを assert:
```ts
expect(ctx.writeScope).toBeDefined();
expect(ctx.writeScope?.stagingMode).toBe(...);
expect(ctx.writeScope?.stepName).toBe(...);
expect(ctx.writeScope?.slug).toBe(...);
expect(ctx.writeScope?.declaredWritePaths).toEqual([...]);
```

`AgentWriteScope` に `managedPaths: string[]` と `forbiddenPaths: string[]` フィールドが存在する（port/agent-runner.ts:137, 143）にもかかわらず、`buildStepContext` がこれらを正しいパラメータで算出していることを検証するアサーションが TC-039〜TC-042 に一切ない。

`grep -c "managedPaths\|forbiddenPaths" step-context-builder.test.ts` → 0

`buildStepContext` の実装（step-context-builder.ts:140-141）:
```ts
const managedPaths = pipelineManagedPaths(deps.slug);
const forbiddenPaths = forbiddenWritePaths(step.name, deps.slug, declaredWritePaths);
```
この配線が壊れてもテストでは検出できない状態が継続している。

---

### F11 [LOW] git branch --contains <sha> / --merged <ref> が mutation に誤分類される

**Status: NOT FIXED**

`src/adapter/claude-code/git-command-classifier.ts` の `classifyConditional('branch')` は line 204:
```ts
// Positional argument (branch name) → create → mutation
if (remainingArgs.some((a) => !a.startsWith("-"))) {
  return { kind: "mutation", subcommand };
}
```
`git branch --contains abc123` および `git branch --merged HEAD` は、`abc123`/`HEAD` が `"-"` で始まらない positional arg として mutation 判定される。これらは読み取り操作であり false positive。

コードに変更はなく、mutation フラグリスト（line 179-188）に `--contains`, `--merged`, `--no-merged` の除外パスは追加されていない。  
design.md Risks 節は false positive を一般的なリスクとして記載しているが、`--contains`/`--merged` の具体的なケースを明示していない。

---

## Test Execution

```
bun test workspace-tool-guard.test.ts  → 80 pass, 0 fail
bun test sandbox-scope.test.ts         → 9 pass, 0 fail
bun test git-command-classifier.test.ts → 89 pass, 0 fail
bun test step-context-builder.test.ts  → 4 pass, 0 fail
bun test round-git-scope.test.ts       → 31 pass, 0 fail
```

## Conclusion

- **9 findings FIXED**: F1〜F9
- **2 findings NOT FIXED (LOW)**: F10（managedPaths/forbiddenPaths アサーション欠落）、F11（git branch --contains/--merged の false positive）
