# ADR: Delta Spec の section header 分類を LLM から tool に委譲

**Date**: 2026-05-19
**Status**: Accepted

## 背景

PR #283, #289, #299, #323 の事故分析から、**delta spec の section header 判断を LLM agent に任せていること**が構造的根であると判明した。

| 事故 | 根本原因 |
|------|---------|
| #283 4 層防衛網突破 | LLM が delta spec 必要性を判断 |
| #289 authority spec 直接編集 | LLM が prompt 規律を守る前提 |
| #299 request body の authority path 直接指定 | LLM が format / path を判断 |
| #323 新規 capability に MODIFIED | LLM が section header を判断 |

各事故ごとに「prompt 強化」「reviewer check 追加」「dsv rule 追加」を積み上げてきたが、LLM は確率的にルールを守らない。対症療法は無限に続く。

## 思想

**LLM agent には semantic content（何を変えたいか）だけ書かせる。format / structure / classification は tool が決定する。**

本 ADR は上記思想の第 1 弾（delta spec の section header 自動分類）。

## 決定事項

### D1: 新 delta spec format

agent が書く delta spec を以下に統一する:

```markdown
# Delta Spec: <Title>

## Requirements
### Requirement: <name>
<本文 + #### Scenario>

## Removed
- "<requirement name>"

## Renamed
- "old name" → "new name"
```

`ADDED` / `MODIFIED` / `REMOVED` / `RENAMED` の section header は agent が書かない。

### D2: auto-classification ロジックの配置

`src/core/finish/spec-merge.ts` の `parseDeltaSpec()` を `ParsedDelta` を返す新形式に書き換え、`classifyDeltaSpec()` 関数を新設する:

1. `parseDeltaSpec()`: 新形式を parse → `{ requirements, removed, renamed }`
2. `classifyDeltaSpec()`: parse 結果 + baseline → `DeltaSpec { added, modified, removed }`
   - baseline に同名あり → MODIFIED
   - baseline に同名なし → ADDED
   - renamed: old → new 適用後に分類

`applyMerge()` は変更不要（入力の `DeltaSpec` 型は同じ）。

### D3: 型分離

```typescript
interface ParsedDelta {
  requirements: RequirementBlock[];  // ADDED/MODIFIED 未分類
  removed: string[];                 // name のリスト
  renamed: RenameEntry[];            // { from, to }
}
```

`DeltaSpec` 型は export 維持（`applyMerge` / `validateDeltaSpec` / `checkBaselineHeaderConsistency` が依存）。

### D4: Removed セクションの形式変更

旧形式: `## REMOVED Requirements` 配下に `### Requirement:` ブロック（本文付き）
新形式: `## Removed` に `- "name"` リスト形式

削除対象に本文を書かせる意味がないため、agent の判断量を最小化。

### D5: Renamed の処理順序

`classifyDeltaSpec()` 内で:
1. `renamed` エントリの `from` → `to` を baseline 上で適用（rename 後の baseline を作成）
2. rename 後の baseline に対して `requirements` を突合し ADDED / MODIFIED を判定

### D6: dsv rule 更新

`canonical-spec-structure.ts` の section header 検証を更新:

- 旧形式 (`## ADDED/MODIFIED/REMOVED/RENAMED Requirements`) → `legacy-section-header` violation (severity: error)
- `## Requirements` が必須
- `## Removed` / `## Renamed` はオプション

### D7: spec-review の Baseline Consistency Check

spec-review では「MODIFIED header が baseline に存在するか」等の **分類前提のチェック** は tool 側 (`classifyDeltaSpec` → `checkBaselineHeaderConsistency`) が `specrunner finish` 時に担保するため、spec-review からは削除。spec-review は semantic な仕様品質に集中する。

## 結果・トレードオフ

### 効果
- PR #323 同型事故（新規 capability に MODIFIED を書く）が物理的に発生不可になる
- LLM agent が ADDED/MODIFIED を判断する場面そのものがなくなる
- dsv が旧形式を reject するため、既存の防衛網が形式的にも強化される

### トレードオフ
- 既存 active change の旧形式 delta spec が dsv で reject される（マージ前に active を空にする必要がある）
- `mergeSpecsForChange` のフローが複雑になる（baseline を parseDeltaSpec より前に読む必要がある）

## Alternatives Considered

### A. Prompt 強化 (採用しない)

「新規 capability のときは `## ADDED Requirements` を使え」という prompt を強化する。過去の事故パターンと同型で、LLM の確率的な誤りを防ぐことはできない。

### B. Reviewer check 追加 (採用しない)

spec-reviewer が baseline 不在時の `## MODIFIED` を検出して reject する。対症療法であり、「agent が確率的にルールを守らない」問題の根本解決にならない。また、review layer は本来 semantic correctness を見る場であり、structural classification の正誤判定を追加するのは責務の混乱を招く。

### C. 本 ADR の方針 (採用)

classification の判断を tool に移管することで、agent が誤判断する「場面そのものを消す」。これは本 request の問題意識 (LLM 不確定性への構造的解決) に最も整合する。

## 参照

- PR #323: 新規 capability に MODIFIED → baseline 不在エラー（本 ADR の trigger）
- PR #289, #291: delta spec format 関連事故
- `src/core/finish/spec-merge.ts`: 実装
- `src/core/spec/rules/canonical-spec-structure.ts`: dsv rule
- `src/prompts/fragments.ts`: DELTA_SPEC_FORMAT / AUTHORITY_SPEC_GUARD
