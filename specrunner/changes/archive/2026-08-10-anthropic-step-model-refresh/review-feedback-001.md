# Code Review Feedback — anthropic-step-model-refresh — iter 1

## 検証した項目

### 受け入れ基準 AC-1: 旧モデル文字列の掃討

`grep -rnE 'claude-sonnet-4-6|claude-opus-4-6\[1m\]|claude-sonnet-4-5' src/core/step src/core/command --include='*.ts' | grep -v '__tests__'` → **0 件** ✓

`grep -nE 'claude-sonnet-4-6|claude-opus-4-6\[1m\]|claude-sonnet-4-5' src/config/model-registry.ts` → **3 行（BUILTIN_MODEL_REGISTRY key リテラル行 18/19/20 のみ）** ✓

`src/cli/init.ts` コメント: `claude-opus-4-6[1m]` → `claude-opus-5` ✓

### 受け入れ基準 AC-2: テスト期待値更新と fixture 保全

**更新対象（確認済み）:**

| ファイル | 対象 | 値 |
|---|---|---|
| tests/config/model-registry.test.ts | `anthropic.defaultModel` assert + it description | `claude-sonnet-5` ✓ |
| tests/init.test.ts | fresh scaffold expectation 行 40/102/499/514 | `claude-sonnet-5` ✓ |
| tests/test-case-gen-step.test.ts | `TestCaseGenStep.agent.model` assert + it description | `claude-sonnet-5` ✓ |

**据え置き対象（変更禁止、確認済み）:**

| 対象 | 値 |
|---|---|
| init.test.ts 行 159（existingConfig fixture）| `claude-sonnet-4-6` ✓ |
| init.test.ts 行 236（existingConfig fixture）| `claude-sonnet-4-6` ✓ |
| init.test.ts 行 363（existingConfig fixture）| `claude-sonnet-4-6` ✓ |
| init.test.ts 行 527（existingConfig fixture）| `claude-sonnet-4-6` ✓ |
| init.test.ts 行 539（provider-flag-ignored 期待値）| `claude-sonnet-4-6` ✓ |

design.md D7 「fixture と期待値の一致が必要」を正確に守っている。

### 受け入れ基準 AC-3: typecheck && test green

verification-result.md より: build / typecheck / test / lint / changed-line-coverage すべて passed ✓

### 非 design step 13 箇所（T-01）

全 const が `"claude-sonnet-5"` になっていることを diff で確認:  
test-case-gen / build-fixer / code-fixer / adr-gen / spec-fixer / implementer / custom-reviewer / conformance / spec-review / request-review / test-materialize / regression-gate / code-review ✓

### design step（T-02）

`DESIGN_AGENT_MODEL = "claude-opus-5"` — `[1m]` サフィックスなし、旧値 `claude-opus-4-6[1m]` なし ✓

### model-registry.ts（T-03）

- `PROVIDER_DEFAULTS.anthropic.defaultModel = "claude-sonnet-5"` ✓
- `designModel` 追加なし（省略維持）✓
- `DEFAULT_ONE_SHOT_MODEL = "claude-sonnet-5"` ✓
- `ProviderDefaults` doc コメント内 `claude-opus-4-6[1m]` → `claude-opus-5` ✓
- `PROVIDER_DEFAULTS` 直上コメント内 `claude-opus-4-6[1m]` → `claude-opus-5` ✓
  （同時に `design.ts:12` という stale な行参照が `design.ts` に修正されている — design.md Open Questions で「scope 外だが任意」と記載された箇所）
- `BUILTIN_MODEL_REGISTRY` の旧 key 3 行は据え置き ✓

### 周辺コメント（T-04）

- `src/cli/init.ts` 行 117: `claude-opus-5` ✓
- `src/core/step/test-case-gen.ts` 行 21: `claude-sonnet-5 — design-reading task; Opus is overkill.` ✓（設計根拠の文言保持）
- `src/core/command/reviewers-new.ts`: `# model: claude-sonnet-5` ✓

### 新規テストファイル（tests/anthropic-step-model-refresh.test.ts）

test-cases.md の must TC 13 件をすべてカバー（TC-001〜TC-012、TC-014 相当）:

- TC-001/002: 全 13 step model を個別 + 一括検証
- TC-003: DesignStep model が `claude-opus-5` かつ `[1m]` なし
- TC-004: fresh scaffold が `claude-sonnet-5` を書き `steps.design` を持たない
- TC-005/010: preserve 系（existingConfig が上書きされない）
- TC-006 (should): `DEFAULT_ONE_SHOT_MODEL === "claude-sonnet-5"`
- TC-007: 新モデルが `resolveProvider` で anthropic に解決される
- TC-008: 旧 key が registry に残り解決可能
- TC-009: `designModel === undefined`
- TC-011/012: gate — src/core/step, src/core/command, model-registry.ts の旧モデル文字列掃討

TC-011/012 のゲートテストは `fs.readFile` でソースを動的スキャンする方式。  
`REGISTRY_KEY_LINE` 正規表現 `/^\s+"(?:claude|gpt)[^"]*":\s*\{/` が registry key 行を識別し、  
default 定数・コメント行のみを violation として検出する。

### 既存ユニットテスト更新

- `tests/unit/step/step-model-maxturn-config.test.ts`: TC-004/005 のモデル期待値を一括更新 ✓
- `tests/unit/step/build-fixer.test.ts`, `code-fixer.test.ts`, `code-review.test.ts`, `implementer.test.ts`, `test-materialize-boundary.test.ts`: description + assert を `claude-sonnet-5` に更新 ✓

## 検証できなかった項目

None — すべての受け入れ基準と実装箇所を確認した。

## Findings 詳細

None。
