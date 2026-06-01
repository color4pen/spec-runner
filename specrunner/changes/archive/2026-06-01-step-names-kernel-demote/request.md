# step-names を kernel へ降格し config/state の back-edge（B-3 / R3）を切る

## Meta

- **type**: refactoring
- **slug**: step-names-kernel-demote
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

ADR `2026-05-31-structure-rulings`（D4）と `architecture/model.md` §5（R3）が「`step-names` を `core/step`→shared-kernel へ降格」を決定済み。現状の divergence:

- `src/core/step/step-names.ts` が `STEP_NAMES` / `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` を定義。
- `src/config/migrate.ts:13` と `src/state/schema.ts:15` がそれを import = kernel（config / state）→ domain（core/step）の**上向き back-edge＝B-3 違反**。

full ratchet（PR #483）が `arch-allowlist.ts` の **R3（B-3）エントリ**（`config/migrate.ts` / `state/schema.ts`）で凍結中。本 change はこれを解消し当該エントリを削除する。

## 要件

1. `step-names`（`STEP_NAMES` 系の共有定数）を `core/step/` から **kernel（共有定数の置き場）へ降格**する。`core/step`・`config`・`state` はそこから import（kernel への下向き＝allowed）に統一する。※既存 kernel dir（config/state/git/parser 等）に共有定数の自然な住処が無いため **`src/kernel/step-names.ts` の新設が想定される**（最終配置は design で確定）。
2. 全 importer を更新する（step-names は広く import される）。`StepName` / `AgentStepName` / `CliStepName` の型導出が壊れないよう維持。
3. `tests/unit/architecture/arch-allowlist.ts` の **R3（invariant B-3）エントリを削除**する。

## スコープ外

- 他の burn-down（R1 / R2 / R4）。
- ratchet が surface した **`B3-state-port`（`state/schema.ts`→`core/port` の ModelUsage 等）・`B3-state-helpers`** は step-names とは**別 edge**なので本 change の対象外（allowlist に残す。triage で別途判断）。
- **振る舞い変更**（純粋な共有定数の移動と import 経路変更のみ）。

## 受け入れ基準

- [ ] `src/config/` と `src/state/` が `src/core/step` を import しない（step-names 由来の B-3 違反が解消）
- [ ] `arch-allowlist.ts` の R3 エントリが削除され、enforcement suite が **green**
- [ ] `StepName` 系の型安全（whitelist 由来 union・`getAgentId` の AgentStepName 制約等）が維持
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **structure-rulings D4 を実行**: `step-names` は純粋な共有語彙（定数）であり kernel が自然な住処。core を頂点に片方向化する D4 の一部。
- **state の他 edge は対象外**: `state/schema.ts` は step-names 以外に `core/port` も import するが、それは別 tracking（`B3-state-port`）で本 change では触らない（scope と freeze 対象を一致させる＝#482 の教訓）。
- **ratchet が fix の完全性を機械強制**: R3 allowlist を消すと config/state→core/step が残れば B-3 test が red。
