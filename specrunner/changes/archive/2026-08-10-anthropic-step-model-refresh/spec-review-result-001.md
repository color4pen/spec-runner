# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. 現状コードの前提確認（request.md の主張と実コードの照合）

worktree のソースを直接 grep して以下を確認した。

**非 design step 13 箇所の現状値（claude-sonnet-4-6）**
- `src/core/step/test-case-gen.ts:12` `TEST_CASE_GEN_AGENT_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/build-fixer.ts:16` `BUILD_FIXER_AGENT_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/code-fixer.ts:22` `CODE_FIXER_AGENT_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/adr-gen.ts:16` `ADR_GEN_AGENT_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/spec-fixer.ts:14` `SPEC_FIXER_AGENT_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/implementer.ts:19` `IMPLEMENTER_AGENT_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/custom-reviewer.ts:37` `DEFAULT_REVIEW_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/conformance.ts:11` `CONFORMANCE_AGENT_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/spec-review.ts:16` `SPEC_REVIEW_AGENT_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/request-review.ts:17` `REQUEST_REVIEW_AGENT_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/test-materialize.ts:13` `TEST_MATERIALIZE_AGENT_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/regression-gate.ts:48` `DEFAULT_REVIEW_MODEL = "claude-sonnet-4-6"` ✓
- `src/core/step/code-review.ts:14` `CODE_REVIEW_AGENT_MODEL = "claude-sonnet-4-6"` ✓

**design step の現状値**
- `src/core/step/design.ts:16` `DESIGN_AGENT_MODEL = "claude-opus-4-6[1m]"` ✓

**model-registry.ts の現状値**
- `PROVIDER_DEFAULTS.anthropic.defaultModel = "claude-sonnet-4-6"` (line 57) ✓
- `DEFAULT_ONE_SHOT_MODEL = "claude-sonnet-4-5"` (line 69) ✓
- `ProviderDefaults` doc コメント (line 39): `(e.g. claude-opus-4-6[1m] for anthropic)` ✓
- `PROVIDER_DEFAULTS` 直上コメント (lines 51-52): `design.ts:12 already hard-codes claude-opus-4-6[1m]` ✓
- `designModel` は未定義（省略） ✓

**コメント群**
- `src/cli/init.ts:117`: `claude-opus-4-6[1m]` を名指し ✓
- `src/core/step/test-case-gen.ts:21`: `Design D2: claude-sonnet-4-6 — design-reading task; Opus is overkill.` ✓
- `src/core/command/reviewers-new.ts:25`: `# model: claude-sonnet-4-6` ✓

### 2. 移行前提条件の確認（model-catalog-refresh の完了）

`BUILTIN_MODEL_REGISTRY` に以下が存在することを直接確認した（model-registry.ts lines 23-24）：
- `"claude-opus-5": { provider: "anthropic" }` ✓
- `"claude-sonnet-5": { provider: "anthropic" }` ✓
- `"claude-opus-5[1m]"` は存在しない ✓（model-registry.test.ts:186-187 でも assert 済み）

`model-catalog-refresh` の前提条件は満足されている。

### 3. テスト照合（変更対象 vs. 据え置き）

**更新が必要な期待値（fresh scaffold）**
- `tests/config/model-registry.test.ts:101-102`: `PROVIDER_DEFAULTS.anthropic.defaultModel` が `"claude-sonnet-4-6"` を assert ✓
- `tests/init.test.ts:40, 102, 499, 514`: fresh scaffold 出力の `steps.defaults.model` を assert ✓（行番号は request との drift が design D7 で説明済み）
- `tests/test-case-gen-step.test.ts:68, 70`: `TestCaseGenStep.agent.model` を assert ✓

**据え置き（変更しない）**
- `tests/init.test.ts:159, 236, 363, 527`: existingConfig の入力 fixture（`claude-sonnet-4-6`） ✓
- `tests/init.test.ts:539`: "provider flag ignored" preserve test の期待値（fixture 527 と連動） ✓

D7 の「行 539 を更新すると preserve test が内部矛盾で fail する」という説明は正しい。fixture（line 527）が旧モデルのまま据え置かれるため、期待値（line 539）も旧モデルのままでなければならない。

### 4. spec.md の規範要件確認

- 5 つの Requirement すべてに `SHALL` または `MUST` を含む ✓
- 全 Requirement に Given/When/Then 形式の Scenario が 1 つ以上ある ✓
- 各 Scenario が変更後のシステム振る舞いを具体的に記述している ✓
- spec.md は 1 ファイル構成 ✓

### 5. design.md の整合性確認

- D1～D7 の全設計判断が request.md の architect 評価済み判断と整合 ✓
- D6 の「受け入れ基準の grep 精緻化」は、registry key リテラルが backward-compat で残ることと受け入れ基準 literal 解釈の矛盾を正しく説明している ✓
- D7 の「preserve test の期待値を更新しない」の根拠が正しい（fixture と期待値の等価性） ✓
- Risks セクションが主要リスクを網羅している ✓

### 6. tasks.md の確認

- T-01～T-06 が request.md の要件 1-6 を完全にカバー ✓
- T-06 の受け入れ基準 grep コマンドが `src/core/step` / `src/core/command` / `src/config` を正しく分離して検証する設計になっている ✓
- registry key リテラルの除外方針（T-06）が D6 と整合 ✓

### 7. セキュリティ観点

- 本変更はモデル名文字列定数の置換のみ
- 認証・認可の変更なし
- 入力バリデーションの変更なし（`resolveProvider` の `CONFIG_INVALID` ガードは無変更）
- 新モデル名は registry 登録済みのため dispatch 時の `CONFIG_INVALID` リスクなし
- OWASP Top 10 に該当する表面の変更なし

## 検証できなかった項目

- **外部事実の独立検証不能**: claude-sonnet-5 の定価 $3/$15、claude-opus-5 の定価 $5/$25、1M context デフォルト、tokenizer 変更による +30% トークン増という外部事実は Anthropic の公式 pricing 情報のため、コードベース内での独立検証が不可能。request.md が「本 request が正とする値」と明示しているため、この制約は許容される。
- **`bun run typecheck && bun run test` の実行**: 環境制約により静的解析/テスト実行を行っていない。設計上の矛盾を見る限り型エラー・テスト失敗のリスクは低いが、実際の green 確認は T-06 に委ねる。

## Findings 詳細

### F-01 (low): `ProviderDefaults` doc コメントの `design.ts:12` 行参照が stale

`src/config/model-registry.ts` の PROVIDER_DEFAULTS 直上コメント（line 51）:
```
anthropic: designModel is omitted intentionally — design.ts:12 already hard-codes
```
`design.ts` の `DESIGN_AGENT_MODEL` 定義は現在 line 16 にある（line 12 ではない）。design.md の Open Questions でも stale と認識されており、モデル名追随（T-03）は要件であるが行参照の訂正は「scope 外・任意」と明示されている。ブロッカーではない。

### F-02 (low): ADR・アーキテクチャ文書の旧モデル名（scope 外）

`specrunner/adr/2026-05-26-project-config-overlay.md` と `2026-06-12-provider-neutral-pricing-table.md` が旧モデル名（`claude-sonnet-4-6`, `claude-opus-4-6[1m]`, `claude-sonnet-4-5`）を含むが、これらは historical 記録の ADR であり scope 外。受け入れ基準 grep の範囲（`src/core/step/`, `src/config/`, `src/core/command/`）にも含まれない。実装上の問題なし。
