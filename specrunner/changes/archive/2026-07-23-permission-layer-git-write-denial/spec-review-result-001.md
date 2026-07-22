# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル
- `specrunner/changes/permission-layer-git-write-denial/request.md`
- `specrunner/changes/permission-layer-git-write-denial/design.md`
- `specrunner/changes/permission-layer-git-write-denial/spec.md`
- `specrunner/changes/permission-layer-git-write-denial/tasks.md`
- `src/adapter/claude-code/agent-runner.ts`（ll.94-150, 430-473）— 現行 `buildWorkspaceSandbox` / `createWorkspaceToolGuard` / `baseAllowedTools`
- `src/core/port/agent-runner.ts`（ll.113-141）— `AgentRunContext` の現行 field 構成
- `src/core/step/step-context-builder.ts`（ll.1-160）— 現行の ctx 組み立てロジック全体
- `src/core/step/write-scope.ts`（全体）— `stagingModeFor` / `GUARDED_WRITE_STEPS` / `protectedCanonPaths` / `forbiddenWritePaths` の実装
- `src/core/pipeline/round-git-scope.ts`（ll.95-130）— `pipelineManagedPaths` の実装
- `src/util/paths.ts`（全体）— 既存 path helper の一覧（`localSidecarBaseDirRel` 含む）
- `src/adapter/claude-code/query-one-shot.ts`（ll.130-145）— `bypassPermissions` 確認
- `scripts/probes/write-scope-guard-probe.ts`（全体）— 現行 probe 3 シナリオ
- `src/adapter/claude-code/__tests__/sandbox-scope.test.ts`（全体）— TC-SB-02 の内容確認
- `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`（全体）— TC-FW-04 / `updatedInput` パススルー固定テストの確認

### 検証した要件・設計判断

**R1 / D1（Bash を canUseTool 経路に載せ替え）**
- 現行の `baseAllowedTools = ["Read", "Bash", "Grep", "Glob"]` を確認。Bash は pre-approve され `canUseTool` を素通りする（コードで検証）。
- `buildWorkspaceSandbox` が `autoAllowBashIfSandboxed: true` を設定していることを確認（l.98）。
- D1 が「probe R5-a（T-01）を最初に走らせ、autoAllowBashIfSandboxed の影響を観測 A/B で分岐する」と明示していることを確認。gating 構造は正しい。

**R2 / D2（git 状態変更コマンドの字句分類器）**
- `ALWAYS_MUTATING` リスト・`CONDITIONAL`（branch / tag / stash）の判定ロジック・未知 subcommand を allow に倒す方針を仕様として確認。
- セグメント分割（`&&` `||` `|` `;` `&` 改行）、環境変数プレフィクスの除外、git 先頭 basename チェック、global option スキップのアルゴリズムを D2 で確認。
- `git` が arg 位置に現れるケース（`echo git commit`）を non-git と扱う false positive 抑制も確認。

**R3 / D3 + D4（AgentRunContext 書込スコープ threading / guard 拡張）**
- `AgentRunContext` に `writeScope?: AgentWriteScope` を optional で追加する設計を確認。
  - Optional にする理由（literal 構築サイト 10 超のテストへの churn 回避）と本番唯一の組み立て点 (`buildStepContext`) での必須設定を確認。
  - Strictly-weaker fallback（scope 無しは cwd 境界のみ）と Bash git 分類は scope 非依存で常時適用する点を確認。
- D4 の Edit/Write 判定順：(1) 非文字列 → allow (2) cwd 境界 deny (3) pipeline 管理パス deny + `.specrunner` deny (4) scoped / guarded 分岐を確認。
- `pipelineManagedPaths` が `[state.json, events.jsonl, usage.json, bite-evidence-result.md]` を返すこと、`bite-evidence` step は CLI step（guard 対象外）なので全 agent step での管理パス deny が正常系を阻害しないことを確認。

**R4（挙動不変）**
- `query-one-shot.ts:136` が `bypassPermissions` を使っており、`canUseTool` が呼ばれないことをコードで確認。
- `managed-agent/agent-runner.ts` が client 側 permission surface を持たないことを確認（`AgentRunContext` を受け取るだけ）。

**R5 / D6（probe 拡張と残余の明文化）**
- 現行 probe が 3 シナリオ（out-of-workspace-write / in-workspace-write / report_result）しか持たないことをコードで確認。
- D6 が追加すべき 5 シナリオ（Bash canUseTool 発火・git commit deny・読み取り git allow・scoped 宣言外 Write deny・state.json Write deny）を正確に定義していることを確認。
- 残余（shell 変数展開・リダイレクト・エディタ経由書込）が設計で明文化され、commit 層（#893）が引き続き受け止める位置づけであることを確認。

**TC-SB-02 / TC-FW-04 既存テストとの整合**
- `TC-SB-02` が `allowedTools.toContain("Bash")` と `autoAllowBashIfSandboxed: true` を固定している（旧挙動）ことを確認。T-07 が明示的にこのテストの更新を要求していることを確認。
- `TC-FW-04` が `guard("Bash", { command: "git status" })` を allow と固定していることを確認。R2 後も `git status` は allow 経路のままで、このアサーションは維持できる。

## 検証できなかった項目

- **probe の実測結果**: `autoAllowBashIfSandboxed: true` 下で Bash を `allowedTools` から外したときに `canUseTool` が発火するか（観測 A / B）は、実 SDK を走らせなければ確認できない。T-01 が先行して走ることが前提。
- **step.writes() の全 scoped step 網羅確認**: 全 scoped step（request-review / design / spec-review / spec-fixer / test-case-gen / verification / code-review / conformance / pr-create / regression-gate / custom reviewers）が `writes()` を宣言し、guard が宣言集合を許可の全集合としても正常系の出力を阻害しないことの全数確認は本レビューの対象外（design.md が既存不変条件として言及）。
- **`CONDITIONAL` `branch` 判定の境界ケース**: `git branch --set-upstream-to=origin/main` の `-u` / `--set-upstream-to` 判定が D2 仕様（変更フラグに含む）と一致するかは実装後に確認が必要。

## Findings 詳細

### F-01 — `git remote` の変更系サブコマンドが allow に倒れる（informational）

**分類**: informational
**対象**: design.md D2 の分類器仕様

D2 の allow 列挙に `remote` が含まれている。`git remote add <name> <url>` / `git remote remove <name>` / `git remote set-url` はリモート定義を変更するが、これらは `ALWAYS_MUTATING` にも `CONDITIONAL` にも含まれず「それ以外（allow）」となる。

ただし、(a) リモート定義の変更はローカル git 履歴を変えず `push` は別途 ALWAYS_MUTATING に含まれているため commit 層の壁は機能する、(b) 設計は「未知 subcommand を allow に倒す（読み取り系の取りこぼしを避ける）」を方針として明示しており、`remote` はその合理的な適用範囲内、という 2 点でブロッキングではない。

**アクション不要**。設計の既存フレームワーク（commit 層が最終防壁）の範囲内。将来的に `remote` を CONDITIONAL に昇格させる余地はあるが本変更のスコープ外。

---

### F-02 — `git worktree` の変更系コマンドが allow に倒れる（informational）

**分類**: informational
**対象**: design.md D2 の分類器仕様

`git worktree add / move / remove` は ALWAYS_MUTATING に含まれず allow となる。ただし sandbox (`filesystem.allowWrite = [cwd, cwd/**]`) が OS レベルで cwd 外書込を制限し、worktree の実体ディレクトリ作成は sandbox で遮断される。また commit 層が変更を吸収する。

**アクション不要**。sandbox レイヤが二重で機能する。

---

### F-03 — `git --exec-path <値> commit` のような稀な形式が mutation 検出をすり抜ける（informational）

**分類**: informational
**対象**: design.md D2 アルゴリズム Step 4

D2 は `--exec-path` を値を取る global option として分離引数形を 2 トークンスキップする。`git --exec-path commit -m x` と書いた場合、classifier は `commit` を exec-path の値と解釈し、`-m` を subcommand として扱う（→ allow）。実際には `--exec-path commit` は git の実行パスに `commit` を渡す呼び出しとなり、意図通りの git commit はほぼ実行されないが、分類器は false negative を返す。

これは設計が明示する残余の一形態（非標準の回避は commit 層が担当）であり、実用上の発生確率は極めて低い。

**アクション不要**。設計の残余明文化の範囲内。

---

### F-04 — `writeScope` が optional であることの本番配線確認がテスト依存（informational）

**分類**: informational
**対象**: design.md D3 / tasks.md T-04

`AgentRunContext.writeScope` は optional で、scope がない場合は cwd 境界のみの strictly-weaker fallback となる（pipeline 管理パスの deny も発動しない）。本番の唯一の組み立て点は `buildStepContext` で、T-04 がその配線を固定するテストを要求している。

この保証はテストに依存しており、将来 `buildStepContext` を経由しない別の execution path が生まれると保護が緩む。設計はこのトレードオフを認識しており「strictly weaker fallback」と明記している。

**アクション不要**。T-04 の受け入れ基準（scoped / guarded 両 step での writeScope 設定確認）で十分。ただし実装者は `buildStepContext` が唯一の本番組み立て点であることを注意して保守すること。

---

### F-05 — TC-SB-02 の旧挙動固定とテスト更新の整合（informational, 対処済み）

**分類**: informational
**対象**: sandbox-scope.test.ts TC-SB-02 / tasks.md T-07

既存 TC-SB-02 は `allowedTools.toContain("Bash")` を assert しており R1 適用後に fail する。T-07 がこの更新を明示的に要求しており、tasks.md の Acceptance Criteria も「更新は本変更が対象とする adapter permission 挙動に限定される」と明記している。

**アクション不要**（T-07 で対処済みの範囲）。
