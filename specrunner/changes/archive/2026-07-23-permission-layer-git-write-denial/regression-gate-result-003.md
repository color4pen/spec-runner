# Regression Gate Result — Iteration 3

**Change**: permission-layer-git-write-denial  
**Date**: 2026-07-23

## Evidence Summary

All 10 findings from the ledger are verified fixed. No regressions detected.

---

## Finding-by-Finding Verification

### F1 [CRITICAL] Bash が allowedTools に残り、本番 SDK 経路で git 変更 deny が機能しない

**Status: FIXED**

`src/adapter/claude-code/agent-runner.ts` line 566:
```ts
const baseAllowedTools = ["Read", "Grep", "Glob"];
```
Bash は `baseAllowedTools` から除外済み。`autoAllowBashIfSandboxed` も `false` に変更（line 103）。
TC-037 / TC-SB-02 テストが `not.toContain("Bash")` を assert し、実装との一致を固定している。

---

### F2 [CRITICAL] guard 単体テスト TC-011〜TC-036 が未実装

**Status: FIXED**

`src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts` に以下の must テストが実装済み:

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

実行結果: `bun test workspace-tool-guard.test.ts` → 162 tests pass, 0 fail。

---

### F3 [HIGH] ALWAYS_MUTATING リストが design D2 仕様より不完全 — switch/pull/revert 等 8 subcommand 欠落

**Status: FIXED**

`src/adapter/claude-code/git-command-classifier.ts` の `ALWAYS_MUTATING` に以下が全て含まれる:
- `"switch"` (line 45)
- `"revert"` (line 51)
- `"pull"` (line 56)
- `"commit-tree"` (line 40)
- `"update-index"` (line 58)
- `"fast-import"` (line 60)
- `"gc"` (line 61)
- `"prune"` (line 62)

design D2 が要求する全 subcommand が収録済み。

---

### F4 [MEDIUM] TC-SB-02 と TC-037 が相互矛盾、TC-037/TC-038 のテストが未実装

**Status: FIXED**

`src/adapter/claude-code/__tests__/sandbox-scope.test.ts`:
- TC-SB-02（line 160）: `expect(sandbox["autoAllowBashIfSandboxed"]).toBe(false)` + `expect(allowedTools).not.toContain("Bash")` — 矛盾解消済み
- TC-037（line 272）: `expect(allowedTools).not.toContain("Bash")` — 実装済み
- TC-038（line 319）: `expect(capturedOptions!["permissionMode"]).toBe("default")` — 実装済み

全 3 テストが pass。

---

### F5 [LOW] probe R5-a 観測 A/B の実行記録が design.md に未記録

**Status: FIXED**

`specrunner/changes/permission-layer-git-write-denial/design.md` D6 節（line 245〜255）に probe 実行記録が追記済み:

```
probe 実行記録(2026-07-23、実 SDK):
| (a) bash-canusetool-gate | PASS | 観測 B: autoAllowBashIfSandboxed: true は…
| (b) bash-git-mutation-deny | PASS | git commit が canUseTool で deny
| (c) bash-git-read-allow | PASS | route=sdk-fast-path…
| (d) scoped-write-deny | PASS |
| (e) state-json-deny | PASS |
```

R5 の 5 シナリオ全ての verdict と観測結果が記録されている。

---

### F6 [LOW] T-06 注記が「Bash は allowedTools に残る」と記述しているが実装は除外済み（stale ドキュメント）

**Status: FIXED**

`tasks.md` T-06 の当該箇所（line 108-109）は更新済み:
```
baseAllowedTools を ["Read", "Grep", "Glob"] に変更（Bash を除外 — canUseTool 発火のため。
TC-SB-02 は「Bash 非含有 + autoAllowBashIfSandboxed: false」を固定するよう更新済み）
```

元の stale テキスト「Bash は allowedTools に残る」は T-06 から削除されている。

付記: T-07 (line 143) に「Bash を allowedTools に維持したため変更不要（TC-SB-02 は変更なしで green）」という別の stale 記述が残存しているが、元の F6 finding が対象とした T-06 の修正は完了している。T-07 の stale は実装・テストには影響しない。

---

### F7 [LOW] git branch --set-upstream-to=origin/main（branch 名引数なし形式）が read-or-nongit に分類される false negative

**Status: FIXED**

`git-command-classifier.ts` の `isBranchMutationFlag` 関数（line 141〜148）に追加済み:
```ts
a === "--set-upstream-to" ||
a.startsWith("--set-upstream-to=") ||
a === "--unset-upstream" ||
a === "--edit-description"
```

`git branch --set-upstream-to=origin/main` は `--set-upstream-to=` prefix check にヒットして mutation 判定される。

---

### F8 [LOW] should 優先度テスト 4 件（TC-010, TC-019, TC-021, TC-030）が未実装

**Status: FIXED**

| テスト | ファイル | 実装行 |
|--------|----------|--------|
| TC-010（classifier leaf 制約） | git-command-classifier.test.ts | 248 |
| TC-019（events.jsonl/usage.json/bite-evidence 個別 deny） | workspace-tool-guard.test.ts | 916 |
| TC-021（pipeline 管理パス deny が scoped/guarded 両方で適用） | workspace-tool-guard.test.ts | 937 |
| TC-030（guarded step が宣言した保護正典への Write は allow） | workspace-tool-guard.test.ts | 973 |

全 4 テストが pass。

---

### F9 [LOW] git branch の long-form mutation フラグが isBranchMutationFlag に未収録

**Status: FIXED**

`git-command-classifier.ts` `isBranchMutationFlag` 関数（line 141〜148）に short/long form 両方が収録済み:
- `-D`, `-d` + `--delete`
- `-m`, `-M` + `--move`
- `-c`, `-C` + `--copy`
- `-f` + `--force`
- `-u` + `--set-upstream-to` (=value 形式も含む)
- `--unset-upstream`
- `--edit-description`

design D2 の仕様との gap は解消されている。

---

### F10 [CRITICAL] bootstrap commit OID の台帳記録削除により egress チェックが初回 push で EGRESS_UNKNOWN_COMMIT を返す

**Status: FIXED**

`appendSynthesizedCommit` 呼び出しが 3 ファイル全てに存在することを確認:

- `src/core/runtime/local.ts` line 426: `(s) => appendSynthesizedCommit(s, bootstrapOid)`
- `src/core/runtime/managed.ts` line 256: `(s) => appendSynthesizedCommit(s, bootstrapOid)`
- `src/core/runtime/workspace-materializer.ts` line 240: `(s) => appendSynthesizedCommit(s, bootstrapOid)`

import も各ファイルで確認済み（local.ts:61, managed.ts:18, workspace-materializer.ts:27）。bootstrap commit OID が台帳に記録され、初回 push での EGRESS_UNKNOWN_COMMIT halt は発生しない。

---

## Test Execution

変更ファイルに関連する全テストが green:

```
bun test workspace-tool-guard.test.ts sandbox-scope.test.ts git-command-classifier.test.ts
  step-context-builder.test.ts paths.test.ts agent-runner.test.ts no-worktree-mode.test.ts

→ 273 pass, 0 fail
```

`bun run typecheck` → エラーなし。

全テスト (`bun test`) の 1638 fail は main と同数（pre-existing、本変更と無関係）。

---

## Conclusion

10 件の finding が全て fix 済みであることを確認。回帰なし。
