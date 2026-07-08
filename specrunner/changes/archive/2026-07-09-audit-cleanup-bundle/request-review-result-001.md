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
| 1 | LOW | Clarity | request.md §要件4 | `DoctorConfig` インターフェースには `loadError?: string` のみあり、`loadErrorPath` フィールドは存在しない。hint 修正には `DoctorConfig` への optional フィールド追加が必要だが、request.md にその旨の記述がない。backward-compatible な変更なので blocking ではない | 実装者が `DoctorConfig` にフィールドを追加する際、インターフェース変更であることを認識して進めれば問題なし |

## Validation Notes

全 5 件のバグをコードで確認した。

1. **coverage command root 欠落**: `changed-line-coverage.ts:210-214` の `spawnCommand(commandStr, cwd, env)` は第 4 引数 `root` を渡していない。`runner.ts:373` は `spawnCommand(cmd.run, cwd, env, root)` で root を渡している。不一致は実在する。

2. **失敗メッセージの区別なし**: `changed-line-coverage.ts:119-130` — `minChangedLineCoverage` 未達（部分実行）と全行未実行の両方が `reason: "unexecuted"` を push し、145-151 行目で同一メッセージ `"changed DA lines were not executed"` を出力する。区別できない。

3. **ADR 例 config の不整合**: `specrunner/adr/2026-07-08-lcov-changed-line-gate.md:57` に `"minChangedLineCoverage": 0` があり、`src/config/schema.ts:887` の `gt(0, ...)` バリデーションに違反する。ADR 本文 D10（line 130）の「指定時（0〜1）」も 0 を誤って含意する。

4. **doctor hint 誤案内**: `file-exists.ts:15` で `configPath` をユーザーグローバルパスにハードコードし、`loadError` 時の hint（line 22）で常にこのパスを案内する。`DoctorContext.config` には `loadErrorPath` がなく、どのファイルが失敗したか区別できない。要件 4 の修正では `DoctorConfig` への optional フィールド追加が必要。

5. **検証能力のないテスト 2 件**: TC-032（ps-filter.test.ts:362-393）は `vi.mock` でモジュールレベルの `checkPrMerged` を差し替えるが `runPs` は module-internal binding を呼ぶため mock が介在せず、コメントも自認している。T-PMI-01（merge-then-archive.test.ts:264）の `expect(FAKE_ESCALATION).toContain("MERGED")` はテスト内定義の定数に対する同語反復 assert で、実装出力を検証していない。

受け入れ基準はすべて testable で、スコープ外宣言も明確。5 件が相互独立であることも確認した。
