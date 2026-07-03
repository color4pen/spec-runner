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
| 1 | MEDIUM | Scope ambiguity | request.md § 症状1 受け入れ基準 | 受け入れ基準「コンソール表示が approved にならないこと」が、「導出規則の変更はスコープ外」と矛盾する可能性がある。中間修正（derived verdict を使いつつ「file says: needs-fix」の付記）で基準を満たせるかどうかが実装者に委ねられている。どちらの形式を期待するかを明示すると手戻りが減る。 | 実装者への補足として「表示形式は `[step] verdict: approved (file says: needs-fix)` のように note を付記する形で可」と request.md にコメント追記することを推奨（request.md は変更不要; 実装判断として許容できるなら approve のまま進める）。 |
| 2 | LOW | Clarity | request.md § 要件3 | 「no-op 理由の明示を要求する」代替案が「needs-fix / escalation にする」と同列で示されているが、どちらを優先すべきかが不明。accept 基準（accepted: fixable findings あり + 変更ゼロ → approved 扱いにならない）は明確なので、実装では fail-closed（needs-fix）を選べば基準を満たせる。 | 実装者は fail-closed（needs-fix）を選ぶ。要件の「または」は実装選択肢の幅であり、受け入れ基準が判定基準になる。追記不要。 |
| 3 | LOW | Clarity | request.md § 要件3 | no-op 検出の「成果物ファイル（events/state/usage 等）以外」の「等」が曖昧。regression-gate-result-NNN.md や request-review-result-NNN.md も書き込まれることがある。 | 実装者は「specrunner/changes/<slug>/ 配下のファイル（state.json / events.jsonl / usage.json / *-result-NNN.md など）」をノイズとして扱い、それ以外（src/ 配下など）に変更がない場合を no-op と定義する。境界を src/__tests__ も含むソースツリーに限定すれば意図に沿う。request.md への追記は不要。 |

## Summary

コードベースを精査した結果、4 つの症状すべてに具体的なコード経路が確認できた。

**症状 1（verdict 三点不一致）**  
`progress.ts:onVerdictParsed` は `verdict:parsed` イベントから derived verdict を表示する。regression-gate が `ok=true, findings=[medium/low fixable]` でツールを呼び出すと CLI は "approved" を導出し、gate は findings-routing で code-fixer へ転送される（`buildParallelReviewerTransitions` の findingsRouting 行）。ファイルに "needs-fix" と書かれていても表示は "approved" となる。さらに `pipeline:iteration:verdict` は terminal 条件（end/escalate）のときしか発火せず、findings-routing（非 terminal の approved → fixer）では発火しないため、「approved → spawning fixer」がコンソールに出ない。これが表示とファイルの食い違いを生む。`pipeline.ts:286` の `pipeline:iteration:start` は `this.maxIterations`（グローバル値）を使っており、`maxIterationsByStep` による step 別上限（regression-gate = 3）が `[iter 3/2]` 表示に反映されない。

**症状 2（request-review 導出逆転）**  
`judge-verdict.ts:deriveRequestReviewVerdict` は `if (!ok) return "needs-discussion"` を最初に評価する。エージェントが `ok=false` を呼び出すと findings が MEDIUM/LOW のみでも "needs-discussion" になる。findings 由来の導出規則より `ok` フラグが先に評価されているため逆転が生じる。

**症状 3（code-fixer no-op 空振り）**  
`code-fixer.ts` は `completionVerdict: "approved"` かつ `resultFilePath: null` で設計されており（Design D7）、ソース変更の有無を問わず常に "approved" を返す。`executor.ts` は `headBeforeStep` を捕捉するが、fixer ステップに対してソース変更ゼロの検出は行っていない。fixable findings が存在する状態で code-fixer がノイズファイル（events.jsonl / state.json / usage.json）しか変更しなくても "approved" が返り、regression-gate ループを継続させる。

**症状 4（drafts 不在 warning）**  
`orchestrator.ts:272` で `git add draftsDir()` を存在確認なしに実行している。`draftsDir()` が存在しない worktree では `git add` が exit non-zero となり warning が出る。

**実装可能性の評価**  
いずれの修正も既存の設計パターン（executor.ts / pipeline.ts / judge-verdict.ts / orchestrator.ts）の範囲内で対応可能であり、外部 SDK 制約・アーキテクチャ変更・新規 port 導入は不要。受け入れ基準もすべてテスト可能な形で記述されている。要件に HIGH 相当の欠落はなく、**approve** とする。
