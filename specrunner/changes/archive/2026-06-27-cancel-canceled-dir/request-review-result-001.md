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
| 1 | LOW | Implementation note | `src/store/job-state-store.ts:225,278` | `list()` は `archive` を名前で明示除外するが、`canceled` は除外していない。現状は `specrunner/changes/canceled/state.json` が存在しないため active job として誤検出されないが、設計として明示的に除外するほうが将来安全。 | design step で `canceled` を `archive` と同様に `entry.name === "canceled"` でスキップするよう list() を更新することを推奨。要件「スキャンが active job として拾わないことも保証する」の実装で対応してください。 |
| 2 | LOW | Behavioral note | `src/core/cancel/runner.ts:356-416` | `cancelAllTerminated` は `list()` で "canceled" ステータスのジョブを収集して sidecar を削除する。本変更後、新方式でキャンセルされたジョブは `canceled/<slug>-<jobId8>/` に移動するため `list()` には現れず、`cancelAllTerminated` のターゲットから外れる。 | 設計上これは意図した挙動（cancel 時に sidecar 削除済み）と思われるが、design step でこの変化を明示し、必要なら `cancelAllTerminated` の doc コメントに注記してください。スコープ判断は design に委ねます。 |

## Code verification notes

- **バグの正確性確認**: `runner.ts:283` で `cleanupJobResources()`（worktree 削除）を先に呼び、その後 `resolveStateStoreByJobId` を呼ぶ（`runner.ts:302`）。`resolveStateStoreByJobId` は worktreePath → canonical の順に試みるが、worktree 削除後は両方 ENOENT → null を返し persist が skip される。バグ記述は正確。
- **`--no-worktree` gap 確認**: `--no-worktree` では state が main の `changes/<slug>/` に残るため `resolveCanonicalStateDir` で persist は成功するが、change-folder が main に残り続けるため `job ls` に canceled ジョブが active として表示される gap が存在する。要件 1 の "copy でなく move" の根拠と整合。
- **line 番号**: 要件記載の行番号（:284, :288-303, :135-146）は現行コードと数行のズレがあるが、参照している処理は正確に対応している。
- **テスト現状**: 既存の `runner-branch-delete.test.ts` は `resolveStateStoreByJobId` を常に有効な store を返すようモック。worktree-only での persist skip シナリオは未テスト。受け入れ基準でこの gap を明示的に修正対象としており適切。
- **archive パターンの参照**: `archive-change-folder.ts` が `git mv + git add` で change-folder を移動するパターンを確立済み。cancel 向け退避の実装もこのパターンを踏襲できる。
- **受け入れ基準**: 全 6 項目が具体的かつテスト可能。worktree-only / no-worktree / 衝突 / branch 削除 / move 保証の各シナリオを網羅している。
