# Code Review Feedback — iteration 002

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

- **verdict**: needs-fix
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | testing | src/core/step/__tests__/per-node-authorship-verification.test.ts | TC-022-exec のアサーション `expect.any(String) \|\| null`（line 605）が JS の評価規則で `expect.any(String)` のみに簡約される。実際の `headBeforeStep` は `null`（テスト fake が captureHeadSha を返さないため）なので型不一致でテスト失敗。`bun run test` が exit code 1 → T8（backward-compat suite 緑）が未達。 | `expect.any(String) \|\| null` を `expect.toSatisfy((v: unknown) => v === null \|\| typeof v === "string")` または単に `null` に修正する。テスト setup では headBeforeStep は null になるので `null` でも正しい。 | yes |
| 2 | medium | security | src/core/runtime/local.ts | `verifyNodeJournalAuthorship` の committed-tree 歯（`diffPathsBetweenCommits` が `unavailable` を返す分岐）で fail-open になる（コメント `// skip this tooth (fail-open, rely on on-disk)`）。設計要件「各検査は fail-closed（判定不能は tamper 扱いで halt）」に反する。T3（git plumbing のみ・on-disk は変更しない）でエージェントが diff を unavailable にすると committed-tree 歯が無効化され、on-disk tooth は pass → per-node 検証を通過する。後続 `commitJournalArtifacts` が on-disk（authentic）を push するため durable anchor への永続影響は限定的だが、node commit の committed tree に tampered journal が残り T3 acceptance criteria「committed-tree 検証が捕えて halt」を厳密には満たさない。 | `diffResult.kind === "unavailable"` 時も `{ kind: "tamper", detail: "committed-tree diff unavailable — treating as tamper (fail-closed)" }` を返す。design D4「判定不能は tamper 扱い」を committed-tree 歯に適用する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 7 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 7.85

## Summary

iteration 001 の6点の指摘（executor wiring・resume command・round sweep・JobStateStore anchorHolder・factory JournalAnchorHolder 注入・executor integration test）は全て修正済みで、設計の骨格（authorship 分離・per-node 検証・resume authenticity・attach authenticity・durable anchor push・managed no-op）は正しく実装されている。typecheck は clean。

**F-1（テスト失敗 — ブロッカー）**: TC-022-exec の `expect.any(String) || null` は JS 評価で `expect.any(String)` のみになり、`headBeforeStep: null` に対して失敗する。1行修正で解消し、`bun run test` が green になれば T8 達成。

**F-2（committed-tree 歯 fail-open）**: `diffPathsBetweenCommits` が unavailable を返すと committed-tree 歯がスキップされ、T3 の fail-closed 保証が完全には満たされない。後続 `commitJournalArtifacts` が on-disk authentic bytes を push するため durable anchor への実害は限定的だが、design D4 の「判定不能は tamper 扱いで halt」に違反する。committed-tree tooth 内で unavailable → tamper に変えるのが最小修正。

両修正後に `bun run test` が green になれば acceptance criteria T1〜T8 が全経路で充足される。

