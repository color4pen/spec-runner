# Code Review — add-baseline-spec-context — Iteration 1

## Summary

実装は仕様に正確に沿っており、既存パターン（collectChangesList のフォールバック、DynamicContext の並列収集）と一貫性がある。エラーハンドリング、型安全性、テストカバレッジいずれも良好。CRITICAL/HIGH の findings なし。

- **verdict**: approved

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **8.80** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | src/git/dynamic-context.ts:151 | `extractPurpose` の `line.startsWith("## Purpose")` は `## Purposeful` 等の仮想ヘッダーにもマッチしうる。spec フォーマットは統制されているため実害なし | 厳密にするなら `line === "## Purpose"` または `/^## Purpose\s*$/.test(line)` に変更 |
| 2 | LOW | testing | tests/ | TC-DC-021（must: DynamicContext 型に specIndex が存在）と TC-EDGE-003（must: dynamicContext undefined 後方互換）が独立テストブロックとして存在しないが、TC-DC-015/016 および TC-DC-006 で実質カバーされている | 明示的なテストブロックを追加するか、implementation-notes の coverage table に covered-by 注記を追加 |

## Correctness (9/10)

- `collectSpecIndex` は `specrunner/specs/` 未存在時に空配列フォールバック、個別 spec.md 読取失敗時にスキップ — 仕様通り
- `extractPurpose` は `## Purpose` 直後の非空行を抽出、次の `##` ヘッダーでガード — D5 準拠
- `countRequirements` の `/^### Requirement:/gm` は行頭マッチで正確
- `buildInitialMessage` の changesList/specIndex 独立条件分岐、両方空時の Repository Context 省略 — 全ケース網羅
- 呼び出し元 `propose.ts` は `deps.dynamicContext` をそのまま渡しており変更不要 — 後方互換維持

## Security (9/10)

- 新機能はファイルシステム読み取り（readdir + readFile）のみ。外部入力なし、ネットワーク通信なし
- path traversal リスクなし: `specsDirRel()` は固定パス、サブディレクトリ名は `readdir` の `Dirent.name` から取得
- system prompt の baseline 参照指示は Read 許可のみ（編集許可ではない）

## Architecture (9/10)

- `specsDirRel()` を `paths.ts` から import — 要件6 準拠、パスのハードコーディング回避
- `collectSpecIndex` を `Promise.all` に追加して並列収集 — 既存の `collectDynamicContext` パターンに統合
- `buildInitialMessage` の引数型を `DynamicContext` に統一 — `implementer.ts` と同じパターン
- system prompt の baseline 参照セクションは path-fence 直後・禁止事項直前 — D4 準拠

## Performance (9/10)

- 全フィールドが `Promise.all` で並列収集される
- 個別 spec.md の読み取りも `Promise.all` で並列化
- 全文注入ではなく軽量 index (~1000 トークン) — D1 のトークン効率設計

## Maintainability (8/10)

- JSDoc コメントが各関数・インターフェースに付与されている
- `extractPurpose` / `countRequirements` が独立ヘルパーとして分離 — テスタブル
- Finding #1 の `startsWith` マッチの曖昧さが唯一の減点要因（実害はないが defensive coding として改善余地あり）

## Testing (8/10)

- must テストケース 15 件中 13 件が明示的に実装済み
- TC-DC-021 は TC-DC-015/016 で構造的にカバー、TC-EDGE-003 は TC-DC-006 でカバー — 実質的には全 must カバー
- TC-SP-001/002 で system prompt の内容と配置順序を検証 — 良好
- TC-DC-019/020（should: Purpose なし / Requirement 0 件）も TC-DC-016 内の追加ケースとして実装済み
- Finding #2 の明示的テストブロック欠落が減点要因（coverage tracking の正確性の観点）

## Scenario Coverage (test-cases.md vs implementation)

| TC | Priority | Implemented | Notes |
|----|----------|-------------|-------|
| TC-DC-015 | must | ✅ | dynamic-context.test.ts |
| TC-DC-016 | must | ✅ | dynamic-context.test.ts |
| TC-DC-017 | must | ✅ | dynamic-context.test.ts |
| TC-DC-018 | must | ✅ | dynamic-context.test.ts |
| TC-DC-019 | should | ✅ | TC-DC-016 内の追加ケース |
| TC-DC-020 | should | ✅ | TC-DC-016 内の追加ケース |
| TC-DC-021 | must | ⚠️ | TC-DC-015/016 で暗黙カバー |
| TC-DC-011 | must | ✅ | dynamic-context-prompts.test.ts |
| TC-DC-012 | must | ✅ | dynamic-context-prompts.test.ts |
| TC-DC-013 | must | ✅ | dynamic-context-prompts.test.ts |
| TC-DC-014 | must | ✅ | dynamic-context-prompts.test.ts |
| TC-SP-001 | must | ✅ | propose-system.test.ts |
| TC-SP-002 | should | ✅ | propose-system.test.ts |
| TC-SP-003 | should | ⚠️ | TC-SP-001 内で部分カバー |
| TC-TYPE-001 | must | ✅ | typecheck pass |
| TC-TYPE-002 | must | ✅ | typecheck pass + propose.ts 未変更 |
| TC-REG-001 | must | ✅ | 1610 tests pass |
| TC-REG-002 | must | ✅ | typecheck exit 0 |
| TC-REG-003 | must | ✅ | 1610 tests pass |
| TC-INT-001 | should | ✅ | import 確認済み |
| TC-INT-002 | could | ✅ | Promise.all 確認済み |
| TC-EDGE-001 | should | ✅ | filter(e => e.isDirectory()) で実現 |
| TC-EDGE-002 | should | ✅ | TC-DC-016 で単一 spec テスト済み |
| TC-EDGE-003 | must | ⚠️ | TC-DC-006 で暗黙カバー |
