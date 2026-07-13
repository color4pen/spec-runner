# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Spec ambiguity | tasks.md T-02 | `perStep.costUsd` と `totalCostUsd` の集計セマンティクスが部分的に矛盾する可能性がある。T-02 は「null（未価格）はその step の `costUsd` を null 方向に寄せ」と述べる一方、「`totalCostUsd`: 価格が取れた invocation の合算」と定義する。ある step で model A（価格あり）と model B（価格なし）が混在する場合、その step の `costUsd` は null になるが、totalCostUsd には model A のコストが含まれる。この非対称が意図通りかが不明確で、テスト設計者が誤実装する可能性がある。 | tasks.md T-02 の `perStep` cost の段落に「1 invocation 内で priced/unpriced が混在する場合、その invocation の costUsd は null とし totalCostUsd の合算から除外する」か「priced 分のみ合算して partial とする」かを明記する。テスト T-05 でこのケースのフィクスチャを追加して挙動を固定する。 |
| 2 | LOW | Implementation note | tasks.md T-02 | `fold()` が返す `StepRun.outcome.toolResult` の TypeScript 型は `BaseReportResult \| null`（event-journal.ts の `StepAttemptRecord` の定義による）であり、`findings` フィールドを静的に持たない。既存コードベースは `as { findings?: Finding[] }` キャストで対処しているが（reviewer-chain.ts / findings-ledger.ts 参照）、T-02 の import 制限リストにこのキャストパターンが記述されていないため、implementer が型エラーで詰まる可能性がある。 | T-02 の「純度制約」節に「`outcome.toolResult` は `as { findings?: Finding[] } \| null \| undefined` とキャストして findings にアクセスする（既存 findings-ledger.ts と同型）」と一文追記する。 |

## Summary

### コードベース参照の事実確認

| 主張 | 確認結果 |
|------|---------|
| `createIssueComment` が `github-client.ts:481` に存在する | ✅ 確認済み（POST /issues/{n}/comments、201 期待） |
| `fold()` が `src/store/event-journal.ts` に存在し `FoldResult.steps: Record<string, StepRun[]>` を返す | ✅ 確認済み |
| `fold()` は `toolResult` を `StepRun.outcome.toolResult` に伝播する（lines 282） | ✅ スプレッド経由で伝播。runtime では `findings` フィールドを含む |
| `readUsageFile` が `src/core/usage/store.ts` に存在し ENOENT を空構造で吸収する | ✅ 確認済み |
| `computeCostUsd` / `formatUsd` が `src/core/usage/pricing.ts` に存在する | ✅ 確認済み |
| `slugEventsPath` / `usageJsonPath` が `src/util/paths.ts` に存在する | ✅ 確認済み |
| `Finding.resolution` が `"fixable" \| "decision-needed"` の 2 値 | ✅ `src/kernel/report-result.ts` |
| 既存 pr-create テストが TC-008〜020 を含む | ✅ `tests/unit/step/pr-create.test.ts` 冒頭コメント確認 |
| `StepRun` の `modelUsage` は journal から fold しても得られない（fold がセットしない） | ✅ `fold()` lines 275-290 に modelUsage 代入なし。D5 が usage.json を canonical source とする設計で正しい |

### 設計整合性

- **純関数分離（D1）**: `judge-verdict.ts` と同型のパターン。`fold()` + `UsageFile` → 純関数 → `Attestation` の流れは codebase の B-5 規律に合致する。
- **best-effort パターン（D7）**: 既存の usage append / lineage append（executor.ts）と同型。`try/catch` + `logWarn` で主目的を巻き込まない設計は確立済みパターン。
- **hash 入力（D3）**: `node:crypto` の `createHash("sha256")` は B-12 非対象。決定的・副作用なし・I/O なし。✓
- **ゲート順序（D4）**: `startedAt` 昇順ソート。`fold()` は step 名でグルーピングするだけで時系列順を保証しないため、平坦化後の sort は必須で正しい。
- **タイミング invariant**: pr-create `run()` 実行時、events.jsonl には pr-create より前の全 step が確定済み（executor が step commit 前に append）。attestation は「通過済みゲート群の証明」として意味的に正確。
- **managed runtime（Risks）**: path 差異（`.specrunner/local/<slug>/`）は best-effort の skip で吸収。主目的（PR 作成）を壊さない最優先方針が明示されており、スコープ内での対応として適切。

### セキュリティ評価（OWASP Top 10）

| 観点 | 評価 |
|------|------|
| A01 Broken Access Control | 既存 `githubClient` の認証を再利用。新規 write 能力なし（check-run はスコープ外と明示）。✅ |
| A03 Injection | コメント body は `JSON.stringify(attestation, null, 2)` で構成。findings は件数要約（本文なし）のみ。文字列 interpolation によるインジェクションリスクなし。✅ |
| A06 Vulnerable Components | `node:crypto`（組み込み）のみ追加。外部依存なし。✅ |
| A08 Data Integrity | `journalHash`（sha256）がコメント内の事後検証基点となる。将来の A-3 verify への布石として設計一貫。✅ |
| コメントサイズ超過 | findings を件数要約に落とすことで GitHub の 65536 文字上限への対処がある（Risks 表）。✅ |
| パス traversal | `path.resolve(cwd, slugEventsPath(slug))` — slug は job 作成時に確定しており、ユーザー入力で動的に変わらない。新規リスクなし。✅ |

### 受け入れ基準の検証可能性

1. 純関数テスト（T-05）: events.jsonl 文字列 + UsageFile fixture → Attestation を assert。完全にテスト可能。✅
2. コメント整形テスト（T-06）: JSON フェンスブロック抽出 + JSON.parse が元 object に一致することを assert。✅
3. best-effort テスト（T-07）: `createIssueComment` reject → `run` 例外なし・result.md が `## Status: success` を保持。✅
4. journal 欠落テスト（T-07）: events.jsonl なし → `createIssueComment` 非呼び出し・`run` 例外なし。✅
5. `typecheck && test` green（T-08）: 独立した検証ステップとして明示されている。✅

MEDIUM 所見 2 件はいずれも実装フェーズで吸収可能（テスト fixture で挙動を固定する、既存コードパターンに倣うキャスト）。ブロッキング所見なし。
