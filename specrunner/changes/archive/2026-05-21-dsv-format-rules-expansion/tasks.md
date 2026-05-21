# Tasks: dsv-format-rules-expansion

## Task 1 [x]: 型システム基盤

### 1a: `DeltaSpecViolationReason` 拡張

**File**: `src/core/spec/delta-spec-validator.ts`

`DeltaSpecViolationReason` union に 6 reason を追加:

```typescript
export type DeltaSpecViolationReason =
  | "legacy-flat-file"
  | "legacy-flat-dir"
  | "non-canonical-path"
  | "missing-requirements-section"
  | "empty-section"
  | "no-specs-for-required-type"
  | "legacy-section-header"
  | "removed-section-format"           // 新規
  | "renamed-section-format"           // 新規
  | "non-standard-requirement-header"  // 新規
  | "missing-scenario"                 // 新規
  | "missing-normative-keyword"        // 新規
  | "baseline-header-mismatch";        // 新規
```

### 1b: `DeltaSpecRuleName` 拡張

**File**: `src/core/spec/rules/types.ts`

`DeltaSpecRuleName` union に 6 rule 名を追加:

```typescript
export type DeltaSpecRuleName =
  | "canonical-spec-structure"
  | "no-legacy-flat-dir"
  | "no-legacy-flat-file"
  | "no-specs-for-required-type"
  | "removed-section-format"               // 新規
  | "renamed-section-format"               // 新規
  | "requirement-header-required"          // 新規
  | "scenario-required-per-requirement"    // 新規
  | "normative-keyword-required"           // 新規
  | "baseline-header-match";              // 新規
```

### 1c: `DeltaSpecRuleInput` に `baselineSpecLoader` 追加

**File**: `src/core/spec/rules/types.ts`

```typescript
export interface DeltaSpecRuleInput {
  changePath: string;
  deps: DeltaSpecValidatorFs;
  requestType?: string;
  baselineSpecLoader?: (capability: string) => Promise<string | null>;  // 新規 (optional per DJ1)
}
```

**検証**: `bun run typecheck`

## Task 2 [x]: 共有ヘルパー `spec-content-parser.ts`

**File**: `src/core/spec/rules/spec-content-parser.ts` (新規)

### 2a: `loadSpecFiles`

change folder 内の全 `specs/<cap>/spec.md` を読み込んで返す。`canonical-spec-structure` と同じ走査パターン。

```typescript
export async function loadSpecFiles(
  input: DeltaSpecRuleInput,
): Promise<Array<{ specPath: string; content: string; capability: string }>>
```

- `deps.readdir(`${changePath}/specs`)` で entries を取得
- `.md` で終わる entry (flat file) は skip
- 各 subdirectory に対して `deps.readFile(`${changePath}/specs/${entry}/spec.md`)` を試行
- `specs/` 不在・readFile 失敗は graceful に空配列 / skip

### 2b: `extractSection`

Markdown content から指定 `## ` header のセクション内容を抽出。

```typescript
export function extractSection(content: string, sectionHeader: string): string | null
```

- `sectionHeader` (例: `"## Removed"`) と行頭一致する行を探す
- 該当行の次の行から、次の `## ` 行 or EOF までを切り出す
- セクション不在時は `null`

### 2c: `parseRequirementBlocks`

`## Requirements` セクション内容を Requirement block に分解。

```typescript
export interface RequirementBlock {
  header: string;       // フルテキスト "### Requirement: X"
  name: string;         // "X" (### Requirement: 以降)
  body: string;         // header 直後〜最初の #### Scenario: の間
  hasScenario: boolean; // #### Scenario: が 1 つ以上
  line: number;         // header の行番号 (セクション内 0-indexed)
}

export function parseRequirementBlocks(sectionContent: string): RequirementBlock[]
```

- `^### Requirement:\s*(.+)$` で header を検出
- 各 header から次の `### ` or `## ` or EOF までが block の範囲
- block 内の `^#### Scenario:` の有無で `hasScenario` を決定
- body は header 行の次行から最初の `#### Scenario:` (or block 末尾) までのテキスト

**検証**: `bun run typecheck`

## Task 3 [x]: `removed-section-format` rule + test

### 3a: rule 実装

**File**: `src/core/spec/rules/removed-section-format.ts` (新規)

```typescript
export const removedSectionFormat: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "removed-section-format",
  severity: "error",
  async check(input) { ... }
};
```

ロジック:
1. `loadSpecFiles(input)` で全 spec.md を取得
2. 各ファイルで `extractSection(content, "## Removed")` を実行
3. セクション不在 → skip (optional セクション)
4. セクション内の非空行が `^-\s+"(.+?)"\s*$` に一致しない → violation

violation:
- `reason: "removed-section-format"`
- `suggested: 'Replace with - "<requirement-name>" format per rules.md'`

### 3b: unit test + PR #359 regression

**File**: `tests/unit/core/spec/rules/removed-section-format.test.ts` (新規)

テストケース:
1. **正常**: `## Removed` に `- "name"` 行のみ → 空 violations
2. **正常**: `## Removed` セクションなし → 空 violations
3. **違反**: `### Removed: name` heading 形式 → violation (PR #359 regression)
4. **違反**: `- name without quotes` → violation
5. **違反**: 自由形式テキスト → violation
6. **edge**: 空ファイル (= `## Removed` なし) → 空 violations
7. **edge**: `## Removed` + 空行のみ → 空 violations

**検証**: `bun run typecheck && bun test tests/unit/core/spec/rules/removed-section-format.test.ts`

## Task 4 [x]: `renamed-section-format` rule + test

### 4a: rule 実装

**File**: `src/core/spec/rules/renamed-section-format.ts` (新規)

```typescript
export const renamedSectionFormat: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "renamed-section-format",
  severity: "error",
  async check(input) { ... }
};
```

ロジック:
1. `loadSpecFiles(input)` で全 spec.md を取得
2. 各ファイルで `extractSection(content, "## Renamed")` を実行
3. セクション不在 → skip
4. 非空行が `^-\s+"(.+?)"\s*(?:→|->|=>)\s*"(.+?)"\s*$` に一致しない → violation

violation:
- `reason: "renamed-section-format"`
- `suggested: 'Replace with - "old" → "new" format per rules.md'`

### 4b: unit test

**File**: `tests/unit/core/spec/rules/renamed-section-format.test.ts` (新規)

テストケース:
1. **正常**: `- "old" → "new"` → 空 violations
2. **正常**: `- "old" -> "new"` (ASCII arrow) → 空 violations
3. **正常**: `- "old" => "new"` (fat arrow) → 空 violations
4. **正常**: `## Renamed` セクションなし → 空 violations
5. **違反**: `- old → new` (引用符なし) → violation
6. **違反**: 自由形式テキスト → violation
7. **edge**: 空ファイル → 空 violations

**検証**: `bun run typecheck && bun test tests/unit/core/spec/rules/renamed-section-format.test.ts`

## Task 5 [x]: `requirement-header-required` rule + test

### 5a: rule 実装

**File**: `src/core/spec/rules/requirement-header-required.ts` (新規)

```typescript
export const requirementHeaderRequired: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "requirement-header-required",
  severity: "error",
  async check(input) { ... }
};
```

ロジック:
1. `loadSpecFiles(input)` で全 spec.md を取得
2. 各ファイルで `extractSection(content, "## Requirements")` を実行
3. セクション不在 → skip (`canonical-spec-structure` が catch)
4. セクション内の `^### ` で始まる行のうち `^### Requirement:` でないもの → violation

violation:
- `reason: "non-standard-requirement-header"`
- `suggested: 'Use ### Requirement: prefix for all requirement headers'`

### 5b: unit test

**File**: `tests/unit/core/spec/rules/requirement-header-required.test.ts` (新規)

テストケース:
1. **正常**: 全 h3 が `### Requirement:` → 空 violations
2. **違反**: `### REQ-001: something` → violation
3. **違反**: `### Feature: something` → violation
4. **正常**: `## Requirements` なし → 空 violations
5. **正常**: h3 header なし → 空 violations (empty-section は別 rule の責務)
6. **edge**: `### Requirement:` と `### Other:` 混在 → `### Other:` のみ violation

**検証**: `bun run typecheck && bun test tests/unit/core/spec/rules/requirement-header-required.test.ts`

## Task 6 [x]: `scenario-required-per-requirement` rule + test

### 6a: rule 実装

**File**: `src/core/spec/rules/scenario-required-per-requirement.ts` (新規)

```typescript
export const scenarioRequiredPerRequirement: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "scenario-required-per-requirement",
  severity: "error",
  async check(input) { ... }
};
```

ロジック:
1. `loadSpecFiles(input)` で全 spec.md を取得
2. 各ファイルで `extractSection(content, "## Requirements")` → `parseRequirementBlocks()` を実行
3. `hasScenario === false` の block → violation

violation:
- `reason: "missing-scenario"`
- `suggested: 'Add at least one #### Scenario: block describing observable behavior'`

### 6b: unit test

**File**: `tests/unit/core/spec/rules/scenario-required-per-requirement.test.ts` (新規)

テストケース:
1. **正常**: 各 Requirement に `#### Scenario:` あり → 空 violations
2. **違反**: Requirement に Scenario なし → violation
3. **違反**: 複数 Requirement のうち 1 件だけ Scenario なし → 1 violation
4. **正常**: `## Requirements` なし → 空 violations
5. **edge**: Scenario が `#### Scenario:` 以外の形式 (例: `#### Test:`) → violation (Scenario として認識されない)

**検証**: `bun run typecheck && bun test tests/unit/core/spec/rules/scenario-required-per-requirement.test.ts`

## Task 7 [x]: `normative-keyword-required` rule + test

### 7a: rule 実装

**File**: `src/core/spec/rules/normative-keyword-required.ts` (新規)

```typescript
export const normativeKeywordRequired: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "normative-keyword-required",
  severity: "error",
  async check(input) { ... }
};
```

ロジック:
1. `loadSpecFiles(input)` で全 spec.md を取得
2. 各ファイルで `extractSection(content, "## Requirements")` → `parseRequirementBlocks()` を実行
3. 各 block の `body` に `/\bSHALL\b/` or `/\bMUST\b/` が含まれない → violation

violation:
- `reason: "missing-normative-keyword"`
- `suggested: 'Add SHALL or MUST in Requirement body to express normative intent'`

注意: header 行自体に `SHALL` が含まれる場合も body には含まれない。検査対象は header 直後〜最初の Scenario の間のテキストのみ。

### 7b: unit test

**File**: `tests/unit/core/spec/rules/normative-keyword-required.test.ts` (新規)

テストケース:
1. **正常**: body に `SHALL` あり → 空 violations
2. **正常**: body に `MUST` あり → 空 violations
3. **違反**: body に SHALL も MUST もなし → violation
4. **正常**: header に `SHALL` があるが body にもある → 空 violations
5. **違反**: header に `SHALL` があるが body にはない → violation (header は body ではない)
6. **正常**: `## Requirements` なし → 空 violations

**検証**: `bun run typecheck && bun test tests/unit/core/spec/rules/normative-keyword-required.test.ts`

## Task 8 [x]: `baseline-header-match` rule + test

### 8a: rule 実装

**File**: `src/core/spec/rules/baseline-header-match.ts` (新規)

```typescript
export const baselineHeaderMatch: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "baseline-header-match",
  severity: "error",
  async check(input) { ... }
};
```

ロジック:
1. `input.baselineSpecLoader` が undefined → return [] (PASS, DJ1)
2. `loadSpecFiles(input)` で全 spec.md を取得
3. 各 spec file について:
   a. `input.baselineSpecLoader(capability)` で baseline を取得
   b. baseline が `null` → skip (新規 capability, 全 ADDED, DJ3)
   c. baseline から `parseRequirementBlocks()` で header リストを抽出
   d. delta から `parseRequirementBlocks()` で header リストを抽出
   e. 各 delta header について:
      - baseline headers に exact match あり → OK (MODIFIED)
      - baseline headers に exact match なし → normalized match (lowercase + whitespace collapse) を試行
      - normalized match あり → violation (typo / case 違い, DJ7)
      - normalized match もなし → OK (ADDED)

violation:
- `reason: "baseline-header-mismatch"`
- `suggested: 'Match baseline header exactly for MODIFIED, or treat as ADDED if new'`

baseline から Requirement header を抽出するために `extractSection` + `parseRequirementBlocks` を使用する。baseline が `## Requirements` を持たない場合は空 block リスト扱い。

### 8b: unit test

**File**: `tests/unit/core/spec/rules/baseline-header-match.test.ts` (新規)

テストケース:
1. **正常**: delta header が baseline header と exact match → 空 violations
2. **正常**: delta header が baseline にない (ADDED) → 空 violations
3. **正常**: baselineSpecLoader undefined → 空 violations
4. **正常**: baseline が null (新規 capability) → 空 violations
5. **違反**: delta header が baseline header と case 違い → violation
6. **違反**: delta header の余分な whitespace → violation
7. **正常**: baseline に `## Requirements` がない → 空 violations
8. **混合**: 1 件 exact match + 1 件 ADDED + 1 件 case 違い → 1 violation のみ

**検証**: `bun run typecheck && bun test tests/unit/core/spec/rules/baseline-header-match.test.ts`

## Task 9 [x]: Registry 登録 + caller plumbing

### 9a: `createDeltaSpecRegistry()` に 6 rule 登録

**File**: `src/core/spec/rules/index.ts`

```typescript
import { removedSectionFormat } from "./removed-section-format.js";
import { renamedSectionFormat } from "./renamed-section-format.js";
import { requirementHeaderRequired } from "./requirement-header-required.js";
import { scenarioRequiredPerRequirement } from "./scenario-required-per-requirement.js";
import { normativeKeywordRequired } from "./normative-keyword-required.js";
import { baselineHeaderMatch } from "./baseline-header-match.js";

export function createDeltaSpecRegistry(): DeltaSpecRuleRegistry<DeltaSpecRuleName> {
  const registry = new DeltaSpecRuleRegistry<DeltaSpecRuleName>();
  // 既存 3 rule
  registry.register(noLegacyFlatFile);
  registry.register(noLegacyFlatDir);
  registry.register(canonicalSpecStructure);
  // 新規 6 rule
  registry.register(removedSectionFormat);
  registry.register(renamedSectionFormat);
  registry.register(requirementHeaderRequired);
  registry.register(scenarioRequiredPerRequirement);
  registry.register(normativeKeywordRequired);
  registry.register(baselineHeaderMatch);
  return registry;
}
```

### 9b: `validateDeltaSpecPaths` に `baselineSpecLoader` 引数追加

**File**: `src/core/spec/delta-spec-validator.ts`

```typescript
export async function validateDeltaSpecPaths(
  changePath: string,
  deps: DeltaSpecValidatorFs,
  requestType?: string,
  baselineSpecLoader: (capability: string) => Promise<string | null> = async () => null,
): Promise<{ ok: true } | { ok: false; violations: DeltaSpecViolation[] }> {
  const ruleInput = { changePath, deps, requestType, baselineSpecLoader };
  // ... 既存ロジック (ruleInput を registry.validate() に渡す)
}
```

既存の `ruleInput` 構築箇所に `baselineSpecLoader` を追加するのみ。

### 9c: Step で実 `baselineSpecLoader` を inject

**File**: `src/core/step/delta-spec-validation.ts`

```typescript
import * as nodePath from "node:path";

// run() 内:
const baselineSpecLoader = async (capability: string): Promise<string | null> => {
  const baselinePath = nodePath.join(cwd, `specrunner/specs/${capability}/spec.md`);
  try {
    return await nodeFs.readFile(baselinePath, "utf-8");
  } catch {
    return null;
  }
};

const result = await validateDeltaSpecPaths(
  changePath,
  {
    readdir: (p: string) => nodeFs.readdir(p),
    readFile: (p: string) => nodeFs.readFile(p, "utf-8"),
  },
  deps.request.type,
  baselineSpecLoader,
);
```

**検証**: `bun run typecheck`

## Task 10 [x]: Delta spec

**File**: `specrunner/changes/dsv-format-rules-expansion/specs/delta-spec-rule/spec.md` (新規)

baseline (`specrunner/specs/delta-spec-rule/spec.md`) に対する delta spec を作成。
MODIFIED 2 件 + ADDED 7 件 の Requirements を記述 (詳細は同ファイル参照)。

## Task 11 [x]: 検証

1. `bun run typecheck` green
2. `bun run test` green
3. 既存 archive の delta spec 3 件で新 rule が false positive を出さないことを確認:
   - 最近の archive folder から 3 件サンプリング
   - 各 folder の `specs/<cap>/spec.md` を test input として `loadSpecFiles` → 各 rule の `check()` に通し、空 violations を確認

検証 3 は手動または ad-hoc test script で実施。
