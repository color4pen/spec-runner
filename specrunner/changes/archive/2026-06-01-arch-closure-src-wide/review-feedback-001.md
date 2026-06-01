# Code Review Feedback — arch-closure-src-wide — iter 1

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
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | testing | `tests/unit/architecture/core-invariants.test.ts` L857 | **Scan liveness 未アサート**: `scanImportEdges()` の戻り値件数をアサートしていない。`classifyLayer` や `path.resolve` に将来的なバグが入っても「検出 0 件 → violations 0 件 → green」となり、closure enforcement が黙って破壊される。現在の allowlist 21 件が scan で検出されている証拠はコード上にない。 | `it("§3 whitelist に無い import edge は...")` 内の `filterViolations` 呼び出し前に `expect(forbiddenEdges.length).toBeGreaterThanOrEqual(dsmEntries.length)` を追加。 | yes |
| 2 | LOW | testing | `tests/unit/architecture/core-invariants.test.ts` | **TC-001〜TC-023 の明示的な unit test なし**: `classifyLayer`（12件）・`DSM_WHITELIST`（5件）・`scanImportEdges` behavior（6件）が個別の `it()` ブロックとして実装されていない。integration test で implicitly 実行されるが、`src/errors.ts` の exact-match、`core/runtime/` vs `core/` の longest-match 優先、node:* スキップ、same-layer skip 等に対する isolated assertion がない。test-cases.md の "result: completed / automated: 46" は implicit coverage を含む解釈。 | `describe("classifyLayer unit")` で代表ケース（TC-001〜TC-012）と `DSM_WHITELIST` key assertion（TC-013〜TC-017）を追加すると保守性が向上する（任意）。 | no |
| 3 | LOW | documentation | `tests/unit/architecture/arch-allowlist.ts` L211 | **"(2行)" コメントと 1 エントリの不整合**: `DSM-adapter-domain-ac-agent` のコメントが "直接 import (2行)" と記載しているが allowlist エントリは 1 件のみ。両行とも `core/agent/definition.js` を含むため pattern matching が 2 行分を正しく抑制しており動作上の問題はないが、コメントが "エントリが欠けている" と誤読される。 | コメントを "直接 import（2 行は同一 pattern で 1 エントリが両行をカバー）" 等に修正するか "(2行)" の記述を削除。 | no |
| 4 | LOW | coverage | `tests/unit/architecture/core-invariants.test.ts` L803 | **未分類ファイルのサイレントスキップ**: `classifyLayer(match.file)` が null を返すソースファイルを `continue` で無音スキップする。`src/` に新ディレクトリが追加された場合、`classifyLayer` を更新するまで closure scan の対象外となる（TC-045 could 相当）。 | 対応は任意。null source のカウントを集計し `> 0` の場合に `console.warn` で報告する等。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.9

## Summary

全 5 つの受け入れ基準を満たしている。`classifyLayer` の longest-match、`DSM_WHITELIST` の §3 matrix 転写（composition-root/domain/ports/adapters/persistence/shared-kernel/leaf の 7 層）、`scanImportEdges` の相対パス解決はいずれも正確に実装されており、adapter→domain (12件) / domain→comp-root (5件) / ports→domain (4件) の計 21 件の divergence が allowlist に authoritative scan 確認済みで全件列挙されている。既存 B-1〜B-9 は無改変。build / typecheck / 3289 tests / lint すべて green。

唯一の non-trivial 指摘は Finding 1（scan liveness 未アサート）。`classifyLayer` や path.resolve の regression を防ぐために、`forbiddenEdges.length >= dsmEntries.length` の事前条件アサートを 1 行追加することを推奨する。

