# AgentStepName と AGENT_STEP_NAMES の手動同期を compile-time enforcement に置き換える

## Meta

- **type**: refactoring
- **slug**: step-name-compile-guard
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`src/kernel/agent-definition.ts` の `AgentStepName` 型（literal union）と `src/kernel/step-names.ts` の `AGENT_STEP_NAMES` 配列（runtime 値）が手動で同期されている。コメントに「Kept in sync with」とあるが、compile-time enforcement がなく、一方に step を足して他方を忘れても型エラーにならない。

## 要件

1. `AgentStepName` 型と `AGENT_STEP_NAMES` 配列の整合性を compile-time で保証する。片方に値を足してもう片方に足し忘れた場合に型エラーになる仕組みを入れる。
2. kernel の zero-import 原則を維持する（agent-definition.ts は外部を import しない）。

## スコープ外

- step の追加・削除。
- StepName（全 step 名）の同様の整合性保証（スコープは AgentStepName のみ）。

## 受け入れ基準

- [ ] `AGENT_STEP_NAMES` に存在して `AgentStepName` に存在しない値、またはその逆がある場合に `bun run typecheck` が fail する
- [ ] kernel の zero-import 原則が維持されている
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- kernel の zero-import を維持するため、`AgentStepName` を agent-definition.ts に残したまま、step-names.ts 側で `satisfies readonly AgentStepName[]` + 網羅性チェック（`typeof AGENT_STEP_NAMES[number] extends AgentStepName` かつ逆方向）を入れる方式が自然。具体的な型テクニックは implementer に委ねる。
