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
| 1 | LOW | 参照精度 | request.md — 背景「現状コードの前提」 | 行番号参照（`:170-235, :482-560`, `:142-146`, `:196`, `:205`, `:218`）が現行コードと約 5–30 行ずれている。コードリーディングで確認済み: 記述したロジック自体は現行実装と完全に一致しており、実装への影響なし。 | 行番号はコード変更で自然に変動するため、修正不要。設計・実装ステップでは行番号ではなく関数名（`runMergeThenArchive` Step 2、`assertJobFinishable` etc.）で参照することを推奨。 |
| 2 | LOW | 実装ヒント補足 | request.md — 「archived 状態」と「archive 記録済みシグナル」の分離 | ステータス遷移を遅延するだけでは再解決可能にならない可能性がある。`archiveChangeFolder` は `git mv specrunner/changes/<slug>/ specrunner/changes/archive/<dated>/` でディレクトリごと移動するため、state.json も archive path へ移る。`listWithSourceDirs` Section 2 は worktree の `archive/` サブディレクトリをスキップするので、status を `awaiting-archive` に保ったまま git mv を行っても Section 2 で job が発見されない。design ステップで「state.json を active path に残す（archiveChangeFolder 範囲変更）」か「Section 2 で worktree の archive dir も走査する」かを選択する必要がある。要件（job が再解決可能なこと）と受け入れ基準（テストで固定）はすでに明確に書かれており、機構は design に委ねてよい。 | design ステップで上記 2 択を検討すること。受け入れ基準の「再解決可能な状態であることをテストで固定」が成立すれば実装判断はどちらでも可。request.md の変更は不要。 |

## Summary

バグは実在し、コードで完全に確認できた。`runArchiveOrchestrator` が worktree で `git mv` + `markJobArchived` を実行した後、worktree の active path (`specrunner/changes/<slug>/state.json`) が消え、`listWithSourceDirs` Section 2 が archive dir をスキップするため、merge 失敗後の再実行で "No job found" になる動線は正確。

- **現状コードの前提**の記述：正確（行番号ズレのみ）
- **要件 1–3**：論理的整合性あり、受け入れ基準が具体的でテスト可能
- **却下済み設計案**（job 解決を feature branch まで拡張 / archive-record を merge 後へ移動）：コードの設計方針と整合
- **最重量部の名指し**（"archived 状態" と "archive 記録済みシグナル" の分離）：適切。TC-029/TC-083 の idempotent gate と crash-resume path（`jobStatus === "archived"` → cleanup）が設計上の難所であることが正確に指摘されている

request.md に定義された受け入れ基準 6 項目はすべて測定可能であり、pipeline 実行に問題なし。
