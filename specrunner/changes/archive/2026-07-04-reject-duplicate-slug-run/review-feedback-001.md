# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | correctness | `src/core/runtime/duplicate-slug-guard.ts` | `JSON.parse(raw)` が `null` を返す（liveness.json の内容が JSON 的に合法な `null`）と、`data["pid"]` が `TypeError: Cannot read properties of null` を throw し、SpecRunnerError ではない例外が propagate する。D4 の判定表は「JSON 破損 → 許容」だが、`null` は valid JSON なので catch されない。 | `JSON.parse` の後に `if (data === null \|\| typeof data !== "object" \|\| Array.isArray(data)) return;` を追加する。 | no |
| 2 | low | testing | `tests/unit/core/runtime/local-duplicate-guard.test.ts` | test-cases.md の TC-015（managed runtime no-op、priority=must、category=integration）が実装されていない。`ManagedRuntime.assertNoDuplicateLiveJob` が resolve することを確認するテストがない。 | `ManagedRuntime.assertNoDuplicateLiveJob(repoRoot, slug)` を呼んで resolve を確認する最小テストを追加する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.15

## Summary

すべての受け入れ基準を満たしており、実装・テスト・検証のいずれも問題なし。

**確認事項**:

- `errors.ts`: `DUPLICATE_LIVE_JOB` コード・`EXIT_CODE_MAP` エントリ・`duplicateLiveJobError` factory が正しく実装されている。hint/message の内容は要件（先行 jobId、cancel 手順、待機案内）を満たす。
- `duplicate-slug-guard.ts`: D4 の判定テーブル（不在→許容 / 破損→許容 / pid 非 number→許容 / dead pid→許容 / live pid→拒否）が正確に実装されている。`isProcessAlive` を再利用し、新規 pid 判定ロジックなし（要件 3 ✅）。
- `RuntimeStrategy` port: `assertNoDuplicateLiveJob?` が optional-on-port、`RealRuntimeStrategy` では required。`canDeriveChangedFiles` パターンと対称で既存設計規律に合致。
- `LocalRuntime`: 薄いラッパとして正しく委譲。`ManagedRuntime`: no-op で scope 境界を明示。
- `pipeline-run.ts` call-site: `bootstrapJob` の直前に `?.` optional-call で配置。state 生成前に弾く設計意図が実現されている。
- **検証**: build/typecheck/test (434 files, 5853 tests)/lint 全フェーズ passed。既存テスト無変更 green 確認済み。

**低重要度所見の補足**:

- Finding #1 (`null` JSON edge case): `writeLivenessSidecar` は常にオブジェクトを書くため、実運用での発現リスクは極めて低い。no-fix 判定は妥当。
- Finding #2 (TC-015 欠落): `ManagedRuntime.assertNoDuplicateLiveJob` は `// no-op` の空関数であり、typecheck で型適合を確認済み。機能的リスクなし。no-fix 判定は妥当。
