# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 既定定数（13 箇所 sonnet + 1 箇所 opus）

各 step ファイルを Read して定数値を直接確認した。

| ファイル | 定数名 | 現在値 |
|---|---|---|
| src/core/step/test-case-gen.ts:12 | `TEST_CASE_GEN_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/build-fixer.ts:16 | `BUILD_FIXER_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/code-fixer.ts:22 | `CODE_FIXER_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/adr-gen.ts:16 | `ADR_GEN_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/spec-fixer.ts:14 | `SPEC_FIXER_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/implementer.ts:19 | `IMPLEMENTER_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/custom-reviewer.ts:37 | `DEFAULT_REVIEW_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/conformance.ts:11 | `CONFORMANCE_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/spec-review.ts:16 | `SPEC_REVIEW_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/request-review.ts:17 | `REQUEST_REVIEW_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/test-materialize.ts:13 | `TEST_MATERIALIZE_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/regression-gate.ts:48 | `DEFAULT_REVIEW_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/code-review.ts:14 | `CODE_REVIEW_AGENT_MODEL` | `"claude-sonnet-4-6"` ✓ |
| src/core/step/design.ts:16 | `DESIGN_AGENT_MODEL` | `"claude-opus-4-6[1m]"` ✓ |

### model-registry.ts

- `PROVIDER_DEFAULTS.anthropic.defaultModel = "claude-sonnet-4-6"` ✓（line 57）
- `anthropic.designModel` は未定義（intentionally omitted） ✓
- 説明コメント（line 51–53）に `claude-opus-4-6[1m]` の記述あり ✓ → 要件 3 の更新対象
- `DEFAULT_ONE_SHOT_MODEL = "claude-sonnet-4-5"` ✓（line 69）

### 前提: registry への claude-sonnet-5 / claude-opus-5 追加

`BUILTIN_MODEL_REGISTRY` を確認。`"claude-sonnet-5"` と `"claude-opus-5"` が既に追加済み（model-catalog-refresh は merge 済み）。
`claude-opus-5[1m]` はエントリなし ✓（[1m] サフィックス不要の設計と整合）。

### コメント / Scaffold 例

- `src/cli/init.ts:117`（実際は行 117–118）: `"// For anthropic, design.ts built-in already handles claude-opus-4-6[1m]; omitting keeps"` ✓
- `src/core/step/test-case-gen.ts:21`: `"Design D2: claude-sonnet-4-6 — design-reading task; Opus is overkill."` ✓
- `src/core/command/reviewers-new.ts:25`: scaffold template 内に `# model: claude-sonnet-4-6` ✓

### テストファイル

#### 更新が必要な expectation（request が明示している 3 ファイル）

| ファイル | 行 | 内容 |
|---|---|---|
| tests/config/model-registry.test.ts:102 | `.toBe("claude-sonnet-4-6")` | `PROVIDER_DEFAULTS.anthropic.defaultModel` |
| tests/init.test.ts:40 | `.toBe("claude-sonnet-4-6")` | scaffold 出力 |
| tests/init.test.ts:102 | `.toBe("claude-sonnet-4-6")` | scaffold 出力 |
| tests/init.test.ts 周辺 | `.toBe("claude-sonnet-4-6")` × 3 | 行 499 / 514 / 539（request 記載と 2 行のズレあり） |
| tests/test-case-gen-step.test.ts:70 | `.toBe("claude-sonnet-4-6")` | `TestCaseGenStep.agent.model` |

#### 変更しない fixture 行（入力データとして確認）

- `tests/init.test.ts:159, 236, 363, 525`（実際の行番号）: いずれも `existingConfig` オブジェクト内の `model: "claude-sonnet-4-6"` で、「明示設定が既定に勝つ」ことを検証する入力 fixture ✓

## 検証できなかった項目

None

## Findings 詳細

None（blocking な指摘なし）

### 参考観察: init.test.ts のアサーション行番号（微小ズレ）

request.md は `tests/init.test.ts:497, 512, 537` を「`claude-sonnet-4-6` assert」と記載しているが、実際のアサーション行は 499 / 514 / 539 と 2 行ずれている（line 497 は `JSON.parse(raw)`）。コードの意図は完全に一致しており、実装上支障はない。ブロッキング finding ではない。
