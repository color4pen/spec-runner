# Review Feedback — permission-layer-git-write-denial — iter 2

## 検証した項目

### diff 規模と変更ファイル

`git diff main...HEAD --stat` で 28 ファイル、4435 行追加を確認。実装ファイル群:

- `src/adapter/claude-code/git-command-classifier.ts` (新規 259 行)
- `src/adapter/claude-code/agent-runner.ts` (+151 行 — guard 拡張)
- `src/core/port/agent-runner.ts` (+54 行 — AgentWriteScope interface)
- `src/core/step/step-context-builder.ts` (+25 行 — writeScope 計算)
- `src/util/paths.ts` (+14 行 — dotSpecrunnerDirRel)
- テスト: git-command-classifier.test.ts (新規)、workspace-tool-guard.test.ts (拡張)、sandbox-scope.test.ts (更新)、step-context-builder.test.ts (新規)、paths.test.ts (拡張)
- `scripts/probes/write-scope-guard-probe.ts` (+352 行 — R5 シナリオ追加)

### 読んだファイル

design.md、tasks.md、test-cases.md、spec.md、git-command-classifier.ts、agent-runner.ts、core/port/agent-runner.ts、step-context-builder.ts、util/paths.ts、全テストファイル、write-scope-guard-probe.ts、verification-result.md

### typecheck / test の確認

`bun run typecheck` → green。`bun run test` → 9052 passed, 1 skipped。

### commit 層不変の確認

`git diff main...HEAD -- src/core/step/write-scope.ts src/core/pipeline/round-git-scope.ts src/core/step/commit-push.ts | wc -l` → `0`。三ファイルとも無改変。

### DSM closure の確認

adapter (`agent-runner.ts`) の import を精査: `core/pipeline/round-git-scope.ts` と `core/step/write-scope.ts` への直接 import はない。managedPaths / forbiddenPaths は `buildStepContext`（core 層）で pre-compute し `AgentWriteScope` に詰めて渡す設計が正しく実装されている。

### test-cases.md の must ケース対照

37 件中の単体/統合 must ケースを確認:

| TC 範囲 | 内容 | 状態 |
|---------|------|------|
| TC-001〜TC-009 | classifier 分類 | ✅ 全実装 |
| TC-011〜TC-015 | guard Bash deny/allow | ✅ 全実装 |
| TC-017, TC-018 | pipeline 管理パス・.specrunner deny | ✅ 実装 |
| TC-022, TC-023, TC-025, TC-026 | scoped step 宣言外 deny / 宣言内 allow | ✅ 全実装 |
| TC-027, TC-028, TC-029 | guarded step 保護正典 deny / その他 allow | ✅ 全実装 |
| TC-031 | cwd 境界 deny | ✅ TC-FW-01 で実装 |
| TC-033 | allow の updatedInput 不変 | ✅ 実装 |
| TC-037, TC-038 | allowedTools に Bash なし、permissionMode=default | ✅ sandbox-scope.test.ts |
| TC-039, TC-040 | buildStepContext の writeScope threading | ✅ step-context-builder.test.ts |
| TC-043 | dotSpecrunnerDirRel() = ".specrunner" | ✅ paths.test.ts |
| TC-045〜TC-049 | probe 実 SDK 検証 | ⚠️ コード実装済み、実行記録なし |
| TC-052 | commit 層テスト無改変 green | ✅ 9052 tests pass |
| TC-058 | typecheck green | ✅ |
| TC-060, TC-061 | 破壊確認（manual、PR に記録） | ⚠️ PR 未作成のため未記録 |

### guard ロジックの正確性確認

`createWorkspaceToolGuard` の判定フローを実装コードで追跡:

1. **Bash 分岐**: `classifyGitCommand(command).kind === "mutation"` → deny（scope 有無によらず常時適用）✅
2. **Edit/Write — cwd 境界**: `path.relative` で `..` チェック ✅
3. **Edit/Write — managedPaths**: `scope.managedPaths.includes(rel)` ✅ (pre-computed in buildStepContext)
4. **Edit/Write — .specrunner**: `rel === dotSpec || rel.startsWith(dotSpec + "/")` ✅
5. **Edit/Write — scoped**: `!scope.declaredWritePaths.includes(rel)` → deny ✅
6. **Edit/Write — guarded**: `scope.forbiddenPaths.includes(rel)` → deny ✅
7. **allow**: 必ず `{ behavior: "allow", updatedInput: input }` ✅ (SDK Zod union 制約)

### probe の実装確認

`write-scope-guard-probe.ts` に 5 シナリオが実装されていることを確認:
- (a) `bash-canusetool-gate`: `autoAllowBashIfSandboxed:true` で Bash が canUseTool に発火するか測定（観測 A/B を確定）
- (b) `bash-git-mutation-deny`: `git commit -m probe-test` が deny される
- (c) `bash-git-read-allow`: `git status` が allow される
- (d) `scoped-write-deny`: scoped guard で宣言外 Write が deny される
- (e) `state-json-deny`: managedPaths に含まれるパスへの Write が deny される

シナリオ (b)/(c) は `autoAllowBashIfSandboxed: false` を使い canUseTool 発火を保証して実行している。機械 grep 可能な verdict 行 `[PROBE] scenario=... verdict=PASS|FAIL` を出力する形式になっている。

## 検証できなかった項目

- **probe R5 の実行結果**: `ANTHROPIC_API_KEY` を持つ環境での実 SDK 実行が必要。本レビュー環境では実行できないため、verdict（特に観測 A/B の区別）の確認は不可。

- **TC-060/TC-061 破壊確認**: PR に記録する manual テスト。PR 未作成のため現時点では確認できない（pipeline 完了後に自動解消される）。

- **should 優先度テスト TC-019, TC-021, TC-030, TC-010**: 上記「未実装」として確認した内容は正しい。これらが pass/fail するかは現テストスイートでは直接確認できない（機能的には関連 must ケースで担保されている）。

## Findings 詳細

### [major] F-1: probe 実行記録なし — autoAllowBashIfSandboxed の観測 A/B が未確定

**根拠コード**:
- `buildWorkspaceSandbox` (agent-runner.ts:96-106): `autoAllowBashIfSandboxed: true`
- `baseAllowedTools` (agent-runner.ts:562): `["Read", "Grep", "Glob"]`（Bash なし）

request の受け入れ基準:
> probe 実行記録: R5 の 5 シナリオが期待どおりであることを design または PR に記録する（実 SDK 検証）

現状では design.md D6 の以下の行が未完:
> 実 SDK 実行結果は `ANTHROPIC_API_KEY` を持つ環境で `bun scripts/probes/write-scope-guard-probe.ts` を実行後に追記する。

**重要性**: `autoAllowBashIfSandboxed: true` が Bash を canUseTool より前に auto-approve する（観測 B）の場合、guard の Bash 分岐は production で到達不能になる。この時 R2（git 状態変更の deny）は機能しない。commit 層が引き続き最終的な壁として機能するが、本変更の主要目的である「tool call 時点での早期遮断」が成立しない。

単体テストは `createWorkspaceToolGuard` を直接呼ぶため SDK の auto-allow 挙動と無関係に green になることに注意。probe のみがこの観測を確認できる。

観測 B だった場合: design D1 の通り `autoAllowBashIfSandboxed: false` に変更し、allow した非 git Bash（`bun test` 等）が実際に実行されることを probe で確認してから採用する必要がある。

---

### [minor] F-2: tasks.md T-06 注記が実装と矛盾（stale ドキュメント）

tasks.md T-06:
> `baseAllowedTools` は `["Read", "Bash", "Grep", "Glob"]` を維持（TC-SB-02 保存）。Bash は allowedTools に残るが...

実際の実装:
```typescript
const baseAllowedTools = ["Read", "Grep", "Glob"];
```

TC-037 / TC-SB-02 テストも「Bash が allowedTools に含まれない」を must として固定しており、実装・テストは一致している。tasks.md 注記が中間設計段階の記述のまま更新されていない。コードの正しさには影響しない。

---

### [minor] F-3: `git branch --set-upstream-to=origin/main`（branch 名引数なし）が false negative

`classifyConditional("branch", ["--set-upstream-to=origin/main"])`:
- mutation フラグリスト `["-D", "-d", "-m", "-M", "-c", "-C", "-u"]` に `--set-upstream-to` が含まれない
- positional arg チェック `!a.startsWith("-")` → `--set-upstream-to=origin/main` は `-` で始まるため false
- 結果: `read-or-nongit` に分類される（false negative）

design D2 は `--set-upstream-to` / `--unset-upstream` を mutation フラグとして明示しているが実装に含まれていない。保守的字句分類の方針と「commit 層が壁」の原則により許容範囲内。

---

### [minor] F-4: should 優先度テストケース 4 件が未実装

- **TC-010** (leaf 制約自動検証): 実装は正しい（classifier に import なし）が、自動テストで固定されていない。
- **TC-019** (events.jsonl / usage.json / bite-evidence-result.md の個別 deny テスト): managedPaths に含まれるため機能的には保証されているが個別テストなし。
- **TC-021** (scoped/guarded 両方で pipeline 管理パス deny): TC-017 に guarded チェックはあるが TC-021 専用テストなし。
- **TC-030** (guarded step が宣言した保護正典パスは allow): `forbiddenPaths.filter(p => !declared.has(p))` の実装が正しいことは TC-025/029 から推論できるが、直接テストなし。

いずれも should 優先度。コードの正しさは関連 must ケースで担保されている。
