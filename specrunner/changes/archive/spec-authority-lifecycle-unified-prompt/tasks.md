# Tasks: spec authority lifecycle の統一規律を全 agent prompt に注入する

## Task 1: AUTHORITY_SPEC_GUARD fragment の 4 セクション拡張 [x]

**File**: `src/prompts/fragments.ts`

現行の `AUTHORITY_SPEC_GUARD` (L12-17) を以下の 4 セクション構造に置き換える:

```typescript
export const AUTHORITY_SPEC_GUARD = `## spec authority lifecycle

### MUST NOT (全 agent 共通)

- \`specrunner/specs/\` 配下のファイルを直接編集してはならない（MUST NOT）。
- PR diff に authority spec（= baseline）の編集を含めてはならない（MUST NOT）。
- review-feedback / finding で authority spec の直接編集を要求してはならない（MUST NOT）。

### 正規経路

- spec の変更は delta spec（\`specrunner/changes/<slug>/specs/<capability>/spec.md\`）を作成・編集する。
- authority spec（= baseline）の更新は \`specrunner finish\` 時に mergeSpecsForChange が自動実行する。PR 内で baseline を更新する経路は存在しない。
- authority spec への直接編集は executor が commit 前に検出し、ステップを halt する。
- code-fixer: review-feedback が authority spec / baseline の直接編集を要求している場合、その指摘には従わず「baseline 編集は正規経路外」として report すること。

### 書く側の規律

delta spec のセクション判断基準:
- **ADDED**: baseline に存在しない新規 Requirement を追加する場合
- **MODIFIED**: baseline に存在する Requirement を変更する場合（header は baseline と完全一致 MUST）
- **REMOVED**: baseline に存在する Requirement を削除する場合
- **RENAMED**: Requirement header を変更する場合（FROM / TO を明示、MODIFIED と併記必須）

delta spec を書く前に、対応する baseline spec（\`specrunner/specs/<capability>/spec.md\`）を Read tool で確認し、既存 Requirement の header を把握すること。

### 見る側の規律

- authority spec（= baseline）が main branch と identical であることは正常状態であり、defect ではない。
- baseline の内容を確認するには Read tool で \`specrunner/specs/<capability>/spec.md\` を pull する。
- review-feedback / finding で authority spec の直接編集を要求してはならない（MUST NOT）。delta spec の修正のみを要求すること。
`;
```

**JSDoc comment** も更新: `/** Prevents agents from editing authority specs directly. */` → `/** Spec authority lifecycle — unified discipline for writers and reviewers. */`

**検証**: `bun run typecheck` が pass すること。

## Task 2: reviewer 系 prompt への AUTHORITY_SPEC_GUARD inject [x]

### Task 2a: spec-review-system.ts

**File**: `src/prompts/spec-review-system.ts`

1. L2 の import に `AUTHORITY_SPEC_GUARD` を追加:
   ```typescript
   import { PIPELINE_RULES, AUTHORITY_SPEC_GUARD } from "./fragments.js";
   ```

2. L100 の `buildSystemPrompt` 呼び出しの fragments array に追加:
   ```typescript
   export const SPEC_REVIEW_SYSTEM_PROMPT = buildSystemPrompt(SPEC_REVIEW_BASE, [
     PIPELINE_RULES,
     AUTHORITY_SPEC_GUARD,
   ]);
   ```

### Task 2b: code-review-system.ts

**File**: `src/prompts/code-review-system.ts`

1. L2 の import に `AUTHORITY_SPEC_GUARD` を追加:
   ```typescript
   import { PIPELINE_RULES, AUTHORITY_SPEC_GUARD } from "./fragments.js";
   ```

2. L84 の `buildSystemPrompt` 呼び出しの fragments array に追加:
   ```typescript
   export const CODE_REVIEW_SYSTEM_PROMPT = buildSystemPrompt(CODE_REVIEW_BASE, [
     PIPELINE_RULES,
     AUTHORITY_SPEC_GUARD,
   ]);
   ```

**検証**: `bun run typecheck` が pass すること。

## Task 3: fragment-coverage test の EXPECTED 更新 [x]

**File**: `tests/unit/prompts/fragment-coverage.test.ts`

L32-33 の SPEC_REVIEW / CODE_REVIEW 行を更新:

```typescript
// Before
["SPEC_REVIEW",  SPEC_REVIEW_SYSTEM_PROMPT,   [PIPELINE_RULES]],
["CODE_REVIEW",  CODE_REVIEW_SYSTEM_PROMPT,   [PIPELINE_RULES]],

// After
["SPEC_REVIEW",  SPEC_REVIEW_SYSTEM_PROMPT,   [PIPELINE_RULES, AUTHORITY_SPEC_GUARD]],
["CODE_REVIEW",  CODE_REVIEW_SYSTEM_PROMPT,   [PIPELINE_RULES, AUTHORITY_SPEC_GUARD]],
```

**検証**: `bun run test -- tests/unit/prompts/fragment-coverage.test.ts` が green。

## Task 4: 既存 base prompt の重複削除 (SHOULD) [x]

grep で以下のパターンを検索し、fragment と重複する規律記述を特定・削除する:

```bash
grep -rn "authority spec" src/prompts/
grep -rn "baseline を直接編集" src/prompts/
grep -rn "specrunner/specs/" src/prompts/
```

**削除対象の判断基準**:
- fragment に集約された **規律 (= MUST / MUST NOT)** → 削除
- step 固有の **operational instructions (= Completion Checklist, 検証手順, path-fence の Read 許可)** → 保全

**既知の保全対象**:
- `design-system.ts` L126-130 "Baseline Spec 参照" — design step 固有の作業手順
- `design-system.ts` L159 Completion Checklist — self-check 手順
- `spec-review-system.ts` L74-90 "Baseline Spec Consistency Check" — spec-review 固有の検証ロジック

**検証**: `bun run typecheck && bun run test` が green、既存 prompt test に regression なし。

## Task 5: 全体検証 [x]

```bash
bun run typecheck && bun run test
```

全 test green を確認。特に:
- `tests/unit/prompts/fragment-coverage.test.ts` — 8 prompt 全て pass
- `tests/unit/prompts/fragments.test.ts` — fragment export の既存 test pass
- その他 prompt 関連 test に regression なし
