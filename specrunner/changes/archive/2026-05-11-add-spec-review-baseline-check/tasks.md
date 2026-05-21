# Tasks: add-spec-review-baseline-check

## Task 1: DynamicContext に baselineSpecs フィールドを追加

**File**: `src/git/dynamic-context.ts`

**Changes**:
- `DynamicContext` interface に `baselineSpecs?: Record<string, string>` を追加
  - key: capability 名（例: `"spec-review-session"`）
  - value: baseline spec 全文（`specrunner/specs/<capability>/spec.md` の内容）
  - optional — 既存の collectDynamicContext() は設定しない（enrichContext が設定する）

**Acceptance**:
- [x] `DynamicContext` に `baselineSpecs` フィールドが存在する
- [x] 既存コードに影響なし（optional フィールド追加のみ）

---

## Task 2: AgentStep interface に enrichContext を追加

**File**: `src/core/step/types.ts`

**Changes**:
- `AgentStep` interface に以下を追加:
  ```typescript
  /**
   * Enrich dynamic context with step-specific data before buildMessage is called.
   * Async — I/O is allowed (unlike buildMessage which is pure).
   * Returns a new DynamicContext with additional fields populated.
   * When absent, adapter skips enrichment and uses the original dynamicContext as-is.
   */
  enrichContext?(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext>;
  ```
- DynamicContext の import を追加: `import type { DynamicContext } from "../../git/dynamic-context.js";`

**Acceptance**:
- [x] `enrichContext` が AgentStep に optional メソッドとして定義されている
- [x] シグネチャ: `(dynamicContext: DynamicContext, cwd: string, slug: string) => Promise<DynamicContext>`

---

## Task 3: 両 adapter に enrichContext 呼び出しを追加

### Task 3a: ClaudeCodeRunner

**File**: `src/adapter/claude-code/agent-runner.ts`

**Changes**:
- Line 99-100 の間（stepCtx 構築後、buildMessage 呼び出し前）に挿入:
  ```typescript
  if (step.enrichContext) {
    const enriched = await step.enrichContext(stepCtx.dynamicContext!, cwd, ctx.slug);
    stepCtx = { ...stepCtx, dynamicContext: enriched };
  }
  ```
- `stepCtx` を `const` から `let` に変更（再代入するため）

### Task 3b: ManagedAgentRunner

**File**: `src/adapter/managed-agent/agent-runner.ts`

**Changes**:
- Line 303-305 の間（stepCtx 構築後、buildMessage 呼び出し前）に挿入:
  ```typescript
  if (step.enrichContext) {
    const enriched = await step.enrichContext(stepCtx.dynamicContext!, cwd, ctx.slug);
    stepCtx = { ...stepCtx, dynamicContext: enriched };
  }
  ```
- `stepCtx` を `const` から `let` に変更（再代入するため）
- `cwd` は `ctx.cwd` を参照

**Acceptance**:
- [x] 両 adapter で enrichContext が buildMessage の前に呼ばれている
- [x] enrichContext がない Step では既存動作に影響なし
- [x] enrichContext のエラーは catch せずそのまま伝播（StepExecutor の既存エラーハンドリングに委ねる）

---

## Task 4: SpecReviewStep に enrichContext を実装

**File**: `src/core/step/spec-review.ts`

**Changes**:
- `enrichContext` メソッドを SpecReviewStep に追加:
  1. `specrunner/changes/<slug>/specs/` ディレクトリの存在を確認。なければ dynamicContext をそのまま返す
  2. specs/ の子ディレクトリを列挙（= capability 名リスト）
  3. 各 capability に対応する `specrunner/specs/<capability>/spec.md` を読み取る
  4. 読み取れたファイルを `Record<string, string>` に格納
  5. `{ ...dynamicContext, baselineSpecs }` を返す

- import 追加（パスは `src/core/step/spec-review.ts` からの相対パスであり、実際のディレクトリ構造に合わせて implementer が確認すること）:
  - `import * as fs from "node:fs/promises";`
  - `import * as path from "node:path";`
  - `import { changeFolderPath, baselineSpecPath } from "../../util/paths.js";`
  - 既存の `import { specReviewResultPath } from "../../util/paths.js"` がある場合は named import を追加する形にまとめること

- 実装例:
  ```typescript
  async enrichContext(dynamicContext, cwd, slug) {
    const specsDir = path.join(cwd, changeFolderPath(slug), "specs");
    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true });
      const capabilities = entries.filter(e => e.isDirectory()).map(e => e.name);
      if (capabilities.length === 0) return dynamicContext;

      const baselineSpecs: Record<string, string> = {};
      for (const cap of capabilities) {
        const baselinePath = path.join(cwd, baselineSpecPath(cap));
        try {
          baselineSpecs[cap] = await fs.readFile(baselinePath, "utf-8");
        } catch {
          // baseline が存在しない capability（新規）はスキップ
        }
      }
      return { ...dynamicContext, baselineSpecs };
    } catch {
      // specs/ ディレクトリが存在しない場合はそのまま返す
      return dynamicContext;
    }
  },
  ```

**Acceptance**:
- [x] delta spec の capability に対応する baseline spec を収集する
- [x] specs/ がない場合は dynamicContext をそのまま返す
- [x] baseline が存在しない capability（新規追加）はスキップする
- [x] buildMessage の pure function 制約を侵害しない

---

## Task 5: spec-review プロンプトに baseline 整合性チェック指示とテンプレート変数を追加

**File**: `src/prompts/spec-review-system.ts`

### Task 5a: system prompt に baseline 整合性チェック指示を追加

- `SPEC_REVIEW_SYSTEM_PROMPT` の `## Important Constraints` セクションの前に以下のセクションを追加:

  ```
  ## Baseline Spec Consistency Check

  When baseline specs are provided in the initial message, verify the following:

  1. **MODIFIED requirements**: Each Requirement header in the MODIFIED section of the delta spec MUST exist in the corresponding baseline spec. If a MODIFIED requirement references a name that does not exist in the baseline, report as HIGH severity finding (category: consistency).

  2. **REMOVED requirements**: Each Requirement header in the REMOVED section MUST exist in the corresponding baseline spec. If a REMOVED requirement references a name that does not exist in the baseline, report as HIGH severity finding (category: consistency).

  3. **ADDED requirements**: Each Requirement header in the ADDED section MUST NOT already exist in the corresponding baseline spec. If an ADDED requirement duplicates an existing baseline requirement name, report as HIGH severity finding (category: consistency).

  If no baseline specs are provided, skip this check entirely.
  ```

### Task 5b: 初期メッセージテンプレートに baseline spec セクションを追加

- `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` の `{{GIT_PUSH_INSTRUCTION}}` の前に `{{BASELINE_SPECS}}` を追加

- `SpecReviewPromptInput` interface に追加:
  ```typescript
  /** Baseline spec content keyed by capability name. Injected by enrichContext. */
  baselineSpecs?: Record<string, string>;
  ```

- `buildSpecReviewInitialMessage` にテンプレート変数の展開ロジックを追加:
  ```typescript
  let baselineSpecsSection = "";
  if (input.baselineSpecs && Object.keys(input.baselineSpecs).length > 0) {
    const sections = Object.entries(input.baselineSpecs)
      .map(([cap, content]) => `### Capability: ${cap}\n\n${content}`)
      .join("\n\n---\n\n");
    baselineSpecsSection = `\n<baseline-specs>\n${sections}\n</baseline-specs>\n`;
  }
  ```

### Task 5c: SpecReviewStep.buildMessage で baselineSpecs を渡す

**File**: `src/core/step/spec-review.ts`

- `buildMessage` 内の `buildSpecReviewInitialMessage` 呼び出しに `baselineSpecs` を追加:
  ```typescript
  baselineSpecs: deps.dynamicContext?.baselineSpecs,
  ```

**Acceptance**:
- [x] system prompt に baseline 整合性チェックの指示がある
- [x] 初期メッセージに baseline spec の内容が含まれる（baselineSpecs がある場合）
- [x] baselineSpecs がない場合は空文字列に展開される（テンプレート変数が残らない）
- [x] DynamicContext の import が不要（baselineSpecs は SpecReviewPromptInput 経由で渡される）

---

## Task 6: 型チェックとテストの確認

**Commands**:
```bash
bun run typecheck
bun run test
```

**Acceptance**:
- [x] 型エラーなし
- [x] 全テスト pass

---

## Implementation Order

Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6

Task 1-2 は型定義のみ（他タスクの前提）。Task 3-5 は独立して実装可能だが、Task 4 が Task 5c に先行する必要がある（enrichContext が baselineSpecs を設定し、buildMessage がそれを参照するため）。
