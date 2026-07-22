# Code Review Feedback — iteration 003

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff 規模と変更ファイル

`git diff main...HEAD --stat` で 29 ファイル、4693 行追加を確認。iter 2 からの差分（fae128f3e オペレータ修正）:
- `src/adapter/claude-code/agent-runner.ts`: `autoAllowBashIfSandboxed: true → false`
- `src/adapter/claude-code/__tests__/sandbox-scope.test.ts`: TC-SB-02 を新契約（Bash 非含有 + `autoAllow false`）に更新
- `specrunner/changes/permission-layer-git-write-denial/design.md`: D6 に probe 実行記録追記
- `specrunner/changes/permission-layer-git-write-denial/tasks.md`: T-06 stale 記述を実装に追随

### 読んだファイル

design.md (D1/D6 修正箇所)、tasks.md (T-06 修正確認)、test-cases.md、git-command-classifier.ts、agent-runner.ts（buildWorkspaceSandbox / createWorkspaceToolGuard / run() guard 配線）、core/port/agent-runner.ts（AgentWriteScope）、step-context-builder.ts（writeScope 計算）、sandbox-scope.test.ts（TC-SB-02 更新確認）、workspace-tool-guard.test.ts、git-command-classifier.test.ts、step-context-builder.test.ts、paths.test.ts、review-feedback-002.md

### typecheck / test の確認

`bun run typecheck` → green（exit 0）。`bun run test` → 9052 passed, 1 skipped（green）。

### commit 層不変の確認

`git diff main...HEAD -- src/core/step/write-scope.ts src/core/pipeline/round-git-scope.ts src/core/step/commit-push.ts | wc -l` → `0`。三ファイルとも無改変（TC-055 / R4 独立性）。

### F-1 修正の確認（autoAllowBashIfSandboxed）

- `buildWorkspaceSandbox`（agent-runner.ts:104）: `autoAllowBashIfSandboxed: false` ✅
- `TC-SB-02`（sandbox-scope.test.ts:180）: `expect(sandbox["autoAllowBashIfSandboxed"]).toBe(false)` ✅
- `TC-037`（sandbox-scope.test.ts:290）: `allowedTools` に `"Bash"` が含まれないことを固定 ✅
- design D6（design.md:248-255）: probe 実行記録（2026-07-23）、5 シナリオ全 PASS ✅
  - 観測 B 確認: `autoAllowBashIfSandboxed: true` では guard 到達前に Bash auto-approve
  - `false` 下での canUseTool 発火確認（bash-canusetool-gate-b PASS）
  - SDK fast-path 観測（read-only コマンドは canUseTool 前に auto-approve される経路）も記録済み
  - (b) `git commit` deny, (c) `git status` allow, (d) scoped 宣言外 Write deny, (e) state.json Write deny — 全 PASS

受け入れ基準「probe 実行記録: R5 の 5 シナリオが期待どおりであることを design または PR に記録する（実 SDK 検証）」を満たした。

### F-2 修正の確認（tasks.md stale 記述）

tasks.md T-06（:108-112）:
```
baseAllowedTools を ["Read", "Grep", "Glob"] に変更（Bash を除外 — canUseTool 発火のため。
TC-SB-02 は「Bash 非含有 + autoAllowBashIfSandboxed: false」を固定するよう更新済み）
probe 観測 B により autoAllowBashIfSandboxed も false に変更（design D6 の実行記録参照）
```

実装と一致している ✅

### guard ロジックの正確性確認（iter 3 再確認）

`createWorkspaceToolGuard` 判定フロー（agent-runner.ts:139-270）:

1. **Bash 分岐**: `classifyGitCommand(command).kind === "mutation"` → deny ✅（scope 有無によらず常時適用）
2. **Edit/Write — cwd 境界**: `path.relative` で `..` チェック ✅
3. **Edit/Write — managedPaths**: `scope.managedPaths.includes(rel)` ✅（pre-computed in buildStepContext）
4. **Edit/Write — .specrunner**: `rel === dotSpec || rel.startsWith(dotSpec + "/")` ✅
5. **Edit/Write — scoped**: `!scope.declaredWritePaths.includes(rel)` → deny ✅
6. **Edit/Write — guarded**: `scope.forbiddenPaths.includes(rel)` → deny ✅
7. **scope なし fallback**: cwd 内は allow（strictly-weaker）✅
8. guard 配線（agent-runner.ts:582）: `canUseTool: createWorkspaceToolGuard(cwd, ctx.writeScope)` ✅

### test-cases.md の must ケース対照（37 件）

| TC 範囲 | 内容 | 状態 |
|---------|------|------|
| TC-001〜TC-009 | classifier 分類（ALWAYS_MUTATING / 読み取り / 複合 / CONDITIONAL 等） | ✅ 全実装 |
| TC-011〜TC-015 | guard Bash deny/allow / 複合コマンド | ✅ 全実装 |
| TC-017, TC-018 | pipeline 管理パス・.specrunner deny | ✅ 実装 |
| TC-022, TC-023, TC-025, TC-026 | scoped step 宣言外 deny / 宣言内 allow | ✅ 全実装 |
| TC-027, TC-028, TC-029 | guarded step 保護正典 deny / その他 allow | ✅ 全実装 |
| TC-031 | cwd 境界 deny | ✅ TC-FW-01/TC-FW-02 で実装 |
| TC-033 | allow の updatedInput 不変 | ✅ 実装 |
| TC-037, TC-038 | allowedTools に Bash なし、permissionMode=default | ✅ sandbox-scope.test.ts |
| TC-039, TC-040 | buildStepContext の writeScope threading | ✅ step-context-builder.test.ts |
| TC-043 | dotSpecrunnerDirRel() = ".specrunner" | ✅ paths.test.ts |
| TC-045〜TC-049 | probe 実 SDK 検証 | ✅ design D6 に実行記録（2026-07-23 全 PASS） |
| TC-052 | commit 層テスト無改変 green | ✅ 9052 tests pass |
| TC-058 | typecheck green | ✅ |
| TC-060, TC-061 | 破壊確認（manual） | ⚠️ PR 未作成（pipeline 完了後に自動解消予定） |

## 検証できなかった項目

- **TC-060/TC-061 破壊確認**: PR 未作成のため manual 記録は未確認。pipeline 完了後に PR で記録される予定。

## Findings 詳細

### [minor] F-3 (iter 2 継続): `git branch` long-form mutation フラグが false negative

design D2 が明示する mutation フラグのうち、長形式（`--set-upstream-to` / `--unset-upstream` / `--edit-description` / `--delete` / `--move` / `--copy` / `--force`）が `classifyConditional("branch", ...)` の短形式フラグリスト `["-D", "-d", "-m", "-M", "-c", "-C", "-u"]` に含まれていない。

**例**: `git branch --unset-upstream` は positional arg なし・長フラグのみのため `read-or-nongit` に分類される（false negative）。

**影響の限定**: 設計原則「permission 層は多重防御であり、回避不能性を主張しない」の範囲内。commit 層（mixed reset + 合成 + egress）が最終的な壁として機能する。iter 2 から状態変化なし。

---

### [minor] F-4 (iter 2 継続): should 優先度テストケース 4 件が未実装

- **TC-010** (should): classifier の leaf 制約（src/ 内 import なし）を自動テストで固定していない。実装は正しい（imports なし）。
- **TC-019** (should): events.jsonl / usage.json / bite-evidence-result.md の個別 deny テスト未実装。managedPaths に含まれるため機能的には TC-017 で担保済み。
- **TC-021** (should): pipeline 管理パス deny が scoped / guarded 両方で適用されることの専用テスト未実装（TC-017 で guarded での state.json deny は確認済み）。
- **TC-030** (should): guarded step が宣言した保護正典パスへの Write は allow されることの直接テスト未実装。`forbiddenPaths = CANON_PATHS.filter(p => !declared.has(p))` の正しさは TC-029 から推論できる。

いずれも should 優先度。関連 must ケースで機能的に担保されている。iter 2 から状態変化なし。
