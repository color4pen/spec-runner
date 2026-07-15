# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Summary

spec-change として問題なし。request → design → spec → tasks の 4 ファイルが一貫しており、production コード（`src/`）の参照先を実際に読んで設計の前提を確認した。

### 検証した主要ポイント

1. **実 resume 経路（D1）**: `runner.ts:215` で `buildPipelineForJob` が呼ばれることを確認。`prepare()` 単体では descriptor 選択を証明できないという claim は正確。`ResumeCommand.execute()` を入口にすることで全経路を網羅できる。

2. **worktree 発見チェーン（D2）**: `job-catalog.ts` が `.git/specrunner-worktrees/` を走査して worktree 内の `state.json` を拾う実装を確認（lines 99-129）。`LocalRuntime.setupWorkspace({attachCheckpoint})` はその配下に worktree を作るため、`resolveJobStateBySlug(slug, machineBDir)` が attach 成果物を発見できることが保証される。

3. **pipelineId → STANDARD の実機構（D5）**: `run.ts:93` で `getPipelineDescriptor(getPipelineId(jobState))` が呼ばれ、`pipelineId` 欠如時に `"standard"` → STANDARD_DESCRIPTOR になることを確認。request.md の「`request.type` から選ぶ」という表現は不正確だが、design/spec が実体（pipelineId 経由）に矯正しており、T-05 で acceptance criteria の文言も修正対象になっている。設計の自己修正として適切。

4. **`createAgentRunner()` override（D3）**: `local.ts:542` で `buildDeps()` が `this.createAgentRunner()` を呼ぶことを確認。サブクラス override で fake runner を注入すれば、他の seam（resolver / setupWorkspace / pipeline）は実 LocalRuntime のまま保てる。

5. **`manager` injectable（T-03）**: `local.ts:135` で `this.manager = opts.manager ?? createWorktreeManager()` と injectable になっていることを確認。spy を渡すことで `create` 呼び出し 0 回の歯を実装できる。

6. **`loadConfig` の CONFIG_MISSING（D7）**: `config/store.ts` で user global・project local の両方が存在しない場合に `CONFIG_MISSING` を throw することを確認。`machineBDir/.specrunner/config.json` を書き、`XDG_CONFIG_HOME` を隔離する対策は必要かつ十分。

7. **worktree guard（D3）**: `ResumeCommand.prepare()` の worktree guard は `cwd = machineBDir`（通常 clone のルート）で呼ばれるため、`isSpecrunnerWorktree` が false になり guard は素通りする。問題なし。

8. **storeFactory の書き先（T-04 running 永続化）**: `LocalRuntime.buildDeps()` の `storeFactory` は `stateRoot = workspace.worktreePath` を使用するため、`transitionJob(running)` の永続化は attach 生成 worktree の `state.json` に書かれる。disk 読みで `running` を確認するアサーションは成立する。

9. **Machine A 無変更（D8）**: Machine B 側のみを書き換えるスコープが明確で、Machine A の `makeMachineAStrategy` / `buildPipeline(STANDARD_DESCRIPTOR)` 直呼びのフローには触れない。既存アサーション a〜d は無変更。

### セキュリティ評価

production コード（`src/`）に変更なし。テスト変更のみであり、OWASP Top 10 に該当する攻撃面の変化はない。XDG 隔離により host 環境の config 汚染を排除する処理はセキュリティ衛生として適切。

### 実装上の留意点（ブロック要因ではない）

- **D9 の停止条件**: 実 interop gap（resolver が worktree を発見できない等）が判明した場合は proxy で塞がず停止する規律が tasks.md に明記されている。実装者がこれを遵守することで spec の誠実さが保たれる。
- **`repoRoot` 解決**: `resolveRepoRoot(machineBDir)` が `machineBDir` を返すことが前提。`machineBDir` は `git clone` 産の通常リポジトリルートであるため成立するが、実装時に念のため確認すること。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| None | | | | | |
