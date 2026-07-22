# Conformance Review — Iteration 003

**Change**: permission-layer-git-write-denial  
**Date**: 2026-07-23

---

## 検証した項目

### J1: Tasks — 全 checkbox 完了確認

tasks.md の T-01〜T-08 全 checkbox が `[x]` であることを確認。

### J2: Design Decisions — 実装照合 (D1–D6)

#### D1: Bash を allowedTools から外し canUseTool に載せ替える

`agent-runner.ts:566`:
```typescript
const baseAllowedTools = ["Read", "Grep", "Glob"];
```
Bash は除外されており `permissionMode: "default"` により canUseTool が発火する。

`buildWorkspaceSandbox`:
```typescript
autoAllowBashIfSandboxed: false,
```
probe 観測 B（`true` では guard を迂回）に基づき `false` に設定済み。設計 D1 と一致。

#### D2: git 状態変更コマンドの保守的字句分類器

`src/adapter/claude-code/git-command-classifier.ts` が新規作成された:

- ALWAYS_MUTATING (24 subcommands): commit/commit-tree/push/add/reset/checkout/switch/restore/clean/merge/rebase/cherry-pick/revert/rm/mv/am/apply/pull/update-ref/update-index/filter-branch/fast-import/gc/prune
- CONDITIONAL: branch/tag/stash/remote — 引数で読み取り形/変更形を分岐
- READ_ONLY (閉集合 allowlist): status/diff/log/show/rev-parse 等
- **未知 subcommand → mutation (fail-closed allowlist 反転)**: `git config alias.p push && git p` の2手による直 push を閉じる設計判断と一致
- セグメント分割: `&&`/`||`/`|`/`;`/`&`/改行で分割し各セグメントを個別判定
- 環境変数代入スキップ、global option + 値トークンスキップ
- leaf module — `src/` から他 module を import しない ✓

CONDITIONAL remote: `show`/`get-url`/`-v` → read-or-nongit、それ以外 → mutation（set-url が push 先差替えベクターになり得るため全 deny）。設計 D2 と一致。

#### D3: AgentRunContext に書込スコープを threading

`src/core/port/agent-runner.ts:116-144`:
```typescript
export interface AgentWriteScope {
  stepName: string; slug: string;
  declaredWritePaths: string[];
  stagingMode: "scoped" | "guarded";
  managedPaths: string[];    // pre-computed
  forbiddenPaths: string[];  // pre-computed
}
// AgentRunContext に:
writeScope?: AgentWriteScope;  // optional — backward compat
```

`src/core/step/step-context-builder.ts:136-180` で計算:
```typescript
const declaredWritePaths = (step.writes?.(state, deps) ?? [])
  .filter((r) => r.artifact !== "gitState").map((r) => r.path);
const stagingMode = stagingModeFor(step.name);
const managedPaths = pipelineManagedPaths(deps.slug);
const forbiddenPaths = forbiddenWritePaths(step.name, deps.slug, declaredWritePaths);
const writeScope: AgentWriteScope = { stepName: step.name, slug: deps.slug,
  declaredWritePaths, stagingMode, managedPaths, forbiddenPaths };
// ctx.writeScope = writeScope
```

- `write-scope.ts` は無改変（再利用のみ） ✓
- DSM closure: adapter は `ctx.writeScope` 経由で受け取るのみ、`core/pipeline`/`core/step` を直接 import しない ✓
- optional + strictly-weaker fallback (scope なし → cwd 境界のみ) ✓

#### D4: guard の Edit / Write 分岐を拡張

`agent-runner.ts:139-270` `createWorkspaceToolGuard(cwd, scope?)` の判定順:

1. Bash: `classifyGitCommand(command).kind === "mutation"` → deny / それ以外 → allow (updatedInput)
2. Edit/Write: `typeof filePath !== "string"` → allow (updatedInput)
3. `!isInside` (cwd 境界) → deny
4. `scope` あり: `scope.managedPaths.includes(rel)` → deny
5. `scope` あり: `.specrunner` / `.specrunner/` → deny (`dotSpecrunnerDirRel()` 利用)
6. `scope.stagingMode === "scoped"` + `!declaredWritePaths.includes(rel)` → deny
7. `scope.stagingMode === "guarded"` + `scope.forbiddenPaths.includes(rel)` → deny
8. `scope` なし: cwd 内 → allow (strictly-weaker fallback)
9. allow は必ず `{ behavior:"allow", updatedInput: input }` ✓

設計 D4 の判定順・メッセージ要件と完全一致。

#### D5: 挙動不変の境界

`git diff main...HEAD --stat` に `commit-push.ts` / `write-scope.ts` / `round-git-scope.ts` の変更なし。T-08 に「全 8990 テスト通過」と記録。

#### D6: probe 拡張と残余の明文化

`scripts/probes/write-scope-guard-probe.ts` (391 行追加):
- 5 シナリオ確認: `bash-canusetool-gate` / `bash-git-mutation-deny` / `bash-git-read-allow` / `scoped-write-deny` / `state-json-deny`
- `design.md` D6 に実行記録テーブル（2026-07-23）— 全 5 シナリオ PASS
- 残余（変数展開・リダイレクト・エディタ経由書込）が design.md に明文化 ✓

### J3: Spec Requirements — SHALL/MUST 照合

| Requirement | 充足根拠 |
|---|---|
| Bash を canUseTool 経路に載せる (MUST) | baseAllowedTools に Bash なし、permissionMode="default"、probe 観測 B |
| git 状態変更 deny (MUST × 3) | classifyGitCommand + guard Bash 分岐、deny message に pipeline/読み取り系言及、複合コマンドのセグメント分割 |
| pipeline 管理パス + .specrunner deny (MUST) | scope.managedPaths / dotSpecrunnerDirRel() チェック |
| scoped 宣言外 deny / 宣言内 allow (MUST × 2) | stagingMode === "scoped" 分岐 |
| guarded 保護正典 deny / それ以外 allow (MUST × 2) | scope.forbiddenPaths チェック |
| cwd 境界 deny を維持 (MUST) | isInside 判定が先行 deny として維持 |
| buildStepContext でスコープ計算 (MUST × 2) | step-context-builder.ts:136-180、write-scope.ts 単一ソース |
| commit 層・utility query・managed adapter 不変 (MUST NOT) | git diff に変更なし |

### J4: 受け入れ基準 — 全項目照合

**classifier 単体テスト**

`git-command-classifier.test.ts` TC-001〜TC-009:
- ALWAYS_MUTATING 24 サブコマンド全て → mutation (TC-001) ✓
- 読み取り git (status/diff/log/show/rev-parse/blame/ls-files) + 非 git → read-or-nongit (TC-002) ✓
- mutation セグメントを含む複合コマンド (&&/|/;) → mutation (TC-003) ✓
- 全セグメント非 mutation → read-or-nongit (TC-004) ✓
- git がセグメント先頭以外 (`echo git commit`) → read-or-nongit (TC-005) ✓
- global option スキップ (`git -C . commit`) → mutation (TC-006) ✓
- 環境変数代入プレフィックススキップ (TC-007) ✓
- CONDITIONAL 読み取り形 (TC-008) ✓
- CONDITIONAL 変更形 (TC-009) ✓

**guard 単体テスト**

`workspace-tool-guard.test.ts`:
- TC-011〜TC-015: Bash git 変更 deny / 読み取り・非 git allow ✓
- TC-012: deny message に「pipeline」「読み取り/read」含む ✓
- TC-013: 読み取り git allow + updatedInput ✓
- TC-017: state.json deny (scoped/guarded 両方) ✓
- TC-018: .specrunner/ deny ✓
- TC-019: events.jsonl / usage.json / bite-evidence-result.md deny ✓
- TC-021: pipeline 管理パス deny が scoped/guarded 両方に適用 ✓
- TC-022〜TC-026: scoped 宣言外 deny / 宣言内 allow ✓
- TC-027〜TC-030: guarded 保護正典 deny / 非保護パス allow / 宣言済み保護正典は allow ✓
- TC-FW-01〜TC-FW-02: cwd 境界 deny（既存挙動保存）✓

**allow 経路の updatedInput パススルー**

`workspace-tool-guard.test.ts` の TC-033 セクション:
- 宣言内 Write / 読み取り git Bash / 非 git Bash / 非文字列 file_path で `{ behavior:"allow", updatedInput: input }` を assert ✓
- deny 結果に `updatedInput` が無いことも assert ✓

**probe 実行記録**

`design.md` D6 の実行記録テーブル（2026-07-23）:

| シナリオ | 結果 |
|---|---|
| (a) bash-canusetool-gate | PASS — 観測 B 確認 |
| (b) bash-git-mutation-deny | PASS |
| (c) bash-git-read-allow | PASS — sdk-fast-path |
| (d) scoped-write-deny | PASS |
| (e) state-json-deny | PASS |

**既存の write-scope / 合成 / egress テストが無改変で green**

T-08 に記録。`git diff` に commit-push.ts / write-scope.ts / round-git-scope.ts の変更なし。

**破壊確認**

- TC-SB-02: `autoAllowBashIfSandboxed: false` かつ `allowedTools に Bash 非含有` を assert — Bash を元に戻すと fail ✓
- classifier テスト TC-001〜TC-009: 分類器削除で fail ✓
- guard テスト TC-011〜TC-036: guard ロジック revert で fail ✓
- buildStepContext テスト TC-039〜TC-042: writeScope 削除で fail ✓

**typecheck && test が green**

T-08: 「`bun run typecheck && bun run test` が green（全 8990 テスト通過）」と記録。

---

## 検証できなかった項目

None — 全項目について実装コード・テスト・実行記録を確認した。

---

## Findings 詳細

Blocking findings: **なし**

### 観測 O1 — ブランチに scope 外ファイルが存在する（非ブロッキング）

`git diff main...HEAD --stat` に `src/core/verification/type-only.ts`、`tests/unit/core/verification/type-only.test.ts`、`specrunner/adr/2026-07-22-coverage-type-only-structural-skip.md` 等、permission-layer とは別の変更が含まれる。これらは別の変更がブランチにマージされた結果であり、permission-layer の設計・仕様・タスクには影響しない。

### 観測 O2 — CONDITIONAL `remote get-url` の引数透過（非ブロッキング）

`classifyConditional` の remote 分岐は `first === "get-url"` のとき後続引数を見ずに read-or-nongit を返す。`git remote get-url --push origin` の `--push` オプション付きは実際には読み取り操作であり false positive の懸念はない。設計方針（保守的字句判定 + 残余は commit 層）と整合している。
