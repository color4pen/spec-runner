# Regression Gate Result — Iteration 2

**Date**: 2026-07-23
**Branch**: feat/permission-layer-git-write-denial-ac3aa8bf
**Change folder**: specrunner/changes/permission-layer-git-write-denial

## Verdict

All 9 findings from the ledger are verified as fixed. No regressions detected.

---

## Evidence per Finding

### F-01 [CRITICAL] Bash が allowedTools に残り、本番 SDK 経路で git 変更 deny が機能しない

**Status: FIXED**

- `src/adapter/claude-code/agent-runner.ts:566` — `baseAllowedTools = ["Read", "Grep", "Glob"]`。Bash を含まない。
- `src/adapter/claude-code/agent-runner.ts:103` — `autoAllowBashIfSandboxed: false` に変更。probe 観測 B を design.md に記録済み。
- `createWorkspaceToolGuard` に Bash 分岐が追加され、`classifyGitCommand(command).kind === "mutation"` で deny。

### F-02 [CRITICAL] guard 単体テスト TC-011〜TC-036 が未実装

**Status: FIXED**

`src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts` に以下が追加された（598 行差分）:
- TC-011: git mutation deny (commit/push/add/reset/checkout/merge/rebase/stash)
- TC-012: deny message 内容（pipeline 合成・読み取り許可の旨）
- TC-013: 読み取り git allow + updatedInput (status/diff/log/stash list)
- TC-014: 非 git allow + updatedInput (bun test/echo/非文字列 command)
- TC-015: 複合コマンド内 mutation セグメント deny
- TC-017: state.json Write deny (scoped/guarded 両 step)
- TC-018: .specrunner/ 配下 Write/Edit deny
- TC-022: scoped step 宣言外 Write deny
- TC-023: scoped step 宣言外 Edit deny
- TC-025: scoped step 宣言内 Write allow + updatedInput
- TC-026: scoped step 宣言内 Edit allow + updatedInput
- TC-027: guarded step 保護正典 Write deny
- TC-028: guarded step 各保護正典 Write deny
- TC-029: guarded step 保護正典以外 Write allow
- TC-033: allow 結果の updatedInput 不変条件
- TC-019: events.jsonl/usage.json/bite-evidence-result.md Write deny
- TC-021: pipeline 管理パス deny が scoped/guarded 両 step で適用
- TC-030: guarded step が宣言した保護正典 Write allow

### F-03 [HIGH] ALWAYS_MUTATING リストが design D2 仕様より不完全

**Status: FIXED**

`src/adapter/claude-code/git-command-classifier.ts:38-63` — ALWAYS_MUTATING に以下が全て含まれる:
switch, revert, pull, commit-tree, update-index, fast-import, gc, prune（design D2 全 24 件一致）。

### F-04 [MEDIUM] TC-SB-02 と TC-037 が相互矛盾、TC-037/TC-038 のテストが未実装

**Status: FIXED**

`src/adapter/claude-code/__tests__/sandbox-scope.test.ts`:
- TC-SB-02: `autoAllowBashIfSandboxed: false` + `not.toContain("Bash")` に更新（probe 観測 B）。
- TC-037: allowedTools に Bash が含まれないこと + Read/Grep/Glob が含まれることを固定。
- TC-038: permissionMode が "default" であることを固定。

### F-05 [LOW] probe R5-a 観測 A/B の実行記録が design.md に未記録

**Status: FIXED**

`specrunner/changes/permission-layer-git-write-denial/design.md` の D6 セクションに "probe 実行記録(2026-07-23、実 SDK)" のテーブルが追加された。観測 A/B (autoAllowBashIfSandboxed の挙動差)、(b) git commit deny、(c) git status allow、(d) 宣言外 Write deny、(e) state.json Write deny の全シナリオが記録済み。

### F-06 [LOW] T-06 注記が「Bash は allowedTools に残る」と記述（stale ドキュメント）

**Status: FIXED**

`specrunner/changes/permission-layer-git-write-denial/tasks.md` の T-06 注記が更新され:
- `baseAllowedTools = ["Read", "Grep", "Glob"]`（Bash 除外）と記述。
- TC-SB-02 は「Bash 非含有 + autoAllowBashIfSandboxed: false を固定するよう更新済み」と明記。
- 旧「Bash は allowedTools に残る」表記は削除済み。

### F-07 [LOW] git branch --set-upstream-to=origin/main が false negative

**Status: FIXED**

`src/adapter/claude-code/git-command-classifier.ts` の `classifyConditional`（branch）内 `isBranchMutationFlag`:
```
a === "--set-upstream-to" ||
a.startsWith("--set-upstream-to=") ||
a === "--unset-upstream" ||
```
が追加され、`git branch --set-upstream-to=origin/main` は mutation に分類される。

### F-08 [LOW] should 優先度テスト 4 件（TC-010, TC-019, TC-021, TC-030）が未実装

**Status: FIXED**

- TC-010: `src/adapter/claude-code/__tests__/git-command-classifier.test.ts` に追加（classifier が src/ 配下 module を import しない leaf 制約をソースコード読取で固定）。
- TC-019: workspace-tool-guard.test.ts に追加（events.jsonl/usage.json/bite-evidence-result.md deny）。
- TC-021: workspace-tool-guard.test.ts に追加（pipeline 管理パス deny が scoped/guarded 両 step 適用）。
- TC-030: workspace-tool-guard.test.ts に追加（guarded step 宣言保護正典 Write allow）。

### F-09 [CRITICAL] bootstrap commit OID の台帳記録削除により EGRESS_UNKNOWN_COMMIT

**Status: FIXED**

`appendSynthesizedCommit` の呼び出しが 3 ファイルすべてに復元済み:
- `src/core/runtime/local.ts:424-428` — bootstrap commit OID を `synthesizedCommits` 台帳に記録。
- `src/core/runtime/managed.ts:253-257` — 同上。
- `src/core/runtime/workspace-materializer.ts:237-241` — 同上。
