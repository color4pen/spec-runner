# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーション検証（src/prompts/conformance-system.ts）

**`src/prompts/conformance-system.ts:20-25`**
- Line 20: `実装が 4 成果物（tasks.md / design.md / spec.md / request.md）すべてに適合しているか` ✅
- Line 25: `` - `${_changesDir}/<slug>/tasks.md` / `design.md` / `spec.md` / `request.md` — 正典 `` ✅
- 4 成果物が同格の「正典」として並記されていることを確認

**`src/prompts/conformance-system.ts:37-47`**
- Line 37: tasks.md 全チェックボックスの `[x]` 確認 ✅
- Line 39: design.md 全 decision（D1, D2,...）の実装反映確認 ✅
- Lines 41-46: spec.md の spec-exempt 判定、Requirement/Scenario の充足確認 ✅
- Line 47: request.md 受け入れ基準の全件確認 ✅

**`src/prompts/conformance-system.ts:74-75`**
- routing 表（spec-fixer / implementer / code-fixer）の存在を確認 ✅
- fixTarget enum の値は変更しないという制約を確認

### Step 2: 関連テストファイルの確認

**`tests/unit/core/step/conformance.test.ts`**
- TC-012: `CONFORMANCE_SYSTEM_PROMPT references all 4 judgment items` — tasks.md/design.md/spec.md/request.md の存在チェック。変更後も 4 成果物への言及は維持されるため通過見込み。
- TC-CONF-03: fixTarget / spec-fixer / implementer / code-fixer の文字列存在チェック — routing 文面の更新後も値は変わらないため通過見込み。

**`tests/unit/core/step/judge-verdict-conformance.test.ts`**
- 全 9 TC(JVCONF-01〜09): verdict 導出・aggregateFixTarget ロジックのテスト。judge-verdict 層（機械層）は本 request のスコープ外で無変更のため全通過見込み。

**`src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`**
- TC-015: `CONFORMANCE_SYSTEM_PROMPT contains SEVERITY_DEFINITION` — SEVERITY_DEFINITION は引き続き使用されるため通過見込み。
- その他の conformance への言及はセクション見出し存在チェックが中心で、prompt 内容の実質的な pinning はなし。

### Step 3: 受け入れ基準の実行可能性確認

- AC1（二層宣言のテスト固定）: 新規テストが必要。design step に委任される。
- AC2（「それ自体では finding にしない」指示のテスト固定）: 新規テストが必要。design step に委任。
- AC3（受け入れ基準・Scenario 全件確認指示の維持）: 既存 TC-012 が部分カバー。prompt 変更後も確認指示は残る。
- AC4（fixTarget enum・verdict 集約の無変更固定）: judge-verdict-conformance.test.ts が既にカバー。
- AC5（既存テスト更新対象の design での全列挙）: design step の責務として明示されている。
- AC6（typecheck && test が green）: 実装完了後に検証。

### Step 4: スコープ・型・ADR 妥当性

- 変更対象: `src/prompts/conformance-system.ts`（prompt 層のみ）+ 新規/更新テスト
- judge-verdict 層（機械意味論）は無変更で一貫している
- `spec-change` 型: conformance の判定基準という振る舞いレベルの変更に適切
- `adr: true`: 正典の格差付けという設計判断に適切

## 検証できなかった項目

None

## Findings 詳細

None
