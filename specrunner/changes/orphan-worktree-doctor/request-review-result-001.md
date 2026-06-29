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
| 1 | LOW | Implementation guidance | 要件1・要件4 | doctor check 内で `JobStateStore.list` を直接呼ぶと `node:fs/promises`（非 injectable）を使うため、`ctx.fs` を使う orphan-sidecars パターンと一致しなくなりテストが困難になる。`JobStateStore.list` の「等で」という表現は実装手段の柔軟性を示しているが、先例パターンと乖離する。 | 共有検出ロジックは `ctx.fs`（injectable）を受け取る純粋関数として抽出し、doctor check は `ctx.fs` で、prune コマンドは `node:fs` で注入するパターンを推奨。orphan-sidecars.test.ts がモデルケース。 |
| 2 | LOW | Implementation guidance | 要件3・受け入れ基準4行目 | 「未 push のコミット」の検出は、orphan worktree が branch の upstream 追跡なし（job 死亡が push 前）のケースで `git log @{upstream}..HEAD` が失敗する。この edge case の扱いが未定義。 | upstream が無い場合は `git log <base-ref>..HEAD --count` 等でベースブランチとの差分コミット数を比較する fallback を実装すること。upstream 未設定 ＝ 未 push と見なしスキップするのが安全側の判断。 |
| 3 | LOW | Clarity | 要件1 | doctor check の hint で表示すべきコマンドについて、orphan-sidecars は raw `rm -rf` ヒントを出しているが、orphan-worktrees は `job prune` コマンドを案内すべきかどうかが明示されていない（設計判断2で `job prune` を選んだ意図と一致するなら `job prune` ヒントが自然）。 | doctor check の hint は `specrunner job prune` を指示するよう実装することを推奨。raw `git worktree remove` を直接列挙するより discoverable。 |

## Review Notes

**コード参照の正確性（全件確認済み）**

- `local.ts:466` — `manager.create(...)` 確認済み（実際の行番号 466 と一致）
- `local.ts:479` — `if (opts?.bootstrapState)` 確認済み（実際は 478–480 行）
- `local.ts:484` — `writeLivenessSidecar` 確認済み
- `pipeline-run.ts:121-122` — "persistence is deferred to setupWorkspace" コメント確認済み
- `src/core/cancel/runner.ts` — `loadStateByJobId` でロード → state 無し orphan は解決不能、確認済み
- `src/core/doctor/checks/index.ts:49-67` — `commonChecks` に `orphanSidecarsCheck` あり、orphan-worktrees check は存在しない、確認済み
- `src/core/doctor/checks/storage/orphan-sidecars.ts` — read-only・warn+rm hint、確認済み
- `buildWorktreePath` — `<repoRoot>/.git/specrunner-worktrees/<slug>-<jobId8>/` 確認済み
- `JobStateStore.list(repoRoot, { includeArchived: true })` — 存在・シグネチャ確認済み

**設計の健全性**

- `commonChecks` への追加: managed runtime はワークツリーを作成しないため常に pass するが、scan コストが軽微かつ一貫性のある配置。問題なし。
- `job prune` 名前空間: `job` サブコマンド（start/ls/show/cancel/resume/archive）に `prune` を加えることは意味的に一貫している。
- dry-run 既定 + `--force` で実削除: 破壊的操作の UX として適切。既存の `cancelAllTerminated` の `--yes` パターンとも整合。
- 検出ロジック共有（要件4）: doctor check と prune で重複実装しないという設計制約は実装上の重要な指針。

**`JobStateStore.list` の worktree スキャン挙動との整合性**

`JobStateStore.list` は `.git/specrunner-worktrees/*/specrunner/changes/*/state.json` もスキャンするが、orphan worktree（state.json が書かれていない）はそこにも存在しない。したがって「list 結果に含まれない worktree ディレクトリ = orphan」という検出ロジックは正確に機能する。
