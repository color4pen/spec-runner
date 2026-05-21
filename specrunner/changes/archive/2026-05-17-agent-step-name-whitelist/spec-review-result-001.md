# Spec Review Result: agent-step-name-whitelist

- **verdict**: approved
- **iteration**: 1
- **date**: 2026-05-17

## Architecture

**Pass.** ホワイトリスト列挙方式への反転は正しい設計判断。

- 黒リスト (Exclude) は「追加忘れ」が silent failure になるのに対し、ホワイトリストは「追加しないと exhaustiveness test が fail する」safe-by-default 構造
- `step.kind` discriminated union はランタイム層で既に確立済み。型レベル名前集合だけが取り残されていた欠落を埋める変更であり、層間の責務分離を壊さない
- `config.agents` キー型の `Partial<Record<AgentStepName, AgentRecord>>` 化は config ↔ agent registry 間の型整合を強化する正しい方向
- `STEP_NAMES` object 形を維持する判断（30+ 箇所の参照無傷）は後方互換と変更スコープの両面で妥当。`Object.fromEntries` 合成による literal type 消失の回避も正しい

## Correctness

**Pass.** 論理・境界条件・エッジケースに問題なし。

- `AGENT_STEP_NAMES` 9 項目 + `CLI_STEP_NAMES` 3 項目 = 12 項目は現在の `STEP_NAMES` の 12 エントリと一致
- `getAgentId.ts`, `registry.ts`, `syncer.ts`, `definition.ts` の型 narrowing は全て呼び出し元が AgentStep 経由であることをコードで確認済み — 実質的な型 narrowing であり behavioral change なし
- `migrate.ts` の `migrateConfig` 戻り値を `Record<string, AgentRecord>` に維持し、`applyMigration` の `as SpecRunnerConfig` cast で吸収する方針は正しい。migration 層は任意キーを扱う必要があるため型を緩く保つのが適切
- `managed.ts` の `Object.entries(config.agents ?? {})` は `Partial<Record<...>>` に対しても動作する。値の undefined 可能性は iterate 先で `record.agentId` アクセス前に存在が保証される文脈
- テスト戦略: disjoint / exhaustive / step-instance 整合 / type-level assertion の 4 軸で runtime + compile-time の両面を網羅

## Completeness (task decomposition coverage)

**Pass.** タスク分解は要件を網羅。

- Task 1-2: 配列定義 + 型導出
- Task 3: config schema 締め込み
- Task 4a-f: コンパイル波及の全箇所を特定・対処方針を記載
- Task 5: テスト 5 本（runtime 4 + type-level 1）
- Task 6: spec authority 更新
- Task 7: 最終検証

## Observations (non-blocking)

1. **Task 4d `syncer.ts`**: `rollback()` メソッドの引数型 `Array<{ role: StepName; ... }>` と `createdAgents` 配列の型も `AgentStepName` に narrowing が必要。タスクの L59 「自動推論で `AgentStepName[]` になることを確認」から連鎖的に解決されるが、実装時に見落とさないこと
2. **Delta spec**: baseline spec の他 Requirement（"StepName union includes implementation-layer steps" 等）にまだ `propose` 表記が残っているが、本 change のスコープ外であり正しくスキップされている
