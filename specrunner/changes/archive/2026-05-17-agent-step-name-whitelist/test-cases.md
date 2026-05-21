# Test Cases: agent-step-name-whitelist

Generated from: request.md / design.md / tasks.md  
Date: 2026-05-17

---

## TC-RT-01: AGENT_STEP_NAMES と CLI_STEP_NAMES が disjoint

- **Category**: Runtime — Array Integrity
- **Priority**: must
- **Source**: tasks.md TC-1 / request.md 要件5

**GIVEN** `step-names.ts` に `AGENT_STEP_NAMES` と `CLI_STEP_NAMES` が export されている  
**WHEN** `AGENT_STEP_NAMES.filter(n => CLI_STEP_NAMES.includes(n as any))` を実行する  
**THEN** 結果が空配列 `[]` である（重複エントリが存在しない）

---

## TC-RT-02: AGENT_STEP_NAMES ∪ CLI_STEP_NAMES が STEP_NAMES 値集合と一致

- **Category**: Runtime — Array Exhaustiveness
- **Priority**: must
- **Source**: tasks.md TC-2 / request.md 要件5

**GIVEN** `AGENT_STEP_NAMES`, `CLI_STEP_NAMES`, `STEP_NAMES` が `step-names.ts` から import できる  
**WHEN** `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].sort()` と `Object.values(STEP_NAMES).sort()` を比較する  
**THEN** 両配列が完全一致する（漏れも余りもない）

---

## TC-RT-03: 全 AgentStep インスタンスの name が AGENT_STEP_NAMES に含まれる

- **Category**: Runtime — Implementation Consistency
- **Priority**: must
- **Source**: tasks.md TC-3 / request.md 要件5

**GIVEN** pipeline に登録された全 step インスタンスが取得できる  
**WHEN** `kind === "agent"` のインスタンスだけを抽出し、各 `step.name` を確認する  
**THEN** 全ての `name` が `AGENT_STEP_NAMES` に含まれる

---

## TC-RT-04: 全 CliStep インスタンスの name が CLI_STEP_NAMES に含まれる

- **Category**: Runtime — Implementation Consistency
- **Priority**: must
- **Source**: tasks.md TC-4 / request.md 要件5

**GIVEN** pipeline に登録された全 step インスタンスが取得できる  
**WHEN** `kind === "cli"` のインスタンスだけを抽出し、各 `step.name` を確認する  
**THEN** 全ての `name` が `CLI_STEP_NAMES` に含まれる

---

## TC-TYPE-01: AgentStepName がすべての agent-resident step 名を受け付ける

- **Category**: Type System — Whitelist Acceptance
- **Priority**: must
- **Source**: request.md 要件2 / tasks.md TC-5

**GIVEN** `AgentStepName` が `typeof AGENT_STEP_NAMES[number]` で定義されている  
**WHEN** `"design"`, `"spec-review"`, `"spec-fixer"`, `"delta-spec-fixer"`, `"test-case-gen"`, `"implementer"`, `"build-fixer"`, `"code-review"`, `"code-fixer"` を `AgentStepName` 型変数に代入する  
**THEN** いずれもコンパイルエラーにならない

---

## TC-TYPE-02: AgentStepName が "verification" を拒否する

- **Category**: Type System — Whitelist Rejection
- **Priority**: must
- **Source**: request.md 要件2 / tasks.md TC-5

**GIVEN** `AgentStepName` がホワイトリスト方式で定義されている  
**WHEN** `const _bad: AgentStepName = "verification"` と書く  
**THEN** `@ts-expect-error` が有効になる（TypeScript が型エラーを報告する）

---

## TC-TYPE-03: AgentStepName が "pr-create" を拒否する

- **Category**: Type System — Whitelist Rejection
- **Priority**: must
- **Source**: request.md 要件2 / tasks.md TC-5

**GIVEN** `AgentStepName` がホワイトリスト方式で定義されている  
**WHEN** `const _bad: AgentStepName = "pr-create"` と書く  
**THEN** `@ts-expect-error` が有効になる（TypeScript が型エラーを報告する）

---

## TC-TYPE-04: AgentStepName が "delta-spec-validation" を拒否する

- **Category**: Type System — Whitelist Rejection
- **Priority**: must
- **Source**: request.md 要件2 / design.md D1 / PR #274 の失敗再現防止

**GIVEN** `AgentStepName` がホワイトリスト方式で定義されている  
**WHEN** `const _bad: AgentStepName = "delta-spec-validation"` と書く  
**THEN** `@ts-expect-error` が有効になる（PR #274 で再発した型ホールが封鎖されている）

---

## TC-TYPE-05: Extract<AgentStepName, CliStepName> が never になる

- **Category**: Type System — Disjoint Type Assertion
- **Priority**: must
- **Source**: request.md 要件5 (type-level disjoint verification)

**GIVEN** `AgentStepName` と `CliStepName` がそれぞれのホワイトリスト配列から派生している  
**WHEN** `type Overlap = Extract<AgentStepName, CliStepName>` を定義し、`never` への代入アサーションを行う  
**THEN** コンパイルエラーが発生しない（Overlap は never 型である）

---

## TC-CFG-01: config.agents が AgentStepName キーを受け付ける

- **Category**: Config Schema — Key Gate Acceptance
- **Priority**: must
- **Source**: request.md 要件3 / design.md D2

**GIVEN** `config.agents` の型が `Partial<Record<AgentStepName, AgentRecord>>` に変更されている  
**WHEN** `{ "design": { ... } }` または `{ "code-review": { ... } }` を `SpecrunnerConfig["agents"]` 型変数に代入する  
**THEN** コンパイルエラーにならない

---

## TC-CFG-02: config.agents が "delta-spec-validation" キーを拒否する

- **Category**: Config Schema — Key Gate Rejection
- **Priority**: must
- **Source**: request.md 要件3 / design.md D2 / PR #274 の型ホール封鎖

**GIVEN** `config.agents` の型が `Partial<Record<AgentStepName, AgentRecord>>` に変更されている  
**WHEN** `const _bad: SpecrunnerConfig["agents"] = { "delta-spec-validation": {} }` と書く  
**THEN** `@ts-expect-error` が有効になる（CliStep 名をキーに書けない）

---

## TC-CFG-03: config.agents が "verification" キーを拒否する

- **Category**: Config Schema — Key Gate Rejection
- **Priority**: must
- **Source**: request.md 要件3 / design.md D2

**GIVEN** `config.agents` の型が `Partial<Record<AgentStepName, AgentRecord>>` に変更されている  
**WHEN** `const _bad: SpecrunnerConfig["agents"] = { "verification": {} }` と書く  
**THEN** `@ts-expect-error` が有効になる

---

## TC-COMPAT-01: STEP_NAMES.<KEY> 形式の参照がすべてそのまま動く

- **Category**: Backward Compatibility
- **Priority**: must
- **Source**: request.md 設計判断4 / design.md D1 / tasks.md Task1

**GIVEN** `STEP_NAMES` object 形が `as const` 明示宣言で維持されている  
**WHEN** `STEP_NAMES.DESIGN`, `STEP_NAMES.VERIFICATION`, `STEP_NAMES.PR_CREATE` 等の既存参照を使用する  
**THEN** コンパイルエラーが発生せず、各値が正しいリテラル型 (`"design"`, `"verification"`, `"pr-create"`) を持つ

---

## TC-COMPAT-02: STEP_NAMES は Object.fromEntries で合成されていない

- **Category**: Backward Compatibility — Literal Type Preservation
- **Priority**: must
- **Source**: request.md 設計判断4 / design.md D1

**GIVEN** `STEP_NAMES` が明示宣言形式 (`{ DESIGN: "design", ... } as const`) で定義されている  
**WHEN** `typeof STEP_NAMES.DESIGN` を評価する  
**THEN** 型が `string` ではなく `"design"` リテラル型である（`Object.fromEntries` 合成を使っていないことの確認）

---

## TC-COMPAT-03: 既存の AgentStepName 参照箇所がコンパイル整合する

- **Category**: Backward Compatibility — Compilation
- **Priority**: must
- **Source**: request.md 要件7 / tasks.md Task4

**GIVEN** `src/` および `tests/` 内の `AgentStepName` 参照箇所すべてが新しいホワイトリスト定義を使う  
**WHEN** `bun run typecheck` を実行する  
**THEN** 0 errors（全参照箇所でコンパイルエラーが出ない）

---

## TC-NARROW-01: getAgentId の role param が AgentStepName に narrowing される

- **Category**: Type Narrowing — Downstream API
- **Priority**: should
- **Source**: design.md D2 / tasks.md Task 4a

**GIVEN** `src/config/getAgentId.ts` の `role` param が `StepName` から `AgentStepName` に変更されている  
**WHEN** CliStep の `role`（例: `"verification"`）を `getAgentId` に渡す呼び出しを書く  
**THEN** コンパイルエラーになる（型が正しく絞り込まれている）

---

## TC-NARROW-02: AgentDefinition.role が AgentStepName に narrowing される

- **Category**: Type Narrowing — Downstream API
- **Priority**: should
- **Source**: design.md D2 / tasks.md Task 4b

**GIVEN** `src/core/agent/definition.ts` の `role` フィールドが `AgentStepName` に変更されている  
**WHEN** `role: "pr-create"` で `AgentDefinition` を構築しようとする  
**THEN** コンパイルエラーになる

---

## TC-NARROW-03: AgentRegistry の Map キーと get/hashOf param が AgentStepName

- **Category**: Type Narrowing — Downstream API
- **Priority**: should
- **Source**: design.md D2 / tasks.md Task 4c

**GIVEN** `src/core/agent/registry.ts` の `Map<AgentStepName, AgentDefinition>` と各メソッド param が変更されている  
**WHEN** `registry.get("verification")` または `registry.hashOf("pr-create")` を呼ぶコードを書く  
**THEN** コンパイルエラーになる

---

## TC-NARROW-04: syncer.getStoredAgent の role param が AgentStepName

- **Category**: Type Narrowing — Downstream API
- **Priority**: should
- **Source**: design.md D2 / tasks.md Task 4d

**GIVEN** `src/core/agent/syncer.ts` の `getStoredAgent(role: AgentStepName)` に変更されている  
**WHEN** CliStep 名を渡す呼び出しを書く  
**THEN** コンパイルエラーになる

---

## TC-MIGRATE-01: migrate.ts の型不一致が安全に吸収される

- **Category**: Migration Safety — Type Cast
- **Priority**: should
- **Source**: design.md D2 / tasks.md Task 4e

**GIVEN** `src/config/migrate.ts` の `migrateConfig` 戻り値が `Record<string, AgentRecord>` を維持しており、`applyMigration` 内で `as SpecRunnerConfig` cast が使われている  
**WHEN** `bun run typecheck` を実行する  
**THEN** migrate.ts 関連で型エラーが発生しない

---

## TC-SPEC-01: spec.md の AgentStepName 説明がホワイトリスト方式に更新されている

- **Category**: Spec Authority
- **Priority**: should
- **Source**: request.md 要件8 / tasks.md Task6

**GIVEN** `specrunner/specs/pipeline-orchestrator/spec.md` が更新されている  
**WHEN** L281 周辺の `AgentStepName` 定義記述を確認する  
**THEN** `Exclude<StepName, ...>` の記述がなく、「`AgentStepName` is derived from `AGENT_STEP_NAMES` whitelist」という記述になっている

---

## TC-SPEC-02: spec.md の Scenario に delta-spec-validation と delta-spec-fixer / test-case-gen が含まれる

- **Category**: Spec Authority
- **Priority**: should
- **Source**: request.md 要件8

**GIVEN** `spec.md` の Scenario が更新されている  
**WHEN** AgentStepName の受け入れ Scenario と拒否 Scenario を確認する  
**THEN** agent-resident 一覧に `delta-spec-fixer` / `test-case-gen` が含まれ、NOT assignable 側に `delta-spec-validation` が含まれる

---

## TC-SPEC-03: spec.md の "propose" が "design" に修正されている

- **Category**: Spec Authority — Stale Reference Fix
- **Priority**: should
- **Source**: request.md 要件8 (旧名残存の修正)

**GIVEN** `spec.md` が更新されている  
**WHEN** AgentStepName Scenario 内の step 名一覧を確認する  
**THEN** `"propose"` という記述が存在せず `"design"` が使われている

---

## TC-SPEC-04: spec.md に「新 CliStep 追加時の型エラー」Scenario が追加されている

- **Category**: Spec Authority — New Scenario
- **Priority**: could
- **Source**: request.md 要件8

**GIVEN** `spec.md` が更新されている  
**WHEN** 新規 Scenario 一覧を確認する  
**THEN** 「新 step を `AGENT_STEP_NAMES` にも `CLI_STEP_NAMES` にも追加しないと test が fail する」という趣旨の Scenario が存在する

---

## TC-BUILD-01: bun run typecheck が 0 errors でパスする

- **Category**: Build Verification
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task7

**GIVEN** Task 1〜6 のすべての変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラー件数が 0 である

---

## TC-BUILD-02: bun run test が green になる

- **Category**: Build Verification
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task7

**GIVEN** Task 5 の新規テストを含むすべてのテストファイルが存在する  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する（TC-1〜TC-5 を含む）

---

## TC-EXPORT-01: AGENT_STEP_NAMES と CLI_STEP_NAMES が named export されている

- **Category**: API Surface
- **Priority**: must
- **Source**: request.md 受け入れ基準

**GIVEN** `src/core/step/step-names.ts` が変更されている  
**WHEN** `import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from ".../step-names.js"` を書く  
**THEN** コンパイルエラーにならず、各配列が `readonly` タプル型として使用できる

---

## TC-EXPORT-02: CliStepName が schema.ts から export されている

- **Category**: API Surface
- **Priority**: must
- **Source**: request.md 受け入れ基準

**GIVEN** `src/state/schema.ts` が変更されている  
**WHEN** `import type { CliStepName } from ".../schema.js"` を書く  
**THEN** コンパイルエラーにならず、`CliStepName` が `"verification" | "pr-create" | "delta-spec-validation"` と等価な型として使用できる
