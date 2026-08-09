# Anthropic step 既定モデルの世代更新: sonnet-4-6 → sonnet-5、design opus-4-6[1m] → opus-5

## Meta

- **type**: spec-change
- **slug**: anthropic-step-model-refresh
- **base-branch**: main
- **adr**: false

## 背景

pipeline 各 step の既定モデルは claude-sonnet-4-6(design step のみ claude-opus-4-6[1m])で固定されている。Claude 5 世代(claude-sonnet-5 / claude-opus-5)が利用可能になり、registry・pricing への追加は request `model-catalog-refresh` で完了済み。本 request は step 既定を新世代へ更新する。

- claude-sonnet-5: sonnet-4-6 と同定価($3/$15)で coding / agentic 品質が大幅向上(旧 Opus 級)。2026-08-31 まで introductory 価格 $2/$10
- claude-opus-5: opus-4-8 と同定価($5/$25)で opus-4-6 より上位。1M context がデフォルトのため `[1m]` SKU 指定が不要になる

**本 request は request `model-catalog-refresh`(registry への claude-sonnet-5 / claude-opus-5 追加)の merge 後にのみ実行可能。** registry に無いモデル名を step 既定にすると dispatch 時の `resolveProvider` が `CONFIG_INVALID` で throw する。

## 現状コードの前提

- 以下 13 箇所の step 既定定数が `"claude-sonnet-4-6"`:
  - src/core/step/test-case-gen.ts:12 `TEST_CASE_GEN_AGENT_MODEL`
  - src/core/step/build-fixer.ts:16 `BUILD_FIXER_AGENT_MODEL`
  - src/core/step/code-fixer.ts:22 `CODE_FIXER_AGENT_MODEL`
  - src/core/step/adr-gen.ts:16 `ADR_GEN_AGENT_MODEL`
  - src/core/step/spec-fixer.ts:14 `SPEC_FIXER_AGENT_MODEL`
  - src/core/step/implementer.ts:19 `IMPLEMENTER_AGENT_MODEL`
  - src/core/step/custom-reviewer.ts:37 `DEFAULT_REVIEW_MODEL`
  - src/core/step/conformance.ts:11 `CONFORMANCE_AGENT_MODEL`
  - src/core/step/spec-review.ts:16 `SPEC_REVIEW_AGENT_MODEL`
  - src/core/step/request-review.ts:17 `REQUEST_REVIEW_AGENT_MODEL`
  - src/core/step/test-materialize.ts:13 `TEST_MATERIALIZE_AGENT_MODEL`
  - src/core/step/regression-gate.ts:48 `DEFAULT_REVIEW_MODEL`
  - src/core/step/code-review.ts:14 `CODE_REVIEW_AGENT_MODEL`
- src/core/step/design.ts:16 `DESIGN_AGENT_MODEL = "claude-opus-4-6[1m]"`
- src/config/model-registry.ts `PROVIDER_DEFAULTS.anthropic = { defaultModel: "claude-sonnet-4-6" }`(designModel は意図的に省略 — design.ts の built-in 既定に委譲、同ファイルの説明コメントが claude-opus-4-6[1m] を名指し。行番号は model-catalog-refresh の merge で変動しうる)
- src/config/model-registry.ts `DEFAULT_ONE_SHOT_MODEL = "claude-sonnet-4-5"`
- src/cli/init.ts:117 のコメントが design.ts の claude-opus-4-6[1m] 既定を名指し
- src/core/command/reviewers-new.ts:25 の scaffold コメント例が `# model: claude-sonnet-4-6`
- 既定値を pin する既存テストが `tests/` 直下に存在する(本 request の意図的挙動変更に伴い期待値更新が必要):
  - tests/config/model-registry.test.ts:100-101 — `PROVIDER_DEFAULTS.anthropic.defaultModel` が `"claude-sonnet-4-6"` であることを assert
  - tests/init.test.ts:40, 102, 497, 512, 537 — anthropic scaffold 出力の `steps.defaults.model` が `"claude-sonnet-4-6"` であることを assert
  - tests/test-case-gen-step.test.ts:68-70 — `TestCaseGenStep.agent.model` が `"claude-sonnet-4-6"` であることを assert
- 一方、tests/init.test.ts:159, 236, 363, 525 の `claude-sonnet-4-6` は「既存 config の温存」を検証する入力 fixture であり、既定値変更の影響を受けない(変更しない)。`src/` 外の他テストの `model: "claude-sonnet-4-5"` 等も明示指定 fixture で同様
- `DEFAULT_ONE_SHOT_MODEL` と design 既定 `claude-opus-4-6[1m]` を直接 assert するテストは無い
- 各 step の model は dispatch 時に src/adapter/dispatching/agent-runner.ts:28 の `resolveProvider` で registry 照合される

## 要件

1. 上記 13 箇所の `"claude-sonnet-4-6"` step 既定定数をすべて `"claude-sonnet-5"` に更新する。
2. src/core/step/design.ts の `DESIGN_AGENT_MODEL` を `"claude-opus-5"` に更新する(claude-opus-5 は 1M context がデフォルトのため `[1m]` サフィックスは付けない)。
3. `PROVIDER_DEFAULTS.anthropic.defaultModel` を `"claude-sonnet-5"` に更新する。designModel は引き続き省略(design.ts の built-in 既定に委譲する現行構造を維持)し、省略理由を説明するコメント内のモデル名を claude-opus-5 に追随させる。
4. `DEFAULT_ONE_SHOT_MODEL` を `"claude-sonnet-5"` に更新する。
5. 旧モデル名を名指しする周辺コメント(src/cli/init.ts:117、src/core/step/test-case-gen.ts:21 の Design D2 注記など、変更対象定数に付随するもの)を新モデル名に追随させる。コメント内の設計根拠(「design-reading task; Opus is overkill」等)は維持する。
6. src/core/command/reviewers-new.ts の scaffold コメント例を `# model: claude-sonnet-5` に更新する。

## スコープ外

- step prompt(system 文)の Claude 5 世代向け再調整 — 既存プロンプトのまま運用し、挙動劣化が観測された場合に別 request で対応
- openai 側の step 既定・PROVIDER_DEFAULTS — request `model-catalog-refresh` で対応済み
- registry / pricing の変更 — request `model-catalog-refresh` で対応済み
- config で明示指定された user 側モデル設定の移行(user config は本 request の対象外)
- テスト fixture 内の明示モデル指定(`model: "claude-sonnet-4-6"` 等)の書き換え — 既定値でなく明示値のテストであり、挙動固定の意図を保つため変更しない

## 受け入れ基準

- [ ] `src/core/step/` `src/config/` `src/core/command/` に文字列 `claude-sonnet-4-6` / `claude-opus-4-6[1m]` / `claude-sonnet-4-5` が残存しないことを grep で確認する(テストファイルの fixture は除外)
- [ ] 既存テスト無変更で green。ただし旧既定値を pin する以下 3 ファイルの expectation 更新のみ、意図的挙動変更への追随として許容する: tests/config/model-registry.test.ts(anthropic.defaultModel)、tests/init.test.ts(anthropic scaffold 出力の expectation。入力 fixture 行 159/236/363/525 は変更しない)、tests/test-case-gen-step.test.ts(TestCaseGenStep.agent.model)
- [ ] `typecheck && test` が green

## 外部事実(本 request が正とする値)

- claude-sonnet-5 定価 $3/$15(USD/MTok、2026-08-31 まで intro $2/$10)。sonnet-4-6 と同定価だが tokenizer 変更により同一テキストで約 +30% トークン consumption → 定価適用後の実質 step コストは約 3 割増
- claude-opus-5 定価 $5/$25。opus-4-6 と同定価で、1M context window がデフォルト(`[1m]` の SKU 区別が存在しない)
- 移行ガイド上、既存プロンプトは Claude 5 世代でも概ね良好に動作する(プロンプト再調整は必須でない)

## architect 評価済みの設計判断

- **sonnet 系 13 箇所を一括で sonnet-5 に更新(段階移行しない)**: 既定値は 1 世代 1 値が原則。step ごとに世代を混在させると usage 比較・障害切り分けが複雑になる。品質敏感 step のみ先行する案は却下 — 全 step 一括のほうが挙動変化の観測が単純。
- **design は opus-5(fable-5 ではなく)**: fable-5 は $10/$50 で opus-5 の 2 倍、かつ安全 classifier による refusal 経路が pipeline の escalation 設計と未整合。コスト・安定性から opus-5 を採用。
- **`[1m]` サフィックスを落とす**: claude-opus-5 は 1M context がデフォルトであり、存在しない SKU 区別を持ち込まない。pricing 表にも claude-opus-5 の `[1m]` 行は無い(model-catalog-refresh の設計と整合)。
- **DEFAULT_ONE_SHOT_MODEL も同時更新**: one-shot query は小粒で単価影響が僅少、世代を registry 既定と揃えることで「既定は 1 世代」の原則を保つ。
- **テスト fixture の旧モデル名は温存**: fixture は「明示指定が既定に勝つ」ことを検証しており、モデル名自体に意味はない。書き換えると diff が肥大しレビュー焦点が濁る。
