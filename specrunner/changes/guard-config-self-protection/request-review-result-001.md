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
| 1 | LOW | Clarity | 要件 4 | worktree 内 cwd 判定の実装詳細（realpath vs 文字列照合、symlink 解決の有無）が明示されていないが、"cwd の実パスが `.git/specrunner-worktrees/` 配下か" という記述と `buildWorktreePath` の実装（`path.join(repoRoot, ".git", "specrunner-worktrees", ...)` 固定形式）から implementer が一意に導ける。 | 実装上の判断余地として受容可能。必要なら実装フェーズで確認。 |

## Validation Notes

**脆弱性の実在確認**

- `.specrunner/config.json` の現在の `forbiddenSurfaces` は 3 surface（`public-types` / `persisted-format` / `state-transitions`）のみ（コード確認済み）。config 自身を保護する surface は存在しない。
- `resume.ts:212` で `resolveRepoRoot(cwd)` → `loadConfig(repoRoot)` が呼ばれ、worktree 内の cwd からは worktree 側 `.specrunner/config.json`（agent 編集済みの可能性あり）が読まれる経路を確認した。
- `resolveRepoRoot` は `git rev-parse --show-toplevel` を使い、git worktree からはそのworktreeルートを返すため、project local config の解決先がworktreeになる。`.specrunner/config.json` は `.gitignore` の `!.specrunner/config.json` 例外により git 管理下（worktree にも checkout される）。

**要件 1 — config self-protection surface 追加**

- `.specrunner/config.json` は `ForbiddenSurfaceConfig.paths` の glob 照合対象として有効（`src/state/schema.ts` のような literal path も既に機能している）。
- surface id `guard-config`、path `.specrunner/config.json` は明確で実装可能。

**要件 2 — dogfooding テスト追加**

- `resolve-scope.test.ts:357-423` の既存パターン（`surfaces.some((s) => s.id === ...)` 形式）に新 assert を 1 件追加するだけで完結する。additive safe な形式で regression なし。

**要件 3 — fixture テスト追加**

- `fast-scope-checkpoint.test.ts:213-237` の `makeFastConfig()` に `guard-config` surface を追加し、`.specrunner/config.json` を変更ファイルとして `makeEvaluableStrategy([".specrunner/config.json"])` で呼ぶテストを追加するパターンが既存 T-05-1 と対称。

**要件 4 — worktree 内 resume 拒否**

- `resume.ts:80`（`const cwd = ...`）の直後、state 解決より前に cwd 判定を挿入すれば "config 読み込み前に拒否" の要件を満たせる。
- `buildWorktreePath` の形式（`<repoRoot>/.git/specrunner-worktrees/<slug>-<id>/`）は固定なので、realpath 解決後に `/.git/specrunner-worktrees/` を含むかをチェックする実装で十分かつ機械的。
- `noWorktree` モードでも worktree 内 cwd を使うケースは実運用上ありえないため、`noWorktree` 例外分岐は不要。

**受け入れ基準の実装可能性**

- 全 AC はコードベースの既存テストフレームワークで計測可能（fixture 差し替え + 単体テスト）。
- スコープ外が明確に列挙されており、実装過剰になるリスクが低い。
- 設計判断（拒否 vs リダイレクト）が事前確定しており、迷走余地がない。
