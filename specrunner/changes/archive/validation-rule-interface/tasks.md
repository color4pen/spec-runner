# Tasks: validation-rule-interface

## Task 1: ValidationRule interface + RuleRegistry class [x]

### 1.1 Create `src/core/validation/types.ts`

```ts
export interface ValidationRule<TInput, TViolation> {
  name: string;
  severity: "error" | "warning";
  check(input: TInput): TViolation[];
}
```

### 1.2 Create `src/core/validation/registry.ts`

```ts
export class RuleRegistry<TInput, TViolation> {
  private rules: ValidationRule<TInput, TViolation>[] = [];

  register(rule: ValidationRule<TInput, TViolation>): void {
    if (this.rules.some(r => r.name === rule.name)) {
      throw new Error(`Duplicate rule name: ${rule.name}`);
    }
    this.rules.push(rule);
  }

  validate(input: TInput): TViolation[] {
    return this.rules.flatMap(r => r.check(input));
  }
}
```

### 1.3 Create `tests/unit/core/validation/registry.test.ts`

Test cases:
- TC-REG-01: register した rule が validate で呼ばれる
- TC-REG-02: 複数 rule の violation が flat に集約される
- TC-REG-03: 同名 rule の重複 register で throw

### 1.4 Verify

```bash
bun run typecheck && bun vitest run tests/unit/core/validation/registry.test.ts
```

---

## Task 2: Parser layer — 型定義 + rule 抽出 [x]

### 2.1 Create `src/parser/rules/types.ts`

```ts
import type { ParsedRequestSections } from "../../core/request/types.js";

/** Raw extracted fields from request.md (null = not found). */
export interface ParsedRequestRaw {
  title: string | null;
  type: string | null;
  slug: string | null;
  baseBranch: string | null;
  adrRaw: string | null;
  adrAnyValue: string | null;
  issue: string | undefined;
  enabled: string[];
  sections: ParsedRequestSections;
  filePath: string;
  content: string;
}

export interface RequestMdViolation {
  rule: string;
  severity: "error" | "warning";
  message: string;
  field?: string;
}
```

### 2.2 Create parser rules (各ファイル `src/parser/rules/`)

各 rule は `ValidationRule<ParsedRequestRaw, RequestMdViolation>` を implements する。

**`title-required.ts`**:
- `name: "title-required"`, `severity: "error"`
- `check`: `input.title === null` → `[{ rule: "title-required", severity: "error", message: "missing title (top-level # heading required) in <filePath>", field: "title" }]`

**`type-required.ts`**:
- `name: "type-required"`, `severity: "error"`
- `check`: `input.type === null` → violation

**`type-known.ts`**:
- `name: "type-known"`, `severity: "warning"`
- `check`: `input.type !== null && !isAllowedType(input.type)` → violation (warning)
- `isAllowedType` を `type-config.ts` から import

**`slug-required.ts`**:
- `name: "slug-required"`, `severity: "error"`
- `check`: `input.slug === null || input.slug.length === 0` → violation

**`base-branch-required.ts`**:
- `name: "base-branch-required"`, `severity: "error"`
- `check`: `input.baseBranch === null || input.baseBranch.length === 0` → violation

**`adr-required.ts`**:
- `name: "adr-required"`, `severity: "error"`
- `check`: `input.adrRaw === null && input.adrAnyValue === null` → violation ("missing 'adr' in Meta section")

**`adr-valid.ts`**:
- `name: "adr-valid"`, `severity: "error"`
- `check`: `input.adrRaw === null && input.adrAnyValue !== null` → violation ("invalid value for 'adr'")

### 2.3 Create `src/parser/rules/index.ts`

```ts
import { RuleRegistry } from "../../core/validation/registry.js";
import type { ParsedRequestRaw, RequestMdViolation } from "./types.js";
// import all rules...

export function createRequestMdRegistry(): RuleRegistry<ParsedRequestRaw, RequestMdViolation> {
  const registry = new RuleRegistry<ParsedRequestRaw, RequestMdViolation>();
  registry.register(titleRequired);
  registry.register(typeRequired);
  registry.register(typeKnown);
  registry.register(slugRequired);
  registry.register(baseBranchRequired);
  registry.register(adrRequired);
  registry.register(adrValid);
  return registry;
}
```

### 2.4 Create rule unit tests (`tests/unit/parser/rules/`)

各 rule について:
- 違反する input → expected violation が返る
- 違反しない input → 空 array が返る

ファイル: `title-required.test.ts`, `type-required.test.ts`, `type-known.test.ts`, `slug-required.test.ts`, `base-branch-required.test.ts`, `adr-required.test.ts`, `adr-valid.test.ts`

### 2.5 Verify

```bash
bun run typecheck && bun vitest run tests/unit/parser/rules/
```

---

## Task 3: Parser layer — `request-md.ts` migration [x]

### 3.1 `src/parser/request-md.ts` を修正

`parseRequestMdContent` の内部を以下のように書き換え:

1. **Parse phase**: 既存の field 抽出ロジック（title / type / slug / baseBranch / adrRaw / adrAnyValue / issue / enabled / sections）を `parseRequestMdRaw(content, filePath): ParsedRequestRaw` 関数として切り出す。ロジック自体は変更しない。

2. **Validate phase**: `createRequestMdRegistry()` で registry を取得し `registry.validate(raw)` を呼ぶ。

3. **Error conversion**: violation のうち severity="error" があれば最初の violation の message で `requestMdInvalidError` を throw。severity="warning" は `stderrWrite` で出力。

4. **Return**: violation（error）がなければ `ParsedRequestRaw` → `ParsedRequest` に変換して return。

公開 API:
- `parseRequestMd(filePath)` — 変更なし
- `parseRequestMdContent(content, filePath?)` — シグネチャ・戻り値型とも変更なし
- `parseRequestMdRaw(content, filePath?)` — 新規 export（テスト用途）

### 3.2 既存テストが green であることを確認

```bash
bun vitest run tests/unit/parser/request-md.test.ts
```

改変不要で pass すること。

### 3.3 Verify full

```bash
bun run typecheck && bun vitest run tests/unit/parser/
```

---

## Task 4: DSV layer — 型定義 + rule 抽出 [x]

### 4.1 Create `src/core/spec/rules/types.ts`

```ts
import type { DeltaSpecViolation, DeltaSpecValidatorFs } from "../delta-spec-validator.js";

export interface DeltaSpecRuleInput {
  changePath: string;
  deps: DeltaSpecValidatorFs;
  requestType?: string;
}

export interface DeltaSpecRule {
  name: string;
  severity: "error" | "warning";
  check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]>;
}
```

### 4.2 Create `src/core/spec/rules/registry.ts`

`DeltaSpecRuleRegistry` — async 版の registry:

```ts
export class DeltaSpecRuleRegistry {
  private rules: DeltaSpecRule[] = [];

  register(rule: DeltaSpecRule): void {
    if (this.rules.some(r => r.name === rule.name)) {
      throw new Error(`Duplicate rule name: ${rule.name}`);
    }
    this.rules.push(rule);
  }

  async validate(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    const violations: DeltaSpecViolation[] = [];
    for (const rule of this.rules) {
      violations.push(...await rule.check(input));
    }
    return violations;
  }
}
```

### 4.3 Create DSV rules (`src/core/spec/rules/`)

**`no-specs-for-required-type.ts`** (= 現状 Step 5):
- `TYPES_REQUIRING_SPECS` に `requestType` が含まれ、かつ specs/ に .md ファイルなし → `no-specs-for-required-type` violation
- fs deps 経由で readdir。既存ロジックをそのまま移植

**`no-legacy-flat-file.ts`** (= 現状 Step 1):
- `<changePath>/delta-spec.md` が存在 → `legacy-flat-file` violation
- readdir で topLevelEntries を走査。`delta-spec.md` を検出

**`no-legacy-flat-dir.ts`** (= 現状 Step 2):
- `<changePath>/delta-spec/*.md` → `legacy-flat-dir` violation

**`canonical-spec-structure.ts`** (= 現状 Step 3 + Step 4 統合):
- specs/ のエントリを走査:
  - `.delta.md` → `legacy-flat-file` violation
  - `.md` directly in specs/ → `non-canonical-path` violation
  - subdir → `spec.md` の存在・セクションヘッダ・Requirement block を検証
    - spec.md なし → subdir 内の .md を `non-canonical-path` violation
    - section header なし → `missing-requirements-section`
    - Requirement block なし → `empty-section`

### 4.4 Create `src/core/spec/rules/index.ts`

```ts
export function createDeltaSpecRegistry(): DeltaSpecRuleRegistry {
  const registry = new DeltaSpecRuleRegistry();
  registry.register(noLegacyFlatFile);
  registry.register(noLegacyFlatDir);
  registry.register(canonicalSpecStructure);
  return registry;
}
```

注意: `no-specs-for-required-type` は registry に含めない。D9 の設計決定に従い、`validateDeltaSpecPaths` で先に独立実行する。

### 4.5 Create rule unit tests (`tests/unit/core/spec/rules/`)

各 rule について:
- 違反する input → expected violation
- 違反しない input → 空 array

`no-specs-for-required-type.test.ts`, `no-legacy-flat-file.test.ts`, `no-legacy-flat-dir.test.ts`, `canonical-spec-structure.test.ts`

既存テストの `makeFsMock` helper を共有 util として切り出すか、各テストファイルにコピーする（軽量な後者を推奨）。

### 4.6 Verify

```bash
bun run typecheck && bun vitest run tests/unit/core/spec/rules/
```

---

## Task 5: DSV layer — `delta-spec-validator.ts` migration [x]

### 5.1 `src/core/spec/delta-spec-validator.ts` を修正

`validateDeltaSpecPaths` の内部を以下のように書き換え:

1. `no-specs-for-required-type` rule を先に実行（D9: 早期 return 保持）
2. violation があれば即 `{ ok: false, violations }` を return
3. violation なければ `createDeltaSpecRegistry()` で残り rule を validate
4. violation 結果から `{ ok: true }` or `{ ok: false, violations }` を構成

公開 API: `validateDeltaSpecPaths(changePath, deps, requestType?)` — シグネチャ・戻り値型とも変更なし。

既存の `DeltaSpecViolationReason`, `DeltaSpecViolation`, `DeltaSpecValidatorFs` 型はそのまま export 維持。

### 5.2 既存テストが green であることを確認

```bash
bun vitest run tests/unit/core/spec/delta-spec-validator.test.ts
```

改変不要で pass すること。

### 5.3 Verify full

```bash
bun run typecheck && bun vitest run tests/unit/core/spec/
```

---

## Task 6: Full regression check [x]

```bash
bun run typecheck && bun run test
```

全テスト green であること。

---

## Task 7: Delta spec 作成 [x]

### 7.1 `specrunner/changes/validation-rule-interface/specs/validation-rule-interface/spec.md`

`## ADDED Requirements` セクションで新規 capability の Requirement を記述。

### 7.2 `specrunner/changes/validation-rule-interface/specs/request-md-parser/spec.md`

`## MODIFIED Requirements` セクションで「validation 経路が RuleRegistry を経由する」旨を記述。

---

## Execution Order

```
Task 1 (foundation)
  ↓
Task 2 (parser rules)
  ↓
Task 3 (parser migration)
  ↓
Task 4 (dsv rules)
  ↓
Task 5 (dsv migration)
  ↓
Task 6 (full regression)
  ↓
Task 7 (delta spec)
```

各 Task 完了時に typecheck + 該当テスト green を確認。Task 6 で全体 regression を検証。
