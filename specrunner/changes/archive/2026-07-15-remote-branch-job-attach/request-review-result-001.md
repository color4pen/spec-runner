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
| 1 | MEDIUM | Scope ambiguity | 要件 2(d)・受け入れ基準 1 行目 | "resume に必須の成果物" / "必須成果物欠落" が列挙されていない。pipeline step によって必要成果物が異なる（design 後は design.md、test-case-gen 後は test-cases.md 等）ため、設計ステップで checkpoint 検証の artifact checklist を pipeline state machine の resume point から機械的に導出する手順が必要。 | design ステップで `state.currentStep` / `state.status` から必須成果物を列挙するロジックを spec に明示する。受け入れ基準のテストは「欠落したときに typed error」を固定できれば十分であり、full enumeration は設計成果物で確定させる。 |
| 2 | MEDIUM | 実装考慮事項 | `src/cli/command-registry.ts` L401 | `job` の `guardedSubcommands`（start/resume/archive/prune）に `attach` が含まれていない。`attach` は worktree を新規作成するため、worktree 内から実行すると不整合が生じる可能性がある。request には言及なし。 | 設計ステップで `attach` を `guardedSubcommands` に追加するか否かを判断して spec に明記する（既存の guarded 動詞と同型のため追加が自然）。 |
| 3 | LOW | コードアサーション精度 | 現状コード前提「`src/util/paths.ts:128`」 | worktree ディレクトリ名 `<slug>-<jobId8>` の参照先として `paths.ts:128` を挙げているが、実際の実装は `src/core/worktree/manager.ts:54–57`（`buildWorktreePath`）。`paths.ts:128` はその命名規約をコメントで言及している行であり、誤りではないが精度が低い。 | 参照先を `src/core/worktree/manager.ts:54–57 (buildWorktreePath)` に変更することで、設計・実装者が直接コードを参照しやすくなる。 |

## Code Assertion Fact-Check

| アサーション | 検証結果 |
|---|---|
| `job attach` サブコマンドが存在しない（`src/cli/command-registry.ts`） | ✅ 確認。L400–648 の `job` サブコマンド定義に `attach` はなく、start/ls/show/cancel/resume/archive/prune/stats のみ。 |
| `resolveJobStateBySlug`（`src/core/resume/resolve-job.ts:18–19`）は `JobStateStore.list(repoRoot)` に委譲し `origin/*` を走査しない | ✅ 確認。L18–19: `async function resolveJobStateBySlug` / `JobStateStore.list(repoRoot, { includeArchived: true })`。fetch 処理なし。 |
| `workspace-materializer.ts:28–33` の resume 系 plan は `remoteBaseRef` を保持する | ✅ 確認。L28–33: discriminated union の `resume-recreated` / `resume-without-recorded-worktree` はいずれも `{ remoteBaseRef: string }` を持つ。 |
| `workspace-materializer.ts:100–101` が `manager.create(..., plan.remoteBaseRef, undefined, ...)` | ✅ 確認。L100–101: `manager.create(this.host.cwd, slug, jobId, plan.remoteBaseRef, undefined, setupPlan)`。 |
| machine-local liveness sidecar は `.specrunner/local/<slug>/liveness.json`（`jobId`/`worktreePath` を持つ） | ✅ 確認。`src/store/local-job-index.ts` L62–69 / `src/core/runtime/local.ts` L914 コメント・L924 で `{ pid, session: null, worktreePath, jobId }` が書き込まれることを確認。 |
| worktree ディレクトリ名は `<slug>-<jobId8>` | ✅ 確認。`src/core/worktree/manager.ts:54–57`（`buildWorktreePath`）で `jobId.slice(0, 8)` を使用し `.git/specrunner-worktrees/<slug>-<jobIdShort>` を生成。 |

## 総評

目標・要件・受け入れ基準はいずれも明確かつテスト可能。ADR-20260715 が D1–D4 の構造判断を ratify 済みで、本 request はその behavior 実装として整合している。capability gate パターン（검査して throw = 状態を作らない）・既存 resume 経路への無変更互換という制約も具体的に記述されており、HIGH ブロッカーは存在しない。MEDIUM 2 件（必須成果物の列挙・`guardedSubcommands`）は設計ステップで解決可能。
