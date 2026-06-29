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
| 1 | LOW | Clarity | request.md § 現状コードの前提 | `src/cli/archive.ts:96` の list 呼び出しも対象外として挙げているが、理由を「best-effort / 握り潰し」と記載している。この list が archived を除外し続ける場合、archived+未マージ job の resume 時にパイプラインログが初期化されない（`initPipelineLog` がスキップされる）。機能的ブロッカーではないが、ログ欠損の副作用として明示するとより親切。 | 現状の記述で十分。実装時に注記するか、将来の改善課題として residual に記録する。 |
| 2 | LOW | Verification | request.md § 受け入れ基準 | 受け入れ基準 4「cancel / inbox / exit-guard の挙動を維持していることを確認する（無変更）」は「確認する」のみで、テストを追加する要求ではない。現行テストで既にこれらは検証済みだが、明示的なテストケースがないと将来の退行リスクが残る。 | 現状の既存テスト green を確認するのみで問題なし。必要に応じて将来の課題として記録する。 |

## Review Notes

### コード検証結果（全件 OK）

- `src/store/job-state-store.ts:210` — `list(repoRoot, opts?: { includeArchived?: boolean })` 確認。既定は archived を走査しない。
- `src/store/job-state-store.ts:242-243` — `opts?.includeArchived === true` のときのみ `changes/archive/*/state.json` を読む。
- `src/store/job-state-store.ts:379-381` — prefix 解決が `{ includeArchived: true }` を渡す前例、確認。
- `src/core/archive/orchestrator.ts:112` — `JobStateStore.list(cwd)` (オプションなし)。archived job が解決されない根本原因。
- `src/core/archive/orchestrator.ts:116` — `No job found with slug '<slug>'` を返す分岐、確認。
- `src/core/archive/orchestrator.ts:129` — `TERMINAL_STATUSES.has(state.status)` → `Already finished`・exitCode 0 の短絡、確認。
- `src/core/archive/merge-then-archive.ts:125` — `JobStateStore.list(cwd)` (オプションなし)。同上の根本原因。
- `src/core/archive/merge-then-archive.ts:129` — `No job found` を返す分岐、確認。
- `src/core/archive/merge-then-archive.ts:178-179` — `prData.state === "MERGED" && jobStatus === "archived"` 分岐 → `runPostMergeCleanup` へ。要件 1 の fix で初めて到達可能になる。確認。
- `src/core/finish/job-state-update.ts:79-84` — `markJobArchived` が `archived` 時に noop (idempotent)。確認。
- `src/state/lifecycle.ts:46` — `TERMINAL_STATUSES = { archived, canceled }`。確認。
- `src/core/finish/resolve-canonical-state-dir.ts:22-28` — active 優先・archive フォールバック。確認。
- `src/core/cancel/runner.ts:486` / `src/core/inbox/run-inbox.ts:88,373` / `src/core/lifecycle/exit-guard.ts:145` — いずれもオプションなし `list`。意図的な除外。確認。

### 追加確認: archiveSha undefined パスの安全性

`merge-then-archive.ts:361` に既存コメント:
```
// If archiveSha is undefined (e.g. terminal-status short-circuit), skip this check.
if (archiveSha !== undefined && headSha !== archiveSha) {
```
要件 3（archived+未マージ resume）でオーケストレーターが terminal short-circuit で exitCode 0 を返すと `archiveSha` は `undefined` になる。この undefined パスはコードが既に明示的に想定しており、CI ポーリングを直接 headSha ベースで行う。設計上の懸念なし。

### type 判断

`bug-fix` は適切。変更点は 2 か所の `list` 呼び出しにオプションを追加するのみ。新 port/adapter・新設計選択・lifecycle 変更はなし。
