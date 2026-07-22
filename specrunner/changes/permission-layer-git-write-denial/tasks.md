# Tasks: agent の git 状態変更とスコープ外書込を permission 層で遮断する

実装対象は local runtime（Claude Agent SDK）adapter と core の seam に限定する:
`src/adapter/claude-code/agent-runner.ts`（D1/D4）、新規
`src/adapter/claude-code/git-command-classifier.ts`（D2）、
`src/core/port/agent-runner.ts`（D3 型追加）、`src/core/step/step-context-builder.ts`（D3 計算）、
`src/util/paths.ts`（`.specrunner` helper）。
`src/core/step/write-scope.ts` と `src/core/pipeline/round-git-scope.ts` の既存純関数は **再利用のみ**（無改変）。
commit 層（`commit-push.ts`）・utility query・managed adapter は変更しない。各タスクは design.md の Decision を参照する。

**タスク順序の制約**: T-01（probe R5-a）を最初に実施し、D1 の観測 A/B を確定してから T-02 以降の実装挙動を
確定する。observe B（`autoAllowBashIfSandboxed` 調整が必要）で「allow した非 git Bash が実行されない」場合は
実装を止めて判断を仰ぐ（design Open Questions）。

## T-01: probe を拡張し SDK 挙動を実測確定する（D1 / D6, R5）

- [ ] `scripts/probes/write-scope-guard-probe.ts` にシナリオを追加する:
  - [ ] **(a)** allowedTools から Bash を外す（現行 `buildWorkspaceSandbox` 設定）と、`permissionMode:"default"`
        で Bash tool call に `canUseTool` が発火するか（fired / not-consulted）を測る gating シナリオ。
        auto-approve で発火しない場合は `autoAllowBashIfSandboxed:false` でも再測し、その設定下で allow した
        非 git Bash（例 `echo ok` / `bun --version`）が実行されるかを測る。
  - [ ] **(b)** `git commit -m x` 等の変更系 Bash が deny される。
  - [ ] **(c)** `git status` 等の読み取り Bash が allow される。
  - [ ] **(d)** scoped step 相当の宣言外 Write が deny される（guard に scope を渡した構成）。
  - [ ] **(e)** `state.json` 相当パスへの Write が deny される。
- [ ] 各シナリオは機械 grep 可能な verdict 行（`[PROBE] scenario=... verdict=PASS|FAIL`）を出力する。
- [ ] probe 実行結果（5 シナリオの verdict と、観測 A / B の別）を design.md の D6 追記または PR コメントに記録する。

**Acceptance Criteria**:
- probe が実 SDK に対して (a)〜(e) を実行し、verdict 行を出力する。
- (a) の結果で D1 の分岐（sandbox 設定を不変にするか `autoAllowBashIfSandboxed` を調整するか）が確定している。
- 観測 B かつ「allow した非 git Bash が実行されない」場合は、実装を進めず design Open Questions に沿って判断を仰いだ記録がある。
- probe 実行記録が design または PR に残っている。

## T-02: git 状態変更コマンドの字句分類器を追加（D2, R2）

- [ ] 新規 leaf module `src/adapter/claude-code/git-command-classifier.ts` に純関数
      `classifyGitCommand(command: string): GitCommandVerdict` を追加する。
      `GitCommandVerdict = { kind: "mutation"; subcommand: string } | { kind: "read-or-nongit" }`。
- [ ] 分類アルゴリズム（design D2）を実装する:
  - [ ] shell 接続子 `&&` `||` `|` `;` `&`・改行でセグメント分割し、各セグメントを個別判定する。
  - [ ] 先頭の `VAR=value` 代入トークンをスキップし、残った先頭トークンの basename が `git`（`git` / 末尾 `/git`、
        両端引用符除去後）のセグメントのみ git 実行と見なす（`git` が arg 位置に現れるセグメントは非 git）。
  - [ ] 値を取る global option（`-C` `-c` `--git-dir` `--work-tree` `--namespace` `--exec-path` の分離引数形）は
        直後トークンも 1 つスキップ、`--opt=value` 形は単一スキップし、最初の bare token を subcommand とする。
  - [ ] `ALWAYS_MUTATING`（design D2 の列挙）に該当 → `{ kind:"mutation", subcommand }`。
  - [ ] `CONDITIONAL`（`branch` / `tag` / `stash`）は design D2 の読み取り形 / 変更形の判定に従う。
  - [ ] それ以外（読み取り系 + 未知 subcommand + 非 git）→ `{ kind:"read-or-nongit" }`。
- [ ] `git-command-classifier.ts` は `src/` の他 module を import しない（純字句判定の leaf に保つ）。

**Acceptance Criteria**:
- 単体テスト（新規 `src/adapter/claude-code/__tests__/git-command-classifier.test.ts`）で以下を固定する:
  - `git commit` / `git push` / `git add` / `git reset` / `git checkout` / `git clean` / `git merge` /
    `git rebase` / `git stash` / `git restore` / `git cherry-pick` / `git rm` / `git mv` / `git am` /
    `git apply` / `git branch -D <n>` / `git branch <new>` / `git tag <v>` / `git update-ref` /
    `git filter-branch` → `mutation`。
  - `git status` / `git diff` / `git log` / `git show` / `git rev-parse` / `git branch`（一覧）/
    `git branch --list` / `git tag -l` / `git stash list` / `git stash show` / 非 git（`bun test` / `echo`）
    → `read-or-nongit`。
  - 複合コマンド（`git status && git commit -m x`、`echo ok | git add -A`、`git -C . commit -m x`）で
    変更系セグメントを含むものは `mutation`。
  - 先頭以外の位置に `git` が現れる `echo git commit` は `read-or-nongit`。
- 分類器は `src/util/paths` を含む他 module へ依存しない。

## T-03: AgentRunContext に書込スコープ field を追加（D3, R3）

- [ ] `src/core/port/agent-runner.ts` に interface `AgentWriteScope { stepName: string; slug: string;
      declaredWritePaths: string[]; stagingMode: "scoped" | "guarded" }` を追加する。
- [ ] `AgentRunContext` に optional field `writeScope?: AgentWriteScope` を追加する（後方互換 / literal 構築
      サイト非破壊のため optional）。

**Acceptance Criteria**:
- `typecheck` が green（既存の `AgentRunContext` literal 構築サイトはコンパイル継続）。
- managed / codex / dispatching adapter は `writeScope` を参照せず、変更不要のまま型が通る。

## T-04: buildStepContext で書込スコープを計算して設定（D3, R3）

- [ ] `src/core/step/step-context-builder.ts` の ctx 組み立て（Step 7）で:
  - [ ] `declaredWritePaths = (step.writes?.(state, deps) ?? []).filter(r => r.artifact !== "gitState")
        .map(r => r.path)` を計算する（`commit-push.ts:449-450` と同一式）。
  - [ ] `stagingMode = stagingModeFor(step.name)`（`write-scope.ts` から import）。
  - [ ] `writeScope = { stepName: step.name, slug: deps.slug, declaredWritePaths, stagingMode }` を
        `AgentRunContext` に設定する。
- [ ] `write-scope.ts` は再利用のみ（無改変）。

**Acceptance Criteria**:
- 単体テストで scoped step（例 spec-review）と guarded step（例 implementer）の両方について、
  組み立てられた ctx の `writeScope` が期待の `stagingMode` / `declaredWritePaths` / `stepName` / `slug` を持つ。
- `stagingModeFor` / `write-scope.ts` の実装は無改変。

## T-05: `.specrunner` ディレクトリ helper を追加（D4）

- [ ] `src/util/paths.ts` に `dotSpecrunnerDirRel(): string`（`.specrunner`）を追加する（既存
      `localSidecarBaseDirRel()` = `.specrunner/local` は範囲が狭く再利用不可のため）。

**Acceptance Criteria**:
- `dotSpecrunnerDirRel()` が `.specrunner` を返す単体テストが green。

## T-06: guard を Bash 分類 + Write/Edit スコープに拡張（D1 / D4, R1/R2/R3）

- [ ] `src/adapter/claude-code/agent-runner.ts`:
  - [ ] `baseAllowedTools` から `"Bash"` を除去する（`["Read","Grep","Glob"]`）。T-01 観測 B の場合は
        `buildWorkspaceSandbox` の `autoAllowBashIfSandboxed` を probe 結果に従って調整し、関連 docstring を更新する。
  - [ ] `createWorkspaceToolGuard(cwd: string, scope?: AgentWriteScope)` に第 2 引数を追加する。
  - [ ] `run()` で `createWorkspaceToolGuard(cwd, ctx.writeScope)` を渡す（follow-up / retry / postWork の
        `...queryOptions` 伝播は既存どおり）。
- [ ] guard の分岐を実装する:
  - [ ] `Bash`: `input.command` が文字列で `classifyGitCommand(command).kind === "mutation"` なら deny
        （message: commit は pipeline が合成する / git 状態変更は不要 / 読み取り系 git は許可、を含む）。
        それ以外（読み取り git・非 git・非文字列 command）は allow（`updatedInput` パススルー）。
        Bash 分類は `scope` の有無に依存せず常時適用する。
  - [ ] `Edit` / `Write`: `file_path` 非文字列 → allow（既存）。cwd 境界 deny（既存・維持）。`scope` があるとき
        cwd 相対を posix 正規化した `rel` で: 全 step 共通 deny（`pipelineManagedPaths(scope.slug)` /
        `rel === ".specrunner"` or `.specrunner/` 配下）→ scoped は `rel ∉ declaredWritePaths` deny →
        guarded は `rel ∈ forbiddenWritePaths(stepName, slug, declaredWritePaths)` deny → それ以外 allow。
        `scope` が無いとき cwd 内は allow（strictly-weaker fallback）。
  - [ ] deny message に対象パスと step の許可範囲の要約（scoped: 宣言パス / guarded: 保護正典は書込不可）を含める。
  - [ ] allow は必ず `{ behavior:"allow", updatedInput: input }` を返す。
  - [ ] その他 tool は従来どおり allow（`updatedInput` パススルー）。
- [ ] `pipelineManagedPaths`（`round-git-scope.ts`）・`forbiddenWritePaths`（`write-scope.ts`）・
      `dotSpecrunnerDirRel`（`util/paths.ts`）を import して再利用する（無改変）。

**Acceptance Criteria**:
- `allowedTools` が `"Bash"` を含まない（`typecheck && test` で固定）。
- guard 単体テスト（`src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts` 拡張）で:
  - Bash: `git commit` 系 deny、`git status` / 非 git allow。
  - Write/Edit: scoped 宣言外 deny・宣言内 allow、guarded 保護正典 deny・その他 allow、
    pipeline 管理パス deny（全 step）、`.specrunner/` deny、cwd 境界 deny（既存挙動保存）。
  - allow 経路は `updatedInput` に元 input を持つ（deny 経路は `updatedInput` を持たない）。
- `write-scope.ts` / `round-git-scope.ts` は無改変。

## T-07: 既存 adapter テストの追随更新（D5）

- [ ] `src/adapter/claude-code/__tests__/sandbox-scope.test.ts` の `TC-SB-02`（`allowedTools` が Bash を含む・
      `autoAllowBashIfSandboxed:true` を固定）を、Bash 除去後の新挙動（および T-01 観測に応じた
      `autoAllowBashIfSandboxed` 値）に合わせて更新する。
- [ ] `TC-FW-04`（Bash allow）が「読み取り Bash は allow」であることは維持しつつ、必要なら状態変更 Bash deny の
      ケースを追加する。既存の cwd 境界・`updatedInput` パススルーテストは挙動保存として維持する。

**Acceptance Criteria**:
- 更新後の `sandbox-scope.test.ts` / `workspace-tool-guard.test.ts` が green。
- 更新は本変更が対象とする adapter permission 挙動に限定され、commit 層テストには波及しない。

## T-08: 挙動不変の証明と破壊確認（D5 / D6, R4/R5）

- [ ] commit 層の write-scope / 合成 / egress を検証する既存テスト（例
      `tests/unit/step/commit-push-write-scope.test.ts` / `tests/unit/step/write-scope.test.ts` /
      egress 関連）が **無改変** で green であることを確認する。
- [ ] utility query（`query-one-shot`）・managed adapter の既存テストが green のまま（対象外の不変）。
- [ ] 破壊確認を記録する:
  - [ ] `allowedTools` が Bash を含まないことを固定するテスト（revert で Bash を戻すと fail）。
  - [ ] guard の scoped 宣言外 Write deny / Bash git 変更 deny のテスト（revert で cwd 境界のみ /
        Bash pre-approve に戻すと fail）。
  - [ ] 上記 2 レバーが「修正前の挙動に戻すと該当テストが fail する」ことを PR に破壊確認として記録する。
- [ ] `bun run typecheck && bun run test` が green。

**Acceptance Criteria**:
- commit 層（write-scope / 合成 / egress）テストが無改変で green。
- 破壊確認 2 レバーが PR に記録され、revert で該当テストが fail することが確認できる。
- `typecheck && test` が green。
