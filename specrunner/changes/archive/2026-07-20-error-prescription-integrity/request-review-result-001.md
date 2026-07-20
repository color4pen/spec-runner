# Request Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approve | needs-discussion | reject
  - approve:          No blocking findings (no HIGH, no decision-needed). Request is ready for pipeline execution.
  - needs-discussion: One or more blocking findings (HIGH or decision-needed) resolvable through discussion.
  - reject:           Multiple blocking findings AND requirement contradictions or structural breakdown.
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | Location | Description | Recommendation
- Valid Severity values (uppercase): HIGH | MEDIUM | LOW
  - HIGH:   Request-level defect — goal unclear, acceptance criteria absent/untestable, or critical external constraint unspecified
  - MEDIUM: Scope ambiguity, recommended additions
  - LOW:    Clarity improvements, expression refinements
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approve

## Findings

| # | Severity | Category | Location | Description | Recommendation |
|---|----------|----------|----------|-------------|----------------|
| 1 | LOW | Clarity | 受け入れ基準 T3 | "git repo 外相当の fail 集合" の定義が暗黙的。どの check 名が fail する想定かが明記されていないため、テスト実装者が fail セットを自力で推定する必要がある。`git-repository` / `github-origin` / `github-token-present` の 3 check が fail し `config-file-exists` は pass という前提と見られるが、request に明示はない。 | T3 の fail 集合を `{ "git-repository": fail, "github-origin": fail, "github-token-present": fail }` のように check 名で列挙すると実装が迷わない。影響はテスト精度のみで非ブロッキング。 |
| 2 | LOW | Clarity | 要件 2・T2 | "hint 文字列中の `specrunner <sub>` をコマンド表と突き合わせる" で `specrunner job archive` のような複合 subcommand パスを T2 が対象とするかが不明。現存する問題 hint（`specrunner ps`）はトップレベルコマンドのみなので実用上は問題ないが、スコープが曖昧。 | T2 の対象をトップレベルコマンド（`COMMANDS` のキー）に限定すると明記するか、複合パスまで検査する旨を記載する。非ブロッキング。 |

## Code Assertion Fact-Check

以下の file:line/symbol/path アサーションをすべて実コードで照合した。

| アサーション | 検証結果 |
|---|---|
| `src/git/remote.ts:36-37` — origin 不在時 hint "cd into a git repository before running specrunner." | ✓ 確認。lines 34–38 にて `SpecRunnerError("NOT_GIT_REPO", "cd into a git repository before running specrunner.", "Origin remote not configured.")` |
| `src/git/remote.ts:51-52` — 空 remoteUrl 時も同文言 | ✓ 確認。lines 49–53 に同一 hint が重複定義 |
| `src/errors.ts:148` — `notGitRepoError()` 同文言 | ✓ 確認。lines 145–151 に `"cd into a git repository before running specrunner."` |
| `src/core/doctor/checks/storage/local-state-writable.ts:42` — "Run 'specrunner ps' once to initialize storage." | ✓ 確認。line 42 に完全一致 |
| `src/core/doctor/checks/repo/workflow-structure.ts:59` — "Create the missing directories manually." | ✓ 確認。line 59 に完全一致 |
| `src/core/doctor/checks/config/github-token-present.ts:35` — 三択 hint | ✓ 確認。line 35 に "Set GH_TOKEN env var, run 'gh auth login', or run 'specrunner login'." |
| `src/core/doctor/checks/auth/github-token-valid.ts:19` — 同三択 hint | ✓ 確認。line 19 に同一文言 |
| `src/core/doctor/checks/config/file-exists.ts:15` — `path.join(ctx.homeDir, ".config", "specrunner", "config.json")` 固定 | ✓ 確認。line 15 に完全一致。`XDG_CONFIG_HOME` を無視している |
| `src/util/xdg.ts:18` — `getConfigPath()` が `XDG_CONFIG_HOME` を尊重 | ✓ 確認。lines 8–9 で `process.env["XDG_CONFIG_HOME"]` を参照し、`getConfigPath()` は line 18 で定義 |
| `src/core/doctor/formatter.ts` — `formatHuman` に next steps 出力なし | ✓ 確認。check 結果 + Summary 行のみで next steps セクションなし |
| `src/cli/command-registry.ts:817` — `doctor` エントリに `usage` フィールドなし | ✓ 確認。lines 817–834 に `usage` キーが存在しない |
| `src/core/runtime/local.ts:464` — `git fetch origin failed (exit N): <stderr>` をそのまま throw | ✓ 確認。line 464 に完全一致 |
| `src/core/command/runner.ts:139` — workspace setup 失敗を `logError` でそのまま表示 | ✓ 確認。line 139 に `logError(\`Failed to set up workspace: ${(err as Error).message}\`)` |
| `bin/specrunner.ts` — `ps` が top-level コマンドとして登録されていない（`COMMANDS` のキーに `ps` なし） | ✓ 確認。`runPs` は import されるが `job ls` の handler 内部でのみ使用。`COMMANDS` に `ps` キーなし |
| `README.md` — Quick Start に既存プロジェクト参加者向け手順なし | ✓ 確認。新規作成者フロー（mkdir → git init → install → init → login）のみ記載 |

## 判定理由

全コードアサーションが実コードと一致し、背景に記述された問題がすべて現行コードで再現可能であることを確認した。要件・受け入れ基準・設計判断はいずれも明確かつ実装可能で、ブロッキングな欠陥は存在しない。2 件の LOW findings は実装者への補足情報であり、いずれも非ブロッキング。
