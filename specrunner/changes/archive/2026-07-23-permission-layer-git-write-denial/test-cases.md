# Test Cases: agent の git 状態変更とスコープ外書込を permission 層で遮断する

## Summary

- **Total**: 61 cases
- **Automated** (unit/integration): 58
- **Manual**: 3
- **Priority**: must: 37, should: 24, could: 0

---

## Category: Classifier 単体テスト（git-command-classifier.ts）

### TC-001: ALWAYS_MUTATING サブコマンド群が mutation を返す

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T-02 AC

**GIVEN** 新規 leaf module `git-command-classifier.ts` の `classifyGitCommand` 関数
**WHEN** `git commit -m x` / `git push origin main` / `git add .` / `git reset --hard HEAD` /
`git checkout main` / `git clean -fd` / `git merge feature` / `git rebase main` /
`git restore src/foo.ts` / `git cherry-pick abc` / `git rm file.txt` / `git mv a.ts b.ts` /
`git am patch.diff` / `git apply patch.diff` / `git update-ref refs/heads/main abc` /
`git filter-branch --tree-filter ...` の各コマンドを渡す
**THEN** 全コマンドが `{ kind: "mutation", subcommand: <対応サブコマンド> }` を返す

---

### TC-002: 読み取り系 git と非 git が read-or-nongit を返す

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T-02 AC

**GIVEN** `classifyGitCommand` 関数
**WHEN** `git status` / `git diff HEAD` / `git log --oneline` / `git show abc123` /
`git rev-parse HEAD` / `git blame src/foo.ts` / `git ls-files` / `bun test` / `echo ok` の各コマンドを渡す
**THEN** 全コマンドが `{ kind: "read-or-nongit" }` を返す

---

### TC-003: mutation セグメントを含む複合コマンドが mutation を返す

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T-02 AC

**GIVEN** `classifyGitCommand` 関数
**WHEN** `git status && git commit -m x` / `echo ok | git add -A` / `git diff; git push` の各コマンドを渡す
**THEN** 全コマンドが `{ kind: "mutation" }` を返す（mutation セグメントを含むため全体が mutation）

---

### TC-004: 全セグメントが非 mutation の複合コマンドは read-or-nongit を返す

**Category**: unit
**Priority**: should
**Source**: design.md D2

**GIVEN** `classifyGitCommand` 関数
**WHEN** `git status; echo done` / `git log | grep foo` のコマンドを渡す
**THEN** `{ kind: "read-or-nongit" }` を返す（全セグメントが読み取り系・非 git）

---

### TC-005: git がセグメント先頭以外に現れるコマンドは read-or-nongit を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 AC

**GIVEN** `classifyGitCommand` 関数
**WHEN** `echo git commit` を渡す（`git` が先頭でなく `echo` の引数位置）
**THEN** `{ kind: "read-or-nongit" }` を返す（git 実行でないため）

---

### TC-006: 値を取る global option をスキップして subcommand を正しく検出する

**Category**: unit
**Priority**: must
**Source**: design.md D2 / tasks.md T-02 AC

**GIVEN** `classifyGitCommand` 関数
**WHEN** `git -C /repo commit -m x`（`-C` の分離引数をスキップ）/
`git --git-dir=.git log`（`--git-dir=value` 形式をスキップ）/ `git -c core.bare=false status` を渡す
**THEN** `git -C /repo commit` は `{ kind: "mutation", subcommand: "commit" }`、
`git --git-dir=.git log` と `git -c core.bare=false status` は `{ kind: "read-or-nongit" }` を返す

---

### TC-007: 環境変数代入プレフィックスをスキップして subcommand を正しく検出する

**Category**: unit
**Priority**: should
**Source**: design.md D2

**GIVEN** `classifyGitCommand` 関数
**WHEN** `GIT_AUTHOR_NAME=foo git commit -m y` を渡す（先頭に `VAR=value` 形式のトークン）
**THEN** 代入トークンをスキップして `commit` を subcommand と判定し `{ kind: "mutation", subcommand: "commit" }` を返す

---

### TC-008: CONDITIONAL サブコマンド（branch/tag/stash）の読み取り形が read-or-nongit を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 AC / design.md D2

**GIVEN** `classifyGitCommand` 関数
**WHEN** `git branch`（引数なし）/ `git branch --list` / `git branch -l` /
`git tag`（引数なし）/ `git tag -l` /
`git stash list` / `git stash show` を渡す
**THEN** 全コマンドが `{ kind: "read-or-nongit" }` を返す

---

### TC-009: CONDITIONAL サブコマンド（branch/tag/stash）の変更形が mutation を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 AC / design.md D2

**GIVEN** `classifyGitCommand` 関数
**WHEN** `git branch -D foo`（削除フラグ）/ `git branch new-branch`（位置引数=作成）/
`git branch -m old new`（移動フラグ）/
`git tag v1.0.0`（位置引数=作成）/ `git tag -a v1.0 -m msg`（annotate フラグ）/ `git tag -d v0.9`（削除フラグ）/
`git stash`（bare）/ `git stash pop` / `git stash drop` / `git stash push` を渡す
**THEN** 全コマンドが `{ kind: "mutation" }` を返す

---

### TC-010: classifier は src/ 配下の他 module を import しない（leaf 制約）

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02 AC

**GIVEN** `src/adapter/claude-code/git-command-classifier.ts` のソース
**WHEN** import 宣言を全列挙する
**THEN** `src/` 配下のモジュールへの import が存在しない（純字句判定 leaf として独立している）

---

## Category: Guard — Bash 分岐テスト

### TC-011: guard が状態変更 git の Bash call を deny する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: git 状態変更コマンドを全 agent step で deny する > Scenario: 状態変更 git を deny する

---

### TC-012: deny message が「commit は pipeline が合成する」と「読み取り系は許可」を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: git 状態変更コマンドを全 agent step で deny する > Scenario: 状態変更 git を deny する

---

### TC-013: guard が読み取り git の Bash call を allow し updatedInput を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: git 状態変更コマンドを全 agent step で deny する > Scenario: 読み取り git と非 git を allow する

---

### TC-014: guard が非 git の Bash call を allow し updatedInput を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: git 状態変更コマンドを全 agent step で deny する > Scenario: 読み取り git と非 git を allow する

---

### TC-015: guard が mutation セグメントを含む複合コマンドを deny する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: git 状態変更コマンドを全 agent step で deny する > Scenario: 複合コマンドを個別セグメントで判定する

---

### TC-016: writeScope なしでも Bash git 変更 deny は適用される

**Category**: unit
**Priority**: should
**Source**: design.md D3

**GIVEN** `scope` 引数を渡さずに生成した guard（`createWorkspaceToolGuard(cwd)` 形式）
**WHEN** `git commit -m x` の Bash call を渡す
**Then** deny が返る（Bash の git 分類は `writeScope` の有無に依存せず常時適用）

---

## Category: Guard — pipeline 管理パス / .specrunner deny

### TC-017: state.json への Write が deny される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipeline 管理パスと .specrunner への書込を全 step で deny する > Scenario: state.json への Write を deny する

---

### TC-018: .specrunner 配下への Write が deny される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipeline 管理パスと .specrunner への書込を全 step で deny する > Scenario: .specrunner 配下への Write を deny する

---

### TC-019: events.jsonl / usage.json / bite-evidence-result.md への Write が deny される

**Category**: unit
**Priority**: should
**Source**: design.md D4 / request.md R3

**GIVEN** slug を持つ任意 step の guard（`writeScope` あり）
**WHEN** agent が `specrunner/changes/<slug>/events.jsonl` / `specrunner/changes/<slug>/usage.json` /
`specrunner/changes/<slug>/bite-evidence-result.md` への Write をそれぞれ試みる
**THEN** 全パスで deny が返る（`pipelineManagedPaths(slug)` に含まれる）

---

### TC-020: .specrunner/ のサブパスへの Write が deny される

**Category**: unit
**Priority**: should
**Source**: design.md D4

**GIVEN** 任意 step の guard（`writeScope` あり）
**WHEN** agent が `.specrunner/local/config.json` への Write を試みる
**THEN** deny が返る（`.specrunner/` 配下のサブパスを含む）

---

### TC-021: pipeline 管理パス deny が scoped step と guarded step の両方で適用される

**Category**: unit
**Priority**: should
**Source**: design.md D4

**GIVEN** scoped step の guard と guarded step の guard をそれぞれ生成する
**WHEN** 両方の guard に `specrunner/changes/<slug>/state.json` への Write を渡す
**THEN** 両方とも deny が返る（step 種別によらず共通 deny）

---

## Category: Guard — scoped step の宣言外 / 宣言内判定

### TC-022: scoped step で宣言外 Write が deny される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped step は宣言外の書込を deny する > Scenario: 宣言外 Write を deny する

---

### TC-023: scoped step で宣言外 Edit が deny される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped step は宣言外の書込を deny する > Scenario: 宣言外 Write を deny する

---

### TC-024: scoped step の deny message に宣言パスの要約が含まれる

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: scoped step は宣言外の書込を deny する > Scenario: 宣言外 Write を deny する

---

### TC-025: scoped step で宣言内 Write が allow され updatedInput を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped step は宣言外の書込を deny する > Scenario: 宣言内 Write を allow する

---

### TC-026: scoped step で宣言内 Edit が allow され updatedInput を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: scoped step は宣言外の書込を deny する > Scenario: 宣言内 Write を allow する

---

## Category: Guard — guarded step の保護正典 / その他

### TC-027: guarded step で宣言していない保護正典（design.md 等）への Write が deny される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guarded step は保護正典への書込を deny する > Scenario: 宣言していない保護正典への Write を deny する

---

### TC-028: guarded step で spec.md / tasks.md / test-cases.md / request.md / attestation への Write が deny される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guarded step は保護正典への書込を deny する > Scenario: 宣言していない保護正典への Write を deny する

---

### TC-029: guarded step で保護正典以外の worktree パス（src/ 等）への Write が allow される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: guarded step は保護正典への書込を deny する > Scenario: 保護正典以外の worktree 書込を allow する

---

### TC-030: guarded step が宣言した保護正典パスへの Write は allow される

**Category**: unit
**Priority**: should
**Source**: design.md D4

**GIVEN** guarded step の guard で `declaredWritePaths` に `specrunner/changes/<slug>/design.md` が含まれる
**WHEN** agent が `specrunner/changes/<slug>/design.md` への Write を試みる
**THEN** `{ behavior: "allow", updatedInput: <元 input> }` が返る（宣言で保護が解除される）

---

## Category: Guard — cwd 境界（既存挙動保存）

### TC-031: cwd 外への Write が deny される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: cwd 境界の deny を維持する > Scenario: worktree 外への Write を deny する

---

### TC-032: cwd 外への deny message に worktree 識別文字列が含まれる

**Category**: unit
**Priority**: should
**Source**: design.md D4

**GIVEN** guard が有効な agent step（cwd = `/work/my-worktree`）
**WHEN** agent が `/etc/passwd` への Write を試みる
**THEN** deny message に `my-worktree` 等の worktree 識別文字列が含まれる

---

## Category: Guard — allow 経路の updatedInput 不変条件

### TC-033: allow 結果に updatedInput が含まれ元 input と同一である

**Category**: unit
**Priority**: must
**Source**: request.md 受け入れ基準（allow 経路が updatedInput パススルーを維持）

**GIVEN** 任意の allow 条件（宣言内 Write / 読み取り git Bash / 非 git Bash / 保護正典以外の guarded Write 等）
**WHEN** guard が allow を返す
**THEN** 返り値は `{ behavior: "allow", updatedInput: <元の input と同一> }` であり `updatedInput` が欠落しない

---

### TC-034: deny 結果は `updatedInput` を持たない（SDK Zod union 準拠）

**Category**: unit
**Priority**: should
**Source**: design.md D4

**GIVEN** 任意の deny 条件（`git commit` Bash / 宣言外 Write / state.json Write 等）
**WHEN** guard が deny を返す
**THEN** 返り値の `behavior` は `"deny"` であり、`updatedInput` フィールドを持たない

---

## Category: Guard — writeScope なし時の fallback

### TC-035: writeScope なし guard は cwd 内 Write を allow する（strictly-weaker fallback）

**Category**: unit
**Priority**: should
**Source**: design.md D3

**GIVEN** `scope` 引数なしで生成した guard（legacy / non-production ctx 相当）
**WHEN** agent が cwd 内の任意パスへ Write する
**THEN** allow が返る（cwd 境界のみが有効な strictly-weaker fallback）

---

### TC-036: writeScope なし guard でも cwd 外 deny は適用される

**Category**: unit
**Priority**: should
**Source**: design.md D3

**GIVEN** `scope` 引数なしで生成した guard
**WHEN** agent が cwd 外のパスへ Write を試みる
**THEN** deny が返る（cwd 境界 deny は scope 有無に関わらず維持）

---

## Category: allowedTools 設定

### TC-037: allowedTools に "Bash" が含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Bash を canUseTool 経路に載せる > Scenario: Bash が allowedTools に含まれない

---

### TC-038: agent step の query options の permissionMode が "default" である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Bash を canUseTool 経路に載せる > Scenario: Bash が allowedTools に含まれない

---

## Category: buildStepContext — 書込スコープ計算と AgentRunContext threading

### TC-039: scoped step の AgentRunContext に正しい writeScope が設定される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 書込スコープを buildStepContext で計算し文脈に載せる > Scenario: scoped step のスコープを設定する

---

### TC-040: guarded step の AgentRunContext に正しい writeScope が設定される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 書込スコープを buildStepContext で計算し文脈に載せる > Scenario: guarded step のスコープを設定する

---

### TC-041: declaredWritePaths に gitState artifact が含まれない

**Category**: unit
**Priority**: should
**Source**: design.md D3

**GIVEN** `writes()` が `{ artifact: "gitState", path: "" }` と `{ artifact: "file", path: "result.md" }` を返す step
**WHEN** `buildStepContext` が `AgentRunContext` を組み立てる
**THEN** `ctx.writeScope.declaredWritePaths` は `["result.md"]` のみを含む（`gitState` は除外される）

---

### TC-042: writes() が undefined の step では declaredWritePaths が空配列になる

**Category**: unit
**Priority**: should
**Source**: design.md D3

**GIVEN** `writes()` フィールドを持たない step（返り値が undefined）
**WHEN** `buildStepContext` が `AgentRunContext` を組み立てる
**THEN** `ctx.writeScope.declaredWritePaths` は `[]` である（null / undefined でなく空配列）

---

## Category: パスユーティリティ

### TC-043: dotSpecrunnerDirRel() が ".specrunner" を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05 AC

**GIVEN** `src/util/paths.ts` に追加された `dotSpecrunnerDirRel` 関数
**WHEN** `dotSpecrunnerDirRel()` を呼ぶ
**THEN** `".specrunner"` が返る

---

### TC-044: dotSpecrunnerDirRel() は localSidecarBaseDirRel() と異なる値を返す

**Category**: unit
**Priority**: should
**Source**: design.md D4

**GIVEN** `dotSpecrunnerDirRel` と既存の `localSidecarBaseDirRel`
**WHEN** 両関数をそれぞれ呼ぶ
**THEN** `dotSpecrunnerDirRel()` = `".specrunner"` / `localSidecarBaseDirRel()` = `".specrunner/local"` で値が異なる（`.specrunner/` 配下の全パスを網羅できる）

---

## Category: Probe — 実 SDK 検証（write-scope-guard-probe.ts）

### TC-045: Bash を allowedTools から外すと Bash tool call が canUseTool に発火する（R5-a）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Bash を canUseTool 経路に載せる > Scenario: Bash tool call が guard を経由する

---

### TC-046: git commit 系 Bash call が probe で deny される（R5-b）

**Category**: integration
**Priority**: must
**Source**: tasks.md T-01 AC

**GIVEN** 拡張された `write-scope-guard-probe.ts` を実行する
**WHEN** probe が `git commit -m x` の Bash call シナリオ（R5-b）を実行する
**THEN** guard が deny を返し、probe の verdict は PASS を報告する

---

### TC-047: 読み取り git Bash call が probe で allow される（R5-c）

**Category**: integration
**Priority**: must
**Source**: tasks.md T-01 AC

**GIVEN** 拡張された `write-scope-guard-probe.ts` を実行する
**WHEN** probe が `git status` の Bash call シナリオ（R5-c）を実行する
**THEN** guard が allow を返し、probe の verdict は PASS を報告する

---

### TC-048: scoped step の宣言外 Write が probe で deny される（R5-d）

**Category**: integration
**Priority**: must
**Source**: tasks.md T-01 AC

**GIVEN** 拡張された `write-scope-guard-probe.ts` を実行する
**WHEN** probe が scoped step 相当の宣言外 Write シナリオ（R5-d）を実行する
**THEN** guard が deny を返し、probe の verdict は PASS を報告する

---

### TC-049: state.json 相当パスへの Write が probe で deny される（R5-e）

**Category**: integration
**Priority**: must
**Source**: tasks.md T-01 AC

**GIVEN** 拡張された `write-scope-guard-probe.ts` を実行する
**WHEN** probe が `state.json` 相当パスへの Write シナリオ（R5-e）を実行する
**THEN** guard が deny を返し、probe の verdict は PASS を報告する

---

### TC-050: probe の全シナリオが機械 grep 可能な verdict 行を出力する

**Category**: integration
**Priority**: should
**Source**: tasks.md T-01 AC

**GIVEN** 拡張された `write-scope-guard-probe.ts` を実行する
**WHEN** 5 シナリオ（a〜e）が完了する
**THEN** 各シナリオについて `[PROBE] scenario=... verdict=PASS|FAIL` の形式の行が標準出力に含まれる

---

### TC-051: probe の実行記録（観測 A/B と全 5 シナリオ verdict）が design または PR に残る

**Category**: manual
**Priority**: should
**Source**: tasks.md T-01 AC

**GIVEN** probe 実行後
**WHEN** design.md の D6 追記または PR コメントを確認する
**THEN** 観測 A（`canUseTool` が発火）/ 観測 B（`autoAllowBashIfSandboxed` 調整）の区別と、
5 シナリオの PASS/FAIL が記録されている

---

## Category: 回帰テスト — commit 層・utility query・managed adapter 不変

### TC-052: commit 層の write-scope / 合成 / egress テストが無改変で green である

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: commit 層・utility query・managed adapter を不変に保つ > Scenario: commit 層テストが無改変で green

---

### TC-053: write-scope.ts が無改変である（変更行ゼロ）

**Category**: integration
**Priority**: should
**Source**: tasks.md T-02 / T-06 AC

**GIVEN** 変更後の git diff
**WHEN** `src/core/step/write-scope.ts` への変更行数を確認する
**THEN** 変更行数がゼロである（再利用のみ。既存関数は無改変）

---

### TC-054: round-git-scope.ts が無改変である（変更行ゼロ）

**Category**: integration
**Priority**: should
**Source**: tasks.md T-06 AC

**GIVEN** 変更後の git diff
**WHEN** `src/core/pipeline/round-git-scope.ts` への変更行数を確認する
**THEN** 変更行数がゼロである（`pipelineManagedPaths` は再利用のみ）

---

### TC-055: commit-push.ts が無改変である（変更行ゼロ）

**Category**: integration
**Priority**: should
**Source**: request.md R4

**GIVEN** 変更後の git diff
**WHEN** `src/core/step/commit-push.ts` への変更行数を確認する
**THEN** 変更行数がゼロである（commit 層の独立性）

---

### TC-056: utility query（query-one-shot）の既存テストが green のまま

**Category**: integration
**Priority**: should
**Source**: design.md D5

**GIVEN** 既存の query-one-shot テストスイート
**WHEN** 本変更を適用してテストを実行する
**THEN** テストは green のままである（`bypassPermissions` 経路は `canUseTool` を呼ばず対象外）

---

### TC-057: managed adapter の既存テストが green のまま

**Category**: integration
**Priority**: should
**Source**: design.md D5

**GIVEN** 既存の managed adapter テストスイート
**WHEN** 本変更を適用してテストを実行する
**THEN** テストは green のままである（client 側 permission surface を持たず対象外）

---

## Category: 型システム整合性

### TC-058: optional writeScope 追加後に既存の AgentRunContext literal 構築サイトがコンパイル継続

**Category**: integration
**Priority**: must
**Source**: tasks.md T-03 AC

**GIVEN** `AgentRunContext` に `writeScope?: AgentWriteScope` を追加した後
**WHEN** `bun run typecheck` を実行する
**THEN** 既存の literal 構築サイト（adapter / テスト等）で型エラーが発生しない（後方互換）

---

### TC-059: managed / codex / dispatching adapter は writeScope を参照せず型が通る

**Category**: integration
**Priority**: should
**Source**: tasks.md T-03 AC

**GIVEN** managed adapter / codex adapter / dispatching adapter のソース
**WHEN** `bun run typecheck` を実行する
**THEN** これらの adapter に `writeScope` 関連の変更は不要であり型が通る

---

## Category: 破壊確認（revert でテストが fail することの記録）

### TC-060: Bash を allowedTools に戻すと TC-037 が fail する

**Category**: manual
**Priority**: must
**Source**: request.md 受け入れ基準（修正前の挙動に戻すと該当テストが fail）

**GIVEN** `baseAllowedTools` に `"Bash"` を戻した状態（旧挙動：Bash pre-approve）
**WHEN** TC-037 に対応するテスト（allowedTools が Bash を含まないことを固定）を実行する
**THEN** テストが fail する（revert で破壊確認可能。PR に記録する）

---

### TC-061: guard を旧実装（cwd 境界のみ / Bash 全許可）に戻すと TC-022 と TC-011 が fail する

**Category**: manual
**Priority**: must
**Source**: request.md 受け入れ基準（修正前の挙動に戻すと該当テストが fail）

**GIVEN** guard を cwd 境界のみ・Bash 全 allow の旧実装に戻した状態
**WHEN** scoped 宣言外 Write deny テスト（TC-022 相当）と Bash git 変更 deny テスト（TC-011 相当）を実行する
**THEN** 両テストが fail する（revert で破壊確認可能。PR に記録する）

---

## テストファイル対応

| カテゴリ | ファイル |
|---------|---------|
| Classifier (TC-001〜TC-010) | `src/adapter/claude-code/__tests__/git-command-classifier.test.ts`（新規） |
| Guard (TC-011〜TC-036) | `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`（拡張） |
| allowedTools (TC-037〜TC-038) | `src/adapter/claude-code/__tests__/sandbox-scope.test.ts`（更新） |
| buildStepContext (TC-039〜TC-042) | `src/core/step/__tests__/step-context-builder.test.ts`（拡張） |
| Paths (TC-043〜TC-044) | `src/util/__tests__/paths.test.ts`（拡張） |
| Probe (TC-045〜TC-051) | `scripts/probes/write-scope-guard-probe.ts`（拡張・手動実行） |
| Regression (TC-052〜TC-057) | 既存テストスイートの green 確認 |
| Typecheck (TC-058〜TC-059) | `bun run typecheck` |
| Destruction (TC-060〜TC-061) | PR 記録（revert 確認手順） |

## Result

```yaml
result: completed
total: 61
automated: 58
manual: 3
must: 37
should: 24
could: 0
blocked_reasons: []
```
