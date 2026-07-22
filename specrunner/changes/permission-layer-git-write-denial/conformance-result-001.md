# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. Tasks Completeness

T-01 〜 T-08 の全チェックボックスが `[x]` であることを確認した。

### 2. Design Decisions (D1–D6)

**D1 (Bash → canUseTool)**: `agent-runner.ts:566` で `baseAllowedTools = ["Read", "Grep", "Glob"]`（Bash 非含有）。`buildWorkspaceSandbox:104` で `autoAllowBashIfSandboxed: false`（観測 B の問題を解消）。TC-SB-02 / TC-037 がこれを固定。

**D2 (字句分類器)**: `git-command-classifier.ts` を新規追加。`ALWAYS_MUTATING`（24 subcommand）+ `CONDITIONAL`（branch/tag/stash）の 2 段構成。shell 接続子分割・各セグメント個別判定。未知 subcommand は allow（可用性優先）。他モジュール非依存の leaf 制約を遵守。

**D3 (AgentWriteScope threading)**: `agent-runner.ts:116-144` に 6 fields の `AgentWriteScope` interface を追加（stepName / slug / declaredWritePaths / stagingMode / managedPaths / forbiddenPaths）。`step-context-builder.ts:132-179` で計算・設定。design.md D3 のコードブロックは 4 fields のみ示すが、tasks.md T-03 が「DSM closure 維持のため管理パスを pre-computed field に追加」として `managedPaths` / `forbiddenPaths` を明示的に拡張しており、実装は tasks.md に従い 6 fields で正しい。

**D4 (guard 拡張)**: `createWorkspaceToolGuard(cwd, scope?)` が Bash 分岐（分類器呼び出し）と Edit/Write 分岐（cwd 境界 → managedPaths → .specrunner → scoped/guarded）を実装。deny message に対象パスと許可範囲要約を含む。allow は必ず `{ behavior: "allow", updatedInput: input }` を返す。adapter が `pipelineManagedPaths` / `forbiddenWritePaths` を直接 import せず scope フィールド経由で参照（DSM closure 維持）。

**D5 (挙動不変)**: diff に `commit-push.ts` / `query-one-shot.ts` / managed adapter の変更なし。verification-result.md で build/typecheck/test/lint/coverage の全フェーズ passed、8993 テスト green。

**D6 (probe + 残余明文化)**: `write-scope-guard-probe.ts` に 5 シナリオ（makeTrackedBashGuard ヘルパー）追加。design.md D6 に 2026-07-23 実 SDK 実行記録を表形式で掲載、5 シナリオ全 PASS。残余（変数展開・リダイレクト・エディタ経由書込）を明文化し commit 層が担当することを記録。

### 3. Spec Requirements

**Req: Bash を canUseTool 経路に載せる**
- Scenario "Bash が allowedTools に含まれない": TC-037 固定
- Scenario "Bash tool call が guard を経由する": TC-SB-02 固定

**Req: git 状態変更コマンドを全 agent step で deny する**
- Scenario "状態変更 git を deny する": TC-011（commit/push/add/reset/checkout/merge/rebase/stash）
- Scenario "読み取り git と非 git を allow する": TC-013（git status/diff/log/stash list）/ TC-014（bun test/echo）、updatedInput パススルー確認
- Scenario "複合コマンドを個別セグメントで判定する": TC-015
- deny message: TC-012 が `pipeline` / `読み取り|read` キーワード含有確認

**Req: pipeline 管理パスと .specrunner への書込を全 step で deny する**
- Scenario "state.json への Write を deny する": TC-017 / TC-021
- Scenario ".specrunner 配下への Write を deny する": TC-018

**Req: scoped step は宣言外の書込を deny する**
- Scenario "宣言外 Write を deny する": TC-022 / TC-023
- Scenario "宣言内 Write を allow する": TC-025 / TC-026

**Req: guarded step は保護正典への書込を deny する**
- Scenario "宣言していない保護正典への Write を deny する": TC-027 / TC-028
- Scenario "保護正典以外の worktree 書込を allow する": TC-029
- TC-030: 宣言した保護正典は allow（guarded 正常系）

**Req: cwd 境界の deny を維持する**
- Scenario "worktree 外への Write を deny する": TC-FW-01 / TC-FW-02

**Req: 書込スコープを buildStepContext で計算し文脈に載せる**
- Scenario "scoped step のスコープを設定する": TC-039
- Scenario "guarded step のスコープを設定する": TC-040
- TC-041: gitState artifact 除外確認
- TC-042: writes() 未定義 → `[]` 確認

**Req: commit 層・utility query・managed adapter を不変に保つ**
- Scenario "commit 層テストが無改変で green": verification-result.md 8993 tests green

### 4. Request Acceptance Criteria

| 基準 | 証拠 | 判定 |
|------|------|------|
| classifier 単体テスト（mutation/read-or-nongit、複合コマンド含む） | `git-command-classifier.test.ts` TC-001〜TC-009 | ✅ |
| guard 単体テスト（scoped/guarded deny/allow、pipeline 管理パス、cwd 境界） | `workspace-tool-guard.test.ts` TC-011〜TC-036+、TC-FW-01〜TC-FW-07 | ✅ |
| allow 経路が updatedInput パススルーを維持 | TC-033 / TC-034 | ✅ |
| probe 実行記録：R5 の 5 シナリオが期待どおり | design.md D6 表（2026-07-23 実 SDK）: (a)(b)(c)(d)(e) 全 PASS | ✅ |
| 既存 write-scope / 合成 / egress テストが無改変 green | verification-result.md 8993 テスト passed | ✅ |
| 破壊確認の記録 | TC-037（allowedTools 非含有）/ TC-011・TC-022（guard deny）を design.md D6 に 2 レバーとして記録 | ✅ |
| typecheck && test が green | verification-result.md 全フェーズ passed | ✅ |

### 5. DSM Closure 確認

`agent-runner.ts` が `round-git-scope.ts` / `write-scope.ts`（core/pipeline・core/step）を直接 import していないことを確認。`pipelineManagedPaths` と `forbiddenWritePaths` は `buildStepContext`（core 層）で計算され、`AgentWriteScope.managedPaths` / `forbiddenPaths` 経由で adapter に渡る。architecture/core-invariants.test.ts による自動検証が存在。

### 6. Probe 観測 B の扱い確認

`autoAllowBashIfSandboxed: true` が Bash を canUseTool より先に auto-approve することが probe で実測された。production では `false` に変更済み。`false` 下でも allow された Bash（読み取り git / 非 git）は sandbox 内で正常実行されることがシナリオ (c)（sdk-fast-path route）で確認されている。

## 検証できなかった項目

None。全 acceptance criteria を実装・テストで確認した。probe 実行記録は design.md D6 に掲載済み（2026-07-23 実 SDK）。

## Findings 詳細

None。
