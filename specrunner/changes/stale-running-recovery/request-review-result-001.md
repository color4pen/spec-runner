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
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approve

## Findings

| # | Severity | Category | Location | Description | Recommendation |
|---|----------|----------|----------|-------------|----------------|
| 1 | MEDIUM | Design gap | request.md § 要件 3 / architect TBD | crash-loop カウンターの保存場所（`state.json` スキーマ変更 vs sidecar `.specrunner/local/<slug>/`）と「失敗」の定義（resume 例外 vs 次 tick に再び stale-running になること）が `architect 評価済みの設計判断: TBD` のまま。実装者が判断を迫られる設計分岐点。 | 既存パターン（sidecar は machine-local liveness に使用済み）から sidecar への `auto-resume-count.json` 追加が自然な選択。「失敗」= auto-resume 後に次 tick で再び stale-running 検出、と定義することを `architect 評価済みの設計判断` 欄に記載推奨。 |
| 2 | LOW | Codebase reference | src/state/reconcile.ts, src/core/resume/safety.ts | `reconcileStaleRunning`（`src/state/reconcile.ts`）と `isStaleRunning`（`src/core/resume/safety.ts`）が既存実装として存在するが、request に言及なし。実装者が独自検出ロジックを書くリスクがある。 | 要件 1 の「検出」実装は `isStaleRunning` を再利用することを注釈として追記推奨。 |
| 3 | LOW | Scope gap | request.md § 受け入れ基準 | issueNumber を持たない running+pid-dead job が crash-loop 上限に達した場合、`notifyJobTerminal` は issueNumber=null を no-op として扱うため escalation 通知が出ない。受け入れ基準「連続自動 resume の上限超過で escalation 通知に倒れる」の動作が issue 非連携 job では成立しない。 | 「issueNumber が null の job は awaiting-resume に遷移するのみ（通知なし）」をスコープ外として明示するか、受け入れ基準の前提条件に追記。 |
