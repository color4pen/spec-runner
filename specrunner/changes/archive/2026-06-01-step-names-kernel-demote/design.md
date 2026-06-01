# Design: step-names-kernel-demote

## Context

`src/core/step/step-names.ts` は `STEP_NAMES` / `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` の共有定数を定義している。これらは pipeline 全体で使われる純粋な語彙であり、domain logic ではない。

現在 `src/config/migrate.ts` と `src/state/schema.ts` がここから import しているが、config / state は shared-kernel 層であり core（domain）を import するのは B-3 違反（上向き back-edge）。ADR structure-rulings D4 により kernel へ降格することが決定済み。

importers 一覧（grep 結果）:
- **B-3 違反（本 change で修正）**: `config/migrate.ts`, `state/schema.ts`
- **core/ 内部（変更不要）**: `core/pipeline/*`, `core/command/*`, `core/step/*`, `core/resume/*`, `core/pr-create/*`, `core/doctor/*` — 計 20+ ファイル
- **上位→domain（B-3 非該当、変更不要）**: `adapter/managed-agent/agent-runner.ts`, `cli/command-registry.ts`
- **テスト（変更不要）**: `tests/unit/core/step/step-names.test.ts`, `tests/unit/core/command/rules-new.test.ts`, `tests/unit/core/step/adr-gen.test.ts`

## Goals / Non-Goals

**Goals**:
- step-names 定数を `src/kernel/step-names.ts` に移動し、config/state の B-3 back-edge を解消する
- `arch-allowlist.ts` の R3 エントリ 2 件を削除する
- 型安全（`StepName` / `AgentStepName` / `CliStepName` union）を維持する

**Non-Goals**:
- core/ 内部の 20+ ファイルの import path を変更する（re-export barrel で吸収）
- R1 / R2 / R4 / B3-state-port / B3-state-helpers など他の burn-down
- 振る舞い変更

## Decisions

### D1: 配置先は `src/kernel/step-names.ts`（新規ディレクトリ）

既存の shared-kernel ディレクトリ（config, state, git, parser）はいずれもドメイン固有の責務を持ち、「pipeline step の名前定数」の自然な住処ではない。`src/kernel/` を新設し、shared-kernel 層の cross-cutting 共有定数を置く。

**Rationale**: config/ や state/ に置くと「なぜ step 定数が config にあるのか」が不明瞭。kernel/ は architecture model の shared-kernel 概念と 1:1 対応し、今後の shared-kernel 降格（R1 等）でも使える汎用的な配置先。

**Alternatives considered**:
- `src/config/step-names.ts` — config は設定解決の責務であり、純粋な定数定義の置き場としては不自然
- `src/shared/step-names.ts` — architecture model の語彙と一致しない

### D2: `src/core/step/step-names.ts` は re-export barrel に変換

```ts
export * from "../../kernel/step-names.js";
```

core/ 内部の 20+ ファイルの import path は変更しない。re-export は core → kernel の下向き依存であり B-3 に抵触しない。

**Rationale**: 差分最小化。core/ 内部の import を全て書き換えると 20+ ファイルに触れるが、振る舞い上の意味はなく review ノイズになる。

**Alternatives considered**:
- 全 importer を `kernel/step-names.ts` に書き換え — 変更ファイル数が膨大で risk に見合わない。将来 core/step/step-names.ts の re-export を消す cleanup は別 change で可能。

### D3: config/migrate.ts と state/schema.ts の import path のみ変更

この 2 ファイルだけが B-3 違反を構成しているので、この 2 ファイルの import を `../kernel/step-names.js` に書き換える。adapter/ や cli/ からの import は上位→domain で合法なので触らない。

### D4: arch-allowlist.ts の R3 エントリ 2 件を削除

`config/migrate.ts` と `state/schema.ts` の R3 tracking エントリを削除。ratchet test が機械的に完全性を検証する（R3 allowlist を消した状態で B-3 test が green ＝ back-edge 解消済み）。

## Risks / Trade-offs

- [Risk] re-export barrel 経由で tree-shaking が効かなくなる可能性 → **Mitigation**: step-names は定数のみ（3 export）で tree-shaking 対象になるほどのサイズではない。Bun bundler は re-export を inline する。
- [Risk] `src/kernel/` 新設で architecture model との乖離 → **Mitigation**: kernel/ は architecture model の shared-kernel 概念そのもの。model.md の shared-kernel 層一覧に kernel/ を追加すべきだが、model.md 更新は本 change のスコープ外（振る舞い変更なし）。

## Open Questions

なし（全決定は ADR structure-rulings D4 により裏付け済み）。
