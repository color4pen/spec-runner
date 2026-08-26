# Code Review Feedback — codex-scope-guidance — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 変更ファイル確認

`git diff main...HEAD --name-only` を確認し、変更が以下に収まることを確認した（TC-018 / TC-019）:

- `src/adapter/codex/scope-guidance.ts` — 新規定数モジュール
- `src/adapter/codex/agent-runner.ts` — 注入ロジック追加
- `src/adapter/codex/__tests__/scope-guidance-injection.test.ts` — 新規テスト
- `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` — byte-identity baseline 更新
- `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts` — byte-identity baseline 更新
- `tests/adapter/codex/scope-guidance-provider-isolation.test.ts` — 新規 guard テスト
- `specrunner/changes/codex-scope-guidance/**` — change folder アーティファクト

`src/core/pipeline/`, `specrunner/reviewers/`, `.specrunner/config.json`, `src/adapter/shared/`,
`src/adapter/claude-code/`, `src/adapter/managed-agent/`, `src/prompts/`, `src/core/` への diff が
0 件であることを確認した（TC-011 / TC-019）。

### 実装コード確認（agent-runner.ts）

- `CODEX_SCOPE_GUIDANCE` を `./scope-guidance.js` から import している（line 34）
- `scopeGuidanceSection = \`\n\n${CODEX_SCOPE_GUIDANCE}\`` として常に非空で定義（line 431）
- `fullPrompt` の組み立て順序: `baseFullPrompt` → `promptRulesSection` → `scopeGuidanceSection`
  → `buildMainTurnCompletionInstruction()`（reportTool あり）または省略（なし）（lines 435-437）
- `reportTool` の有無・`promptRules` の有無・resume の有無に関わらず guidance が常に含まれる
- `buildCompletionRetryPrompt` / post-work prompts / output verification repair の各経路には
  `CODEX_SCOPE_GUIDANCE` が注入されていない（design D4 準拠）
- resume 経路（`codex.resumeThread` / 失敗時 fresh-thread fallback）はいずれも同じ
  `fullPrompt` を使用する（lines 612-638）

### scope-guidance.ts 確認

- import 文が 0 行。定数 1 つ（`CODEX_SCOPE_GUIDANCE`）のみを export
- JSDoc に適用範囲（Codex only）・禁止事項（Claude / managed / shared からの import 禁止）・
  design 参照（D1/D3/D7）が明記されている
- 定数値を spec.md の canonical text と目視比較: 見出し行・空行・6 bullet が一致している

### テスト Coverage 確認（test-cases.md 全 19 件）

| TC | 結果 | 確認先 |
|----|------|--------|
| TC-001 | ✅ | `scope-guidance-injection.test.ts` — `custom-reviewer` step に guidance あり |
| TC-002 | ✅ | 同上 — `implementer` step に guidance あり |
| TC-003 | ✅ | 同上 — `reportTool` なし・`promptRules` なしで guidance あり、`COMPLETION_REPORT_MEANS` なし |
| TC-004 | ✅ | 同上 — `resumeSessionId` + `resumePrompt` セットで guidance あり |
| TC-005 | ✅ | 同上 — `indexOf` 比較で rules < guidance < completion 順を固定 |
| TC-006 | ✅ | `artifact-bundle-injection.test.ts` TC-015 ケース — `toBe` 厳密一致で guidance が末尾に来ることを固定 |
| TC-007 | ✅ | `scope-guidance-injection.test.ts` — 2 回目の呼び出し（completion retry）が guidance を含まない |
| TC-008 | ✅ | `scope-guidance-provider-isolation.test.ts` — `src/` 外スキャンで forbidden markers 不在を確認 |
| TC-009 | ✅ | 同上 — `buildAdditionalInstructions` / `buildResumeSection` の戻り値に guidance なし |
| TC-010 | ✅（目視） | 全テストファイルが `CODEX_SCOPE_GUIDANCE` を import し、guidance 文字列をインライン再掲していない |
| TC-011 | ✅（gate） | `git diff --name-only` — `src/core/pipeline/`, `specrunner/reviewers/` への diff なし |
| TC-012 | ✅ | `scope-guidance-provider-isolation.test.ts` — `scope-guidance.ts` に import 文なし |
| TC-013 | ❌ **MISSING** | 定数値を spec.md の canonical text と比較するテストが存在しない（must 優先度） |
| TC-014 | ✅ | `scope-guidance-injection.test.ts` — `reportTool` あり・`promptRules` なしで guidance が completion より前に位置 |
| TC-015 | ✅ | `resume-prompt-injection.test.ts:167` + `artifact-bundle-injection.test.ts:175` — `toBe` 厳密一致、`CODEX_SCOPE_GUIDANCE` を import して baseline に含む |
| TC-016 | ✅ | `scope-guidance-provider-isolation.test.ts` — `src/core/port/agent-runner.ts` に forbidden strings なし |
| TC-017 | ✅（gate） | `verification-result.md` — build / typecheck / test / lint すべて passed |
| TC-018 | ✅（gate） | 変更ファイル一覧が許可集合に収まっている |
| TC-019 | ✅（gate） | 禁止領域への diff なし |

### 受け入れ基準 5 項目の確認

| 受け入れ基準 | 確認結果 |
|------------|---------|
| Codex adapter 経由で実行される step の prompt に guidance 文面が含まれることが unit test で固定されている | ✅ TC-001〜TC-007, TC-014 が該当 |
| Claude provider の prompt 組み立てに変更がない | ✅ 変更ファイル一覧に `src/adapter/claude-code/` / `src/adapter/shared/` / `src/prompts/` が含まれない |
| 新しい provider config protocol / pipeline abstraction が追加されていない | ✅ TC-016 guard + `src/core/` に diff なし |
| pipeline transition / convergence budget / maxIterations / `specrunner/reviewers/*.md` に diff がない | ✅ TC-011 / TC-019 gate 確認済み |
| typecheck / test / architecture tests が green | ✅ verification-result.md 全 phase passed |

## 検証できなかった項目

None — 上記以外に検証を省略した項目はない。

## Findings 詳細

### F-001: TC-013 — `CODEX_SCOPE_GUIDANCE` 定数値の automated test が存在しない

**severity**: medium
**resolution**: fixable
**file**: `src/adapter/codex/scope-guidance.ts`

`test-cases.md` は TC-013 を **must** 優先度・**unit** カテゴリとして定義しており、以下を要求する:

> WHEN the string value is compared character-for-character to the canonical text in spec.md
> THEN the values are identical — no leading or trailing blank lines, no paraphrasing, no
> omission of any bullet item

`scope-guidance-injection.test.ts` および `scope-guidance-provider-isolation.test.ts` の
いずれにも、この検証に対応するテストケースが存在しない。

- 既存テスト（TC-001〜TC-007, TC-014）はすべて `CODEX_SCOPE_GUIDANCE` の **存在**（`toContain`）
  を確認するものであり、定数が保持する **値** を参照元（spec.md）と照合しない。
- 現時点では定数値は正しい（目視確認済み）。しかし `scope-guidance.ts` の文面を変更した場合、
  既存テストはすべて通過し続けるためドリフトが検出できない。

**修正案**: `scope-guidance-provider-isolation.test.ts`（または新規ファイル）に、`spec.md` の
該当 Scenario ブロックを fs.readFile で読み込み、ガイダンスブロックを抽出して
`CODEX_SCOPE_GUIDANCE` と `toBe` で比較するテストを追加する。これにより TC-010（定数 import、
inline literal 再掲なし）にも抵触しない形で TC-013 が満たされる。
