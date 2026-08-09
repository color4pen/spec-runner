# Tasks: Anthropic step 既定モデルの世代更新

すべてのモデル名は `src/` 内で locate すること。行番号は request / attestation と drift
しうるため、**内容（const 名・文字列）で検索して置換**する。テスト fixture は変更しない。

## T-01: 非 design step 13 箇所の built-in default を claude-sonnet-5 に更新

- [x] `src/core/step/test-case-gen.ts` `TEST_CASE_GEN_AGENT_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/build-fixer.ts` `BUILD_FIXER_AGENT_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/code-fixer.ts` `CODE_FIXER_AGENT_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/adr-gen.ts` `ADR_GEN_AGENT_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/spec-fixer.ts` `SPEC_FIXER_AGENT_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/implementer.ts` `IMPLEMENTER_AGENT_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/custom-reviewer.ts` `DEFAULT_REVIEW_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/conformance.ts` `CONFORMANCE_AGENT_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/spec-review.ts` `SPEC_REVIEW_AGENT_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/request-review.ts` `REQUEST_REVIEW_AGENT_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/test-materialize.ts` `TEST_MATERIALIZE_AGENT_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/regression-gate.ts` `DEFAULT_REVIEW_MODEL` を `"claude-sonnet-5"` に
- [x] `src/core/step/code-review.ts` `CODE_REVIEW_AGENT_MODEL` を `"claude-sonnet-5"` に

**Acceptance Criteria**:
- 上記 13 const がすべて `"claude-sonnet-5"` を保持する。
- `grep -rnE 'claude-sonnet-4-6' src/core/step --include='*.ts' | grep -v '__tests__'` が
  この後 T-04 完了時点で 0 件になる（本 task 単独では test-case-gen.ts:21 コメントが T-04 で残る）。

## T-02: design step の built-in default を claude-opus-5 に更新

- [x] `src/core/step/design.ts` `DESIGN_AGENT_MODEL` を `"claude-opus-4-6[1m]"` →
      `"claude-opus-5"` に（`[1m]` サフィックスは付けない — claude-opus-5 は 1M context が
      デフォルトで SKU 区別が存在しない）

**Acceptance Criteria**:
- `DESIGN_AGENT_MODEL === "claude-opus-5"`。
- `src/core/step/design.ts` に `claude-opus-4-6[1m]` および `[1m]` サフィックス付きモデル名が
  残らない。

## T-03: model-registry.ts の scaffold 既定・one-shot 既定・省略理由コメントを更新

- [x] `PROVIDER_DEFAULTS.anthropic.defaultModel` を `"claude-sonnet-4-6"` →
      `"claude-sonnet-5"` に
- [x] `DEFAULT_ONE_SHOT_MODEL` を `"claude-sonnet-4-5"` → `"claude-sonnet-5"` に
- [x] `designModel` は**追加しない**（省略のまま維持。design.ts built-in へ委譲する現行構造）
- [x] `ProviderDefaults` interface の doc コメント内 `claude-opus-4-6[1m]` を `claude-opus-5` に
- [x] `PROVIDER_DEFAULTS` 直上の省略理由コメント内 `claude-opus-4-6[1m]` を `claude-opus-5` に
      （省略の設計意図の文言は維持）
- [x] `BUILTIN_MODEL_REGISTRY` の旧モデル key リテラル
      （`"claude-opus-4-6[1m]"` / `"claude-sonnet-4-6"` / `"claude-sonnet-4-5"`）は
      **削除・変更しない**（backward-compat / scope 外）

**Acceptance Criteria**:
- `PROVIDER_DEFAULTS.anthropic.defaultModel === "claude-sonnet-5"`、
  `PROVIDER_DEFAULTS.anthropic.designModel === undefined`。
- `DEFAULT_ONE_SHOT_MODEL === "claude-sonnet-5"`。
- `model-registry.ts` のコメントに `claude-opus-4-6[1m]` が残らない。
- `BUILTIN_MODEL_REGISTRY` は旧モデル key を保持したまま（`claude-sonnet-5` /
  `claude-opus-5` の存在も不変）。

## T-04: 周辺コメント・scaffold 例中の旧モデル名を追随

- [x] `src/cli/init.ts:117` 付近のコメント `claude-opus-4-6[1m]` → `claude-opus-5`
- [x] `src/core/step/test-case-gen.ts:21` 付近の Design D2 注記 `claude-sonnet-4-6` →
      `claude-sonnet-5`（「design-reading task; Opus is overkill」の根拠は維持）
- [x] `src/core/command/reviewers-new.ts:25` 付近の scaffold 例
      `# model: claude-sonnet-4-6` → `# model: claude-sonnet-5`

**Acceptance Criteria**:
- 上記 3 コメントが新モデル名を保持し、設計根拠の文言は残る。
- これらのコメントに旧モデル名が残らない。

## T-05: 旧既定値を pin する 3 テストの期待値のみ更新（fixture・preserve 期待値は据え置き）

**更新する（期待値・description）**:
- [x] `tests/config/model-registry.test.ts`: `PROVIDER_DEFAULTS.anthropic.defaultModel`
      の assert を `"claude-sonnet-5"` に。同 `it("anthropic.defaultModel is ...")` の
      description 文字列も `claude-sonnet-5` に追随
- [x] `tests/init.test.ts`: **fresh scaffold 出力の expectation のみ** を `"claude-sonnet-5"` に。
      対象は現行行 40 / 102 / 499 / 514（いずれも `runInit` が既存 config 無し／steps 無しから
      scaffold した結果の `steps.defaults.model` を assert する箇所）
- [x] `tests/test-case-gen-step.test.ts`: `TestCaseGenStep.agent.model` の assert を
      `"claude-sonnet-5"` に。同 `it(... model === ...)` の description 文字列も追随

**変更しない（重要）**:
- [x] `tests/init.test.ts` の input fixture（existingConfig）行 159 / 236 / 363 / 527 は
      `claude-sonnet-4-6` のまま据え置く
- [x] `tests/init.test.ts` の「provider flag ignored（既存 config を上書きしない）」test の
      期待値（現行行 539）は `claude-sonnet-4-6` のまま据え置く。この期待値は同 test の
      fixture（現行行 527、旧モデル据え置き）と一致する必要があり、更新すると
      「上書きしない」検証が内部矛盾で fail する

**Acceptance Criteria**:
- 更新した 3 ファイルの対象 assert が `claude-sonnet-5` を期待する。
- init.test.ts の行 159 / 236 / 363 / 527 / 539 は無変更（`claude-sonnet-4-6` のまま）。
- `bun run test` が green（preserve test を含む）。

## T-06: 検証（grep 掃討 + typecheck + test）

- [x] step / command ディレクトリの旧文字列ゼロを確認:
      `grep -rnE 'claude-sonnet-4-6|claude-opus-4-6\[1m\]|claude-sonnet-4-5' src/core/step src/core/command --include='*.ts' | grep -v '__tests__'`
      → **0 件**
- [x] config の旧文字列は registry key リテラルのみ残ることを確認:
      `grep -nE 'claude-sonnet-4-6|claude-opus-4-6\[1m\]|claude-sonnet-4-5' src/config/model-registry.ts`
      → 残るのは `BUILTIN_MODEL_REGISTRY` の 3 key 行のみ（default 定数・one-shot 定数・
      コメントには残らない）
- [x] src/cli/init.ts の対象コメントに旧モデル名が残らないことを確認
- [x] `bun run typecheck` が green
- [x] `bun run test` が green

**Acceptance Criteria**:
- 上記 grep 2 種の結果が期待どおり（step/command は 0 件、config は registry key のみ）。
- `typecheck && test` が green。
- 受け入れ基準の grep（request）は本 task の精緻化コマンドで解釈・充足する
  （registry key リテラルと test fixture を除外）。
