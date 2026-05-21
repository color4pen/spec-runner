# Design: dsv-format-rules-expansion

## 概要

rules.md L137-146 が規定する tool 必須 format rule 6 件を delta-spec-validator (dsv) に追加する。現行 dsv は構造・path 検証のみ (4 rule) で、section content の format は未検証。PR #359 で `## Removed` セクションの形式違反が素通りした根本原因は rule 不在。新 rule は各 spec.md の content を走査し、format 違反を機械的に検出する。

## 設計判断

### DJ1: `baselineSpecLoader` の DI 形式 — 関数注入 + デフォルト引数

**決定**: `validateDeltaSpecPaths` に第 4 引数 `baselineSpecLoader: (capability: string) => Promise<string | null>` を追加する (default = `async () => null`)。`DeltaSpecRuleInput` にも optional field として追加する。

**理由**:
- 既存 `deps: DeltaSpecValidatorFs` と同じ関数注入パターン — 一貫性
- 6 rule のうち `baseline-header-match` のみが使用 — class / port interface は過剰
- default `async () => null` により既存呼び出し箇所・テストの変更不要 (後方互換)
- 呼び出し側 (`delta-spec-validation.ts` step) で `specrunner/specs/<cap>/spec.md` を読む実 loader を inject

`DeltaSpecRuleInput.baselineSpecLoader` を optional にする理由: 6 rule のうち 5 rule は baseline を参照しない。個別 rule の unit test で毎回 `baselineSpecLoader: async () => null` を書く冗長さを排除。`baseline-header-match` rule 内で `input.baselineSpecLoader` が undefined なら baseline 不在扱い (PASS) にする。

### DJ2: rule 間の依存関係 — 独立実行、全違反一括報告

**決定**: 各 rule は独立に実行する。ある rule が違反を出しても他 rule を skip しない。

**理由**:
- registry の `validate()` は全 rule を順次実行して violations を collect する既存設計
- 全違反を一度に報告した方が fixer agent にとって有益 (1 修正サイクルで全問題を解決)
- rule 間依存を入れると registry の制御フローが複雑化しテスタビリティが低下
- `canonical-spec-structure` の `empty-section` と `requirement-header-required` の `non-standard-requirement-header` が同一ファイルで重複報告される可能性があるが、fixer にとっては情報量が増えるだけで害はない

### DJ3: baseline 不在の扱い — rule 側で PASS

**決定**: `baselineSpecLoader` が `null` を返した場合 (= 新規 capability)、`baseline-header-match` rule は全 Requirement を ADDED 扱いとして PASS (空 violations リスト) を返す。`baselineSpecLoader` 自体が undefined の場合も同様に PASS。

**理由**:
- rule の check 関数内で判定するのが最もシンプル — registry に特殊ロジック不要
- Single Responsibility: registry は実行オーケストレーション、rule はバリデーションロジック

### DJ4: `canonical-spec-structure` との責務分離

**決定**: 既存 `canonical-spec-structure` の責務 (構造検証 = path + section header 存在 + Requirement 存在確認) はそのまま維持。新 rule は section content format 検証に限定。

**理由**:
- `canonical-spec-structure`: 「構造が正しいか」(path, section header, 最低 1 Requirement の存在)
- 新 rule: 「content format が rules.md 規定に準拠しているか」(行形式, header prefix, Scenario 存在, normative keyword, baseline 一致)
- 責務が明確に分離 — 構造 vs format

### DJ5: 共有ヘルパー `spec-content-parser.ts` の導入

**決定**: `src/core/spec/rules/spec-content-parser.ts` に以下の共有関数を配置する。

1. **`loadSpecFiles(input)`** — change folder 内の全 `specs/<cap>/spec.md` を読み込んで `Array<{ specPath, content, capability }>` を返す。`specs/` 不在時は空配列。
2. **`extractSection(content, sectionHeader)`** — `## <header>` から次の `## ` or EOF までの内容を抽出。セクション不在時は `null`。
3. **`parseRequirementBlocks(sectionContent)`** — `## Requirements` セクション内容を `RequirementBlock[]` にパース。各 block は `{ header, name, body, hasScenario, line }` を持つ。

**理由**:
- 6 rule 全てが `specs/<cap>/spec.md` を走査 — iteration boilerplate の重複排除
- rules 3-6 が `## Requirements` 内の Requirement block をパース — parsing ロジックの一元化
- pure function のみ (I/O は `loadSpecFiles` 内で `input.deps` 経由) — D1 準拠

```typescript
// RequirementBlock の構造
export interface RequirementBlock {
  header: string;       // "### Requirement: X" (フルテキスト)
  name: string;         // "X" (### Requirement: 以降)
  body: string;         // header 直後〜最初の #### Scenario: の間のテキスト
  hasScenario: boolean; // #### Scenario: が 1 つ以上あるか
  line: number;         // header の行番号 (0-indexed)
}
```

### DJ6: `DeltaSpecViolationReason` の拡張

**決定**: 新 rule 用に 6 つの violation reason を `DeltaSpecViolationReason` union に追加する。

| Rule | Reason | 説明 |
|------|--------|------|
| removed-section-format | `removed-section-format` | `## Removed` の行形式違反 |
| renamed-section-format | `renamed-section-format` | `## Renamed` の行形式違反 |
| requirement-header-required | `non-standard-requirement-header` | `### Requirement:` 以外の h3 header |
| scenario-required-per-requirement | `missing-scenario` | Requirement に `#### Scenario:` がない |
| normative-keyword-required | `missing-normative-keyword` | Requirement 本文に SHALL/MUST がない |
| baseline-header-match | `baseline-header-mismatch` | baseline header と不一致 (類似だが非同一) |

### DJ7: `baseline-header-match` の一致判定ロジック

**決定**: delta Requirement header が baseline のどの header とも exact match しない場合、normalized match (lowercase + whitespace 正規化) で baseline header と比較する。normalized match する baseline header が存在するなら violation (= typo / case 違い)。normalized match もしなければ ADDED 扱いで PASS。

**理由**:
- exact match しない header が「新規追加」なのか「既存の typo」なのかを判別する必要がある
- agent の典型的ミス: case 違い (`shall` vs `SHALL`)、軽微な語順変更
- normalized match は false positive が少なく実装もシンプル
- より高度な類似度検出 (Levenshtein 等) は future enhancement

## 変更対象ファイル

| File | 種別 | 変更内容 |
|------|------|----------|
| `src/core/spec/rules/types.ts` | 変更 | `DeltaSpecRuleName` に 6 名追加、`DeltaSpecRuleInput.baselineSpecLoader?` 追加 |
| `src/core/spec/delta-spec-validator.ts` | 変更 | `DeltaSpecViolationReason` に 6 reason 追加、`validateDeltaSpecPaths` に `baselineSpecLoader` 引数追加 |
| `src/core/spec/rules/index.ts` | 変更 | `createDeltaSpecRegistry()` に 6 rule 登録 (3 → 9) |
| `src/core/step/delta-spec-validation.ts` | 変更 | `baselineSpecLoader` 実 loader を inject |
| `src/core/spec/rules/spec-content-parser.ts` | 新規 | 共有ヘルパー (`loadSpecFiles` / `extractSection` / `parseRequirementBlocks`) |
| `src/core/spec/rules/removed-section-format.ts` | 新規 | `## Removed` 行形式検証 |
| `src/core/spec/rules/renamed-section-format.ts` | 新規 | `## Renamed` 行形式検証 |
| `src/core/spec/rules/requirement-header-required.ts` | 新規 | `### Requirement:` prefix 検証 |
| `src/core/spec/rules/scenario-required-per-requirement.ts` | 新規 | `#### Scenario:` 存在検証 |
| `src/core/spec/rules/normative-keyword-required.ts` | 新規 | `SHALL` / `MUST` keyword 検証 |
| `src/core/spec/rules/baseline-header-match.ts` | 新規 | baseline header 一致検証 |
| `tests/unit/core/spec/rules/removed-section-format.test.ts` | 新規 | + PR #359 regression test |
| `tests/unit/core/spec/rules/renamed-section-format.test.ts` | 新規 | |
| `tests/unit/core/spec/rules/requirement-header-required.test.ts` | 新規 | |
| `tests/unit/core/spec/rules/scenario-required-per-requirement.test.ts` | 新規 | |
| `tests/unit/core/spec/rules/normative-keyword-required.test.ts` | 新規 | |
| `tests/unit/core/spec/rules/baseline-header-match.test.ts` | 新規 | |

## 変更しないファイル

| File | 理由 |
|------|------|
| `src/core/spec/rules/canonical-spec-structure.ts` | request scope out — 既存 rule の振る舞い変更なし |
| `src/core/spec/rules/registry.ts` | 構造変更なし — TName generic は既存で十分 |
| `src/core/spec/rules/no-legacy-flat-file.ts` | 変更不要 |
| `src/core/spec/rules/no-legacy-flat-dir.ts` | 変更不要 |
| `src/core/spec/rules/no-specs-for-required-type.ts` | 変更不要 |
