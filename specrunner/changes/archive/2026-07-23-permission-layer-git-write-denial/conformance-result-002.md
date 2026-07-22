# Conformance Result — permission-layer-git-write-denial — iter 2

## Summary

All 4 judgment items (tasks / spec requirements / design decisions / request acceptance criteria) are met. No blocking gaps found.

---

## J1: tasks.md — All Checkboxes Complete

All 8 tasks (T-01 through T-08) have every sub-checkbox marked `[x]`.

| Task | Description | Status |
|------|-------------|--------|
| T-01 | Probe 拡張・SDK 挙動実測確定 | ✅ complete |
| T-02 | git-command-classifier.ts 新規追加 | ✅ complete |
| T-03 | AgentRunContext に AgentWriteScope field 追加 | ✅ complete |
| T-04 | buildStepContext で writeScope 計算・設定 | ✅ complete |
| T-05 | dotSpecrunnerDirRel() helper 追加 | ✅ complete |
| T-06 | guard を Bash 分類 + Write/Edit スコープに拡張 | ✅ complete |
| T-07 | 既存 adapter テストの追随更新 | ✅ complete |
| T-08 | 挙動不変の証明と破壊確認 | ✅ complete |

---

## J2: spec.md — Requirements and Scenarios

### Requirement: Bash を canUseTool 経路に載せる

**Scenario: Bash が allowedTools に含まれない**
- Evidence: `src/adapter/claude-code/agent-runner.ts:566` — `baseAllowedTools = ["Read", "Grep", "Glob"]`（"Bash" なし）。
- TC-037 (`expect(allowedTools).not.toContain("Bash")`) および TC-SB-02 (`expect(sandbox["autoAllowBashIfSandboxed"]).toBe(false)` + allowedTools no Bash) で固定。

**Scenario: Bash tool call が guard を経由する**
- Evidence: `autoAllowBashIfSandboxed: false`（`agent-runner.ts:104`）により sandbox が Bash を事前承認しない。probe 観測 B（design.md D6、2026-07-23）で `bash-canusetool-gate-b PASS` を実測確認済み。

### Requirement: git 状態変更コマンドを全 agent step で deny する

**Scenario: 状態変更 git を deny する**
- Evidence: `createWorkspaceToolGuard`（Bash 分岐, `agent-runner.ts:146-162`）→ `classifyGitCommand` で `kind === "mutation"` なら deny。TC-011 で `git commit/push/add/reset/checkout/merge/rebase/stash` 各コマンドの deny を確認。

**deny message の要件（commit は pipeline が合成する / 読み取り系は許可）**
- Evidence: TC-012 で `result.message` が `/pipeline/i` と `/読み取り|read/i` を含むことを確認。実装 message は「Commit は pipeline が合成する」「読み取り系 git (status/diff/log/show/rev-parse 等) は許可されています」を含む（`agent-runner.ts:153-157`）。

**Scenario: 読み取り git と非 git を allow する**
- Evidence: TC-013（`git status/diff/log/stash list` → allow + updatedInput）、TC-014（`bun test/echo/bun run typecheck` → allow + updatedInput）。

**Scenario: 複合コマンドを個別セグメントで判定する**
- Evidence: `git-command-classifier.ts:87-88` — `splitSegments` で `&&/||/|/;/&/\n` 分割。TC-003（classifier）で `git status && git commit -m x` → mutation、`echo ok | git add -A` → mutation を確認。

### Requirement: pipeline 管理パスと .specrunner への書込を全 step で deny する

**Scenario: state.json への Write を deny する**
- Evidence: `agent-runner.ts:201-209` — `scope.managedPaths.includes(rel)` で deny。guard 単体テストで `state.json/events.jsonl/usage.json/bite-evidence-result.md` → deny を確認。probe シナリオ (e) `state-json-deny PASS`（design.md D6）。

**Scenario: .specrunner 配下への Write を deny する**
- Evidence: `agent-runner.ts:213-220` — `rel === dotSpec || rel.startsWith(dotSpec + "/")` で deny。guard 単体テストで `.specrunner/local/foo` → deny を確認。

### Requirement: scoped step は宣言外の書込を deny する

**Scenario: 宣言外 Write を deny する**
- Evidence: `agent-runner.ts:228-241` — `stagingMode === "scoped"` かつ `!scope.declaredWritePaths.includes(rel)` で deny。probe シナリオ (d) `scoped-write-deny PASS`（design.md D6）。guard 単体テストで宣言外 → deny を確認。

**Scenario: 宣言内 Write を allow する（updatedInput パススルー）**
- Evidence: TC-025（Write to declared path → `{ behavior: "allow", updatedInput: input }`）、TC-026（Edit）。

### Requirement: guarded step は保護正典への書込を deny する

**Scenario: 宣言していない保護正典への Write を deny する**
- Evidence: `agent-runner.ts:248-257` — `scope.forbiddenPaths.includes(rel)` で deny。guard 単体テストで `design.md/spec.md/tasks.md/test-cases.md/request.md/attestation` → deny を確認。

**Scenario: 保護正典以外の worktree 書込を allow する**
- Evidence: guard 単体テストで `src/foo.ts` / `tests/foo.test.ts` → allow + updatedInput を確認。

### Requirement: cwd 境界の deny を維持する

**Scenario: worktree 外への Write を deny する**
- Evidence: `agent-runner.ts:177-190` — 既存 cwd 境界 deny ロジック維持。TC-FW-01（絶対パス外 → deny）、TC-FW-02（`../` エスケープ → deny）。

### Requirement: 書込スコープを buildStepContext で計算し文脈に載せる

**Scenario: scoped step のスコープを設定する**
- Evidence: `step-context-builder.ts:136-149` — `declaredWritePaths / stagingMode / managedPaths / forbiddenPaths / stepName / slug` を計算して `writeScope` に設定。TC-039 で `spec-review`（scoped）の `stagingMode === "scoped"` / `declaredWritePaths` / `stepName` / `slug` を確認。

**Scenario: guarded step のスコープを設定する**
- Evidence: TC-040 で `implementer`（guarded）の `stagingMode === "guarded"` / `declaredWritePaths` を確認。TC-041 で gitState artifact が除外されることを確認。TC-042 で `writes()` 未定義 → `declaredWritePaths = []`（null でなく空配列）を確認。

### Requirement: commit 層・utility query・managed adapter を不変に保つ

**Scenario: commit 層テストが無改変で green**
- Evidence: `git diff main...HEAD --stat` に `commit-push.ts` / `write-scope.ts` / `round-git-scope.ts` の変更なし。verification-result.md: 9069 tests passed。

---

## J3: design.md — Design Decisions

**D1: Bash を allowedTools から外し canUseTool に載せ替える**
- `baseAllowedTools = ["Read", "Grep", "Glob"]`（`agent-runner.ts:566`）、`autoAllowBashIfSandboxed: false`（`agent-runner.ts:104`）。probe 観測 B（2026-07-23）で確定 → 実装に反映済み。

**D2: git 状態変更コマンドの保守的字句分類器**
- `src/adapter/claude-code/git-command-classifier.ts` — 純 leaf module（他 `src/` への import なし）。`ALWAYS_MUTATING`（24 subcommands）、`CONDITIONAL`（branch/tag/stash）、セグメント分割、VAR=value スキップ、global option スキップを全実装。TC-001〜TC-009 で各分類を固定。

**D3: 書込スコープを buildStepContext で計算し AgentRunContext に threading**
- `AgentWriteScope` interface を `src/core/port/agent-runner.ts:116-144` に定義（stepName / slug / declaredWritePaths / stagingMode + pre-computed managedPaths / forbiddenPaths）。`buildStepContext` Step 7（`step-context-builder.ts:132-149`）で全フィールドを計算し `writeScope` に設定。pre-computed フィールドは DSM closure 維持のため core 層で解決（adapter → core/pipeline 直接 import なし）。

**D4: guard の Edit / Write 分岐を拡張**
- 判定順（cwd 境界 → managedPaths → .specrunner → scoped/guarded）が `agent-runner.ts:167-262` に実装済み。deny message に対象パスと許可範囲の要約を含む。

**D5: 挙動不変の境界**
- `commit-push.ts` / `write-scope.ts` / `round-git-scope.ts` の変更なし（diff で確認）。utility query（`query-one-shot.ts`）は bypassPermissions のまま。managed adapter 変更なし。

**D6: probe 拡張と残余の明文化**
- `scripts/probes/write-scope-guard-probe.ts` に 5 シナリオ実装済み（`bash-canusetool-gate / bash-canusetool-gate-b / bash-git-mutation-deny / bash-git-read-allow / scoped-write-deny / state-json-deny`）。
- design.md D6 に 2026-07-23 実行記録あり：(a)〜(e) 全 PASS。
- 残余（変数展開・リダイレクト・エディタ経由書込）を D6 末尾に明文化し commit 層が受け止める旨を記録。

**DSM closure**
- `agent-runner.ts` の import 先は `core/port/*` / `util/*` / 同 adapter 内モジュールのみ。`core/pipeline/round-git-scope` / `core/step/write-scope` への直接 import なし。`architecture/core-invariants.test.ts` が DSM を自動検証（9069 tests green）。

---

## J4: request.md — Acceptance Criteria

| 受け入れ基準 | 証拠 | 判定 |
|------------|------|------|
| classifier 単体テスト（状態変更 deny / 読み取り allow / 複合コマンド） | TC-001〜TC-009（`git-command-classifier.test.ts`） | ✅ |
| guard 単体テスト（scoped 宣言外 deny / 宣言内 allow / guarded 保護正典 deny / 管理パス deny / cwd 境界 deny） | TC-011〜TC-036+（`workspace-tool-guard.test.ts`） | ✅ |
| allow 経路が updatedInput パススルーを維持（SDK Zod 制約） | TC-013, TC-014, TC-025, TC-026, TC-033、`allow results carry updatedInput` describe | ✅ |
| probe 実行記録: R5 の 5 シナリオが期待どおり（実 SDK 検証） | design.md D6 に 2026-07-23 実行記録（全 PASS） | ✅ |
| 既存の write-scope / 合成 / egress テストが無改変で green | verification-result.md: 9069 tests passed、commit-push.ts 変更なし | ✅ |
| 破壊確認: revert で該当テストが fail することを記録 | TC-037（allowedTools no Bash）・TC-011（guard Bash deny）が破壊確認レバーとして design.md D6 に記録 | ✅ |
| typecheck && test が green | verification-result.md phase 2（typecheck）/ phase 3（test）ともに passed | ✅ |

---

## Observations (Non-Blocking)

1. **tasks.md T-07 の注記が stale**: `TC-SB-02` の注記に「Bash を allowedTools に維持したため変更不要」とあるが、最終実装では Bash を除去し TC-SB-02 も `expect(allowedTools).not.toContain("Bash")` と `expect(sandbox["autoAllowBashIfSandboxed"]).toBe(false)` を確認するよう更新されている。タスクチェックボックスは ✅ であり、テストは通過している。説明文が stale なだけで実装・テストに影響なし。

2. **AgentWriteScope の field 数が design.md D3 の記載より多い**: design.md D3 には 4 フィールド（stepName/slug/declaredWritePaths/stagingMode）を示すが実装は 6 フィールド（+ managedPaths/forbiddenPaths）。tasks.md T-03/T-06 に「DSM closure 維持のため管理パスを pre-computed field に追加」と明記されており、設計精緻化の記録がある。矛盾でなく設計深化であり問題なし。
